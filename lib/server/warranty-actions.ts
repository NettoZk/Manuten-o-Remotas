import "server-only"
import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore"
import { createHash } from "node:crypto"
import { getAdmin } from "./firebase-admin"
import { HttpError } from "./http"
import { correctionReason, revisionSchema } from "./maintenance-actions"
import { assertEquipmentVersion, operationAudit, writeEquipment, type Actor, type OperationContext } from "./operation-journal"
import { recordEquipmentSituation } from "./equipment-situation-history"
import { cleanUndefined, warrantyReturnSchema, isWarrantySeparatedSituation } from "@/lib/validation"
import { serializeRecord } from "./reporting"

export async function rectifyWarrantyReturn(equipmentId: string, warrantyId: string, input: unknown, reasonInput: unknown, versionInput: unknown, actor: Actor, context: OperationContext = {}) {
  const { garantiaId, observacoesRetorno, ...data } = warrantyReturnSchema.parse(input)
  if (garantiaId !== warrantyId) throw new HttpError(400, "Garantia divergente")
  const reason = correctionReason.parse(reasonInput), version = revisionSchema.parse(versionInput)
  const { db } = getAdmin(), ref = db.collection("equipments").doc(equipmentId), warrantyRef = db.collection("warranties").doc(warrantyId)
  const proposed = db.collection("equipments").doc()
  const numberRef = (number: string) => db.collection("equipment_numbers").doc(createHash("sha256").update(number).digest("hex"))
  await db.runTransaction(async (tx) => {
    const [equipment, warranty] = await Promise.all([tx.get(ref), tx.get(warrantyRef)])
    const eq = equipment.data(), current = warranty.data()
    if (!eq || !current || current.equipmentId !== equipmentId) throw new HttpError(404, "Garantia não encontrada")
    assertEquipmentVersion(eq, version)
    if (current.status !== "retornada" || eq.garantia?.id !== warrantyId || eq.garantia?.status !== "retornada") throw new HttpError(409, "Retifique somente o retorno atual desta remota")
    const oldRef = current.novoEquipmentId ? db.collection("equipments").doc(current.novoEquipmentId) : undefined
    const old = oldRef ? (await tx.get(oldRef)).data() : undefined
    const pending = (value: DocumentData) => value.manutencaoId || value.emManutencaoPor || value.placement?.status === "em_transito" || ["separada", "enviada"].includes(value.garantia?.status)
    if (current.returnOriginalVersion === undefined || current.returnOriginalVersion !== (Number(eq.operationVersion) || 0) || pending(eq) || (old && (current.returnReplacementVersion !== (Number(old.operationVersion) || 0) || old.estadoRegistro === "inativo" || pending(old)))) throw new HttpError(409, "Movimentação posterior ou retorno legado sem versão. A retificação não pode desfazer atividade posterior")
    const changed = data.numeroRemota !== eq.numeroRemota
    if (!changed && data.status !== "Usada") throw new HttpError(400, "Retorno com o mesmo IMEI deve ter condição Usada")
    const targetRef = changed ? oldRef || proposed : ref, targetBefore = changed ? old : eq
    const [reservation, duplicates, situations, operators] = await Promise.all([
      tx.get(numberRef(data.numeroRemota)), tx.get(db.collection("equipments").where("numeroRemota", "==", data.numeroRemota)),
      tx.get(db.collection("equipment_status").where("nome", "==", data.situacaoRemota).where("ativo", "==", true)),
      tx.get(db.collection("operators").where("nome", "==", data.operadoraAtual).where("ativo", "==", true)),
    ])
    if ((reservation.exists && reservation.data()?.equipmentId !== targetRef.id) || duplicates.docs.some((doc) => doc.id !== targetRef.id && !doc.data().cadastroAnulado)) throw new HttpError(409, "Já existe uma remota com este número/IMEI")
    if (situations.empty || operators.empty) throw new HttpError(400, "Escolha situação e operadora ativas")
    const now = Timestamp.now(), garantia = { ...eq.garantia, status: "retornada" }
    const withoutExpected = { ...context, expectedVersion: undefined }
    if (changed) {
      if (old && old.numeroRemota !== data.numeroRemota) tx.delete(numberRef(old.numeroRemota))
      if (!reservation.exists) tx.create(numberRef(data.numeroRemota), { equipmentId: targetRef.id })
      const replacementData = { ...cleanUndefined(data), estadoRegistro: "ativo", ...(old ? {} : { dataCadastro: now }), remotaAnteriorId: equipmentId, remotaAnteriorNumero: eq.numeroRemota, garantiaOrigemId: warrantyId }
      const history = recordEquipmentSituation(tx, targetRef, targetBefore, { ...targetBefore, ...replacementData }, "warranty_return_rectified", now)
      writeEquipment(tx, actor, "rectifyWarrantyReturn", targetRef, targetBefore, { ...replacementData, ...history }, withoutExpected)
      const previous = recordEquipmentSituation(tx, ref, eq, { ...eq, estadoRegistro: "inativo", arquivadoEm: now }, "warranty_return_rectified", now)
      writeEquipment(tx, actor, "rectifyWarrantyReturn", ref, eq, { garantia, estadoRegistro: "inativo", arquivadoEm: eq.arquivadoEm || now, arquivadoPor: actor.nome, arquivadoUserId: actor.id, substituidaPorId: targetRef.id, substituidaPorNumero: data.numeroRemota, motivoArquivamento: "Substituída no retorno da garantia", ...previous }, context)
    } else {
      if (old && oldRef) {
        const history = recordEquipmentSituation(tx, oldRef, old, { ...old, estadoRegistro: "inativo", arquivadoEm: now }, "warranty_registration_invalidated", now)
        writeEquipment(tx, actor, "rectifyWarrantyReturn", oldRef, old, { cadastroAnulado: true, estadoRegistro: "inativo", arquivadoEm: now, arquivadoPor: actor.nome, motivoArquivamento: reason, ...history }, withoutExpected)
        tx.delete(numberRef(old.numeroRemota))
      }
      const history = recordEquipmentSituation(tx, ref, eq, { ...eq, ...data, estadoRegistro: "ativo", arquivadoEm: undefined }, "warranty_return_rectified", now)
      writeEquipment(tx, actor, "rectifyWarrantyReturn", ref, eq, { ...cleanUndefined(data), garantia, estadoRegistro: "ativo", arquivadoEm: FieldValue.delete(), arquivadoPor: FieldValue.delete(), arquivadoUserId: FieldValue.delete(), substituidaPorId: FieldValue.delete(), substituidaPorNumero: FieldValue.delete(), motivoArquivamento: FieldValue.delete(), situacaoAnterior: eq.situacaoRemota || null, situacaoAtualizadaEm: now, situacaoAtualizadaPor: actor.nome, motivoAlteracaoSituacao: reason, ...history }, context)
    }
    const after = { ...current, returnData: { ...data, observacoesRetorno }, observacoesRetorno, situacaoRetorno: data.situacaoRemota, condicaoRetorno: data.status, imeiAlterado: changed, novoEquipmentId: changed ? targetRef.id : null, novoNumeroRemota: changed ? data.numeroRemota : null }
    tx.create(db.collection("warranty_revisions").doc(), { warrantyId, equipmentId, at: now, userId: actor.id, userName: actor.nome, reason, action: "return_rectified", before: current, after })
    tx.update(warrantyRef, { returnData: after.returnData, observacoesRetorno, situacaoRetorno: data.situacaoRemota, condicaoRetorno: data.status, imeiAlterado: changed,
      novoEquipmentId: changed ? targetRef.id : FieldValue.delete(), novoNumeroRemota: changed ? data.numeroRemota : FieldValue.delete(),
      equipmentIds: [...new Set([...(current.equipmentIds || []), equipmentId, ...(changed ? [targetRef.id] : [])])],
      returnOriginalVersion: (Number(eq.operationVersion) || 0) + 1, returnReplacementVersion: changed ? (Number(old?.operationVersion) || 0) + 1 : FieldValue.delete(), revisionCount: (Number(current.revisionCount) || 0) + 1 })
    operationAudit(tx, actor, "warranty_return_rectified", equipmentId, { warrantyId, motivo: reason, numeroRetorno: data.numeroRemota })
  })
  return null
}

