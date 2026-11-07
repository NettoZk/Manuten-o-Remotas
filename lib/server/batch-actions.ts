import "server-only"
import { Timestamp, type DocumentData } from "firebase-admin/firestore"
import { getAdmin } from "./firebase-admin"
import { HttpError } from "./http"
import { correctionReason } from "./maintenance-actions"
import { operationAudit, writeEquipment, type Actor } from "./operation-journal"
import { recordEquipmentSituation } from "./equipment-situation-history"
import { serializeRecord } from "./reporting"

export async function getBatchHistory(actor: Actor) {
  const collection = getAdmin().db.collection("operation_batches")
  const records = await (actor.tipo === "admin" ? collection.orderBy("createdAt", "desc").limit(50) : collection.where("userId", "==", actor.id)).get()
  return records.docs.map((doc) => serializeRecord({ ...doc.data(), id: doc.id }) as Record<string, unknown>).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50)
}
async function batchAccess(batchId: string, actor: Actor) {
  const ref = getAdmin().db.collection("operation_batches").doc(batchId), snapshot = await ref.get()
  if (!snapshot.exists) throw new HttpError(404, "Lote indisponível")
  if (actor.tipo !== "admin" && snapshot.data()?.userId !== actor.id) throw new HttpError(403, "Este lote pertence a outro usuário")
  return ref
}
export async function getBatchItems(batchId: string, actor: Actor) {
  const ref = await batchAccess(batchId, actor)
  const [items, changes] = await Promise.all([ref.collection("items").get(), getAdmin().db.collection("operational_changes").where("batchId", "==", batchId).get()])
  const equipmentId = (data: DocumentData) => {
    const candidate = data.operation === "createMaintenance" ? data.args?.[0]?.equipmentId : data.operation === "finalizeMaintenance" ? data.args?.[1] : data.args?.[0]
    return typeof candidate === "string" && candidate.length > 0 && candidate.length <= 200 && !candidate.includes("/") ? candidate : undefined
  }
  const legacyIds = [...new Set(items.docs.filter((doc) => !doc.data().number).map((doc) => equipmentId(doc.data())).filter((id): id is string => !!id))]
  const legacyEquipment = legacyIds.length ? await getAdmin().db.getAll(...legacyIds.map((id) => getAdmin().db.collection("equipments").doc(id))) : []
  const legacyNumbers = new Map(legacyEquipment.map((doc) => [doc.id, doc.data()?.numeroRemota]))
  return items.docs.map((item) => {
    const data = item.data(), logs = changes.docs.filter((doc) => doc.data().row === data.row)
    const primary = logs.find((doc) => doc.data().before) || logs[0]
    const inputNumber = typeof data.args?.[0]?.numeroRemota === "string" ? data.args[0].numeroRemota : undefined
    const inferredNumber = !data.number ? inputNumber || legacyNumbers.get(equipmentId(data) || "") : undefined
    return serializeRecord({ ...data, id: item.id, ...(inferredNumber ? { number: inferredNumber, numberInferred: !inputNumber } : {}), ...(primary ? { changeId: primary.id, equipmentId: primary.data().equipmentId, before: primary.data().before, after: primary.data().after, ...(primary.data().procedure ? { procedure: primary.data().procedure } : {}) } : {}), hasCommittedChange: !!primary }) as Record<string, unknown>
  }).sort((a, b) => Number(a.row) - Number(b.row))
}
export async function reverseBatchItem(batchId: string, itemId: string, reasonInput: unknown, actor: Actor) {
  const reason = correctionReason.parse(reasonInput), batch = await batchAccess(batchId, actor)
  const { db } = getAdmin(), itemRef = batch.collection("items").doc(itemId)
  await db.runTransaction(async (tx) => {
    const item = (await tx.get(itemRef)).data()
    if (!item?.ok || item.reversedAt) throw new HttpError(409, "Selecione um item concluído que ainda não foi corrigido")
    const logs = await tx.get(db.collection("operational_changes").where("batchId", "==", batchId))
    const matching = logs.docs.filter((doc) => doc.data().row === item.row)
    if (matching.length !== 1) throw new HttpError(409, "Este movimento exige o procedimento específico de retificação de garantia")
    const log = matching[0], change = log.data(), ref = db.collection("equipments").doc(change.equipmentId), eq = (await tx.get(ref)).data()
    if (!eq || eq.lastChangeId !== log.id || eq.operationVersion !== change.afterVersion) throw new HttpError(409, "Movimentação posterior impede desfazer este item. Consulte o procedimento atual")
    if (eq.manutencaoId || eq.emManutencaoPor || ["separada", "enviada"].includes(eq.garantia?.status) || eq.placement?.status === "em_transito" || eq.substituidaPorId || eq.cadastroAnulado) throw new HttpError(409, "Utilize o cancelamento ou a retificação específica da etapa pendente")
    const now = Timestamp.now(), before = change.before as DocumentData | null
    let patch: DocumentData
    if (change.operation === "createEquipment") patch = { estadoRegistro: "inativo", arquivadoEm: now, arquivadoPor: actor.nome, arquivadoUserId: actor.id, motivoArquivamento: reason }
    else if (["updateEquipment", "updateEquipmentWithLog", "updateEquipmentSituationManual"].includes(change.operation) && before) {
      patch = Object.fromEntries(["modelo", "anoFabricacao", "lote", "operadoraAtual", "status", "situacaoRemota", "observacoes"].map((key) => [key, before[key] ?? (key === "observacoes" ? "" : eq[key])]).filter(([, value]) => value !== undefined))
    } else throw new HttpError(409, "Utilize Reativar remota, Cancelar abertura ou o procedimento específico de manutenção/garantia para corrigir este item")
    const history = recordEquipmentSituation(tx, ref, eq, { ...eq, ...patch }, "batch_item_reversed", now)
    const metadata = writeEquipment(tx, actor, "reverseBatchItem", ref, eq, { ...patch, ...history, motivoAlteracaoSituacao: reason, situacaoAtualizadaEm: now, situacaoAtualizadaPor: actor.nome })
    tx.update(itemRef, { reversedAt: now, reversedBy: actor.nome, reversalReason: reason, reversalChangeId: metadata.lastChangeId })
    operationAudit(tx, actor, "batch_item_reversed", ref.id, { batchId, itemId, motivo: reason })
  })
  return null
}
