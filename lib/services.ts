import { collection, getDocs, query, where, limit } from "firebase/firestore"
import { db } from "./firebase"
import { apiRequest } from "./api-client"
import { equipmentFromDoc, maintenanceFromDoc } from "./firestore-records"
import { isWarrantyImeiChangeSituation } from "./equipment-situations"
import type { Equipment, Maintenance, User, UserRole, Defect, Service, Operator, EquipmentSituation, EquipmentSituationReport, Warranty } from "./types"
import type { FinalizationInput, WarrantyReturnInput } from "./validation"
import type { BulkCommand, BulkResult } from "./bulk-movements"
import { bulkRequestBytes } from "./bulk-movements"

export interface BulkReceiptPointer { runId: string; numbers: string[] }
export async function getBulkRun(runId: string) { return operation<{ state: string; results: BulkResult[] }>("getBulkRun", runId) }
export async function runBulkMovements(commands: BulkCommand[], onProgress?: (done: number) => void, onReceipt?: (pointer: BulkReceiptPointer) => void): Promise<BulkResult[]> {
  const results: BulkResult[] = []
  for (let offset = 0; offset < commands.length;) {
    const batch: Pick<BulkCommand, "operation" | "args">[] = []
    while (offset + batch.length < commands.length && batch.length < 20) {
      const { operation: name, args } = commands[offset + batch.length]
      const next = { operation: name, args }
      if (bulkRequestBytes([...batch, next]) > 28_000) {
        break
      }
      batch.push(next)
    }
    if (!batch.length) {
      results.push({ ok: false, error: "Esta linha excede o tamanho permitido. Reduza os textos antes de enviar" })
      offset++; onProgress?.(offset); continue
    }
    const runId = crypto.randomUUID()
    onReceipt?.({ runId, numbers: commands.slice(offset, offset + batch.length).map((item) => item.number) })
    try {
      const result = await operation<BulkResult[]>("bulkMovements", batch, runId)
      if (!Array.isArray(result) || result.length !== batch.length) throw new Error("O servidor não confirmou todos os resultados. Consulte os cadastros antes de repetir")
      results.push(...result)
    }
    catch (error) {
      let recovered: BulkResult[] | undefined
      try { const receipt = await getBulkRun(runId); if (receipt.results?.length === batch.length) recovered = receipt.results } catch { /* Pode ainda estar em processamento; consulta manual permanece disponível. */ }
      results.push(...(recovered || batch.map(() => ({ ok: false, uncertain: true, error: `${error instanceof Error ? error.message : "Falha no envio"}. Resultado não confirmado; consulte o lote antes de repetir` }))))
    }
    offset += batch.length
    onProgress?.(offset)
  }
  return results
}

