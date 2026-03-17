"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getImportLogs } from "@/lib/services"
import type { ImportLog } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"
import { FileSpreadsheet, Upload, User, Calendar, CheckCircle, XCircle, AlertCircle, Eye } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ImportEquipmentsDialog } from "@/components/import-equipments-dialog"

export default function ImportacoesPage() {
  const { hasPermission } = useAuth()
  const isAdmin = hasPermission(["admin"])

  const [logs, setLogs] = useState<ImportLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState<ImportLog | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const data = await getImportLogs()
      setLogs(data)
    } catch (error) {
      console.error("Erro ao carregar logs:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const handleViewDetails = (log: ImportLog) => {
    setSelectedLog(log)
    setShowDetailsDialog(true)
  }

  if (!isAdmin) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Acesso Restrito</h2>
        <p className="text-muted-foreground">
          Esta página é acessível apenas para administradores.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Importações</h1>
          <p className="text-muted-foreground">
            Histórico de importações em massa de remotas
          </p>
        </div>
        <ImportEquipmentsDialog
          onImportComplete={loadLogs}
          trigger={
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Nova Importação
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Importações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Registros Inseridos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {logs.reduce((acc, log) => acc + log.inseridos, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Registros Atualizados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {logs.reduce((acc, log) => acc + log.atualizados, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Erros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {logs.reduce((acc, log) => acc + log.erros, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Histórico de Importações
          </CardTitle>
          <CardDescription>
            {logs.length} importação(ões) registrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <div className="mb-4 rounded-full bg-muted p-4">
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="mb-2 font-medium">Nenhuma importação registrada</p>
              <p className="text-sm text-muted-foreground">
                Clique em "Nova Importação" para começar
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-full bg-primary/10 p-2">
                      <FileSpreadsheet className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">{log.nomeArquivo}</p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {log.usuarioNome}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(log.dataHora, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Badge variant="outline" className="text-xs">
                          {log.totalRegistros} total
                        </Badge>
                        <Badge variant="default" className="bg-green-600 text-xs">
                          {log.inseridos} inseridos
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {log.atualizados} atualizados
                        </Badge>
                        {log.erros > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {log.erros} erros
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.erros === 0 ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-yellow-500" />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewDetails(log)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Detalhes
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalhes da Importação */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Detalhes da Importação
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.nomeArquivo}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Usuário</p>
                  <p className="font-medium">{selectedLog.usuarioNome}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Data/Hora</p>
                  <p className="font-medium">
                    {format(selectedLog.dataHora, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xl font-bold">{selectedLog.totalRegistros}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{selectedLog.inseridos}</p>
                  <p className="text-xs text-muted-foreground">Inseridos</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xl font-bold text-blue-600">{selectedLog.atualizados}</p>
                  <p className="text-xs text-muted-foreground">Atualizados</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xl font-bold text-red-600">{selectedLog.erros}</p>
                  <p className="text-xs text-muted-foreground">Erros</p>
                </div>
              </div>

              {selectedLog.detalhesErros && selectedLog.detalhesErros.length > 0 && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                  <p className="mb-2 font-medium text-destructive">Detalhes dos erros:</p>
                  <ScrollArea className="h-32">
                    <ul className="space-y-1 text-sm">
                      {selectedLog.detalhesErros.map((erro, index) => (
                        <li key={index} className="text-muted-foreground">
                          {erro}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}

              {selectedLog.erros === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <p className="text-sm font-medium">Importação concluída sem erros</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
