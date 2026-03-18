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
  observacoes?: string
  // Campos de log de edição
  ultimaEdicaoEm?: Date
  ultimaEdicaoPor?: string
  ultimaEdicaoUserId?: string
  // Campos de arquivamento
  estadoRegistro?: "ativo" | "inativo"
  arquivadoEm?: Date
  arquivadoPor?: string
  arquivadoUserId?: string
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
