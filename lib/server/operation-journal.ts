import "server-only"
import { FieldValue, Timestamp, type DocumentData, type DocumentReference, type Transaction } from "firebase-admin/firestore"
import type { requireUser } from "./http"
import { HttpError } from "./http"
import { getAdmin } from "./firebase-admin"

export type Actor = Awaited<ReturnType<typeof requireUser>>
export interface OperationContext { batchId?: string; row?: number; expectedVersion?: number; procedure?: { kind: string; id: string; before: DocumentData | null; after: DocumentData | null } }
export function assertEquipmentVersion(current: DocumentData, expected: number | undefined) {
  if (expected !== undefined && (Number(current.operationVersion) || 0) !== expected) throw new HttpError(409, "O equipamento foi atualizado. Consulte os dados novamente antes de confirmar")
}
export function applyEquipmentPatch(before: DocumentData | undefined, patch: DocumentData) {
  const next = { ...before }
  for (const [key, value] of Object.entries(patch)) {
    if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete next[key]
    else if (value !== undefined) next[key] = value
  }
  return next
}
// Somente escrita: todos os reads da operação precisam ocorrer antes desta função.
export function writeEquipment(tx: Transaction, actor: Actor, operation: string, ref: DocumentReference, before: DocumentData | undefined, patch: DocumentData | null, context: OperationContext = {}) {
  if (before) assertEquipmentVersion(before, context.expectedVersion)
  const change = getAdmin().db.collection("operational_changes").doc()
  const operationVersion = (Number(before?.operationVersion) || 0) + 1
  const metadata = { operationVersion, lastChangeId: change.id }
  const after = patch === null ? null : { ...applyEquipmentPatch(before, patch), ...metadata }
  tx.create(change, { equipmentId: ref.id, operation, userId: actor.id, userName: actor.nome, at: Timestamp.now(), before: before || null, after,
    afterVersion: operationVersion, ...(context.batchId ? { batchId: context.batchId, row: context.row ?? 0 } : {}), ...(context.procedure ? { procedure: context.procedure } : {}) })
  if (patch === null) tx.delete(ref)
  else if (before) tx.update(ref, { ...patch, ...metadata })
  else tx.create(ref, after!)
  return metadata
}
export function operationAudit(tx: Transaction, actor: Actor, action: string, equipmentId: string, detail: DocumentData = {}) {
  tx.create(getAdmin().db.collection("audit_logs").doc(), { action, equipmentId, userId: actor.id, userName: actor.nome, at: Timestamp.now(), ...detail })
}
