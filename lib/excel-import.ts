import * as XLSX from "xlsx"

export interface ParsedRow {
  numeroRemota: string
  modelo: string
  anoFabricacao: string
  lote: string
  operadoraAtual: string
  status: string
  situacaoRemota?: string
}

export function parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: "binary" })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet)
        resolve(jsonData)
      } catch (error) {
        reject(new Error("Erro ao processar arquivo Excel: " + (error as Error).message))
      }
    }
    
    reader.onerror = () => {
      reject(new Error("Erro ao ler arquivo"))
    }
    
    reader.readAsBinaryString(file)
  })
}

export function generateImportTemplate(): void {
  const templateData = [
    {
      "Número Remota": "EX001",
      "Modelo": "Modelo A",
      "Ano Fabricação": "2024",
      "Lote": "LOTE001",
      "Operadora": "VIVO",
      "Status": "Nova",
      "Situação": "",
    },
    {
      "Número Remota": "EX002",
      "Modelo": "Modelo B",
      "Ano Fabricação": "2023",
      "Lote": "LOTE002",
      "Operadora": "CLARO",
      "Status": "Usada",
      "Situação": "",
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(templateData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Remotas")

  // Auto-size columns
  const colWidths = [
    { wch: 20 }, // Número Remota
    { wch: 15 }, // Modelo
    { wch: 15 }, // Ano Fabricação
    { wch: 15 }, // Lote
    { wch: 15 }, // Operadora
    { wch: 10 }, // Status
    { wch: 15 }, // Situação
  ]
  worksheet["!cols"] = colWidths

  // Add instructions sheet
  const instructionsData = [
    { "Instruções para Importação": "" },
    { "Instruções para Importação": "1. Preencha os dados na aba 'Remotas'" },
    { "Instruções para Importação": "2. Os campos obrigatórios são: Número Remota, Modelo, Ano Fabricação, Lote, Operadora, Status" },
    { "Instruções para Importação": "3. O Status deve ser 'Nova' ou 'Usada'" },
    { "Instruções para Importação": "4. A Operadora deve estar cadastrada no sistema" },
    { "Instruções para Importação": "5. O Ano de Fabricação deve estar no formato YYYY (ex: 2024)" },
    { "Instruções para Importação": "6. Se a remota já existir no sistema, os dados serão atualizados" },
    { "Instruções para Importação": "7. Se o Status for 'Usada', a Situação será automaticamente definida como 'Triagem'" },
    { "Instruções para Importação": "" },
    { "Instruções para Importação": "Dica: Não altere os nomes das colunas na aba 'Remotas'" },
  ]
  const instructionsSheet = XLSX.utils.json_to_sheet(instructionsData)
  instructionsSheet["!cols"] = [{ wch: 80 }]
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instruções")

  XLSX.writeFile(workbook, "modelo_importacao_remotas.xlsx")
}

export function normalizeRowData(row: Record<string, unknown>): ParsedRow {
  return {
    numeroRemota: String(row.numeroRemota || row["Número Remota"] || row["numero_remota"] || "").trim(),
    modelo: String(row.modelo || row["Modelo"] || "").trim(),
    anoFabricacao: String(row.anoFabricacao || row["Ano Fabricação"] || row["ano_fabricacao"] || "").trim(),
    lote: String(row.lote || row["Lote"] || "").trim(),
    operadoraAtual: String(row.operadoraAtual || row["Operadora"] || row["operadora_atual"] || "").trim(),
    status: String(row.status || row["Status"] || "").trim(),
    situacaoRemota: String(row.situacaoRemota || row["Situação"] || row["situacao"] || "").trim() || undefined,
  }
}
