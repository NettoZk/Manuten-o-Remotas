"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useLiveData } from "@/contexts/live-data-context"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { exportMaintenancesToExcel } from "@/lib/excel-export"
import { maintenanceEquipmentData } from "@/lib/maintenance-snapshot"
import { getMaintenancePage, getAllMaintenanceResults, getMaintenanceTechnicianTotals, type PageCursor } from "@/lib/services"
import type { Maintenance, Equipment, Operator, User } from "@/lib/types"
import { History, Download, Filter, X } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function HistoryPage() {
  const router = useRouter()
  const { hasPermission } = useAuth()
  const live = useLiveData()
  const [maintenances, setMaintenances] = useState<Maintenance[]>([])
  const filteredMaintenances = maintenances
  const [cursor, setCursor] = useState<PageCursor | null>(null)
  const [queryError, setQueryError] = useState(false)
  const [queryRevision, setQueryRevision] = useState(0)
  const [equipments, setEquipments] = useState<Map<string, Equipment>>(new Map())
  const [operators, setOperators] = useState<Operator[]>([])
  const [technicians, setTechnicians] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [filterNumero, setFilterNumero] = useState("")
  const [filterModelo, setFilterModelo] = useState("")
  const [filterTecnico, setFilterTecnico] = useState("")
  const [filterOperadora, setFilterOperadora] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [procedureId, setProcedureId] = useState<string | null>(null)
  useEffect(() => { setProcedureId(new URLSearchParams(window.location.search).get("manutencao")) }, [])

  useEffect(() => {
    setEquipments(new Map(live.equipments.map((item) => [item.numeroRemota, item])))
    setOperators(live.operators.filter((item) => item.ativo))
  }, [live.equipments, live.operators])
  useEffect(() => {
    let active = true
    getMaintenanceTechnicianTotals().then((totals) => { if (active) setTechnicians(totals.map((item) => ({ id: item.id, nome: item.name, username: "", tipo: "tecnico", ativo: true, criadoEm: new Date(0) }))) }).catch(() => { toast.error("Não foi possível carregar a lista de técnicos") })
    return () => { active = false }
  }, [])
  const filters = { numero: filterNumero.trim(), modelo: filterModelo.trim(), tecnico: filterTecnico, operadora: filterOperadora, dateFrom: filterDateFrom, dateTo: filterDateTo, ...(procedureId ? { procedureId } : {}) }
  const filtersKey = JSON.stringify(filters)
  const activeKey = useRef(filtersKey)
  useEffect(() => { activeKey.current = filtersKey }, [filtersKey])
  useEffect(() => {
    let active = true
    setLoading(true); setQueryError(false); setMaintenances([]); setCursor(null)
    const timer = setTimeout(() => {
      getMaintenancePage(JSON.parse(filtersKey)).then((page) => { if (active) { setMaintenances(page.records); setCursor(page.cursor) } }).catch(() => { if (active) setQueryError(true) }).finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [filtersKey, queryRevision])
  async function loadMore() {
    if (!cursor || loading) return
    const key = filtersKey
    setLoading(true); setQueryError(false)
    try { const page = await getMaintenancePage(filters, cursor); if (activeKey.current === key) { setMaintenances((old) => [...old, ...page.records]); setCursor(page.cursor) } }
    catch { if (activeKey.current === key) setQueryError(true) }
    finally { if (activeKey.current === key) setLoading(false) }
  }

  const clearFilters = () => {
    setFilterNumero("")
    setFilterModelo("")
    setFilterTecnico("")
    setFilterOperadora("")
    setFilterDateFrom("")
    setFilterDateTo("")
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const records = await getAllMaintenanceResults(filters)
      if (!records.length) { toast.error("Nenhuma manutenção para exportar"); return }
      exportMaintenancesToExcel(records, equipments)
      toast.success("Arquivo Excel gerado com sucesso")
    } catch (error) {
      console.error("Erro ao exportar:", error)
      toast.error("Erro ao gerar arquivo Excel")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Histórico</h1>
          <p className="text-muted-foreground">
            Consulte o histórico de manutenções realizadas
          </p>
        </div>
        {hasPermission(["admin"]) && (
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar todos os resultados
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Manutenções
              </CardTitle>
              <CardDescription>
                {filteredMaintenances.length} registro(s) carregado(s){cursor ? " · há mais registros para consultar" : ""}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {procedureId && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"><span>Manutenção vinculada ao envio para garantia</span><Button variant="outline" size="sm" onClick={() => { setProcedureId(null); router.replace("/historico") }}>Ver todo o histórico</Button></div>}
          {showFilters && (
            <div className="mb-6 rounded-lg border bg-muted/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-medium">Filtros</h3>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-2 h-4 w-4" />
                  Limpar
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field>
                  <FieldLabel>Número da Remota</FieldLabel>
                  <Input
                    placeholder="Buscar..."
                    value={filterNumero}
                    onChange={(e) => setFilterNumero(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Modelo</FieldLabel>
                  <Input
                    placeholder="Buscar..."
                    value={filterModelo}
                    onChange={(e) => setFilterModelo(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Técnico</FieldLabel>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={filterTecnico}
                    onChange={(e) => setFilterTecnico(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel>Operadora</FieldLabel>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={filterOperadora}
                    onChange={(e) => setFilterOperadora(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {operators.map((o) => (
                      <option key={o.id} value={o.nome}>
                        {o.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel>Data Inicial</FieldLabel>
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Data Final</FieldLabel>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          )}

          {loading && <p role="status" className="py-2 text-sm">Consultando histórico…</p>}
          {queryError && <p role="alert" className="py-2 text-sm text-destructive">Não foi possível consultar. <button className="underline" onClick={() => setQueryRevision((v) => v + 1)}>Tentar novamente</button></p>}
          {filteredMaintenances.length === 0 && !loading && !queryError ? (
            <p className="text-center text-muted-foreground py-8">
              {cursor ? "Ainda há registros a pesquisar. Continue a busca para conferir os demais resultados." : "Nenhuma manutenção encontrada"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium">Remota</th>
                    <th className="pb-3 font-medium">Modelo</th>
                    <th className="pb-3 font-medium">Técnico</th>
                    <th className="pb-3 font-medium">Defeito</th>
                    <th className="pb-3 font-medium">Serviços</th>
                    <th className="pb-3 font-medium">Data</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaintenances.map((maintenance) => {
                    const { equipment, sourceLabel, historical, complete } = maintenanceEquipmentData(maintenance, equipments.get(maintenance.numeroRemota))
                    return (
                      <tr key={maintenance.id} className="border-b last:border-0">
                        <td className="py-3 font-medium">{maintenance.numeroRemota}</td>
                        <td className="py-3" title={sourceLabel}>{equipment?.modelo || "-"}{(!historical || !complete) && <span className="block text-xs text-muted-foreground">{historical ? "Registro parcial" : "Cadastro atual"}</span>}</td>
                        <td className="py-3">{maintenance.tecnicoNome}</td>
                        <td className="py-3">
                          {maintenance.defeitoEncontrado || maintenance.defeitoRelatado}
                        </td>
                        <td className="py-3 max-w-48 truncate">
                          {maintenance.servicosRealizados.join(", ") || "-"}
                        </td>
                        <td className="py-3 text-sm">
                          {format(maintenance.dataEntrada, "dd/MM/yyyy", {
                            locale: ptBR,
                          })}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={
                              maintenance.status === "finalizada"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {maintenance.status === "finalizada"
                              ? "Finalizada"
                              : "Em andamento"}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {cursor && <Button className="mt-4" variant="outline" disabled={loading} onClick={() => void loadMore()}>{filteredMaintenances.length ? "Carregar mais atendimentos" : "Continuar busca"}</Button>}
        </CardContent>
      </Card>
    </div>
  )
}