async function operation<T>(name: string, ...args: unknown[]): Promise<T> {
  return (await apiRequest<{ result: T }>(`/api/data/${name}`, { args })).result
}
export async function createUser(username: string, password: string, nome: string, tipo: UserRole) { return operation<string>("createUser", username, password, nome, tipo) }
export async function getUsers(): Promise<User[]> {
  const users = await operation<(Omit<User, "criadoEm"> & { criadoEm: string | null })[]>("getUsers")
  return users.map((user) => ({ ...user, criadoEm: new Date(user.criadoEm || 0) }))
}
export async function updateUser(userId: string, data: Partial<Pick<User, "nome" | "tipo" | "ativo">>) { await operation("updateUser", userId, data) }
export async function updateUserPassword(userId: string, password: string) { await operation("updateUserPassword", userId, password) }
export async function deleteUser(userId: string) { await operation("deleteUser", userId) }
export async function createEquipment(data: Omit<Equipment, "id" | "dataCadastro">) { return operation<string>("createEquipment", data) }
export async function getEquipmentSituationReport(month: string) { return operation<EquipmentSituationReport>("getEquipmentSituationReport", month) }
export async function returnWarranty(equipmentId: string, data: WarrantyReturnInput) { await operation("returnWarranty", equipmentId, data) }
export async function sendWarranty(equipmentId: string, warrantyId: string) { await operation("sendWarranty", equipmentId, warrantyId) }
export async function cancelWarrantyPreparation(equipmentId: string, warrantyId: string, reason: string) { await operation("cancelWarrantyPreparation", equipmentId, warrantyId, reason) }
export async function getWarrantyHistory(equipmentId: string): Promise<Warranty[]> {
  type Dates = "separadaEm" | "enviadaEm" | "retornadaEm" | "canceladaEm"
  const records = await operation<(Omit<Warranty, Dates> & Partial<Record<Dates, string>>)[]>("getWarrantyHistory", equipmentId)
  return records.map((record) => ({ ...record, separadaEm: record.separadaEm ? new Date(record.separadaEm) : undefined, enviadaEm: record.enviadaEm ? new Date(record.enviadaEm) : undefined, retornadaEm: record.retornadaEm ? new Date(record.retornadaEm) : undefined, canceladaEm: record.canceladaEm ? new Date(record.canceladaEm) : undefined }))
}
export async function getEquipmentByNumber(numeroRemota: string): Promise<Equipment | null> {
  const snapshot = await getDocs(query(collection(db, "equipments"), where("numeroRemota", "==", numeroRemota)))
  return snapshot.empty ? null : equipmentFromDoc(snapshot.docs[0])
}
export async function getEquipments(includeInactive = false): Promise<Equipment[]> {
  const equipments = (await getDocs(collection(db, "equipments"))).docs.map(equipmentFromDoc)
  return equipments.filter((item) => includeInactive || item.estadoRegistro !== "inativo").sort((a, b) => b.dataCadastro.getTime() - a.dataCadastro.getTime())
}
export async function updateEquipment(equipmentId: string, data: Partial<Omit<Equipment, "id" | "numeroRemota" | "dataCadastro">>) { await operation("updateEquipment", equipmentId, data) }
export async function updateEquipmentWithLog(equipmentId: string, data: { modelo?: string; status?: "Nova" | "Usada"; situacaoRemota?: string; observacoes?: string }, _userId: string, _userName: string) { await operation("updateEquipmentWithLog", equipmentId, data) }
export async function deleteEquipment(equipmentId: string) { await operation("deleteEquipment", equipmentId) }
export async function archiveEquipment(equipmentId: string, _userId: string, _userName: string) { await operation("archiveEquipment", equipmentId) }
export async function hasMaintenanceHistory(numeroRemota: string) { return !(await getDocs(query(collection(db, "maintenances"), where("numeroRemota", "==", numeroRemota), limit(1)))).empty }
export interface HistoryFilters { numero?: string; modelo?: string; tecnico?: string; operadora?: string; dateFrom?: string; dateTo?: string; procedureId?: string }
export interface PageCursor { seconds: number; nanoseconds: number; id: string }
function maintenanceFromApi(data: Maintenance) { return maintenanceFromDoc({ id: data.id, data: () => data }) }
export async function getMaintenancePage(filters: HistoryFilters, cursor?: PageCursor | null) {
  const page = await operation<{ records: Maintenance[]; cursor: PageCursor | null }>("getMaintenancePage", filters, cursor)
  return { ...page, records: page.records.map(maintenanceFromApi) }
}
export async function getAllMaintenanceResults(filters: HistoryFilters) {
  const records: Maintenance[] = []
  let cursor: PageCursor | null = null
  do { const page = await getMaintenancePage(filters, cursor); records.push(...page.records); cursor = page.cursor } while (cursor)
  return records
}
export async function getDashboardMetrics(month: string) {
  const result = await operation<{ totalMaintenances: number; inProgress: number; completedThisMonth: number; recentMaintenances: Maintenance[]; manutencoesPorMes: { mes: string; total: number }[] }>("getDashboardMetrics", month)
  return { ...result, recentMaintenances: result.recentMaintenances.map(maintenanceFromApi) }
}
export function getMaintenanceTechnicianTotals() { return operation<{ id: string; name: string; total: number }[]>("getMaintenanceTechnicianTotals") }
export interface EquipmentMovement { id: string; action: string; userName: string; at: string; situation: string | null; reason: string | null }
export function getEquipmentMovements(id: string, cursor?: PageCursor | null) { return operation<{ records: EquipmentMovement[]; cursor: PageCursor | null }>("getEquipmentMovements", id, cursor) }
export async function updateEquipmentSituationManual(equipmentId: string, data: { situacaoAnterior: string | undefined; situacaoRemota: string; situacaoAtualizadaPor: string; motivoAlteracaoSituacao?: string }) { await operation("updateEquipmentSituationManual", equipmentId, data) }
export async function createMaintenance(data: Omit<Maintenance, "id" | "dataEntrada" | "dataFinalizacao" | "status">, _situacaoAtual?: string) { return operation<string>("createMaintenance", data) }
export async function finalizeMaintenance(maintenanceId: string, equipmentId: string, data: FinalizationInput) { await operation("finalizeMaintenance", maintenanceId, equipmentId, data) }
export async function saveMaintenanceDraft(maintenanceId: string, equipmentId: string, data: import("./validation").MaintenanceDraft, expectedVersion: number) { return operation<{ version: number; updatedAt: string }>("saveMaintenanceDraft", maintenanceId, equipmentId, data, expectedVersion) }
export async function forceFinalizeMaintenance(maintenanceId: string, equipmentId: string, _userId: string, _userName: string, motivo: string) { await operation("forceFinalizeMaintenance", maintenanceId, equipmentId, null, null, motivo) }
export async function getMaintenancesByEquipment(numeroRemota: string): Promise<Maintenance[]> {
  return (await getDocs(query(collection(db, "maintenances"), where("numeroRemota", "==", numeroRemota)))).docs.map(maintenanceFromDoc).sort((a, b) => b.dataEntrada.getTime() - a.dataEntrada.getTime())
}
async function getReferences<T>(name: string): Promise<T[]> { return (await getDocs(collection(db, name))).docs.map((doc) => ({ ...doc.data(), id: doc.id })) as T[] }
export function getDefects() { return getReferences<Defect>("defects") }
export async function createDefect(nome: string) { return operation<string>("createDefect", nome) }
export async function updateDefect(id: string, data: Partial<Defect>) { await operation("updateDefect", id, data) }
export async function deleteDefect(id: string) { await operation("deleteDefect", id) }
export function getServices() { return getReferences<Service>("services") }
export async function createService(nome: string) { return operation<string>("createService", nome) }
export async function updateService(id: string, data: Partial<Service>) { await operation("updateService", id, data) }
export async function deleteService(id: string) { await operation("deleteService", id) }
export function getOperators() { return getReferences<Operator>("operators") }
export async function createOperator(nome: string) { return operation<string>("createOperator", nome) }
export async function updateOperator(id: string, data: Partial<Operator>) { await operation("updateOperator", id, data) }
export async function deleteOperator(id: string) { await operation("deleteOperator", id) }
export async function getEquipmentSituations() { return (await getReferences<EquipmentSituation>("equipment_status")).filter((item) => !isWarrantyImeiChangeSituation(item.nome)) }
export async function createEquipmentSituation(nome: string) { return operation<string>("createEquipmentSituation", nome) }
export async function updateEquipmentSituation(id: string, data: Partial<EquipmentSituation>) { await operation("updateEquipmentSituation", id, data) }
export async function deleteEquipmentSituation(id: string) { await operation("deleteEquipmentSituation", id) }
