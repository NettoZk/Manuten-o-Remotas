"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getEquipments, getMaintenancesByEquipment } from "@/lib/services"
import type { Equipment, Maintenance } from "@/lib/types"
import { Radio, Search, Eye, History, Calendar, Layers, Signal, Clock, CheckCircle } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

export default function EquipmentsPage() {
  const [equipments, setEquipments] = useState<Equipment[]>([])
  const [filteredEquipments, setFilteredEquipments] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [equipmentHistory, setEquipmentHistory] = useState<Maintenance[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)

  useEffect(() => {
    async function loadEquipments() {
      try {
        const data = await getEquipments()
        setEquipments(data)
        setFilteredEquipments(data)
      } catch (error) {
        console.error("Erro ao carregar equipamentos:", error)
      } finally {
        setLoading(false)
      }
    }
    loadEquipments()
  }, [])

  useEffect(() => {
    if (!search.trim()) {
      setFilteredEquipments(equipments)
      return
    }

    const searchLower = search.toLowerCase()
    const filtered = equipments.filter(
      (e) =>
        e.numeroRemota.toLowerCase().includes(searchLower) ||
        e.modelo.toLowerCase().includes(searchLower) ||
        e.operadoraAtual.toLowerCase().includes(searchLower)
    )
    setFilteredEquipments(filtered)
  }, [search, equipments])

  const handleViewDetails = async (equipment: Equipment) => {
    setSelectedEquipment(equipment)
    setShowDetailsDialog(true)
    setLoadingHistory(true)

    try {
      const history = await getMaintenancesByEquipment(equipment.numeroRemota)
      setEquipmentHistory(history)
    } catch (error) {
      console.error("Erro ao carregar histórico:", error)
      setEquipmentHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleCloseDialog = () => {
    setShowDetailsDialog(false)
    setSelectedEquipment(null)
    setEquipmentHistory([])
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Equipamentos</h1>
        <p className="text-muted-foreground">
          Visualize todas as remotas cadastradas no sistema
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Remotas Cadastradas
          </CardTitle>
          <CardDescription>
            {filteredEquipments.length} de {equipments.length} remota(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, modelo ou operadora..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {filteredEquipments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma remota encontrada
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium">Número</th>
                    <th className="pb-3 font-medium">Modelo</th>
                    <th className="pb-3 font-medium">Ano</th>
                    <th className="pb-3 font-medium">Lote</th>
                    <th className="pb-3 font-medium">Operadora</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Cadastro</th>
                    <th className="pb-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipments.map((equipment) => (
                    <tr key={equipment.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 font-medium">{equipment.numeroRemota}</td>
                      <td className="py-3">{equipment.modelo}</td>
                      <td className="py-3">{equipment.anoFabricacao}</td>
                      <td className="py-3">{equipment.lote}</td>
                      <td className="py-3">{equipment.operadoraAtual}</td>
                      <td className="py-3">
                        <Badge
                          variant={equipment.status === "Nova" ? "default" : "secondary"}
                        >
                          {equipment.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {format(equipment.dataCadastro, "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetails(equipment)}
                          className="gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          Ver Detalhes
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalhes da Remota */}
      <Dialog open={showDetailsDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              Remota {selectedEquipment?.numeroRemota}
            </DialogTitle>
            <DialogDescription>
              Detalhes do cadastro e histórico de manutenções
            </DialogDescription>
          </DialogHeader>

          {selectedEquipment && (
            <div className="space-y-6">
              {/* Informações do Cadastro */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Radio className="h-4 w-4 text-primary" />
                    Dados do Cadastro
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Modelo</p>
                      <p className="font-medium">{selectedEquipment.modelo}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Ano de Fabricação</p>
                      <p className="flex items-center gap-2 font-medium">
                        <Calendar className="h-4 w-4 text-primary" />
                        {selectedEquipment.anoFabricacao}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Lote</p>
                      <p className="flex items-center gap-2 font-medium">
                        <Layers className="h-4 w-4 text-primary" />
                        {selectedEquipment.lote}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Operadora Atual</p>
                      <p className="flex items-center gap-2 font-medium">
                        <Signal className="h-4 w-4 text-primary" />
                        {selectedEquipment.operadoraAtual}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p>
                      <Badge variant={selectedEquipment.status === "Nova" ? "default" : "secondary"}>
                        {selectedEquipment.status}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Data de Cadastro</p>
                      <p className="font-medium">
                        {format(selectedEquipment.dataCadastro, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Histórico de Manutenções */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    Histórico de Manutenções
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Spinner className="h-6 w-6 text-primary" />
                      <span className="ml-2 text-muted-foreground">Carregando histórico...</span>
                    </div>
                  ) : equipmentHistory.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <div className="mb-4 rounded-full bg-muted p-4">
                        <History className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Nenhuma manutenção registrada para esta remota
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {equipmentHistory.map((maintenance) => (
                        <div
                          key={maintenance.id}
                          className="rounded-lg border border-border/50 p-4 transition-colors hover:bg-muted/30"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <span className="font-medium">
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
                                Técnico: <span className="text-foreground">{maintenance.tecnicoNome}</span>
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
                                  Serviços:{" "}
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
                                <p className="text-sm font-medium">
                                  {format(maintenance.dataEntrada, "dd/MM/yyyy HH:mm", {
                                    locale: ptBR,
                                  })}
                                </p>
                                {maintenance.dataFinalizacao && (
                                  <>
                                    <p className="mt-2 text-xs text-muted-foreground">Finalização</p>
                                    <p className="text-sm font-medium">
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
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
