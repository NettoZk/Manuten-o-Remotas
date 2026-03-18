import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  setDoc,
} from "firebase/firestore"
import { db } from "./firebase"
import type {
  Equipment,
  Maintenance,
  User,
  UserRole,
  Defect,
  Service,
  Operator,
  ChecklistItem,
  EquipmentSituation,
} from "./types"
import bcrypt from "bcryptjs"

// ==================== USERS ====================
export async function createUser(
  username: string,
  password: string,
  nome: string,
  tipo: UserRole
): Promise<string> {
  // Verificar se username ja existe
  const usersRef = collection(db, "users")
  const q = query(usersRef, where("username", "==", username.toLowerCase()))
  const existing = await getDocs(q)
  
  if (!existing.empty) {
    throw new Error("Este nome de usuario ja esta em uso")
  }

  // Hash da senha
  const senhaHash = await bcrypt.hash(password, 10)
  
  // Criar ID unico para o usuario
  const userId = `user_${Date.now()}`

  await setDoc(doc(db, "users", userId), {
    nome,
    username: username.toLowerCase(),
    senhaHash,
    tipo,
    ativo: true,
    criadoEm: Timestamp.now(),
  })

  return userId
}

export async function getUsers(): Promise<User[]> {
  const snapshot = await getDocs(collection(db, "users"))
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    criadoEm: doc.data().criadoEm?.toDate() || new Date(),
  })) as User[]
}

export async function updateUser(
  userId: string,
  data: Partial<Pick<User, "nome" | "tipo" | "ativo">>
): Promise<void> {
  await updateDoc(doc(db, "users", userId), data)
}

export async function updateUserPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const senhaHash = await bcrypt.hash(newPassword, 10)
  await updateDoc(doc(db, "users", userId), { senhaHash })
}

export async function deleteUser(userId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId))
}

// ==================== EQUIPMENTS ====================
export async function createEquipment(data: Omit<Equipment, "id" | "dataCadastro">): Promise<string> {
  const existingQuery = query(
    collection(db, "equipments"),
    where("numeroRemota", "==", data.numeroRemota)
  )
  const existing = await getDocs(existingQuery)
  
  if (!existing.empty) {
    throw new Error("Ja existe uma remota com este numero")
  }

  // Aplicar regra automática de situação baseada no status
  let situacaoRemota = data.situacaoRemota
  if (!situacaoRemota) {
    // Se status = usada -> situação = triagem
    // Se status = nova -> situação = nova
    situacaoRemota = data.status === "Usada" ? "triagem" : "nova"
  }

  const docRef = await addDoc(collection(db, "equipments"), {
    ...data,
    situacaoRemota,
    estadoRegistro: "ativo",
    dataCadastro: Timestamp.now(),
  })
  return docRef.id
}

export async function getEquipmentByNumber(numeroRemota: string): Promise<Equipment | null> {
  const q = query(collection(db, "equipments"), where("numeroRemota", "==", numeroRemota))
  const snapshot = await getDocs(q)
  
  if (snapshot.empty) return null
  
  const doc = snapshot.docs[0]
  return {
    id: doc.id,
    ...doc.data(),
    dataCadastro: doc.data().dataCadastro?.toDate() || new Date(),
  } as Equipment
}

export async function getEquipments(includeInactive = false): Promise<Equipment[]> {
  const snapshot = await getDocs(
    query(collection(db, "equipments"), orderBy("dataCadastro", "desc"))
  )
  const equipments = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      ...data,
      dataCadastro: data.dataCadastro?.toDate() || new Date(),
      situacaoAtualizadaEm: data.situacaoAtualizadaEm?.toDate() || undefined,
      ultimaEdicaoEm: data.ultimaEdicaoEm?.toDate() || undefined,
      arquivadoEm: data.arquivadoEm?.toDate() || undefined,
      estadoRegistro: data.estadoRegistro || "ativo",
    }
  }) as Equipment[]

  // Filtrar inativos se não for para incluí-los
  if (!includeInactive) {
    return equipments.filter((e) => e.estadoRegistro !== "inativo")
  }
  return equipments
}

export async function updateEquipment(
  equipmentId: string,
  data: Partial<Omit<Equipment, "id" | "numeroRemota" | "dataCadastro">>
): Promise<void> {
  await updateDoc(doc(db, "equipments", equipmentId), data)
}

export async function updateEquipmentWithLog(
  equipmentId: string,
  data: {
    modelo?: string
    status?: "Nova" | "Usada"
    situacaoRemota?: string
    observacoes?: string
  },
  userId: string,
  userName: string
): Promise<void> {
  const updateData: Record<string, unknown> = { ...data }
  
  // Adicionar log de alteração
  updateData.ultimaEdicaoEm = Timestamp.now()
  updateData.ultimaEdicaoPor = userName
  updateData.ultimaEdicaoUserId = userId
  
  await updateDoc(doc(db, "equipments", equipmentId), updateData)
}

