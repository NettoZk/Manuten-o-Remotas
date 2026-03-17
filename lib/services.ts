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
  EstadoRegistro,
  ImportLog,
  ImportResult,
  ImportValidationResult,
  ImportValidationError,
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
export async function createEquipment(data: Omit<Equipment, "id" | "dataCadastro" | "estadoRegistro">): Promise<string> {
  const existingQuery = query(
    collection(db, "equipments"),
    where("numeroRemota", "==", data.numeroRemota)
  )
  const existing = await getDocs(existingQuery)
  
  if (!existing.empty) {
    // Verificar se a remota existente está ativa
    const existingDoc = existing.docs[0]
    const existingData = existingDoc.data()
    if (existingData.estadoRegistro === "ativo" || !existingData.estadoRegistro) {
      throw new Error("Ja existe uma remota ativa com este numero")
    }
  }

  // Aplicar regra automática: se status = "Usada", situação = "Triagem"
  const situacaoRemota = data.status === "Usada" ? "Triagem" : data.situacaoRemota

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

export async function getEquipments(includeInactive: boolean = false): Promise<Equipment[]> {
  const snapshot = await getDocs(
    query(collection(db, "equipments"), orderBy("dataCadastro", "desc"))
  )
  const equipments = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      ...data,
      estadoRegistro: data.estadoRegistro || "ativo", // Retrocompatibilidade
      dataCadastro: data.dataCadastro?.toDate() || new Date(),
      situacaoAtualizadaEm: data.situacaoAtualizadaEm?.toDate() || undefined,
    }
  }) as Equipment[]

  // Filtrar apenas registros ativos por padrão
  if (!includeInactive) {
    return equipments.filter(eq => eq.estadoRegistro === "ativo")
  }
  return equipments
}

export async function updateEquipment(
  equipmentId: string,
  data: Partial<Omit<Equipment, "id" | "numeroRemota" | "dataCadastro">>
): Promise<void> {
  await updateDoc(doc(db, "equipments", equipmentId), data)
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

// Excluir equipamento (apenas admin, somente sem histórico)
export async function deleteEquipment(
  equipmentId: string,
  userRole: string
): Promise<{ success: boolean; message: string }> {
  // Verificar se usuário é admin
  if (userRole !== "admin") {
    return { success: false, message: "Apenas administradores podem excluir remotas" }
  }

  // Buscar equipamento para obter número da remota
  const equipments = await getEquipments(true)
  const equipment = equipments.find(eq => eq.id === equipmentId)
  
  if (!equipment) {
    return { success: false, message: "Remota não encontrada" }
  }

  // Verificar se tem histórico de manutenções
  const maintenances = await getMaintenancesByEquipment(equipment.numeroRemota)
  
  if (maintenances.length > 0) {
    return { 
      success: false, 
      message: `Não é possível excluir esta remota pois ela possui ${maintenances.length} manutenção(ões) registrada(s). Use a opção de arquivar.` 
    }
  }

  // Excluir permanentemente
  await deleteDoc(doc(db, "equipments", equipmentId))
  return { success: true, message: "Remota excluída com sucesso" }
}

// Arquivar equipamento (soft delete)
export async function archiveEquipment(equipmentId: string): Promise<void> {
  await updateDoc(doc(db, "equipments", equipmentId), {
    estadoRegistro: "arquivado",
  })
}

// Alterar estado do registro
export async function updateEquipmentEstado(
  equipmentId: string,
  estadoRegistro: EstadoRegistro
): Promise<void> {
  await updateDoc(doc(db, "equipments", equipmentId), {
    estadoRegistro,
  })
}

// Marcar como substituído por garantia e criar nova remota
export async function markAsWarrantyReplaced(
  oldEquipmentId: string,
  newEquipmentData: Omit<Equipment, "id" | "dataCadastro" | "estadoRegistro">
): Promise<string> {
  // Marcar remota antiga como substituída por garantia
  await updateDoc(doc(db, "equipments", oldEquipmentId), {
    estadoRegistro: "substituido_garantia",
  })

  // Criar nova remota com referência à antiga
  const docRef = await addDoc(collection(db, "equipments"), {
    ...newEquipmentData,
    estadoRegistro: "ativo",
    remotaSubstituidaId: oldEquipmentId,
    situacaoRemota: newEquipmentData.status === "Usada" ? "Triagem" : newEquipmentData.situacaoRemota,
    dataCadastro: Timestamp.now(),
  })

  return docRef.id
}

// ==================== MAINTENANCES ====================
// Helper para remover campos undefined (Firebase não aceita undefined)
function removeUndefinedFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}

