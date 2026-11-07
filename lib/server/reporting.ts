import "server-only"
import { FieldPath, Timestamp, type DocumentData, type Query } from "firebase-admin/firestore"
import { z } from "zod"
import { monthKey } from "@/lib/dashboard"
import { getAdmin } from "./firebase-admin"
import { HttpError } from "./http"

export const historyFiltersSchema = z.object({
  numero: z.string().max(100).optional(), modelo: z.string().max(160).optional(), tecnico: z.string().max(200).optional(),
  operadora: z.string().max(100).optional(), procedureId: z.string().max(200).refine((s) => !s.includes("/")).optional(),
  dateFrom: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(), dateTo: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
})
const cursorSchema = z.object({ seconds: z.number().int(), nanoseconds: z.number().int().min(0).max(999999999), id: z.string().min(1).max(200).refine((s) => !s.includes("/")) })
export function serializeRecord(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(serializeRecord)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeRecord(item)]))
  return value
}
const dateAt = (date: string, end = false) => {
  const value = new Date(`${date}T${end ? "23:59:59.999" : "00:00:00.000"}-03:00`)
  if (!Number.isFinite(value.getTime())) throw new HttpError(400, "Data inválida")
  return Timestamp.fromDate(value)
}
export async function maintenancePage(input: unknown, after?: unknown) {
  const filters = historyFiltersSchema.parse(input)
  const cursor = after ? cursorSchema.parse(after) : null
  const { db } = getAdmin()
  let base: Query = db.collection("maintenances")
  if (filters.dateFrom) base = base.where("dataEntrada", ">=", dateAt(filters.dateFrom))
  if (filters.dateTo) base = base.where("dataEntrada", "<=", dateAt(filters.dateTo, true))
  const matches = async (data: DocumentData) => {
    if (filters.numero && !String(data.numeroRemota).toLowerCase().includes(filters.numero.toLowerCase())) return false
    if (filters.tecnico && data.tecnicoId !== filters.tecnico) return false
    if (filters.operadora && ![data.operadoraAntes, data.operadoraDepois].includes(filters.operadora)) return false
    if (filters.modelo) {
      let model = data.equipmentSnapshot?.modelo
      if (!data.equipmentSnapshot) model = (await db.collection("equipments").where("numeroRemota", "==", data.numeroRemota).limit(1).get()).docs[0]?.data().modelo
      if (!String(model || "").toLowerCase().includes(filters.modelo.toLowerCase())) return false
    }
    return true
  }
  if (filters.procedureId) {
    const doc = await db.collection("maintenances").doc(filters.procedureId).get()
    const data = doc.data()
    const inRange = data && (!filters.dateFrom || data.dataEntrada.toMillis() >= dateAt(filters.dateFrom).toMillis()) && (!filters.dateTo || data.dataEntrada.toMillis() <= dateAt(filters.dateTo, true).toMillis())
    return { records: data && inRange && await matches(data) ? [serializeRecord({ ...data, id: doc.id })] : [], cursor: null }
  }
  let query = base.orderBy("dataEntrada", "desc").orderBy(FieldPath.documentId(), "desc")
  if (cursor) query = query.startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), cursor.id)
  const snapshot = await query.limit(101).get()
  const records: unknown[] = []
  let consumed = 0
  for (const doc of snapshot.docs.slice(0, 100)) {
    consumed++
    if (await matches(doc.data())) records.push(serializeRecord({ ...doc.data(), id: doc.id }))
    if (records.length === 50) break
  }
  const last = snapshot.docs[consumed - 1]
  const at = last?.data().dataEntrada as Timestamp | undefined
  return { records, cursor: last && at && consumed < snapshot.size ? { seconds: at.seconds, nanoseconds: at.nanoseconds, id: last.id } : null }
}

function monthBounds(month: string) {
  const [year, number] = month.split("-").map(Number)
  return [Timestamp.fromDate(new Date(Date.UTC(year, number - 1, 1, 3))), Timestamp.fromDate(new Date(Date.UTC(year, number, 1, 3)))]
}
export async function dashboardMetrics(month: string) {
  const { db } = getAdmin()
  const records = db.collection("maintenances")
  const count = async (query: Query) => (await query.count().get()).data().count
  const completed = async (key: string) => { const [from, to] = monthBounds(key); return count(records.where("dataFinalizacao", ">=", from).where("dataFinalizacao", "<", to)) }
  const [year, number] = monthKey(new Date()).split("-").map(Number)
  const keys = Array.from({ length: 6 }, (_, index) => { const date = new Date(Date.UTC(year, number - 6 + index, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` })
  const [totalMaintenances, inProgress, completedThisMonth, recent, months] = await Promise.all([
    count(records), count(records.where("status", "==", "em_andamento")), completed(month), records.orderBy("dataEntrada", "desc").limit(5).get(),
    Promise.all(keys.map(async (key) => ({ mes: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${key}-01T12:00:00Z`)), total: await completed(key) }))),
  ])
  return { totalMaintenances, inProgress, completedThisMonth, recentMaintenances: recent.docs.map((doc) => serializeRecord({ ...doc.data(), id: doc.id })), manutencoesPorMes: months }
}
export async function technicianTotals() {
  const docs = await getAdmin().db.collection("maintenances").select("tecnicoId", "tecnicoNome").get()
  const totals = new Map<string, { id: string; name: string; total: number }>()
  for (const doc of docs.docs) {
    const data = doc.data()
    const id = String(data.tecnicoId || "desconhecido")
    const old = totals.get(id)
    totals.set(id, { id, name: String(data.tecnicoNome || "Desconhecido"), total: (old?.total || 0) + 1 })
  }
  return [...totals.values()].sort((a, b) => b.total - a.total)
}
export async function equipmentMovements(equipmentId: string, after?: unknown) {
  const { db } = getAdmin()
  if (!(await db.collection("equipments").doc(equipmentId).get()).exists) throw new HttpError(404, "Equipamento não encontrado")
  const cursor = after ? cursorSchema.parse(after) : null
  const base = db.collection("audit_logs").where("equipmentId", "==", equipmentId)
  let query = base.orderBy("at", "desc").orderBy(FieldPath.documentId(), "desc")
  if (cursor) query = query.startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), cursor.id)
  let docs
  try { docs = (await query.limit(21).get()).docs }
  catch (error) {
    if ((error as { code?: number }).code !== 9) throw error
    // Compatibilidade até publicar o índice: restrito à remota, nunca ao acervo inteiro.
    docs = (await base.get()).docs.sort((a, b) => b.data().at.toMillis() - a.data().at.toMillis() || b.id.localeCompare(a.id))
    if (cursor) { const index = docs.findIndex((doc) => doc.id === cursor.id); docs = index < 0 ? [] : docs.slice(index + 1) }
    docs = docs.slice(0, 21)
  }
  const selected = docs.slice(0, 20)
  const last = selected.at(-1)
  return {
    records: selected.map((doc) => { const data = doc.data(); return { id: doc.id, action: String(data.action), userName: String(data.userName || "Não informado"), at: data.at.toDate().toISOString(), situation: data.situation || data.changes?.situacaoRemota || null, reason: data.motivo || null } }),
    cursor: docs.length > 20 && last ? { id: last.id, seconds: last.data().at.seconds, nanoseconds: last.data().at.nanoseconds } : null,
  }
}
