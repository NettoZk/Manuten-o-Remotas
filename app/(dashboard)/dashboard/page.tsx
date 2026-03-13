"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart"
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer } from "recharts"
import { getDashboardStats } from "@/lib/services"
import type { Maintenance } from "@/lib/types"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Radio, Wrench, CheckCircle, Clock, TrendingUp, Activity, RefreshCw, PieChartIcon, BarChart3, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface DashboardStats {
  totalEquipments: number
  totalMaintenances: number
  inProgress: number
  completedThisMonth: number
  recentMaintenances: Maintenance[]
  remotasPorSituacao: { name: string; value: number }[]
  manutencoesPorTecnico: { name: string; total: number }[]
  manutencoesPorMes: { mes: string; total: number }[]
}

// Cores vibrantes para os gráficos (otimizadas para tema escuro)
const COLORS = [
  "#22c55e", // Verde vibrante
  "#3b82f6", // Azul vibrante
  "#f59e0b", // Amarelo/Laranja
  "#ef4444", // Vermelho
  "#8b5cf6", // Roxo
  "#06b6d4", // Ciano
  "#ec4899", // Rosa
  "#14b8a6", // Teal
]

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const loadStats = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true)
    }
    try {
      const data = await getDashboardStats()
      setStats(data)
      setLastUpdate(new Date())
    } catch (error) {
      console.error("Erro ao carregar estatisticas:", error)
      // Definir valores padrão em caso de erro
      if (!stats) {
        setStats({
          totalEquipments: 0,
          totalMaintenances: 0,
          inProgress: 0,
          completedThisMonth: 0,
          recentMaintenances: [],
          remotasPorSituacao: [],
          manutencoesPorTecnico: [],
          manutencoesPorMes: [],
        })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [stats])

  useEffect(() => {
    loadStats()
    
    // Auto-refresh a cada 30 segundos
    const interval = setInterval(() => {
      loadStats()
    }, 30000)

    return () => clearInterval(interval)
  }, [loadStats])

  const handleRefresh = () => {
    loadStats(true)
  }

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
      description: "Remotas cadastradas no sistema",
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
      description: "Manutencoes concluidas",
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
          <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 ring-1 ring-border">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Sistema Online</span>
          </div>
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
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <PieChartIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Remotas por Situacao
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Distribuicao das remotas por status atual
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {stats?.remotasPorSituacao && stats.remotasPorSituacao.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.remotasPorSituacao}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      outerRadius={90}
                      innerRadius={40}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={{ stroke: "#888", strokeWidth: 1 }}
                    >
                      {stats.remotasPorSituacao.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">Sem dados disponiveis</p>
              </div>
            )}
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
              <div className="h-[300px]">
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
                    <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center">
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
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.manutencoesPorMes} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="mes" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="text-xs" tick={{ fontSize: 11 }} />
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
            <div className="flex h-[300px] items-center justify-center">
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
