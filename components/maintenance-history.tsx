"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Maintenance } from "@/lib/types"
import { History, Clock, CheckCircle } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface MaintenanceHistoryProps {
  history: Maintenance[]
}

export function MaintenanceHistory({ history }: MaintenanceHistoryProps) {
  if (history.length === 0) {
    return (
      <Card className="border-border/50 bg-card">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <History className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-lg">Historico de Manutencoes</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-12">
          <div className="mb-4 rounded-full bg-muted p-4">
            <History className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Nenhuma manutencao registrada para esta remota
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <History className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Historico de Manutencoes</CardTitle>
            <CardDescription>
              {history.length} manutencao(oes) registrada(s)
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {history.map((maintenance) => (
            <div
              key={maintenance.id}
              className="p-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-foreground">
                      {maintenance.defeitoRelatado === "Outro"
                        ? maintenance.defeitoRelatadoOutro
                        : maintenance.defeitoRelatado}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        maintenance.status === "finalizada"
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      )}
                    >
                      {maintenance.status === "finalizada" ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {maintenance.status === "finalizada"
                        ? "Finalizada"
                        : "Em andamento"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tecnico: <span className="text-foreground">{maintenance.tecnicoNome}</span>
                  </p>
                  {maintenance.defeitoEncontrado && (
                    <p className="text-sm text-muted-foreground">
                      Defeito encontrado:{" "}
                      <span className="text-foreground">
                        {maintenance.defeitoEncontrado === "Outro"
                          ? maintenance.defeitoEncontradoOutro
                          : maintenance.defeitoEncontrado}
                      </span>
                    </p>
                  )}
                  {maintenance.servicosRealizados.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Servicos:{" "}
                      <span className="text-foreground">
                        {maintenance.servicosRealizados.join(", ")}
                        {maintenance.servicosRealizadosOutro &&
                          `, ${maintenance.servicosRealizadosOutro}`}
                      </span>
                    </p>
                  )}
                  {maintenance.operadoraAntes !== maintenance.operadoraDepois && (
                    <p className="text-sm text-muted-foreground">
                      Operadora:{" "}
                      <span className="text-foreground">
                        {maintenance.operadoraAntes} → {maintenance.operadoraDepois}
                      </span>
                    </p>
                  )}
                  {maintenance.observacoes && (
                    <p className="text-sm text-muted-foreground">
                      Obs: <span className="text-foreground">{maintenance.observacoes}</span>
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="rounded-lg bg-secondary/50 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Entrada</p>
                    <p className="text-sm font-medium text-foreground">
                      {format(maintenance.dataEntrada, "dd/MM/yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                    {maintenance.dataFinalizacao && (
                      <>
                        <p className="mt-2 text-xs text-muted-foreground">Finalizacao</p>
                        <p className="text-sm font-medium text-foreground">
                          {format(maintenance.dataFinalizacao, "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
