import "server-only"
import { createHash } from "node:crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { getAdmin } from "./firebase-admin"
import { HttpError } from "./http"
import { correctionReason, revisionSchema } from "./maintenance-actions"
import { assertEquipmentVersion, operationAudit, writeEquipment, type Actor, type OperationContext } from "./operation-journal"
import { recordEquipmentSituation } from "./equipment-situation-history"
export async function hasEquipmentHistory(equipmentId: string) {
  const { db } = getAdmin(), equipment = (await db.collection("equipments").doc(equipmentId).get()).data()
  if (!equipment) throw new HttpError(404, "Equipamento não encontrado")
  if (equipment.garantia || equipment.placement || equipment.remotaAnteriorId || equipment.substituidaPorId) return true
  const records = await Promise.all([
    db.collection("maintenances").where("numeroRemota", "==", equipment.numeroRemota).limit(1).get(),
    db.collection("warranties").where("equipmentIds", "array-contains", equipmentId).limit(1).get(),
    db.collection("equipment_movements").where("equipmentId", "==", equipmentId).limit(1).get(),
  ])
  return records.some((record) => !record.empty)
}

export async function restoreEquipment(equipmentId: string, reasonInput: unknown, versionInput: unknown, actor: Actor, context: OperationContext = {}) {
  const reason = correctionReason.parse(reasonInput), version = revisionSchema.parse(versionInput)
  const { db } = getAdmin(), ref = db.collection("equipments").doc(equipmentId)
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref), current = snapshot.data()
    if (!current) throw new HttpError(404, "Equipamento não encontrado")
    if (current.estadoRegistro !== "inativo") throw new HttpError(409, "Esta remota não está arquivada")
    if (current.substituidaPorId || current.cadastroAnulado || current.motivoArquivamento === "Substituída no retorno da garantia") throw new HttpError(409, "Remota substituída ou invalidada exige o procedimento de retificação de retorno; não pode ser reativada manualmente")
    if (current.manutencaoId || current.emManutencaoPor || ["separada", "enviada"].includes(current.garantia?.status) || current.placement?.status === "em_transito") throw new HttpError(409, "Resolva a etapa pendente antes de reativar")
    assertEquipmentVersion(current, version)
    const numberRef = db.collection("equipment_numbers").doc(createHash("sha256").update(current.numeroRemota).digest("hex"))
    const [number, duplicates] = await Promise.all([tx.get(numberRef), tx.get(db.collection("equipments").where("numeroRemota", "==", current.numeroRemota))])
    if ((number.exists && number.data()?.equipmentId !== equipmentId) || duplicates.docs.some((doc) => doc.id !== equipmentId && doc.data().estadoRegistro !== "inativo")) throw new HttpError(409, "Outro cadastro está vinculado a este número. Confira os vínculos antes de reativar")
    const now = Timestamp.now()
    const next = { ...current, estadoRegistro: "ativo", arquivadoEm: undefined }
    const history = recordEquipmentSituation(tx, ref, current, next, "restored", now)
    writeEquipment(tx, actor, "restoreEquipment", ref, current, { estadoRegistro: "ativo", arquivadoEm: FieldValue.delete(), arquivadoPor: FieldValue.delete(), arquivadoUserId: FieldValue.delete(),
      reativadaEm: now, reativadaPor: actor.nome, reativadaUserId: actor.id, motivoReativacao: reason, ...history }, context)
    if (!number.exists) tx.create(numberRef, { equipmentId })
    operationAudit(tx, actor, "equipment_restored", equipmentId, { motivo: reason })
  })
  return null
}
