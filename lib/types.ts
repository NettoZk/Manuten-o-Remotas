export type UserRole = "admin" | "tecnico" | "usuario"

export interface User {
  id: string
  nome: string
  username: string
  tipo: UserRole
  ativo: boolean
  criadoEm: Date
}

export type EquipmentStatus = "Nova" | "Usada"

// Estado administrativo do registro
export type EstadoRegistro = "ativo" | "substituido_garantia" | "cancelado" | "erro_cadastro" | "arquivado"

export interface EquipmentSituation {
  id: string
  nome: string
  ativo: boolean
}

export interface Equipment {
  id: string
  numeroRemota: string
  modelo: string
  anoFabricacao: string
  lote: string
  operadoraAtual: string
  status: EquipmentStatus
  situacaoRemota?: string
  situacaoAnterior?: string
  situacaoAtualizadaEm?: Date
  situacaoAtualizadaPor?: string
  motivoAlteracaoSituacao?: string
  dataCadastro: Date
  estadoRegistro: EstadoRegistro // Novo campo para controle administrativo
  remotaSubstituidaId?: string // ID da remota que esta substituiu (em caso de garantia)
}

export type ChecklistStatus = "OK" | "Falha" | "Não testado"

export interface ChecklistItem {
  leituraSIMCard: ChecklistStatus
  firmwareAtualizado: ChecklistStatus
  sinal: ChecklistStatus
  apnEnergiza: ChecklistStatus
  comunicacaoMedidor: ChecklistStatus
  comunicacaoIRIS: ChecklistStatus
}

export interface Maintenance {
  id: string
  numeroRemota: string
  equipmentId: string
  tecnicoId: string
  tecnicoNome: string
  dataEntrada: Date
  dataFinalizacao: Date | null
  operadoraAntes: string
  operadoraDepois: string
  defeitoRelatado: string
  defeitoRelatadoOutro?: string
  defeitoEncontrado: string
  defeitoEncontradoOutro?: string
  servicosRealizados: string[]
  servicosRealizadosOutro?: string
  checklist: ChecklistItem
  observacoes: string
  status: "em_andamento" | "finalizada"
  numeroManutencao: number // Contador incremental por remota
}

export interface Defect {
  id: string
  nome: string
  ativo: boolean
}

export interface Service {
  id: string
  nome: string
  ativo: boolean
}

export interface Operator {
  id: string
  nome: string
  ativo: boolean
}

// Interface para registro de importações em massa
export interface ImportLog {
  id: string
  nomeArquivo: string
  usuarioId: string
  usuarioNome: string
  dataHora: Date
  totalRegistros: number
  inseridos: number
  atualizados: number
  erros: number
  detalhesErros?: string[]
}

// Interface para validação de importação
export interface ImportValidationResult {
  isValid: boolean
  totalRows: number
  validRows: number
  errors: ImportValidationError[]
}

export interface ImportValidationError {
  row: number
  field: string
  message: string
  value?: string
}

// Interface para resultado de importação
export interface ImportResult {
  success: boolean
  totalProcessed: number
  inserted: number
  updated: number
  errors: number
  errorDetails: string[]
}
