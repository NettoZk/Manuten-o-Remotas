"use client"

import { useState, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, XCircle } from "lucide-react"
import { parseExcelFile, generateImportTemplate, normalizeRowData } from "@/lib/excel-import"
import { validateImportData, importEquipments, getEquipments, getOperators } from "@/lib/services"
import type { ImportValidationResult, ImportResult, Equipment, Operator } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"

type ImportStep = "upload" | "validating" | "preview" | "importing" | "result"

interface ImportEquipmentsDialogProps {
  onImportComplete?: () => void
  trigger?: React.ReactNode
}

export function ImportEquipmentsDialog({ onImportComplete, trigger }: ImportEquipmentsDialogProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<ImportStep>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<Record<string, unknown>[]>([])
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = () => {
    setStep("upload")
    setFile(null)
    setParsedData([])
    setValidationResult(null)
    setImportResult(null)
    setProgress(0)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      resetState()
    }
  }

  const handleDownloadTemplate = () => {
    generateImportTemplate()
    toast.success("Modelo baixado com sucesso")
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    const validExtensions = [".xlsx", ".xls"]
    const fileExtension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf("."))
    
    if (!validExtensions.includes(fileExtension)) {
      toast.error("Formato inválido. Use arquivos .xlsx ou .xls")
      return
    }

    setFile(selectedFile)
    setStep("validating")
    setProgress(10)

    try {
      // Parse Excel
      const data = await parseExcelFile(selectedFile)
      setParsedData(data)
      setProgress(40)

      if (data.length === 0) {
        toast.error("O arquivo não contém dados")
        setStep("upload")
        setFile(null)
        return
      }

      // Get existing data for validation
      const [equipments, operators] = await Promise.all([
        getEquipments(true),
        getOperators(),
      ])
      setProgress(70)

      // Validate data
      const normalizedData = data.map(normalizeRowData)
      const validation = validateImportData(
        normalizedData as unknown as Record<string, unknown>[],
        equipments as Equipment[],
        operators as Operator[]
      )
      setValidationResult(validation)
      setProgress(100)

      setStep("preview")
    } catch (error) {
      toast.error("Erro ao processar arquivo: " + (error as Error).message)
      setStep("upload")
      setFile(null)
    }
  }

  const handleImport = async () => {
    if (!user || !file || parsedData.length === 0) return

    setStep("importing")
    setProgress(0)

    try {
      const normalizedData = parsedData.map(normalizeRowData)
      
      // Simular progresso durante importação
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 5, 90))
      }, 200)

      const result = await importEquipments(
        normalizedData as unknown as Record<string, unknown>[],
        user.id,
        user.nome,
        file.name
      )

      clearInterval(progressInterval)
      setProgress(100)
      setImportResult(result)
      setStep("result")

      if (result.success) {
        toast.success(`Importação concluída: ${result.inserted} inseridos, ${result.updated} atualizados`)
      } else {
        toast.warning(`Importação com erros: ${result.errors} erros encontrados`)
      }

      onImportComplete?.()
    } catch (error) {
      toast.error("Erro durante importação: " + (error as Error).message)
      setStep("preview")
    }
  }

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">Selecione um arquivo Excel</p>
          <p className="text-sm text-muted-foreground">
            Formatos aceitos: .xlsx, .xls
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          Selecionar arquivo
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-sm text-muted-foreground">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-start gap-4">
          <Download className="h-8 w-8 text-primary" />
          <div className="flex-1">
            <h4 className="font-medium">Baixar modelo de importação</h4>
            <p className="text-sm text-muted-foreground">
              Use o modelo para preencher os dados corretamente
            </p>
          </div>
          <Button variant="outline" onClick={handleDownloadTemplate}>
            Baixar modelo
          </Button>
        </div>
      </div>
    </div>
  )

  const renderValidatingStep = () => (
    <div className="flex flex-col items-center gap-4 py-8">
      <FileSpreadsheet className="h-12 w-12 animate-pulse text-primary" />
      <p className="font-medium">Validando arquivo...</p>
      <div className="w-full max-w-xs">
        <Progress value={progress} />
      </div>
      <p className="text-sm text-muted-foreground">{file?.name}</p>
    </div>
  )

  const renderPreviewStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{file?.name}</p>
          <p className="text-sm text-muted-foreground">
            {validationResult?.totalRows} registros encontrados
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={validationResult?.isValid ? "default" : "destructive"}>
            {validationResult?.validRows} válidos
          </Badge>
          {validationResult && validationResult.errors.length > 0 && (
            <Badge variant="destructive">
              {validationResult.errors.length} erros
            </Badge>
          )}
        </div>
      </div>

      {validationResult && validationResult.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erros de validação</AlertTitle>
          <AlertDescription>
            <ScrollArea className="mt-2 h-40">
              <ul className="space-y-1 text-sm">
                {validationResult.errors.map((error, index) => (
                  <li key={index}>
                    <span className="font-medium">Linha {error.row}:</span>{" "}
                    {error.field} - {error.message}
                    {error.value && (
                      <span className="text-muted-foreground"> (valor: {error.value})</span>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </AlertDescription>
        </Alert>
      )}

      {validationResult?.isValid && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Validação concluída</AlertTitle>
          <AlertDescription>
            Todos os {validationResult.totalRows} registros estão prontos para importação.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border p-4">
        <h4 className="mb-2 font-medium">Prévia dos dados</h4>
        <ScrollArea className="h-48">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">N° Remota</th>
                <th className="p-2 text-left">Modelo</th>
                <th className="p-2 text-left">Operadora</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {parsedData.slice(0, 10).map((row, index) => {
                const normalized = normalizeRowData(row)
                return (
                  <tr key={index} className="border-b">
                    <td className="p-2">{normalized.numeroRemota}</td>
                    <td className="p-2">{normalized.modelo}</td>
                    <td className="p-2">{normalized.operadoraAtual}</td>
                    <td className="p-2">{normalized.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {parsedData.length > 10 && (
            <p className="mt-2 text-center text-sm text-muted-foreground">
              ... e mais {parsedData.length - 10} registros
            </p>
          )}
        </ScrollArea>
      </div>
    </div>
  )

  const renderImportingStep = () => (
    <div className="flex flex-col items-center gap-4 py-8">
      <FileSpreadsheet className="h-12 w-12 animate-pulse text-primary" />
      <p className="font-medium">Importando dados...</p>
      <div className="w-full max-w-xs">
        <Progress value={progress} />
      </div>
      <p className="text-sm text-muted-foreground">
        Processando {parsedData.length} registros
      </p>
    </div>
  )

  const renderResultStep = () => (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4 py-4">
        {importResult?.success ? (
          <CheckCircle className="h-16 w-16 text-green-500" />
        ) : (
          <AlertCircle className="h-16 w-16 text-yellow-500" />
        )}
        <h3 className="text-lg font-medium">
          {importResult?.success ? "Importação concluída" : "Importação com alertas"}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{importResult?.totalProcessed}</p>
          <p className="text-sm text-muted-foreground">Total</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{importResult?.inserted}</p>
          <p className="text-sm text-muted-foreground">Inseridos</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{importResult?.updated}</p>
          <p className="text-sm text-muted-foreground">Atualizados</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{importResult?.errors}</p>
          <p className="text-sm text-muted-foreground">Erros</p>
        </div>
      </div>

      {importResult && importResult.errorDetails.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Detalhes dos erros</AlertTitle>
          <AlertDescription>
            <ScrollArea className="mt-2 h-32">
              <ul className="space-y-1 text-sm">
                {importResult.errorDetails.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </ScrollArea>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Importar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Remotas</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Selecione um arquivo Excel para importar remotas em massa"}
            {step === "validating" && "Validando os dados do arquivo..."}
            {step === "preview" && "Revise os dados antes de confirmar a importação"}
            {step === "importing" && "Processando importação..."}
            {step === "result" && "Resultado da importação"}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && renderUploadStep()}
        {step === "validating" && renderValidatingStep()}
        {step === "preview" && renderPreviewStep()}
        {step === "importing" && renderImportingStep()}
        {step === "result" && renderResultStep()}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={resetState}>
                Voltar
              </Button>
              <Button
                onClick={handleImport}
                disabled={!validationResult?.isValid || validationResult.validRows === 0}
              >
                Importar {validationResult?.validRows} registros
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
