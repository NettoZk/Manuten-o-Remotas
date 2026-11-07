import "server-only"
import { Timestamp } from "firebase-admin/firestore"
import { getAdmin } from "./firebase-admin"
import { recurrenceReport } from "@/lib/recurrence"
import type { Maintenance } from "@/lib/types"
export async function getRecurrenceReport(days: number, equipmentId?: string) {
  const now = new Date(), from = Timestamp.fromMillis(now.getTime() - days * 86400000)
  const base = getAdmin().db.collection("maintenances")
  // Um campo temporal no acervo; por remota, evita depender de índice composto.
  const records = await (equipmentId ? base.where("equipmentId", "==", equipmentId) : base.where("dataFinalizacao", ">=", from).where("dataFinalizacao", "<=", Timestamp.fromDate(now))).select("equipmentId", "numeroRemota", "status", "dataFinalizacao", "finalizadoForcadamente", "defeitoEncontrado", "defeitoEncontradoOutro").get()
  return recurrenceReport(records.docs.map((doc) => ({ ...doc.data(), id: doc.id, dataFinalizacao: doc.data().dataFinalizacao?.toDate?.() || null } as Maintenance)), days, now)
}