export async function deleteEquipment(equipmentId: string): Promise<void> {
  await deleteDoc(doc(db, "equipments", equipmentId))
}

export async function archiveEquipment(
  equipmentId: string,
  userId: string,
  userName: string
): Promise<void> {
  await updateDoc(doc(db, "equipments", equipmentId), {
    estadoRegistro: "inativo",
    arquivadoEm: Timestamp.now(),
    arquivadoPor: userName,
    arquivadoUserId: userId,
  })
}

export async function hasMaintenanceHistory(numeroRemota: string): Promise<boolean> {
  const q = query(
    collection(db, "maintenances"),
    where("numeroRemota", "==", numeroRemota)
  )
  const snapshot = await getDocs(q)
  return !snapshot.empty
}

export async function updateEquipmentSituationManual(
  equipmentId: string,
  data: {
    situacaoAnterior: string | undefined
    situacaoRemota: string
    situacaoAtualizadaPor: string
    motivoAlteracaoSituacao?: string
  }
): Promise<void> {
  const cleanedData = removeUndefinedFields({
    situacaoAnterior: data.situacaoAnterior || "Não definida",
    situacaoRemota: data.situacaoRemota,
    situacaoAtualizadaEm: Timestamp.now(),
    situacaoAtualizadaPor: data.situacaoAtualizadaPor,
    motivoAlteracaoSituacao: data.motivoAlteracaoSituacao || undefined,
  })
  await updateDoc(doc(db, "equipments", equipmentId), cleanedData)
}

// ==================== MAINTENANCES ====================
// Helper para remover campos undefined (Firebase não aceita undefined)
function removeUndefinedFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}

export async function createMaintenance(
  data: Omit<Maintenance, "id" | "dataEntrada" | "dataFinalizacao" | "status">
): Promise<string> {
  const cleanedData = removeUndefinedFields(data)
  const docRef = await addDoc(collection(db, "maintenances"), {
    ...cleanedData,
    dataEntrada: Timestamp.now(),
    dataFinalizacao: null,
    status: "em_andamento",
  })
  return docRef.id
}

export async function finalizeMaintenance(
  maintenanceId: string,
  data: {
    defeitoEncontrado: string
    defeitoEncontradoOutro?: string
    servicosRealizados: string[]
    servicosRealizadosOutro?: string
    operadoraDepois: string
    checklist: ChecklistItem
    observacoes: string
    situacaoRemota?: string
  }
): Promise<void> {
  const cleanedData = removeUndefinedFields(data)
  await updateDoc(doc(db, "maintenances", maintenanceId), {
    ...cleanedData,
    dataFinalizacao: Timestamp.now(),
    status: "finalizada",
  })
}

export async function getMaintenancesByEquipment(numeroRemota: string): Promise<Maintenance[]> {
  // Query simples sem orderBy para evitar necessidade de índice composto
  const q = query(
    collection(db, "maintenances"),
    where("numeroRemota", "==", numeroRemota)
  )
  const snapshot = await getDocs(q)
  const maintenances = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    dataEntrada: doc.data().dataEntrada?.toDate() || new Date(),
    dataFinalizacao: doc.data().dataFinalizacao?.toDate() || null,
  })) as Maintenance[]
  
  // Ordenar no cliente
  return maintenances.sort((a, b) => b.dataEntrada.getTime() - a.dataEntrada.getTime())
}

export async function getAllMaintenances(): Promise<Maintenance[]> {
  const snapshot = await getDocs(collection(db, "maintenances"))
  const maintenances = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    dataEntrada: doc.data().dataEntrada?.toDate() || new Date(),
    dataFinalizacao: doc.data().dataFinalizacao?.toDate() || null,
  })) as Maintenance[]
  
  // Ordenar no cliente
  return maintenances.sort((a, b) => b.dataEntrada.getTime() - a.dataEntrada.getTime())
}

export async function getMaintenancesInProgress(): Promise<Maintenance[]> {
  // Query simples com apenas where, sem orderBy
  const q = query(
    collection(db, "maintenances"),
    where("status", "==", "em_andamento")
  )
  const snapshot = await getDocs(q)
  const maintenances = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    dataEntrada: doc.data().dataEntrada?.toDate() || new Date(),
    dataFinalizacao: doc.data().dataFinalizacao?.toDate() || null,
  })) as Maintenance[]
  
  // Ordenar no cliente
  return maintenances.sort((a, b) => b.dataEntrada.getTime() - a.dataEntrada.getTime())
}

export async function getMaintenancesThisMonth(): Promise<number> {
  // Buscar todas as manutenções e filtrar no cliente para evitar índice
  const snapshot = await getDocs(collection(db, "maintenances"))
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  let count = 0
  snapshot.docs.forEach((doc) => {
    const dataFinalizacao = doc.data().dataFinalizacao?.toDate()
    if (dataFinalizacao && dataFinalizacao >= startOfMonth) {
      count++
    }
  })
  return count
}

