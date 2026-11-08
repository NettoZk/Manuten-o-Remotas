import "server-only"
import { Timestamp } from "firebase-admin/firestore"
import { z } from "zod"
import { getAdmin } from "./firebase-admin"
import { HttpError } from "./http"
import { revisionSchema } from "./maintenance-actions"
import { assertEquipmentVersion, operationAudit, writeEquipment, type Actor, type OperationContext } from "./operation-journal"
import { recordEquipmentSituation } from "./equipment-situation-history"
import { serializeRecord } from "./reporting"

export const dispatchSchema = z.object({ type: z.enum(["polo", "estoque"]), destination: z.string().trim().min(2).max(160), recipientName: z.string().trim().min(2).max(160), notes: z.string().trim().max(2000).default("") })
export async function getPhysicalMovements(equipmentId: string) {
  return (await getAdmin().db.collection("equipment_movements").where("equipmentId", "==", equipmentId).get()).docs.map((doc) => serializeRecord({ ...doc.data(), id: doc.id }) as Record<string, unknown>).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)))
}
export async function dispatchEquipment(equipmentId: string, input: unknown, versionInput: unknown, actor: Actor, context: OperationContext = {}) {
  const data = dispatchSchema.parse(input), version = revisionSchema.parse(versionInput)
  const { db } = getAdmin(), ref = db.collection("equipments").doc(equipmentId), movement = db.collection("equipment_movements").doc()
  await db.runTransaction(async (tx) => {
    const eq = (await tx.get(ref)).data()
    if (!eq || eq.estadoRegistro === "inativo") throw new HttpError(404, "Equipamento indisponível")
    assertEquipmentVersion(eq, version)
    if (eq.manutencaoId || eq.emManutencaoPor || ["separada", "enviada"].includes(eq.garantia?.status)) throw new HttpError(409, "Conclua o procedimento de manutenção ou garantia antes de movimentar")
    if (eq.placement?.status === "em_transito") throw new HttpError(409, "Esta remota já está em trânsito. Confirme o recebimento antes de movimentar novamente")
    const now = Timestamp.now(), placement = { id: movement.id, ...data, status: "em_transito", sentAt: now, sentBy: actor.nome, sentUserId: actor.id }
    tx.create(movement, { ...placement, equipmentId, numeroRemota: eq.numeroRemota, origin: eq.placement?.status === "recebida" ? eq.placement.destination : "Origem não registrada" })
    writeEquipment(tx, actor, "dispatchEquipment", ref, eq, { placement }, context)
    operationAudit(tx, actor, "physical_dispatched", equipmentId, { movementId: movement.id, motivo: `Destino: ${data.destination}. Responsável previsto: ${data.recipientName}` })
  })
  return movement.id
}
export async function receiveEquipment(equipmentId: string, movementId: string, notesInput: unknown, versionInput: unknown, actor: Actor, context: OperationContext = {}) {
  const notes = z.string().trim().max(2000).parse(notesInput), version = revisionSchema.parse(versionInput)
  const { db } = getAdmin(), ref = db.collection("equipments").doc(equipmentId), movementRef = db.collection("equipment_movements").doc(movementId)
  await db.runTransaction(async (tx) => {
    const [snapshot, movement] = await Promise.all([tx.get(ref), tx.get(movementRef)])
    const eq = snapshot.data(), current = movement.data()
    if (!eq || !current || current.equipmentId !== equipmentId) throw new HttpError(404, "Movimentação não encontrada")
    assertEquipmentVersion(eq, version)
    if (eq.estadoRegistro === "inativo" || eq.placement?.id !== movementId || eq.placement?.status !== "em_transito" || current.status !== "em_transito" || eq.manutencaoId || ["separada", "enviada"].includes(eq.garantia?.status)) throw new HttpError(409, "Não há recebimento pendente compatível. Consulte a remota novamente")
    const situations = await tx.get(db.collection("equipment_status").where("ativo", "==", true))
    const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    const situation = situations.docs.map((doc) => String(doc.data().nome)).find((value) => new RegExp(`^disponibilizad[ao] para ${current.type === "polo" ? "polo" : "estoque"}$`).test(normalized(value)))
    if (!situation) throw new HttpError(400, `Cadastre uma situação ativa de disponibilização para ${current.type}`)
    const now = Timestamp.now(), receipt = { status: "recebida", receivedAt: now, receivedBy: actor.nome, receivedUserId: actor.id, receiptNotes: notes }
    tx.update(movementRef, receipt)
    const history = recordEquipmentSituation(tx, ref, eq, { ...eq, situacaoRemota: situation }, "physical_received", now)
    writeEquipment(tx, actor, "receiveEquipment", ref, eq, { placement: { ...eq.placement, ...receipt }, situacaoAnterior: eq.situacaoRemota || null, situacaoRemota: situation, situacaoAtualizadaEm: now, situacaoAtualizadaPor: actor.nome, motivoAlteracaoSituacao: `Recebimento confirmado em ${current.destination}`, ...history }, context)
    operationAudit(tx, actor, "physical_received", equipmentId, { movementId, motivo: `Recebimento em ${current.destination}. ${notes}` })
  })
  return null
}