export async function createMaintenance(
  data: Omit<Maintenance, "id" | "dataEntrada" | "dataFinalizacao" | "status" | "numeroManutencao">
): Promise<string> {
  // Calcular número da manutenção (contar manutenções existentes + 1)
  const existingMaintenances = await getMaintenancesByEquipment(data.numeroRemota)
  const numeroManutencao = existingMaintenances.length + 1

  const cleanedData = removeUndefinedFields(data)
  const docRef = await addDoc(collection(db, "maintenances"), {
    ...cleanedData,
    numeroManutencao,
    dataEntrada: Timestamp.now(),
    dataFinalizacao: null,
    status: "em_andamento",
  })

  // Atualizar situação da remota para "Triagem" ao iniciar manutenção
  if (data.equipmentId) {
    await updateEquipment(data.equipmentId, {
      situacaoAnterior: undefined, // Será preenchido na finalização
      situacaoRemota: "Triagem",
    })
  }

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

// ==================== IMPORT LOGS ====================
export async function createImportLog(
  data: Omit<ImportLog, "id" | "dataHora">
): Promise<string> {
  const docRef = await addDoc(collection(db, "import_logs"), {
    ...data,
    dataHora: Timestamp.now(),
  })
  return docRef.id
}

export async function getImportLogs(): Promise<ImportLog[]> {
  const snapshot = await getDocs(
    query(collection(db, "import_logs"), orderBy("dataHora", "desc"))
  )
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    dataHora: doc.data().dataHora?.toDate() || new Date(),
  })) as ImportLog[]
}

// ==================== IMPORT EQUIPMENTS ====================
export function validateImportData(
  rows: Record<string, unknown>[],
  existingEquipments: Equipment[],
  operators: Operator[]
): ImportValidationResult {
  const errors: ImportValidationError[] = []
  let validRows = 0
  const operatorNames = operators.map(op => op.nome.toLowerCase())
  const existingNumbers = new Set(existingEquipments.map(eq => eq.numeroRemota))

  rows.forEach((row, index) => {
    const rowNumber = index + 2 // +2 porque linha 1 é cabeçalho e índice começa em 0
    let rowValid = true

    // Validar número da remota (obrigatório)
    const numeroRemota = String(row.numeroRemota || row["Número Remota"] || "").trim()
    if (!numeroRemota) {
      errors.push({
        row: rowNumber,
        field: "numeroRemota",
        message: "Número da remota é obrigatório",
      })
      rowValid = false
    }

    // Validar modelo (obrigatório)
    const modelo = String(row.modelo || row["Modelo"] || "").trim()
    if (!modelo) {
      errors.push({
        row: rowNumber,
        field: "modelo",
        message: "Modelo é obrigatório",
      })
      rowValid = false
    }

    // Validar ano de fabricação (obrigatório, formato YYYY)
    const anoFabricacao = String(row.anoFabricacao || row["Ano Fabricação"] || "").trim()
    if (!anoFabricacao) {
      errors.push({
        row: rowNumber,
        field: "anoFabricacao",
        message: "Ano de fabricação é obrigatório",
      })
      rowValid = false
    } else if (!/^\d{4}$/.test(anoFabricacao)) {
      errors.push({
        row: rowNumber,
        field: "anoFabricacao",
        message: "Ano de fabricação deve estar no formato YYYY",
        value: anoFabricacao,
      })
      rowValid = false
    }

    // Validar lote (obrigatório)
    const lote = String(row.lote || row["Lote"] || "").trim()
    if (!lote) {
      errors.push({
        row: rowNumber,
        field: "lote",
        message: "Lote é obrigatório",
      })
      rowValid = false
    }

    // Validar operadora (obrigatório, deve existir na lista)
    const operadora = String(row.operadoraAtual || row["Operadora"] || "").trim()
    if (!operadora) {
      errors.push({
        row: rowNumber,
        field: "operadoraAtual",
        message: "Operadora é obrigatória",
      })
      rowValid = false
    } else if (!operatorNames.includes(operadora.toLowerCase())) {
      errors.push({
        row: rowNumber,
        field: "operadoraAtual",
        message: `Operadora "${operadora}" não cadastrada no sistema`,
        value: operadora,
      })
      rowValid = false
    }

    // Validar status (obrigatório, deve ser "Nova" ou "Usada")
    const status = String(row.status || row["Status"] || "").trim()
    if (!status) {
      errors.push({
        row: rowNumber,
        field: "status",
        message: "Status é obrigatório (Nova ou Usada)",
      })
      rowValid = false
    } else if (!["Nova", "Usada", "nova", "usada"].includes(status)) {
      errors.push({
        row: rowNumber,
        field: "status",
        message: "Status deve ser 'Nova' ou 'Usada'",
        value: status,
      })
      rowValid = false
    }

    // Verificar duplicatas (aviso, não erro crítico para atualização)
    if (existingNumbers.has(numeroRemota)) {
      // Não é erro, será uma atualização
    }

    if (rowValid) {
      validRows++
    }
  })

  return {
    isValid: errors.length === 0,
    totalRows: rows.length,
    validRows,
    errors,
  }
}