// ==================== DEFECTS ====================
export async function getDefects(): Promise<Defect[]> {
  const snapshot = await getDocs(collection(db, "defects"))
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Defect[]
}

export async function createDefect(nome: string): Promise<string> {
  const docRef = await addDoc(collection(db, "defects"), {
    nome,
    ativo: true,
  })
  return docRef.id
}

export async function updateDefect(id: string, data: Partial<Defect>): Promise<void> {
  await updateDoc(doc(db, "defects", id), data)
}

export async function deleteDefect(id: string): Promise<void> {
  await deleteDoc(doc(db, "defects", id))
}

// ==================== SERVICES ====================
export async function getServices(): Promise<Service[]> {
  const snapshot = await getDocs(collection(db, "services"))
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Service[]
}

export async function createService(nome: string): Promise<string> {
  const docRef = await addDoc(collection(db, "services"), {
    nome,
    ativo: true,
  })
  return docRef.id
}

export async function updateService(id: string, data: Partial<Service>): Promise<void> {
  await updateDoc(doc(db, "services", id), data)
}

export async function deleteService(id: string): Promise<void> {
  await deleteDoc(doc(db, "services", id))
}

// ==================== OPERATORS ====================
export async function getOperators(): Promise<Operator[]> {
  const snapshot = await getDocs(collection(db, "operators"))
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Operator[]
}

export async function createOperator(nome: string): Promise<string> {
  const docRef = await addDoc(collection(db, "operators"), {
    nome,
    ativo: true,
  })
  return docRef.id
}

export async function updateOperator(id: string, data: Partial<Operator>): Promise<void> {
  await updateDoc(doc(db, "operators", id), data)
}

export async function deleteOperator(id: string): Promise<void> {
  await deleteDoc(doc(db, "operators", id))
}

// ==================== EQUIPMENT SITUATIONS ====================
export async function getEquipmentSituations(): Promise<EquipmentSituation[]> {
  const snapshot = await getDocs(collection(db, "equipment_status"))
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as EquipmentSituation[]
}

export async function createEquipmentSituation(nome: string): Promise<string> {
  const docRef = await addDoc(collection(db, "equipment_status"), {
    nome,
    ativo: true,
  })
  return docRef.id
}

export async function updateEquipmentSituation(id: string, data: Partial<EquipmentSituation>): Promise<void> {
  await updateDoc(doc(db, "equipment_status", id), data)
}

export async function deleteEquipmentSituation(id: string): Promise<void> {
  await deleteDoc(doc(db, "equipment_status", id))
}

// ==================== DASHBOARD STATS ====================
export async function getDashboardStats() {
  const [equipments, maintenancesInProgress, maintenancesThisMonth, allMaintenances] =
    await Promise.all([
      getEquipments(),
      getMaintenancesInProgress(),
      getMaintenancesThisMonth(),
      getAllMaintenances(),
    ])

  // Calcular remotas por situação
  const situacaoCount: Record<string, number> = {}
  equipments.forEach((eq) => {
    const situacao = eq.situacaoRemota || "Não definida"
    situacaoCount[situacao] = (situacaoCount[situacao] || 0) + 1
  })
  const remotasPorSituacao = Object.entries(situacaoCount).map(([name, value]) => ({
    name,
    value,
  }))

  // Calcular manutenções por técnico
  const tecnicoCount: Record<string, number> = {}
  allMaintenances.forEach((m) => {
    const tecnico = m.tecnicoNome || "Desconhecido"
    tecnicoCount[tecnico] = (tecnicoCount[tecnico] || 0) + 1
  })
  const manutencoesPorTecnico = Object.entries(tecnicoCount)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10) // Top 10 técnicos

  // Calcular manutenções por mês (últimos 6 meses)
  const now = new Date()
  const monthsData: Record<string, number> = {}
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    monthsData[key] = 0
  }
  
  allMaintenances.forEach((m) => {
    if (m.dataFinalizacao) {
      const date = new Date(m.dataFinalizacao)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      if (monthsData[key] !== undefined) {
        monthsData[key]++
      }
    }
  })

  const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  const manutencoesPorMes = Object.entries(monthsData).map(([key, total]) => {
    const [year, month] = key.split("-")
    return {
      mes: `${mesesNomes[parseInt(month) - 1]}/${year.slice(2)}`,
      total,
    }
  })

  return {
    totalEquipments: equipments.length,
    totalMaintenances: allMaintenances.length,
    inProgress: maintenancesInProgress.length,
    completedThisMonth: maintenancesThisMonth,
    recentMaintenances: allMaintenances.slice(0, 5),
    remotasPorSituacao,
    manutencoesPorTecnico,
    manutencoesPorMes,
  }
}