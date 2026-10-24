"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ChartTooltip } from "@/components/ui/chart"
import { ReportMonthFilter } from "@/components/report-month-filter"
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer } from "recharts"
import { useLiveData } from "@/contexts/live-data-context"
import { calculateDashboard, monthKey, monthLabel } from "@/lib/dashboard"
import { equipmentSituationReport, includeSituationCategories, situationColor } from "@/lib/equipment-situation-report"
import { getEquipmentSituationReport } from "@/lib/services"
import type { EquipmentSituationReport } from "@/lib/types"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Radio, Wrench, CheckCircle, Clock, TrendingUp, RefreshCw, PieChartIcon, BarChart3, Users } from "lucide-react"
import { cn } from "@/lib/utils"

export default function DashboardPage() {
  const { equipments, maintenances, situations, loading, error, lastUpdate, refresh } = useLiveData()
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()))
  const [historicalReport, setHistoricalReport] = useState<EquipmentSituationReport | null>(null)
  const [reportLoading, setReportLoading] = useState(true)
  const [reportError, setReportError] = useState(false)
  const [reportRevision, setReportRevision] = useState(0)
  const isCurrentMonth = selectedMonth === monthKey(new Date())
  const stats = useMemo(() => calculateDashboard(equipments, maintenances, selectedMonth), [equipments, maintenances, selectedMonth])
  const currentReport = equipmentSituationReport(equipments, [], monthKey(new Date()))
  const report = isCurrentMonth ? currentReport : historicalReport?.month === selectedMonth ? historicalReport : null
  const situationRows = includeSituationCategories(report?.situations || [], situations)
  const chartSituations = situationRows.filter((item) => item.value > 0)
  const historicalPending = !isCurrentMonth && (reportLoading || !report)
  const firstYear = Math.min(historicalReport?.firstYear || Infinity, equipments.reduce((earliest, item) => item.dataCadastro.getTime() > 0 ? Math.min(earliest, Number(monthKey(item.dataCadastro).slice(0, 4))) : earliest, Number(monthKey(new Date()).slice(0, 4)) - 6))
  useEffect(() => {
    if (loading || error) return
    let active = true
    setReportLoading(true)
    setReportError(false)
    // Agrupa importações e mudanças em lote; o gráfico atual já reage ao listener.
    const timeout = setTimeout(() => {
      getEquipmentSituationReport(selectedMonth).then((result) => {
        if (active) setHistoricalReport(result)
      }).catch(() => {
        if (active) setReportError(true)
      }).finally(() => {
        if (active) setReportLoading(false)
      })
    }, 200)
    return () => { active = false; clearTimeout(timeout) }
  }, [equipments, selectedMonth, loading, error, reportRevision])
  const refreshing = loading
  const handleRefresh = refresh
  if (error) return <div role="alert" className="rounded-lg border border-destructive/40 p-6">Não foi possível carregar o dashboard. Use “Tentar novamente” para sincronizar.</div>

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    )
  }

  const statCards = [
    {
      title: "Total de Remotas",
      value: stats?.totalEquipments || 0,
      description: "Remotas ativas atualmente",
      icon: Radio,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Total de Manutencoes",
      value: stats?.totalMaintenances || 0,
      description: "Manutencoes registradas",
      icon: Wrench,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Em Manutencao",
      value: stats?.inProgress || 0,
      description: "Aguardando finalizacao",
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Finalizadas no Mes",
      value: stats?.completedThisMonth || 0,
      description: `Concluídas em ${monthLabel(selectedMonth)}`,
      icon: CheckCircle,
      color: "text-success",
      bgColor: "bg-success/10",
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Visao geral do sistema de manutencao
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {lastUpdate && (
        <p className="text-xs text-muted-foreground">
          Ultima atualizacao: {format(lastUpdate, "dd/MM/yyyy 'as' HH:mm:ss", { locale: ptBR })}
        </p>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title} className="relative overflow-hidden border-border/50 bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={cn("rounded-lg p-2", card.bgColor)}>
                <card.icon className={cn("h-4 w-4", card.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">{card.value}</span>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
            <div className={cn("absolute -bottom-4 -right-4 h-24 w-24 rounded-full opacity-10", card.bgColor)} />
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Gráfico de Pizza - Remotas por Situação */}
        <Card data-monthly-report className="border-border/50 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <PieChartIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Remotas por situação — {monthLabel(selectedMonth)}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {isCurrentMonth ? "Situação atual de todas as remotas ativas, com ou sem manutenção." : "Situação das remotas ativas no fechamento do mês, conforme o histórico registrado."}
                </CardDescription>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3 print:hidden">
              <ReportMonthFilter value={selectedMonth} onChange={setSelectedMonth} firstYear={firstYear} />
              <Button variant="outline" className="h-10" onClick={() => window.print()} disabled={!report?.totalEquipments || historicalPending || (!isCurrentMonth && reportError)}>Imprimir relatório</Button>
            </div>
          </CardHeader>
          <CardContent>
            {reportError && <div role="alert" className="mb-4 rounded-md border border-destructive/40 p-3 text-sm">Não foi possível sincronizar o histórico. <button className="underline print:hidden" onClick={() => setReportRevision((value) => value + 1)}>Tentar novamente</button></div>}
            {historicalPending && !reportError ? <div className="flex h-75 items-center justify-center" role="status"><Spinner className="mr-2 h-5 w-5" />Consultando histórico do mês...</div> : chartSituations.length > 0 && (isCurrentMonth || !reportError) ? (
              <div className="h-75">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={chartSituations}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={40}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={{ stroke: "#888", strokeWidth: 1 }}
                    >
                      {chartSituations.map((item) => (
                        <Cell key={item.name} fill={situationColor(item.name)} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{payload[0].name}</span>
                                <span className="text-sm text-muted-foreground">
                                  {payload[0].value} remota(s)
                                </span>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-75 items-center justify-center">
                <p className="text-sm text-muted-foreground">{reportError && !isCurrentMonth ? "Histórico indisponível no momento" : "Nenhuma remota ativa no período selecionado"}</p>
              </div>
            )}
            {!historicalPending && (isCurrentMonth || !reportError) && <>
              <p className="mb-3 text-sm font-medium">{report?.totalEquipments || 0} remota(s) ativa(s) · {isCurrentMonth ? "posição atual" : "posição no fechamento do mês"}</p>
              <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Situação</th><th>Remotas</th><th>Percentual</th></tr></thead><tbody>{situationRows.map((item) => <tr key={item.name} className="border-b"><td className="py-2"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: situationColor(item.name) }} />{item.name}</td><td>{item.value}</td><td>{report?.totalEquipments ? (item.value / report.totalEquipments * 100).toFixed(1) : "0.0"}%</td></tr>)}</tbody></table>
              {!!report?.missingHistory && <p role="note" className="mt-3 text-xs text-muted-foreground">{report.missingHistory} remota(s) não possuem histórico suficiente para determinar a situação neste mês e estão identificadas como “Sem histórico no período”.</p>}
            </>}
          </CardContent>
        </Card>

        {/* Gráfico de Barras - Manutenções por Técnico */}
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Manutencoes por Tecnico
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Quantidade de manutencoes realizadas por tecnico
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {stats?.manutencoesPorTecnico && stats.manutencoesPorTecnico.length > 0 ? (
              <div className="h-75">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.manutencoesPorTecnico} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#4b5563" }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={100} 
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      axisLine={{ stroke: "#4b5563" }}
                    />
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{payload[0].payload.name}</span>
                                <span className="text-sm text-muted-foreground">
                                  {payload[0].value} manutencao(oes)
                                </span>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Bar isAnimationActive={false} dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-75 items-center justify-center">
                <p className="text-sm text-muted-foreground">Sem dados disponiveis</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Linha - Manutenções por Mês */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2">
              <BarChart3 className="h-5 w-5 text-success" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                Manutencoes por Mes
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Evolucao das manutencoes finalizadas nos ultimos 6 meses
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stats?.manutencoesPorMes && stats.manutencoesPorMes.length > 0 ? (
            <div className="h-75">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.manutencoesPorMes} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid stroke="#ffffff20" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="mes"
                    tick={{ fill: "#e5e7eb", fontSize: 11 }}
                    axisLine={{ stroke: "#ffffff30" }}
                    tickLine={{ stroke: "#ffffff30" }}
                  />

                  <YAxis
                    tick={{ fill: "#e5e7eb", fontSize: 11 }}
                    axisLine={{ stroke: "#ffffff30" }}
                    tickLine={{ stroke: "#ffffff30" }}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{payload[0].payload.mes}</span>
                              <span className="text-sm text-muted-foreground">
                                {payload[0].value} manutencao(oes)
                              </span>
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="total"
                    stroke="#ffffff"
                    strokeWidth={2}
                    dot={{ fill: "#ffffff", stroke: "#ffffff", r: 4 }}
                    activeDot={{ r: 6, fill: "#ffffff" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-75 items-center justify-center">
              <p className="text-sm text-muted-foreground">Sem dados disponiveis</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Maintenances */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                Ultimas Manutencoes
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Manutencoes mais recentes registradas no sistema
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {stats?.recentMaintenances && stats.recentMaintenances.length > 0 ? (
            <div className="divide-y divide-border/50">
              {stats.recentMaintenances.map((maintenance) => (
                <div
                  key={maintenance.id}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                      <Radio className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Remota {maintenance.numeroRemota}</p>
                      <p className="text-sm text-muted-foreground">
                        {maintenance.defeitoRelatado === "Outro" 
                          ? maintenance.defeitoRelatadoOutro 
                          : maintenance.defeitoRelatado}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{maintenance.tecnicoNome}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(maintenance.dataEntrada, "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                        maintenance.status === "finalizada"
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      )}
                    >
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        maintenance.status === "finalizada" ? "bg-success" : "bg-warning"
                      )} />
                      {maintenance.status === "finalizada"
                        ? "Finalizada"
                        : "Em andamento"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 rounded-full bg-muted p-4">
                <Wrench className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nenhuma manutencao registrada ainda
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
