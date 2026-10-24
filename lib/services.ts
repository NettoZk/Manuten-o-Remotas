import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "./firebase"
import { apiRequest } from "./api-client"
import { equipmentFromDoc, maintenanceFromDoc } from "./firestore-records"
import type { Equipment, Maintenance, User, UserRole, Defect, Service, Operator, EquipmentSituation, EquipmentSituationReport, Warranty } from "./types"
import type { FinalizationInput, WarrantyReturnInput } from "./validation"

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
export async function getWarrantyHistory(equipmentId: string): Promise<Warranty[]> {
  const records = await operation<(Omit<Warranty, "enviadaEm" | "retornadaEm"> & { enviadaEm: string; retornadaEm?: string })[]>("getWarrantyHistory", equipmentId)
  return records.map((record) => ({ ...record, enviadaEm: new Date(record.enviadaEm), retornadaEm: record.retornadaEm ? new Date(record.retornadaEm) : undefined }))
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
export async function hasMaintenanceHistory(numeroRemota: string) { return !(await getDocs(query(collection(db, "maintenances"), where("numeroRemota", "==", numeroRemota)))).empty }
export async function updateEquipmentSituationManual(equipmentId: string, data: { situacaoAnterior: string | undefined; situacaoRemota: string; situacaoAtualizadaPor: string; motivoAlteracaoSituacao?: string }) { await operation("updateEquipmentSituationManual", equipmentId, data) }
export async function createMaintenance(data: Omit<Maintenance, "id" | "dataEntrada" | "dataFinalizacao" | "status">, _situacaoAtual?: string) { return operation<string>("createMaintenance", data) }
export async function finalizeMaintenance(maintenanceId: string, equipmentId: string, data: FinalizationInput) { await operation("finalizeMaintenance", maintenanceId, equipmentId, data) }
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
export function getEquipmentSituations() { return getReferences<EquipmentSituation>("equipment_status") }
export async function createEquipmentSituation(nome: string) { return operation<string>("createEquipmentSituation", nome) }
export async function updateEquipmentSituation(id: string, data: Partial<EquipmentSituation>) { await operation("updateEquipmentSituation", id, data) }
export async function deleteEquipmentSituation(id: string) { await operation("deleteEquipmentSituation", id) }