export async function getWarrantyRevisions(warrantyId: string) {
  return (await getAdmin().db.collection("warranty_revisions").where("warrantyId", "==", warrantyId).get()).docs.map((doc) => serializeRecord({ ...doc.data(), id: doc.id }) as Record<string, unknown>).sort((a, b) => String(b.at).localeCompare(String(a.at)))
}
export async function correctWarrantyDispatch(equipmentId: string, warrantyId: string, reasonInput: unknown, noDeparture: unknown, versionInput: unknown, actor: Actor, context: OperationContext = {}) {
  const reason = correctionReason.parse(reasonInput), version = revisionSchema.parse(versionInput)
  if (noDeparture !== true) throw new HttpError(400, "Confirme que não houve saída física. Equipamento que saiu deve seguir o retorno da garantia")
  const { db } = getAdmin(), ref = db.collection("equipments").doc(equipmentId), warrantyRef = db.collection("warranties").doc(warrantyId)
  await db.runTransaction(async (tx) => {
    const [equipment, warranty, situations] = await Promise.all([tx.get(ref), tx.get(warrantyRef), tx.get(db.collection("equipment_status").where("ativo", "==", true))])
    const eq = equipment.data(), current = warranty.data()
    if (!eq || !current || current.equipmentId !== equipmentId) throw new HttpError(404, "Garantia não encontrada")
    assertEquipmentVersion(eq, version)
    if (eq.estadoRegistro === "inativo" || eq.garantia?.id !== warrantyId || eq.garantia?.status !== "enviada" || current.status !== "enviada" || eq.manutencaoId) throw new HttpError(409, "Corrija somente um envio aberto sem retorno")
    if (current.sentOperationVersion === undefined || current.sentOperationVersion !== (Number(eq.operationVersion) || 0)) throw new HttpError(409, "Movimentação posterior ou envio legado sem evidência de versão. Confira o procedimento atual")
    const situation = situations.docs.map((doc) => String(doc.data().nome)).find(isWarrantySeparatedSituation)
    if (!situation) throw new HttpError(400, "Cadastre uma situação ativa de separação para garantia")
    const now = Timestamp.now(), after: Record<string, unknown> = { ...current, status: "separada" }
    for (const field of ["enviadaEm", "enviadaPor", "enviadaUserId", "sentOperationVersion", "situacaoEnvio"]) delete after[field]
    tx.create(db.collection("warranty_revisions").doc(), { warrantyId, equipmentId, at: now, userId: actor.id, userName: actor.nome, reason, action: "dispatch_corrected", before: current, after })
    tx.update(warrantyRef, { status: "separada", enviadaEm: FieldValue.delete(), enviadaPor: FieldValue.delete(), enviadaUserId: FieldValue.delete(), sentOperationVersion: FieldValue.delete(), situacaoEnvio: FieldValue.delete(), revisionCount: (Number(current.revisionCount) || 0) + 1 })
    const garantia = { ...eq.garantia, status: "separada" }; delete garantia.enviadaEm
    const history = recordEquipmentSituation(tx, ref, eq, { ...eq, situacaoRemota: situation }, "warranty_dispatch_corrected", now)
    writeEquipment(tx, actor, "correctWarrantyDispatch", ref, eq, { garantia, situacaoAnterior: eq.situacaoRemota, situacaoRemota: situation, situacaoAtualizadaEm: now, situacaoAtualizadaPor: actor.nome, motivoAlteracaoSituacao: reason, ...history }, context)
    operationAudit(tx, actor, "warranty_dispatch_corrected", equipmentId, { warrantyId, motivo: reason, semSaidaFisica: true })
  })
  return null
}
