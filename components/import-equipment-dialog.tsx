"use client"

import { useState, useRef } from "react"
import * as XLSX from "xlsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { createEquipment, getEquipmentByNumber, updateEquipment } from "@/lib/services"
import type { EquipmentStatus } from "@/lib/types"
import { equipmentTemplate, parseEquipmentRow } from "@/lib/equipment-import"
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Download } from "lucide-react"

interface ImportRow {
  numeroRemota: string
  modelo: string
  anoFabricacao: string
  lote: string
  operadoraAtual: string
  status: EquipmentStatus
  situacaoRemota?: string
  observacoes?: string
}

interface ValidationResult {
  row: number
  data: ImportRow
  isValid: boolean
  errors: string[]
  exists: boolean
}

interface ImportEquipmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

export function ImportEquipmentDialog({
  open,
  onOpenChange,
  onImported,
}: ImportEquipmentDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [fileName, setFileName] = useState("")
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })

  const validateRow = async (row: Record<string, unknown>, rowIndex: number): Promise<ValidationResult> => {
    const { data, errors } = parseEquipmentRow(row)
    const { numeroRemota } = data
    // Verificar se já existe
    let exists = false
    if (numeroRemota) {
      const existing = await getEquipmentByNumber(numeroRemota)
      exists = !!existing
      if (existing?.estadoRegistro === "inativo") errors.push("Esta remota está arquivada")
      if (existing?.garantia?.status === "enviada") errors.push("Registre o retorno da garantia antes de importar alterações")
      if (existing?.manutencaoId || existing?.emManutencaoPor) errors.push("Finalize a manutenção antes de importar alterações")
    }

    return {
      row: rowIndex + 2, // +2 porque Excel começa em 1 e tem cabeçalho
      data,
      isValid: errors.length === 0 && numeroRemota !== "",
      errors,
      exists,
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setIsValidating(true)
    setValidationResults([])

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (jsonData.length === 0) {
        toast.error("A planilha está vazia")
        setIsValidating(false)
        return
      }

      // Validar cada linha
      const results: ValidationResult[] = []
      for (let i = 0; i < jsonData.length; i++) {
        const result = await validateRow(jsonData[i] as Record<string, unknown>, i)
        if (results.some((previous) => previous.data.numeroRemota === result.data.numeroRemota)) {
          result.errors.push("Número da remota repetido na planilha")
          result.isValid = false
        }
        results.push(result)
      }

      setValidationResults(results)
    } catch (error) {
      console.error("[v0] Erro ao ler planilha:", error)
      toast.error("Erro ao ler a planilha. Verifique o formato do arquivo.")
    } finally {
      setIsValidating(false)
    }
  }

  const handleImport = async () => {
    const validItems = validationResults.filter((r) => r.isValid)
    if (validItems.length === 0) {
      toast.error("Nenhum item válido para importar")
      return
    }

    setIsImporting(true)
    setImportProgress({ current: 0, total: validItems.length })

    let created = 0
    let updated = 0
    let failed = 0
    const failedItems: ValidationResult[] = []

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i]
      setImportProgress({ current: i + 1, total: validItems.length })

      try {
        if (item.exists) {
          // Atualizar existente
          const existing = await getEquipmentByNumber(item.data.numeroRemota)
          if (existing) {
            await updateEquipment(existing.id, {
              modelo: item.data.modelo,
              anoFabricacao: item.data.anoFabricacao,
              lote: item.data.lote,
              operadoraAtual: item.data.operadoraAtual,
              status: item.data.status,
              situacaoRemota: item.data.situacaoRemota,
              observacoes: item.data.observacoes || "",
            })
            updated++
          } else { throw new Error("Equipamento removido durante a importação") }
        } else {
          // Criar novo
          await createEquipment({
            numeroRemota: item.data.numeroRemota,
            modelo: item.data.modelo,
            anoFabricacao: item.data.anoFabricacao,
            lote: item.data.lote,
            operadoraAtual: item.data.operadoraAtual,
            status: item.data.status,
            situacaoRemota: item.data.situacaoRemota,
            observacoes: item.data.observacoes || "",
          })
          created++
        }
      } catch (error) {
        console.error(`[v0] Erro ao importar remota ${item.data.numeroRemota}:`, error)
        failed++
        failedItems.push({ ...item, isValid: false, errors: [error instanceof Error ? error.message : "Falha ao gravar esta linha"] })
      }
    }

    setIsImporting(false)
    
    const messages: string[] = []
    if (created > 0) messages.push(`${created} criadas`)
    if (updated > 0) messages.push(`${updated} atualizadas`)
    if (failed > 0) messages.push(`${failed} com erro`)
    
    if (failed) toast.warning(`Importação concluída: ${messages.join(", ")}`)
    else toast.success(`Importação concluída: ${messages.join(", ")}`)
    onImported()
    if (failedItems.length) setValidationResults(failedItems)
    else handleClose()
  }

  const handleClose = () => {
    setValidationResults([])
    setFileName("")
    setImportProgress({ current: 0, total: 0 })
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    onOpenChange(false)
  }

  const downloadTemplate = () => {
    const templateData = equipmentTemplate

    const worksheet = XLSX.utils.json_to_sheet(templateData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Remotas")

    // Ajustar largura das colunas
    worksheet["!cols"] = [
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 10 },
      { wch: 15 },
      { wch: 25 },
    ]

    XLSX.writeFile(workbook, "modelo_importacao_remotas.xlsx")
  }

  const validCount = validationResults.filter((r) => r.isValid).length
  const invalidCount = validationResults.filter((r) => !r.isValid).length
  const existingCount = validationResults.filter((r) => r.exists && r.isValid).length
  const newCount = validationResults.filter((r) => !r.exists && r.isValid).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importação em Massa de Remotas
          </DialogTitle>
          <DialogDescription>
            Importe remotas a partir de uma planilha Excel (.xlsx). Remotas existentes serão atualizadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Download Template */}
          <div className="rounded-lg border border-dashed border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Modelo de Planilha</p>
                <p className="text-sm text-muted-foreground">
                  Baixe o modelo para preencher corretamente
                </p>
              </div>
              <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Baixar Modelo
              </Button>
            </div>
          </div>

          {/* Upload Area */}
          <div
            className="rounded-lg border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            {isValidating ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner className="h-8 w-8 text-primary" />
                <p className="text-muted-foreground">Validando planilha...</p>
              </div>
            ) : fileName ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-12 w-12 text-primary" />
                <p className="font-medium">{fileName}</p>
                <p className="text-sm text-muted-foreground">
                  Clique para selecionar outro arquivo
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-12 w-12 text-muted-foreground" />
                <p className="font-medium">Clique para selecionar a planilha</p>
                <p className="text-sm text-muted-foreground">
                  Arquivos .xlsx ou .xls
                </p>
              </div>
            )}
          </div>

          {/* Validation Results */}
          {validationResults.length > 0 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1">
                  Total: {validationResults.length}
                </Badge>
                {validCount > 0 && (
                  <Badge className="gap-1 bg-success/10 text-success border-success/20">
                    <CheckCircle className="h-3 w-3" />
                    Válidos: {validCount}
                  </Badge>
                )}
                {newCount > 0 && (
                  <Badge className="gap-1 bg-primary/10 text-primary border-primary/20">
                    Novos: {newCount}
                  </Badge>
                )}
                {existingCount > 0 && (
                  <Badge className="gap-1 bg-warning/10 text-warning border-warning/20">
                    <AlertTriangle className="h-3 w-3" />
                    Atualizar: {existingCount}
                  </Badge>
                )}
                {invalidCount > 0 && (
                  <Badge className="gap-1 bg-destructive/10 text-destructive border-destructive/20">
                    <XCircle className="h-3 w-3" />
                    Inválidos: {invalidCount}
                  </Badge>
                )}
              </div>

              {/* Details Table */}
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Linha</th>
                      <th className="px-3 py-2 text-left font-medium">Número</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Ação</th>
                      <th className="px-3 py-2 text-left font-medium">Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResults.map((result, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-3 py-2">{result.row}</td>
                        <td className="px-3 py-2 font-medium">
                          {result.data.numeroRemota || "-"}
                        </td>
                        <td className="px-3 py-2">
                          {result.isValid ? (
                            <CheckCircle className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {result.isValid && (
                            <Badge variant="outline" className="text-xs">
                              {result.exists ? "Atualizar" : "Criar"}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-destructive text-xs">
                          {result.errors.join("; ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Import Progress */}
              {isImporting && (
                <div className="rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center gap-3">
                    <Spinner className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="font-medium">Importando...</p>
                      <p className="text-sm text-muted-foreground">
                        {importProgress.current} de {importProgress.total}
                      </p>
                    </div>
                    <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${(importProgress.current / importProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={validCount === 0 || isImporting || isValidating}
          >
            {isImporting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Importando...
              </>
            ) : (
              `Importar ${validCount} Remota(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
