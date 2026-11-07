import { checklistKeys, checklistLabels, type BulkCommand } from "./bulk-movements"
import type { Equipment, Maintenance } from "./types"
export interface FieldChange { field: string; label: string; before: unknown; after: unknown }
export interface MovementDiff { changes: FieldChange[]; notes: string[] }
const labels: Record<string, string> = { numeroRemota: "Número / IMEI", modelo: "Modelo", anoFabricacao: "Ano de fabricação", lote: "OCM", operadoraAtual: "Operadora", status: "Condição", situacaoRemota: "Situação", observacoes: "Observações", estadoRegistro: "Cadastro", defeitoRelatado: "Defeito relatado", defeitoRelatadoOutro: "Descrição do defeito relatado", defeitoEncontrado: "Defeito encontrado", defeitoEncontradoOutro: "Descrição do defeito", servicosRealizados: "Serviços realizados", servicosRealizadosOutro: "Descrição do serviço", operadoraDepois: "Operadora após manutenção", motivoGarantia: "Motivo da separação", observacoesRetorno: "Descrição do retorno", "garantia.status": "Etapa da garantia", "maintenance.status": "Atendimento", "placement.type": "Tipo de destino", "placement.destination": "Destino físico", "placement.recipientName": "Responsável previsto", "placement.status": "Etapa física", "placement.notes": "Observações da saída" }
export function movementDiff(equipment: Equipment | undefined, command: BulkCommand, maintenance?: Maintenance): MovementDiff {
  const result: MovementDiff = { changes: [], notes: [] }
  function add(field: string, before: unknown, after: unknown, label = labels[field] || field) {
    if (after === undefined || JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return
    result.changes.push({ field, label, before, after })
  }
  const data = (command.args[command.operation === "createEquipment" ? 0 : command.operation === "finalizeMaintenance" ? 2 : 1] || {}) as Record<string, unknown>
  if (["updateEquipment", "updateEquipmentSituationManual", "createEquipment"].includes(command.operation)) {
    for (const field of ["numeroRemota", "modelo", "anoFabricacao", "lote", "operadoraAtual", "status", "situacaoRemota", "observacoes"]) add(field, equipment?.[field as keyof Equipment], data[field])
    if (!equipment) result.notes.push("Será criado um novo cadastro ativo.")
  } else if (command.operation === "createMaintenance") {
    const input = command.args[0] as Record<string, unknown>
    add("situacaoRemota", equipment?.situacaoRemota, "Manutenção"); add("defeitoRelatado", undefined, input.defeitoRelatado); add("defeitoRelatadoOutro", undefined, input.defeitoRelatadoOutro)
    result.notes.push("Abrir atendimento sob o usuário que executar e bloquear outras movimentações até conclusão ou cancelamento.")
  } else if (command.operation === "finalizeMaintenance") {
    add("maintenance.status", "em_andamento", "finalizada"); add("situacaoRemota", equipment?.situacaoRemota, data.situacaoRemota); add("status", equipment?.status, "Usada"); add("operadoraAtual", equipment?.operadoraAtual, data.operadoraDepois)
    for (const field of ["defeitoEncontrado", "defeitoEncontradoOutro", "servicosRealizados", "servicosRealizadosOutro", "observacoes", "motivoGarantia"]) add(field, maintenance?.[field as keyof Maintenance], data[field], `Manutenção · ${labels[field]}`)
    const checklist = data.checklist as Record<string, unknown> | undefined
    for (const [field, after] of Object.entries(checklist || {})) add(`checklist.${field}`, maintenance?.checklist?.[field as keyof Maintenance["checklist"]], after, `Checklist · ${checklistLabels[checklistKeys.indexOf(field as typeof checklistKeys[number])] || field}`)
    result.notes.push("Registrar a conclusão e liberar o atendimento. Separação para garantia aguarda confirmação da saída física.")
  } else if (command.operation === "sendWarranty" || command.operation === "cancelWarrantyPreparation") {
    add("garantia.status", equipment?.garantia?.status, command.operation === "sendWarranty" ? "enviada" : "cancelada")
    if (command.operation === "cancelWarrantyPreparation") add("situacaoRemota", equipment?.situacaoRemota, "Triagem")
    result.notes.push(command.operation === "sendWarranty" ? "Confirmar somente equipamentos que estão saindo fisicamente para a garantia; a situação de envio ativa será aplicada." : "Preservar avaliação e cancelar a separação antes da saída física.")
  } else if (command.operation === "returnWarranty") {
    for (const field of ["numeroRemota", "modelo", "anoFabricacao", "lote", "operadoraAtual", "status", "situacaoRemota", "observacoes"]) add(field, equipment?.[field as keyof Equipment], data[field])
    add("observacoesRetorno", undefined, data.observacoesRetorno)
    if (data.numeroRemota !== equipment?.numeroRemota) result.notes.push("O cadastro atual será arquivado. Criar outro vinculado ao IMEI anterior, preservando as manutenções na remota original.")
    else result.notes.push("Manter o cadastro e registrar retorno com condição Usada.")
  } else if (command.operation === "archiveEquipment") { add("estadoRegistro", equipment?.estadoRegistro || "ativo", "inativo"); result.notes.push("Preservar cadastro e histórico; retirar da operação ativa.") }
  else if (command.operation === "dispatchEquipment") {
    for (const field of ["type", "destination", "recipientName", "notes"]) add(`placement.${field}`, equipment?.placement?.[field as keyof Equipment["placement"]], data[field])
    add("placement.status", equipment?.placement?.status, "em_transito"); result.notes.push("Manter situação técnica durante o trânsito; recebimento deve ser confirmado no destino.")
  } else if (command.operation === "receiveEquipment") {
    add("placement.status", equipment?.placement?.status, "recebida"); add("situacaoRemota", equipment?.situacaoRemota, equipment?.placement?.type === "polo" ? "Disponibilizada para polo" : "Disponibilizado para estoque")
    result.notes.push("Registrar o usuário executor e a data/hora atual como confirmação física de recebimento.")
  }
  return result
}
export function previewValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—"
  if (Array.isArray(value)) return value.map(previewValue).join("; ")
  if (typeof value === "object") return JSON.stringify(value)
  const known: Record<string, string> = { ativo: "Ativa", inativo: "Arquivada", em_transito: "Em trânsito", recebida: "Recebida", separada: "Separada", enviada: "Enviada", retornada: "Retornada", cancelada: "Cancelada", em_andamento: "Em andamento", finalizada: "Concluída" }
  return known[String(value)] || String(value)
}
export const operationTitles: Record<string, string> = { createEquipment: "Cadastrar remota", updateEquipment: "Atualizar cadastro", updateEquipmentWithLog: "Atualizar cadastro", updateEquipmentSituationManual: "Alterar situação", createMaintenance: "Iniciar manutenção", finalizeMaintenance: "Concluir manutenção", sendWarranty: "Confirmar envio à garantia", cancelWarrantyPreparation: "Cancelar separação", returnWarranty: "Registrar retorno da garantia", archiveEquipment: "Arquivar", dispatchEquipment: "Movimentar para destino", receiveEquipment: "Confirmar recebimento" }
export interface ProcedureSnapshot { kind: string; id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
export function recordedDiff(before?: Record<string, unknown> | null, after?: Record<string, unknown> | null, procedure?: ProcedureSnapshot): FieldChange[] {
  const changes: FieldChange[] = []
  function read(source: Record<string, unknown> | null | undefined, path: string): unknown { let value: unknown = source; for (const key of path.split(".")) value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined; return value }
  function add(field: string, old: unknown, next: unknown, label: string) { if (JSON.stringify(old ?? null) !== JSON.stringify(next ?? null)) changes.push({ field, label, before: old, after: next }) }
  for (const field of ["numeroRemota", "modelo", "anoFabricacao", "lote", "operadoraAtual", "status", "situacaoRemota", "observacoes", "estadoRegistro", "garantia.status", "placement.type", "placement.destination", "placement.recipientName", "placement.status", "placement.notes"]) add(field, read(before, field), read(after, field), labels[field] || field)
  if (procedure) {
    for (const field of ["status", "defeitoRelatado", "defeitoRelatadoOutro", "defeitoEncontrado", "defeitoEncontradoOutro", "servicosRealizados", "servicosRealizadosOutro", "operadoraDepois", "observacoes", "motivoGarantia"]) add(`procedure.${field}`, read(procedure.before, field), read(procedure.after, field), `Manutenção · ${field === "status" ? "Etapa" : labels[field] || field}`)
    for (const [index, field] of checklistKeys.entries()) add(`procedure.checklist.${field}`, read(procedure.before, `checklist.${field}`), read(procedure.after, `checklist.${field}`), `Checklist · ${checklistLabels[index]}`)
  }
  return changes
}
