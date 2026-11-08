import "server-only"
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore"
import { z } from "zod"
import { getAdmin } from "./firebase-admin"
import { HttpError } from "./http"
import { assertEquipmentVersion, operationAudit, writeEquipment, type Actor, type OperationContext } from "./operation-journal"
import { recordEquipmentSituation } from "./equipment-situation-history"
import { cleanUndefined, finalizationSchema, isMaintenanceSituation, isWarrantySentSituation, isWarrantySeparatedSituation } from "@/lib/validation"
import { serializeRecord } from "./reporting"

export const correctionReason = z.string().trim().min(10, "Descreva o motivo com pelo menos 10 caracteres").max(2000)
export const revisionSchema = z.number().int().nonnegative()
export async function getAssignableTechnicians() {
  const users = await getAdmin().db.collection("users").where("ativo", "==", true).get()
  return users.docs.filter((doc) => ["admin", "tecnico"].includes(doc.data().tipo)).map((doc) => ({ id: doc.id, nome: String(doc.data().nome) })).sort((a, b) => a.nome.localeCompare(b.nome))
}
export async function transferMaintenance(maintenanceId: string, equipmentId: string, targetId: string, reasonInput: unknown, versionInput: unknown, actor: Actor, context: OperationContext = {}) {
  const reason = correctionReason.parse(reasonInput), version = revisionSchema.parse(versionInput)
  const { db } = getAdmin()
  const ref = db.collection("maintenances").doc(maintenanceId), eqRef = db.collection("equipments").doc(equipmentId)
  await db.runTransaction(async (tx) => {
    const [maintenance, equipment, target] = await Promise.all([tx.get(ref), tx.get(eqRef), tx.get(db.collection("users").doc(targetId))])
    const current = maintenance.data(), eq = equipment.data(), user = target.data()
    if (!current || !eq || current.equipmentId !== equipmentId) throw new HttpError(404, "Atendimento não encontrado")
    if (!user?.ativo || !["admin", "tecnico"].includes(user.tipo)) throw new HttpError(400, "Escolha um técnico ou administrador ativo")
    if (current.tecnicoId === targetId) throw new HttpError(409, "Escolha um responsável diferente do atual")
    if (current.status !== "em_andamento" || eq.manutencaoId !== maintenanceId || eq.estadoRegistro === "inativo") throw new HttpError(409, "Transfira somente uma manutenção em andamento vinculada à remota")
    assertEquipmentVersion(eq, version)
    const now = Timestamp.now()
    tx.create(db.collection("maintenance_transfers").doc(), { maintenanceId, equipmentId, at: now, reason, userId: actor.id, userName: actor.nome,
      previousUserId: current.tecnicoId, previousUserName: current.tecnicoNome, targetUserId: targetId, targetUserName: user.nome })
    tx.update(ref, { tecnicoId: targetId, tecnicoNome: user.nome, tecnicoAberturaId: current.tecnicoAberturaId || current.tecnicoId,
      tecnicoAberturaNome: current.tecnicoAberturaNome || current.tecnicoNome, draftVersion: (Number(current.draftVersion) || 0) + 1,
      transferCount: (Number(current.transferCount) || 0) + 1, transferidaEm: now, transferidaPor: actor.nome, motivoTransferencia: reason })
    writeEquipment(tx, actor, "transferMaintenance", eqRef, eq, { emManutencaoPor: targetId, emManutencaoNome: user.nome, responsavelDesde: now }, context)
    operationAudit(tx, actor, "maintenance_transferred", equipmentId, { maintenanceId, motivo: reason, previousUserName: current.tecnicoNome, targetUserName: user.nome })
  })
  return null
}
async function activeReference(tx: Transaction, collection: string, value: string) {
  if ((await tx.get(getAdmin().db.collection(collection).where("nome", "==", value).where("ativo", "==", true))).empty) throw new HttpError(400, `Valor indisponível na lista: ${value}`)
}
export async function getMaintenanceRevisions(maintenanceId: string) {
  const { db } = getAdmin()
  if (!(await db.collection("maintenances").doc(maintenanceId).get()).exists) throw new HttpError(404, "Atendimento não encontrado")
  return (await db.collection("maintenance_revisions").where("maintenanceId", "==", maintenanceId).get()).docs.map((doc) => serializeRecord({ ...doc.data(), id: doc.id }) as Record<string, unknown>).sort((a, b) => String(b.at).localeCompare(String(a.at)))
}
export async function rectifyMaintenance(maintenanceId: string, equipmentId: string, input: unknown, reasonInput: unknown, versionInput: unknown, actor: Actor, context: OperationContext = {}) {
  const data = finalizationSchema.parse(input)
  const reason = correctionReason.parse(reasonInput), version = revisionSchema.parse(versionInput)
  const { db } = getAdmin()
  const ref = db.collection("maintenances").doc(maintenanceId), eqRef = db.collection("equipments").doc(equipmentId), revision = db.collection("maintenance_revisions").doc()
  await db.runTransaction(async (tx) => {
    const [maintenance, equipment] = await Promise.all([tx.get(ref), tx.get(eqRef)])
    const current = maintenance.data(), eq = equipment.data()
    if (!current || !eq || current.equipmentId !== equipmentId) throw new HttpError(404, "Atendimento não encontrado")
    if (current.status !== "finalizada" || current.finalizadoForcadamente) throw new HttpError(409, "Retifique somente uma conclusão técnica normal; finalização forçada não representa serviço executado")
    assertEquipmentVersion(eq, version)
    const changedResult = data.situacaoRemota !== current.situacaoRemota || data.operadoraDepois !== current.operadoraDepois
    const latest = current.completionRevision !== undefined && current.completionRevision === (Number(eq.operationVersion) || 0)
    if (changedResult && (!latest || eq.manutencaoId || eq.emManutencaoPor || eq.estadoRegistro === "inativo" || ["separada", "enviada"].includes(eq.garantia?.status) || eq.placement?.status === "em_transito")) throw new HttpError(409, "Existe movimentação posterior ou etapa vinculada. Corrija somente os dados técnicos ou utilize o procedimento da etapa atual")
    if (data.defeitoEncontrado !== current.defeitoEncontrado && data.defeitoEncontrado !== "Outro") await activeReference(tx, "defects", data.defeitoEncontrado)
    for (const service of new Set(data.servicosRealizados)) if (service !== "Outro" && !current.servicosRealizados?.includes(service)) await activeReference(tx, "services", service)
    if (data.operadoraDepois !== current.operadoraDepois) await activeReference(tx, "operators", data.operadoraDepois)
    if (data.situacaoRemota !== current.situacaoRemota) await activeReference(tx, "equipment_status", data.situacaoRemota)
    const linkedWarranty = eq.garantia?.maintenanceId === maintenanceId && data.motivoGarantia !== current.motivoGarantia && ["separada", "enviada"].includes(eq.garantia?.status)
      ? await tx.get(db.collection("warranties").doc(eq.garantia.id)) : undefined
    const patch: Record<string, unknown> = {}
    const now = Timestamp.now()
    if (linkedWarranty?.exists) {
      const previous = linkedWarranty.data()!, after = { ...previous, motivo: data.motivoGarantia || "" }
      tx.create(db.collection("warranty_revisions").doc(), { warrantyId: linkedWarranty.id, equipmentId, at: now, userId: actor.id, userName: actor.nome, reason, action: "assessment_reason_rectified", before: previous, after })
      tx.update(linkedWarranty.ref, { motivo: data.motivoGarantia || "", revisionCount: (Number(previous.revisionCount) || 0) + 1 })
      patch.garantia = { ...eq.garantia, motivo: data.motivoGarantia || "" }
    }
    if (changedResult) {
      Object.assign(patch, { operadoraAtual: data.operadoraDepois, situacaoAnterior: eq.situacaoRemota || null, situacaoRemota: data.situacaoRemota, situacaoAtualizadaEm: now, situacaoAtualizadaPor: actor.nome, motivoAlteracaoSituacao: reason })
      if (isWarrantySeparatedSituation(data.situacaoRemota)) {
        const warranty = db.collection("warranties").doc()
        const garantia = { id: warranty.id, status: "separada", separadaEm: now, motivo: data.motivoGarantia!, maintenanceId }
        tx.create(warranty, { ...garantia, equipmentId, numeroRemota: eq.numeroRemota, equipmentIds: [equipmentId], separadaPor: actor.nome, separadaUserId: actor.id, retificacaoOrigemId: revision.id })
        patch.garantia = garantia
        operationAudit(tx, actor, "warranty_prepared", equipmentId, { warrantyId: warranty.id, maintenanceId, motivo: data.motivoGarantia })
      }
      Object.assign(patch, recordEquipmentSituation(tx, eqRef, eq, { ...eq, ...patch }, "maintenance_rectified", now))
    }
    const update = { ...cleanUndefined(data), revisionCount: (Number(current.revisionCount) || 0) + 1, retificadaEm: now, retificadaPor: actor.nome, motivoRetificacao: reason,
      ...(latest ? { completionRevision: (Number(eq.operationVersion) || 0) + 1 } : {}) }
    tx.create(revision, { maintenanceId, equipmentId, at: now, userId: actor.id, userName: actor.nome, reason, before: current, after: { ...current, ...update }, changedResult })
    tx.update(ref, update)
    writeEquipment(tx, actor, "rectifyMaintenance", eqRef, eq, patch, context)
    operationAudit(tx, actor, "maintenance_rectified", equipmentId, { maintenanceId, revisionId: revision.id, motivo: reason })
  })
  return null
}
export async function cancelMaintenance(maintenanceId: string, equipmentId: string, reasonInput: unknown, versionInput: unknown, actor: Actor, context: OperationContext = {}) {
  const reason = correctionReason.parse(reasonInput)
  const version = revisionSchema.parse(versionInput)
  const { db } = getAdmin()
  const ref = db.collection("maintenances").doc(maintenanceId)
  const eqRef = db.collection("equipments").doc(equipmentId)
  await db.runTransaction(async (tx) => {
    const [maintenance, equipment] = await Promise.all([tx.get(ref), tx.get(eqRef)])
    const current = maintenance.data(), eq = equipment.data()
    if (!current || !eq) throw new HttpError(404, "Atendimento não encontrado")
    if (actor.tipo !== "admin" && current.tecnicoId !== actor.id) throw new HttpError(403, "Somente o responsável ou administrador pode cancelar a abertura")
    if (current.equipmentId !== equipmentId || current.status !== "em_andamento" || eq.manutencaoId !== maintenanceId || eq.estadoRegistro === "inativo") throw new HttpError(409, "A manutenção não está aberta e vinculada a esta remota")
    assertEquipmentVersion(eq, version)
    const initial = String(current.initialSituation || eq.situacaoAnterior || "Triagem")
    const situation = isMaintenanceSituation(initial) || isWarrantySentSituation(initial) || isWarrantySeparatedSituation(initial) ? "Triagem" : initial
    const now = Timestamp.now()
    const history = recordEquipmentSituation(tx, eqRef, eq, { ...eq, situacaoRemota: situation }, "maintenance_cancelled", now)
    tx.update(ref, { status: "cancelada", canceladaEm: now, canceladaPor: actor.nome, canceladaUserId: actor.id, motivoCancelamento: reason })
    writeEquipment(tx, actor, "cancelMaintenance", eqRef, eq, { situacaoAnterior: eq.situacaoRemota || null, situacaoRemota: situation, situacaoAtualizadaEm: now,
      situacaoAtualizadaPor: actor.nome, motivoAlteracaoSituacao: reason, emManutencaoPor: FieldValue.delete(), emManutencaoNome: FieldValue.delete(),
      emManutencaoDesde: FieldValue.delete(), manutencaoId: FieldValue.delete(), ...history }, context)
    operationAudit(tx, actor, "maintenance_cancelled", equipmentId, { maintenanceId, motivo: reason })
  })
  return null
}
