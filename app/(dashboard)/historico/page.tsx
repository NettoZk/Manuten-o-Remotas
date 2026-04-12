"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { exportMaintenancesToExcel } from "@/lib/excel-export"
import type { Maintenance, Equipment, Operator, User } from "@/lib/types"
import { collection, onSnapshot, query } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { History, Search, Download, Filter, X } from "lucide-react"
import { format, isWithinInterval, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function HistoryPage() {
  const { hasPermission } = useAuth()
  const [maintenances, setMaintenances] = useState<Maintenance[]>([])
  const [filteredMaintenances, setFilteredMaintenances] = useState<Maintenance[]>([])
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

  useEffect(() => {
    let readyCount = 0
    const markReady = () => {
      readyCount += 1
      if (readyCount === 4) {
        setLoading(false)
      }
    }

    const maintenancesQuery = query(collection(db, "maintenances"))
    const equipmentsQuery = query(collection(db, "equipments"))
    const operatorsQuery = query(collection(db, "operators"))
    const usersQuery = query(collection(db, "users"))

    const unsubscribeMaintenances = onSnapshot(
      maintenancesQuery,
      (snapshot) => {
        const maintenancesData = snapshot.docs
          .map((doc) => {
            const data = doc.data()
            return {
              id: doc.id,
              ...data,
              dataEntrada: data.dataEntrada?.toDate() || new Date(),
              dataFinalizacao: data.dataFinalizacao?.toDate() || null,
            } as Maintenance
          })
          .sort((a, b) => b.dataEntrada.getTime() - a.dataEntrada.getTime())

        setMaintenances(maintenancesData)
        setFilteredMaintenances(maintenancesData)
        markReady()
      },
      (error) => {
        console.error("Erro ao carregar histórico em tempo real:", error)
        markReady()
      }
    )

    const unsubscribeEquipments = onSnapshot(
      equipmentsQuery,
      (snapshot) => {
        const equipmentMap = new Map<string, Equipment>()
        snapshot.docs.forEach((doc) => {
          const data = doc.data()
          equipmentMap.set(doc.id, {
            id: doc.id,
            ...data,
            dataCadastro: data.dataCadastro?.toDate() || new Date(),
            situacaoAtualizadaEm: data.situacaoAtualizadaEm?.toDate() || undefined,
            ultimaEdicaoEm: data.ultimaEdicaoEm?.toDate() || undefined,
            arquivadoEm: data.arquivadoEm?.toDate() || undefined,
            emManutencaoDesde: data.emManutencaoDesde?.toDate() || undefined,
            estadoRegistro: data.estadoRegistro || "ativo",
          } as Equipment)
        })
        setEquipments(equipmentMap)
        markReady()
      },
      (error) => {
        console.error("Erro ao carregar equipamentos em tempo real:", error)
        markReady()
      }
    )

    const unsubscribeOperators = onSnapshot(
      operatorsQuery,
      (snapshot) => {
        setOperators(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Operator)).filter((o) => o.ativo))
        markReady()
      },
      (error) => {
        console.error("Erro ao carregar operadoras em tempo real:", error)
        markReady()
      }
    )

    const unsubscribeUsers = onSnapshot(
      usersQuery,
      (snapshot) => {
        setTechnicians(
          snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() } as User))
            .filter((u) => u.tipo === "tecnico" || u.tipo === "admin")
        )
        markReady()
      },
      (error) => {
        console.error("Erro ao carregar usuários em tempo real:", error)
        markReady()
      }
    )

    return () => {
      unsubscribeMaintenances()
      unsubscribeEquipments()
      unsubscribeOperators()
      unsubscribeUsers()
    }
  }, [])

  useEffect(() => {
    let filtered = [...maintenances]

    if (filterNumero.trim()) {
      filtered = filtered.filter((m) =>
        m.numeroRemota.toLowerCase().includes(filterNumero.toLowerCase())
      )
    }

    if (filterModelo.trim()) {
      filtered = filtered.filter((m) => {
        const equipment = equipments.get(m.numeroRemota)
        return equipment?.modelo.toLowerCase().includes(filterModelo.toLowerCase())
      })
    }

    if (filterTecnico) {
      filtered = filtered.filter((m) => m.tecnicoId === filterTecnico)
    }

    if (filterOperadora) {
      filtered = filtered.filter(
        (m) => m.operadoraAntes === filterOperadora || m.operadoraDepois === filterOperadora
      )
    }

    if (filterDateFrom) {
      const fromDate = parseISO(filterDateFrom)
      filtered = filtered.filter((m) => m.dataEntrada >= fromDate)
    }

    if (filterDateTo) {
      const toDate = parseISO(filterDateTo)
      toDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter((m) => m.dataEntrada <= toDate)
    }

    setFilteredMaintenances(filtered)
  }, [filterNumero, filterModelo, filterTecnico, filterOperadora, filterDateFrom, filterDateTo, maintenances, equipments])

  const clearFilters = () => {
    setFilterNumero("")
    setFilterModelo("")
    setFilterTecnico("")
    setFilterOperadora("")
    setFilterDateFrom("")
    setFilterDateTo("")
  }

  const handleExport = async () => {
    if (filteredMaintenances.length === 0) {
      toast.error("Nenhuma manutenção para exportar")
      return
    }

    setExporting(true)
    try {
      exportMaintenancesToExcel(filteredMaintenances, equipments)
      toast.success("Arquivo Excel gerado com sucesso")
    } catch (error) {
      console.error("Erro ao exportar:", error)
      toast.error("Erro ao gerar arquivo Excel")
    } finally {
      setExporting(false)
    }
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
            Exportar Excel
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
                {filteredMaintenances.length} de {maintenances.length} registro(s)
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

          {filteredMaintenances.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma manutenção encontrada
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
                    const equipment = equipments.get(maintenance.numeroRemota)
                    return (
                      <tr key={maintenance.id} className="border-b last:border-0">
                        <td className="py-3 font-medium">{maintenance.numeroRemota}</td>
                        <td className="py-3">{equipment?.modelo || "-"}</td>
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
        </CardContent>
      </Card>
    </div>
  )
}
