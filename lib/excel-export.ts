import * as XLSX from "xlsx"
import type { Maintenance, Equipment } from "./types"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface ExportData extends Maintenance {
  equipmentData?: Equipment
}

export function exportMaintenancesToExcel(
  maintenances: ExportData[],
  equipments: Map<string, Equipment>
) {
  const data = maintenances.map((m) => {
    const equipment = equipments.get(m.numeroRemota)
    
    return {
      "Número da Remota": m.numeroRemota,
      Modelo: equipment?.modelo || "-",
      "Ano de Fabricação": equipment?.anoFabricacao || "-",
      Lote: equipment?.lote || "-",
      "Situação da Remota": equipment?.situacaoRemota || "-",
      "Operadora Antes": m.operadoraAntes,
      "Operadora Depois": m.operadoraDepois,
      "Defeito Relatado": m.defeitoRelatado === "Outro" 
        ? m.defeitoRelatadoOutro 
        : m.defeitoRelatado,
      "Defeito Encontrado": m.defeitoEncontrado === "Outro"
        ? m.defeitoEncontradoOutro
        : m.defeitoEncontrado,
      "Serviços Realizados": [
        ...m.servicosRealizados,
        m.servicosRealizadosOutro ? `Outro: ${m.servicosRealizadosOutro}` : "",
      ]
        .filter(Boolean)
        .join(", "),
      "Técnico Responsável": m.tecnicoNome,
      "Data de Entrada": m.dataEntrada
        ? format(m.dataEntrada, "dd/MM/yyyy HH:mm", { locale: ptBR })
        : "-",
      "Data de Finalização": m.dataFinalizacao
        ? format(m.dataFinalizacao, "dd/MM/yyyy HH:mm", { locale: ptBR })
        : "-",
      Observações: m.observacoes || "-",
    }
  })

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Manutenções")

  // Auto-size columns
  const colWidths = Object.keys(data[0] || {}).map((key) => ({
    wch: Math.max(key.length, 15),
  }))
  worksheet["!cols"] = colWidths

  const fileName = `manutencoes_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`
  XLSX.writeFile(workbook, fileName)
}