export async function importEquipments(
  rows: Record<string, unknown>[],
  userId: string,
  userName: string,
  fileName: string
): Promise<ImportResult> {
  const existingEquipments = await getEquipments(true)
  const existingNumbersMap = new Map(existingEquipments.map(eq => [eq.numeroRemota, eq]))
  
  let inserted = 0
  let updated = 0
  let errors = 0
  const errorDetails: string[] = []

  for (const row of rows) {
    try {
      const numeroRemota = String(row.numeroRemota || row["Número Remota"] || "").trim()
      const modelo = String(row.modelo || row["Modelo"] || "").trim()
      const anoFabricacao = String(row.anoFabricacao || row["Ano Fabricação"] || "").trim()
      const lote = String(row.lote || row["Lote"] || "").trim()
      const operadoraAtual = String(row.operadoraAtual || row["Operadora"] || "").trim()
      const statusRaw = String(row.status || row["Status"] || "").trim()
      const status = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase() as "Nova" | "Usada"
      const situacaoRemota = String(row.situacaoRemota || row["Situação"] || "").trim() || undefined

      const existingEquipment = existingNumbersMap.get(numeroRemota)

      if (existingEquipment) {
        // Atualizar equipamento existente
        await updateEquipment(existingEquipment.id, {
          modelo,
          anoFabricacao,
          lote,
          operadoraAtual,
          status,
          situacaoRemota: status === "Usada" ? "Triagem" : situacaoRemota,
        })
        updated++
      } else {
        // Criar novo equipamento
        await addDoc(collection(db, "equipments"), {
          numeroRemota,
          modelo,
          anoFabricacao,
          lote,
          operadoraAtual,
          status,
          situacaoRemota: status === "Usada" ? "Triagem" : situacaoRemota,
          estadoRegistro: "ativo",
          dataCadastro: Timestamp.now(),
        })
        inserted++
      }
    } catch (error) {
      errors++
      const rowNum = rows.indexOf(row) + 2
      errorDetails.push(`Linha ${rowNum}: ${error instanceof Error ? error.message : "Erro desconhecido"}`)
    }
  }

  // Criar log de importação
  await createImportLog({
    nomeArquivo: fileName,
    usuarioId: userId,
    usuarioNome: userName,
    totalRegistros: rows.length,
    inseridos: inserted,
    atualizados: updated,
    erros: errors,
    detalhesErros: errorDetails.length > 0 ? errorDetails : undefined,
  })

  return {
    success: errors === 0,
    totalProcessed: rows.length,
    inserted,
    updated,
    errors,
    errorDetails,
  }
}

// ==================== DASHBOARD STATS ====================
export async function getDashboardStats() {
  const [equipments, allEquipments, maintenancesInProgress, maintenancesThisMonth, allMaintenances] =
    await Promise.all([
      getEquipments(), // Apenas ativos
      getEquipments(true), // Todos incluindo inativos
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

  // Novos indicadores
  const remotasRecuperadas = equipments.filter(eq => eq.situacaoRemota === "Recuperada").length
  const remotasSucateadas = equipments.filter(eq => eq.situacaoRemota === "Sucateada").length
  const remotasTriagem = equipments.filter(eq => eq.situacaoRemota === "Triagem").length
  const remotasGarantia = allEquipments.filter(eq => eq.estadoRegistro === "substituido_garantia").length
  const remotasArquivadas = allEquipments.filter(eq => eq.estadoRegistro === "arquivado").length

  // Calcular média de manutenções por remota
  const remotasComManutencao = new Set(allMaintenances.map(m => m.numeroRemota))
  const mediaManutencoesPorRemota = remotasComManutencao.size > 0 
    ? (allMaintenances.length / remotasComManutencao.size).toFixed(2) 
    : "0"

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
    // Novos indicadores
    remotasRecuperadas,
    remotasSucateadas,
    remotasTriagem,
    remotasGarantia,
    remotasArquivadas,
    mediaManutencoesPorRemota,
    totalEquipmentsTodos: allEquipments.length,
  }
}
