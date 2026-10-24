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
export type WarrantyStatus = "separada" | "enviada" | "retornada" | "cancelada"

export interface EquipmentSituation {
  id: string
  nome: string
  ativo: boolean
}

export interface EquipmentSituationEvent {
  equipmentId: string
  numeroRemota: string
  at: Date
  registeredAt: Date
  archivedAt?: Date
  situation: string | null
  active: boolean
  version: number
  source: string
}

export interface EquipmentSituationReport {
  month: string
  isCurrent: boolean
  totalEquipments: number
  missingHistory: number
  situations: { name: string; value: number }[]
  trackedSince: string | null
  firstYear: number
  generatedAt: string
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
  // Campos de bloqueio de manutenção
  emManutencaoPor?: string       // ID do técnico responsável
  emManutencaoNome?: string      // Nome do técnico responsável
  emManutencaoDesde?: Date       // Data/hora que iniciou
  manutencaoId?: string          // ID da manutenção atual
  garantia?: { id: string; status: WarrantyStatus; separadaEm?: Date; enviadaEm?: Date; retornadaEm?: Date; canceladaEm?: Date; motivo: string; maintenanceId?: string }
  remotaAnteriorId?: string
  remotaAnteriorNumero?: string
  garantiaOrigemId?: string
  substituidaPorId?: string
  substituidaPorNumero?: string
}

export interface Warranty {
  id: string
  equipmentId: string
  numeroRemota: string
  status: WarrantyStatus
  separadaEm?: Date
  separadaPor?: string
  enviadaEm?: Date
  enviadaPor?: string
  canceladaEm?: Date
  canceladaPor?: string
  motivoCancelamento?: string
  motivo: string
  maintenanceId?: string
  situacaoEnvio?: string
  retornadaEm?: Date
  retornadaPor?: string
  observacoesRetorno?: string
  situacaoRetorno?: string
  condicaoRetorno?: EquipmentStatus
  imeiAlterado?: boolean
  novoEquipmentId?: string
  novoNumeroRemota?: string
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
  // Situação registrada na conclusão; independe de alterações futuras do equipamento.
  situacaoRemota?: string
  status: "em_andamento" | "finalizada"
  motivoGarantia?: string
  // Campos para finalização forçada
  finalizadoForcadamente?: boolean
  finalizadoForcadoPor?: string
  finalizadoForcadoNome?: string
  motivoFinalizacaoForcada?: string
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
