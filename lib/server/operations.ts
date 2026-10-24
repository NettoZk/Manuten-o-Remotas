import "server-only"
import { createHash, randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore"
import { z } from "zod"
import { cleanUndefined, equipmentSchema, finalizationSchema, isMaintenanceSituation, isWarrantySentSituation, passwordSchema, roleSchema, userSchema, warrantyReturnSchema } from "@/lib/validation"
import { getAdmin } from "./firebase-admin"
import { HttpError, type requireUser } from "./http"

type Actor = Awaited<ReturnType<typeof requireUser>>
const id = z.string().min(1).max(200).refine((value) => !value.includes("/"), "Identificador inválido")
const name = z.string().trim().min(1).max(160)
type ReferenceCollection = "defects" | "services" | "operators" | "equipment_status"
function admin(actor: Actor) { if (actor.tipo !== "admin") throw new HttpError(403, "Ação exclusiva de administradores") }
function technician(actor: Actor) { if (!["admin", "tecnico"].includes(actor.tipo)) throw new HttpError(403, "Ação exclusiva de técnicos e administradores") }
function key(value: string) { return createHash("sha256").update(value).digest("hex") }
function audit(tx: Transaction, actor: Actor, action: string, equipmentId: string, detail: Record<string, unknown> = {}) {
  const { db } = getAdmin()
  tx.create(db.collection("audit_logs").doc(), { action, equipmentId, userId: actor.id, userName: actor.nome, at: Timestamp.now(), ...cleanUndefined(detail) })
}
async function activeName(tx: Transaction, collection: ReferenceCollection, value: string) {
  const { db } = getAdmin()
  const snapshot = await tx.get(db.collection(collection).where("nome", "==", value).where("ativo", "==", true))
  if (snapshot.empty) throw new HttpError(400, `Valor indisponível na lista: ${value}`)
}

function registerWarranty(tx: Transaction, actor: Actor, equipmentId: string, numeroRemota: string, maintenanceId: string, data: { situacaoRemota: string; motivo: string }) {
  const { db } = getAdmin()
  const ref = db.collection("warranties").doc()
  const enviadaEm = Timestamp.now()
  const garantia = { id: ref.id, status: "enviada", enviadaEm, motivo: data.motivo, maintenanceId }
  tx.create(ref, { equipmentId, numeroRemota, equipmentIds: [equipmentId], status: "enviada", enviadaEm, enviadaPor: actor.nome, enviadaUserId: actor.id,
    motivo: data.motivo, maintenanceId, situacaoEnvio: data.situacaoRemota })
  audit(tx, actor, "warranty_sent", equipmentId, { warrantyId: ref.id, numeroRemota, motivo: data.motivo, maintenanceId })
  return garantia
}

export async function executeOperation(operation: string, args: unknown[], actor: Actor): Promise<unknown> {
  const { db, auth } = getAdmin()
  const equipmentRef = (value: unknown) => db.collection("equipments").doc(id.parse(value))
  switch (operation) {
    case "getUsers": {
      admin(actor)
      const users = await db.collection("users").get()
      // Seleção explícita: nunca enviar senhaHash, mesmo para administradores.
      return users.docs.map((doc) => {
        const data = doc.data()
        return { id: doc.id, nome: data.nome, username: data.username, tipo: data.tipo, ativo: data.ativo, criadoEm: data.criadoEm?.toDate?.()?.toISOString() ?? null }
      })
    }
    case "getWarrantyHistory": {
      const ref = equipmentRef(args[0])
      if (!(await ref.get()).exists) throw new HttpError(404, "Equipamento não encontrado")
      const records = await db.collection("warranties").where("equipmentIds", "array-contains", ref.id).get()
      return records.docs.map((doc) => {
        const data = doc.data()
        return { ...data, id: doc.id, enviadaEm: data.enviadaEm.toDate().toISOString(), retornadaEm: data.retornadaEm?.toDate().toISOString() }
      }).sort((a, b) => b.enviadaEm.localeCompare(a.enviadaEm))
    }
    case "sendWarranty": {
      throw new HttpError(409, "O envio para garantia deve ser registrado na conclusão de uma manutenção em andamento")
    }
    case "returnWarranty": {
      admin(actor)
      const ref = equipmentRef(args[0])
      const { garantiaId, observacoesRetorno, ...data } = warrantyReturnSchema.parse(args[1])
      const warrantyRef = db.collection("warranties").doc(garantiaId)
      const replacement = db.collection("equipments").doc()
      await db.runTransaction(async (tx) => {
        const [snapshot, warranty] = await Promise.all([tx.get(ref), tx.get(warrantyRef)])
        const current = snapshot.data()
        if (!current || current.estadoRegistro === "inativo") throw new HttpError(404, "Equipamento indisponível")
        if (current.garantia?.id !== garantiaId || current.garantia?.status !== "enviada" || !warranty.exists || warranty.data()?.status !== "enviada" || warranty.data()?.equipmentId !== ref.id) throw new HttpError(409, "Não há envio para garantia aberto para esta remota. Consulte o cadastro novamente")
        if (current.manutencaoId || current.emManutencaoPor) throw new HttpError(409, "Esta remota está em manutenção")
        const changed = data.numeroRemota !== current.numeroRemota
        const numberRef = db.collection("equipment_numbers").doc(key(data.numeroRemota))
        if (changed) {
          const [reservation, existing] = await Promise.all([tx.get(numberRef), tx.get(db.collection("equipments").where("numeroRemota", "==", data.numeroRemota).limit(1))])
          if (reservation.exists || !existing.empty) throw new HttpError(409, "Já existe uma remota com este número/IMEI, inclusive nos cadastros arquivados")
        }
        await activeName(tx, "equipment_status", data.situacaoRemota)
        await activeName(tx, "operators", data.operadoraAtual)
        const now = Timestamp.now()
        const garantia = { ...current.garantia, status: "retornada", retornadaEm: now }
        if (changed) {
          tx.create(numberRef, { equipmentId: replacement.id })
          tx.create(replacement, { ...cleanUndefined(data), estadoRegistro: "ativo", dataCadastro: now,
            remotaAnteriorId: ref.id, remotaAnteriorNumero: current.numeroRemota, garantiaOrigemId: warrantyRef.id })
          tx.update(ref, { garantia, estadoRegistro: "inativo", arquivadoEm: now, arquivadoPor: actor.nome, arquivadoUserId: actor.id,
            substituidaPorId: replacement.id, substituidaPorNumero: data.numeroRemota, motivoArquivamento: "Substituída no retorno da garantia" })
        } else {
          tx.update(ref, { ...cleanUndefined(data), garantia, situacaoAnterior: current.situacaoRemota || null,
            situacaoAtualizadaEm: now, situacaoAtualizadaPor: actor.nome, motivoAlteracaoSituacao: observacoesRetorno })
        }
        tx.update(warrantyRef, { status: "retornada", retornadaEm: now, retornadaPor: actor.nome, retornadaUserId: actor.id,
          observacoesRetorno, situacaoRetorno: data.situacaoRemota, equipmentIds: changed ? [ref.id, replacement.id] : [ref.id],
          ...(changed ? { novoEquipmentId: replacement.id, novoNumeroRemota: data.numeroRemota } : {}) })
        audit(tx, actor, "warranty_returned", ref.id, { warrantyId: warrantyRef.id, numeroRemota: current.numeroRemota,
          ...(changed ? { replacementEquipmentId: replacement.id, replacementNumber: data.numeroRemota } : {}), observacoesRetorno })
      })
      return null
    }
    case "createUser": {
      admin(actor)
      const data = userSchema.parse({ username: args[0], password: args[1], nome: args[2], tipo: args[3] })
      const uid = randomUUID()
      const senhaHash = await bcrypt.hash(data.password, 12)
      await db.runTransaction(async (tx) => {
        const index = db.collection("usernames").doc(key(data.username))
        const [reservation, existing] = await Promise.all([tx.get(index), tx.get(db.collection("users").where("username", "==", data.username).limit(1))])
        if (reservation.exists || !existing.empty) throw new HttpError(409, "Este nome de usuário já está em uso")
        tx.create(index, { userId: uid })
        tx.create(db.collection("users").doc(uid), { nome: data.nome, username: data.username, senhaHash, tipo: data.tipo, ativo: true, criadoEm: Timestamp.now() })
      })
      return uid
    }
    case "updateUser":
    case "deleteUser": {
      admin(actor)
      const uid = id.parse(args[0])
      const update = operation === "deleteUser" ? { ativo: false } : z.object({ nome: name.optional(), tipo: roleSchema.optional(), ativo: z.boolean().optional() }).parse(args[1])
      if (uid === actor.id && (operation === "deleteUser" || update.ativo === false || (update.tipo && update.tipo !== "admin"))) throw new HttpError(400, "Você não pode remover seu próprio acesso administrativo")
      await db.runTransaction(async (tx) => {
        const ref = db.collection("users").doc(uid)
        const [target, admins] = await Promise.all([tx.get(ref), tx.get(db.collection("users").where("tipo", "==", "admin").where("ativo", "==", true))])
        if (!target.exists) throw new HttpError(404, "Usuário não encontrado")
        if (target.data()?.tipo === "admin" && target.data()?.ativo && admins.size <= 1 && (operation === "deleteUser" || update.ativo === false || (update.tipo && update.tipo !== "admin"))) throw new HttpError(400, "Mantenha pelo menos um administrador ativo")
        if (operation === "deleteUser") {
          tx.delete(ref)
          tx.delete(db.collection("usernames").doc(key(target.data()!.username)))
        } else tx.update(ref, update)
      })
      try {
        if (operation === "deleteUser") await auth.deleteUser(uid)
        else if (update.ativo !== undefined) { await auth.updateUser(uid, { disabled: !update.ativo }); if (!update.ativo) await auth.revokeRefreshTokens(uid) }
      } catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error }
      return null
    }
    case "updateUserPassword": {
      admin(actor)
      const uid = id.parse(args[0])
      const password = passwordSchema.parse(args[1])
      await db.collection("users").doc(uid).update({ senhaHash: await bcrypt.hash(password, 12) })
      try { await auth.revokeRefreshTokens(uid) } catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error }
      return null
    }
    case "createEquipment": {
      technician(actor)
      const data = equipmentSchema.parse(args[0])
      if (actor.tipo !== "admin" && data.situacaoRemota && data.situacaoRemota !== (data.status === "Nova" ? "Nova" : "Triagem")) throw new HttpError(403, "Situação inicial não permitida")
      if (isMaintenanceSituation(data.situacaoRemota || "")) throw new HttpError(400, "Inicie uma manutenção para usar essa situação")
      if (isWarrantySentSituation(data.situacaoRemota || "")) throw new HttpError(400, "O envio para garantia exige a conclusão de uma manutenção")
      const ref = db.collection("equipments").doc()
      await db.runTransaction(async (tx) => {
        const index = db.collection("equipment_numbers").doc(key(data.numeroRemota))
        const [reservation, existing] = await Promise.all([tx.get(index), tx.get(db.collection("equipments").where("numeroRemota", "==", data.numeroRemota).limit(1))])
        if (reservation.exists || !existing.empty) throw new HttpError(409, "Já existe uma remota com este número")
        await activeName(tx, "operators", data.operadoraAtual)
        if (data.situacaoRemota) await activeName(tx, "equipment_status", data.situacaoRemota)
        tx.create(index, { equipmentId: ref.id })
        tx.create(ref, { ...cleanUndefined(data), situacaoRemota: data.situacaoRemota || (data.status === "Nova" ? "Nova" : "Triagem"), estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
        audit(tx, actor, "equipment_created", ref.id)
      })
      return ref.id
    }
    case "updateEquipment":
    case "updateEquipmentWithLog":
    case "updateEquipmentSituationManual": {
      admin(actor)
      const ref = equipmentRef(args[0])
      const allowed = equipmentSchema.omit({ numeroRemota: true }).partial()
      const data = operation === "updateEquipmentSituationManual"
        ? z.object({ situacaoRemota: name, motivoAlteracaoSituacao: z.string().trim().max(2000).optional() }).parse(args[1])
        : allowed.parse(args[1])
      await db.runTransaction(async (tx) => {
        const current = await tx.get(ref)
        if (!current.exists) throw new HttpError(404, "Equipamento não encontrado")
        if (current.data()?.estadoRegistro === "inativo") throw new HttpError(409, "Esta remota está arquivada")
        if (current.data()?.garantia?.status === "enviada") throw new HttpError(409, "Registre o retorno da garantia antes de editar a remota")
        if (current.data()?.manutencaoId || current.data()?.emManutencaoPor) throw new HttpError(409, "Finalize a manutenção antes de editar o equipamento")
        if (data.situacaoRemota) {
          if (isMaintenanceSituation(data.situacaoRemota)) throw new HttpError(400, "Use a abertura de manutenção para esta situação")
          if (isWarrantySentSituation(data.situacaoRemota)) throw new HttpError(400, "O envio para garantia exige a conclusão de uma manutenção")
          await activeName(tx, "equipment_status", data.situacaoRemota)
        }
        if ("operadoraAtual" in data && data.operadoraAtual) await activeName(tx, "operators", data.operadoraAtual)
        const situation = data.situacaoRemota && data.situacaoRemota !== current.data()?.situacaoRemota ? {
          situacaoAnterior: current.data()?.situacaoRemota || null, situacaoAtualizadaEm: Timestamp.now(), situacaoAtualizadaPor: actor.nome,
          motivoAlteracaoSituacao: "motivoAlteracaoSituacao" in data ? data.motivoAlteracaoSituacao || "" : "",
        } : {}
        tx.update(ref, { ...cleanUndefined(data), ...situation, ultimaEdicaoEm: Timestamp.now(), ultimaEdicaoPor: actor.nome, ultimaEdicaoUserId: actor.id })
        audit(tx, actor, "equipment_updated", ref.id, { changes: cleanUndefined(data), previousSituation: current.data()?.situacaoRemota })
      })
      return null
    }
    case "deleteEquipment":
    case "archiveEquipment": {
      admin(actor)
      const ref = equipmentRef(args[0])
      await db.runTransaction(async (tx) => {
        const equipment = await tx.get(ref)
        if (!equipment.exists) throw new HttpError(404, "Equipamento não encontrado")
        if (equipment.data()?.manutencaoId || equipment.data()?.emManutencaoPor) throw new HttpError(409, "Finalize a manutenção antes de arquivar ou excluir")
        if (equipment.data()?.garantia?.status === "enviada") throw new HttpError(409, "Registre o retorno da garantia antes de arquivar ou excluir")
        const history = await tx.get(db.collection("maintenances").where("numeroRemota", "==", equipment.data()!.numeroRemota).limit(1))
        const warranties = await tx.get(db.collection("warranties").where("equipmentIds", "array-contains", ref.id).limit(1))
        if (operation === "deleteEquipment" && (!history.empty || !warranties.empty || equipment.data()?.remotaAnteriorId || equipment.data()?.substituidaPorId)) throw new HttpError(409, "Este equipamento tem histórico e deve ser arquivado")
        if (operation === "archiveEquipment") tx.update(ref, { estadoRegistro: "inativo", arquivadoEm: Timestamp.now(), arquivadoPor: actor.nome, arquivadoUserId: actor.id })
        else { tx.delete(ref); tx.delete(db.collection("equipment_numbers").doc(key(equipment.data()!.numeroRemota))) }
        audit(tx, actor, operation === "deleteEquipment" ? "equipment_deleted" : "equipment_archived", ref.id)
      })
      return null
    }
    case "createMaintenance": {
      technician(actor)
      const data = z.object({ equipmentId: id, defeitoRelatado: name, defeitoRelatadoOutro: z.string().trim().max(2000).optional() }).parse(args[0])
      if (data.defeitoRelatado === "Outro" && !data.defeitoRelatadoOutro) throw new HttpError(400, "Descreva o defeito relatado")
      const ref = db.collection("maintenances").doc()
      await db.runTransaction(async (tx) => {
        const eqRef = equipmentRef(data.equipmentId)
        const eq = await tx.get(eqRef)
        if (!eq.exists || eq.data()?.estadoRegistro === "inativo") throw new HttpError(404, "Equipamento indisponível")
        const current = eq.data()!
        if (current.garantia?.status === "enviada") throw new HttpError(409, "Registre o retorno da garantia antes de iniciar uma manutenção")
        // A consulta cobre também registros antigos que não possuam todos os campos de bloqueio.
        const open = await tx.get(db.collection("maintenances").where("numeroRemota", "==", current.numeroRemota))
        if (current.manutencaoId || current.emManutencaoPor || open.docs.some((item) => item.data().status === "em_andamento")) throw new HttpError(409, "Esta remota já está em manutenção. Os dados foram atualizados")
        if (data.defeitoRelatado !== "Outro") await activeName(tx, "defects", data.defeitoRelatado)
        const now = Timestamp.now()
        tx.create(ref, { numeroRemota: current.numeroRemota, equipmentId: eq.id, tecnicoId: actor.id, tecnicoNome: actor.nome,
          dataEntrada: now, dataFinalizacao: null, status: "em_andamento", operadoraAntes: current.operadoraAtual, operadoraDepois: current.operadoraAtual,
          ...cleanUndefined({ defeitoRelatado: data.defeitoRelatado, defeitoRelatadoOutro: data.defeitoRelatadoOutro }),
          defeitoEncontrado: "", servicosRealizados: [], observacoes: "", checklist: { leituraSIMCard: "Não testado", firmwareAtualizado: "Não testado", sinal: "Não testado", apnEnergiza: "Não testado", comunicacaoMedidor: "Não testado", comunicacaoIRIS: "Não testado" },
        })
        tx.update(eqRef, { situacaoAnterior: current.situacaoRemota || null, situacaoRemota: "Manutenção", situacaoAtualizadaEm: now, situacaoAtualizadaPor: actor.nome,
          emManutencaoPor: actor.id, emManutencaoNome: actor.nome, emManutencaoDesde: now, manutencaoId: ref.id })
        audit(tx, actor, "maintenance_started", eq.id, { maintenanceId: ref.id })
      })
      return ref.id
    }
    case "finalizeMaintenance":
    case "forceFinalizeMaintenance": {
      technician(actor)
      const forced = operation === "forceFinalizeMaintenance"
      if (forced) admin(actor)
      const ref = db.collection("maintenances").doc(id.parse(args[0]))
      const eqRef = equipmentRef(args[1])
      const data = forced ? null : finalizationSchema.parse(args[2])
      const reason = forced ? z.string().trim().min(10, "Descreva o motivo com pelo menos 10 caracteres").max(2000).parse(args[4]) : ""
      await db.runTransaction(async (tx) => {
        const [maintenance, eq] = await Promise.all([tx.get(ref), tx.get(eqRef)])
        if (!maintenance.exists || !eq.exists) throw new HttpError(404, "Manutenção ou equipamento não encontrado")
        const current = maintenance.data()!
        const equipment = eq.data()!
        if (current.equipmentId !== eq.id) throw new HttpError(409, "A manutenção não pertence a este equipamento")
        if (!forced && current.tecnicoId !== actor.id) throw new HttpError(403, "Somente o técnico responsável pode concluir esta manutenção")
        // Repetir a mesma solicitação não libera uma manutenção posterior.
        if (current.status === "finalizada") return
        if (current.status !== "em_andamento" || equipment.manutencaoId !== maintenance.id || equipment.estadoRegistro === "inativo") throw new HttpError(409, "O bloqueio desta manutenção mudou. Consulte a remota novamente")
        if (data) {
          await activeName(tx, "operators", data.operadoraDepois)
          await activeName(tx, "equipment_status", data.situacaoRemota)
          if (data.defeitoEncontrado !== "Outro") await activeName(tx, "defects", data.defeitoEncontrado)
          for (const service of new Set(data.servicosRealizados)) if (service !== "Outro") await activeName(tx, "services", service)
        }
        const now = Timestamp.now()
        const situation = data?.situacaoRemota || "Triagem"
        const garantia = isWarrantySentSituation(situation) ? registerWarranty(tx, actor, eq.id, equipment.numeroRemota, ref.id, {
          situacaoRemota: situation, motivo: data!.motivoGarantia!,
        }) : undefined
        tx.update(ref, { ...(data ? cleanUndefined(data) : { finalizadoForcadamente: true, finalizadoForcadoPor: actor.id, finalizadoForcadoNome: actor.nome, motivoFinalizacaoForcada: reason }),
          situacaoRemota: situation, dataFinalizacao: now, status: "finalizada" })
        tx.update(eqRef, { situacaoAnterior: equipment.situacaoRemota || null, situacaoRemota: situation, situacaoAtualizadaEm: now, situacaoAtualizadaPor: actor.nome,
          ...(garantia ? { garantia } : {}),
          motivoAlteracaoSituacao: forced ? `Manutenção finalizada forçadamente: ${reason}` : "Conclusão de manutenção",
          ...(data ? { operadoraAtual: data.operadoraDepois, status: "Usada" } : {}),
          emManutencaoPor: FieldValue.delete(), emManutencaoNome: FieldValue.delete(), emManutencaoDesde: FieldValue.delete(), manutencaoId: FieldValue.delete() })
        audit(tx, actor, forced ? "maintenance_forced" : "maintenance_finalized", eq.id, { maintenanceId: ref.id, situation })
      })
      return null
    }
    default: {
      const match = /^(create|update|delete)(Defect|Service|Operator|EquipmentSituation)$/.exec(operation)
      if (!match) throw new HttpError(404, "Operação desconhecida")
      admin(actor)
      const collection = ({ Defect: "defects", Service: "services", Operator: "operators", EquipmentSituation: "equipment_status" } as const)[match[2] as "Defect" | "Service" | "Operator" | "EquipmentSituation"]
      if (match[1] === "create") return (await db.collection(collection).add({ nome: name.parse(args[0]), ativo: true })).id
      const ref = db.collection(collection).doc(id.parse(args[0]))
      if (match[1] === "delete") {
        // Preservar referência histórica; o item deixa de estar disponível em novos formulários.
        await ref.update({ ativo: false })
      } else await ref.update(z.object({ nome: name.optional(), ativo: z.boolean().optional() }).parse(args[1]))
      return null
    }
  }
}
