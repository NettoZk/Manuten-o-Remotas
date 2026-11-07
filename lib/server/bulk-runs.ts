import "server-only"
import { createHash } from "node:crypto"
import { Timestamp } from "firebase-admin/firestore"
import type { BulkResult } from "@/lib/bulk-movements"
import { getAdmin } from "./firebase-admin"
import { HttpError } from "./http"

export async function getBulkReceipt(runId: string, userId: string) {
  const record = await getAdmin().db.collection("bulk_runs").doc(runId).get()
  const data = record.data()
  if (!data || data.expiresAt.toMillis() < Date.now()) throw new HttpError(404, "Comprovante indisponível ou vencido")
  if (data.userId !== userId) throw new HttpError(403, "Este comprovante pertence a outro usuário")
  const results: BulkResult[] = Array.from({ length: data.count }, (_, index) => data.results[index] || { ok: false, uncertain: true, error: "Resultado ainda não confirmado. Consulte o cadastro antes de repetir" })
  return { state: data.state as string, results }
}
export async function reserveBulkRun(runId: string, userId: string, entries: unknown[]) {
  const ref = getAdmin().db.collection("bulk_runs").doc(runId)
  const hash = createHash("sha256").update(JSON.stringify(entries)).digest("hex")
  const created = await getAdmin().db.runTransaction(async (tx) => {
    const old = await tx.get(ref)
    if (old.exists) {
      if (old.data()?.userId !== userId) throw new HttpError(403, "Este comprovante pertence a outro usuário")
      if (old.data()?.hash !== hash) throw new HttpError(409, "Este identificador já foi usado com outros dados")
      return false
    }
    tx.create(ref, { userId, hash, count: entries.length, results: [], state: "processing", createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000) })
    return true
  })
  return { ref, created }
}
