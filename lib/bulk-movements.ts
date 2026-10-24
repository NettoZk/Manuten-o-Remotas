import { z } from "zod"
import { finalizationSchema, warrantyReturnSchema, isMaintenanceSituation, isWarrantySentSituation, isWarrantySeparatedSituation } from "./validation"
import { isWarrantyImeiChangeSituation } from "./equipment-situations"
import type { Equipment } from "./types"

export const bulkActions = ["alterar_situacao", "iniciar_manutencao", "finalizar_manutencao", "enviar_garantia", "cancelar_separacao", "retornar_garantia", "arquivar"] as const
export type BulkAction = typeof bulkActions[number]
export const bulkOperations = ["updateEquipmentSituationManual", "createMaintenance", "finalizeMaintenance", "sendWarranty", "cancelWarrantyPreparation", "returnWarranty", "archiveEquipment"] as const
export interface BulkCommand { number: string; operation: typeof bulkOperations[number]; args: unknown[] }
export interface BulkResult { ok: boolean; error?: string; result?: unknown }
export interface BulkPreview { row: number; number: string; command?: BulkCommand; errors: string[] }
export const actionLabels: Record<BulkAction, string> = { alterar_situacao: "Alterar situação", iniciar_manutencao: "Iniciar manutenção", finalizar_manutencao: "Concluir manutenção / separar para garantia", enviar_garantia: "Confirmar envio para garantia", cancelar_separacao: "Cancelar separação para garantia", retornar_garantia: "Registrar retorno da garantia", arquivar: "Arquivar" }
export const checklistKeys = ["leituraSIMCard", "firmwareAtualizado", "sinal", "apnEnergiza", "comunicacaoMedidor", "comunicacaoIRIS"] as const
export const checklistLabels = ["Leitura do SIM Card", "Firmware atualizado", "Sinal", "APN Energiza", "Comunicação com medidor", "Comunicação com IRIS"]
export const movementHeaders: Record<BulkAction, string[]> = {
  alterar_situacao: ["numeroRemota", "situacaoRemota", "motivoAlteracaoSituacao"],
  iniciar_manutencao: ["numeroRemota", "defeitoRelatado", "defeitoRelatadoOutro"],
  finalizar_manutencao: ["numeroRemota", "operadoraDepois", "defeitoEncontrado", "defeitoEncontradoOutro", "servicosRealizados", "servicosRealizadosOutro", ...checklistKeys, "situacaoRemota", "motivoGarantia", "observacoes"],
  retornar_garantia: ["numeroRemota", "novoNumeroRemota", "condicaoRetorno", "situacaoRemota", "modelo", "anoFabricacao", "OCM", "operadoraAtual", "observacoesRetorno", "observacoes"],
  arquivar: ["numeroRemota"],
  enviar_garantia: ["numeroRemota"],
  cancelar_separacao: ["numeroRemota", "motivoCancelamento"],
}
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase()
export function buildBulkPreview(action: BulkAction, rows: Record<string, unknown>[], equipments: Equipment[]): BulkPreview[] {
  const numbers = new Set<string>()
  const targets = new Set<string>()
  return rows.map((raw, index) => {
    const columns = new Map(Object.entries(raw).map(([key, value]) => [normalize(key), String(value ?? "").trim()]))
    const value = (...keys: string[]) => keys.map((key) => columns.get(normalize(key))).find((item) => item !== undefined && item !== "") || ""
    const number = value("numeroRemota", "numero", "IMEI")
    const entry: BulkPreview = { row: index + 2, number, errors: [] }
    try {
      if (!number) throw new Error("Informe o número da remota")
      if (numbers.has(number)) throw new Error("Número repetido no mesmo lote")
      numbers.add(number)
      const equipment = equipments.find((item) => item.numeroRemota === number)
      if (!equipment) throw new Error("Remota não encontrada. Cadastre antes de movimentar")
      if (equipment.estadoRegistro === "inativo") throw new Error("Esta remota está arquivada")
      const locked = Boolean(equipment.manutencaoId || equipment.emManutencaoPor)
      if (equipment.garantia?.status === "enviada" && action !== "retornar_garantia") throw new Error("Registre o retorno da garantia antes desta movimentação")
      if (equipment.garantia?.status === "separada" && action !== "enviar_garantia" && action !== "cancelar_separacao") throw new Error("Confirme o envio ou cancele a separação para garantia antes desta movimentação")
      if (action !== "finalizar_manutencao" && locked) throw new Error("Finalize a manutenção em andamento antes desta movimentação")
      let operation: BulkCommand["operation"]
      let args: unknown[]
      if (action === "alterar_situacao") {
        const situation = z.string().trim().min(1, "Informe a situação").max(100).parse(value("situacaoRemota"))
        if (isMaintenanceSituation(situation) || isWarrantySentSituation(situation) || isWarrantySeparatedSituation(situation) || isWarrantyImeiChangeSituation(situation)) throw new Error("Esta situação exige o procedimento de manutenção ou garantia")
        if (situation === equipment.situacaoRemota) throw new Error("A situação selecionada é igual à atual")
        operation = "updateEquipmentSituationManual"; args = [equipment.id, { situacaoRemota: situation, motivoAlteracaoSituacao: z.string().max(2000).parse(value("motivoAlteracaoSituacao")) }]
      } else if (action === "iniciar_manutencao") {
        const defect = z.string().trim().min(1, "Informe o defeito relatado").max(160).parse(value("defeitoRelatado"))
        if (defect === "Outro" && !value("defeitoRelatadoOutro")) throw new Error("Descreva o defeito relatado Outro")
        operation = "createMaintenance"; args = [{ equipmentId: equipment.id, defeitoRelatado: defect, defeitoRelatadoOutro: z.string().max(2000).parse(value("defeitoRelatadoOutro")) }]
      } else if (action === "finalizar_manutencao") {
        if (!equipment.manutencaoId) throw new Error("A remota não possui manutenção em andamento")
        const data = finalizationSchema.parse({ operadoraDepois: value("operadoraDepois"), defeitoEncontrado: value("defeitoEncontrado"), defeitoEncontradoOutro: value("defeitoEncontradoOutro"),
          servicosRealizados: value("servicosRealizados").split(/[;|]/).map((item) => item.trim()).filter(Boolean), servicosRealizadosOutro: value("servicosRealizadosOutro"),
          checklist: Object.fromEntries(checklistKeys.map((key) => [key, value(key)])), situacaoRemota: value("situacaoRemota"), motivoGarantia: value("motivoGarantia"), observacoes: value("observacoes") })
        operation = "finalizeMaintenance"; args = [equipment.manutencaoId, equipment.id, data]
      } else if (action === "enviar_garantia" || action === "cancelar_separacao") {
        if (equipment.garantia?.status !== "separada" || !equipment.garantia.maintenanceId || !isWarrantySeparatedSituation(equipment.situacaoRemota || "")) throw new Error("Não há separação pendente vinculada a uma avaliação")
        operation = action === "enviar_garantia" ? "sendWarranty" : "cancelWarrantyPreparation"
        args = [equipment.id, equipment.garantia.id]
        if (action === "cancelar_separacao") args.push(z.string().trim().min(10, "Descreva o motivo do cancelamento com pelo menos 10 caracteres").max(2000).parse(value("motivoCancelamento")))
      } else if (action === "retornar_garantia") {
        if (equipment.garantia?.status !== "enviada") throw new Error("Não há envio para garantia aberto")
        const returnedNumber = value("novoNumeroRemota", "novoIMEI") || number
        const changed = returnedNumber !== number
        const condition = value("condicaoRetorno", "status").toLowerCase()
        const status = ["nova", "novo", "new"].includes(condition) ? "Nova" : ["usada", "usado", "used"].includes(condition) || (!changed && !condition) ? "Usada" : ""
        if (!status) throw new Error("Informe a condição Nova ou Usada após conferir o equipamento")
        if (!changed && status !== "Usada") throw new Error("Retorno com o mesmo IMEI deve ter condição Usada")
        if (changed && (equipments.some((item) => item.numeroRemota === returnedNumber) || targets.has(returnedNumber))) throw new Error("O novo número/IMEI já existe ou está repetido no lote")
        const data = warrantyReturnSchema.parse({ garantiaId: equipment.garantia.id, numeroRemota: returnedNumber,
          modelo: value("modelo") || equipment.modelo, anoFabricacao: value("anoFabricacao") || equipment.anoFabricacao,
          lote: value("OCM", "lote") || equipment.lote, operadoraAtual: value("operadoraAtual") || equipment.operadoraAtual,
          status, situacaoRemota: value("situacaoRemota") || (status === "Nova" ? "Nova" : ""), observacoesRetorno: value("observacoesRetorno"),
          observacoes: columns.has("observacoes") ? columns.get("observacoes") : equipment.observacoes || "" })
        if (changed) targets.add(returnedNumber)
        operation = "returnWarranty"; args = [equipment.id, data]
      } else { operation = "archiveEquipment"; args = [equipment.id] }
      entry.command = { number, operation, args }
    } catch (error) {
      entry.errors = error instanceof z.ZodError ? [...new Set(error.issues.map((item) => `${item.path.join(".")}: ${item.message}`))] : [error instanceof Error ? error.message : "Linha inválida"]
    }
    return entry
  })
}

export function movementTemplate(action: BulkAction, equipments: Equipment[]) {
  const headers = movementHeaders[action]
  return equipments.map((item) => Object.fromEntries(headers.map((key) => [key,
    key === "numeroRemota" ? item.numeroRemota : key === "OCM" ? item.lote : key === "condicaoRetorno" ? "Usada" : key === "operadoraDepois" ? item.operadoraAtual
      : checklistKeys.includes(key as typeof checklistKeys[number]) ? "Não testado"
        : ["modelo", "anoFabricacao", "operadoraAtual", "observacoes"].includes(key) ? item[key as keyof Equipment] || "" : "",
  ])))
}
