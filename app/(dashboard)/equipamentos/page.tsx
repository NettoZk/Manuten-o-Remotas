"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { updateEquipmentSituationManual } from "@/lib/services"
import type { Equipment, Maintenance } from "@/lib/types"
import { useLiveData } from "@/contexts/live-data-context"
import { useAuth } from "@/contexts/auth-context"
import { EditEquipmentDialog } from "@/components/edit-equipment-dialog"
import { DeleteEquipmentDialog } from "@/components/delete-equipment-dialog"
import { ImportEquipmentDialog } from "@/components/import-equipment-dialog"
import { WarrantyDialog } from "@/components/warranty-dialog"
import { WarrantyHistory } from "@/components/warranty-history"
import { BulkMovementDialog } from "@/components/bulk-movement-dialog"
import { isWarrantySentSituation } from "@/lib/validation"
import { filterEquipmentRegistration, searchEquipments, type EquipmentRegistrationFilter } from "@/lib/equipment-search"
import { Radio, Search, Eye, History, Calendar, Layers, Signal, Clock, CheckCircle, RefreshCw, Pencil, Trash2, Upload, ShieldCheck } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function EquipmentsPage() {
  const { user, hasPermission } = useAuth()
  const live = useLiveData()
  const isAdmin = hasPermission(["admin"])
  const canMove = hasPermission(["admin", "tecnico"])
  const [movementIds, setMovementIds] = useState<string[]>([])
  const [showBulkMovement, setShowBulkMovement] = useState(false)
  
  const equipments = live.equipments
  const loading = live.loading
  const [search, setSearch] = useState("")
  const [registrationFilter, setRegistrationFilter] = useState<EquipmentRegistrationFilter>("todas")
  const detailsRef = useRef<HTMLDivElement>(null)
  const [warrantyEquipmentId, setWarrantyEquipmentId] = useState<string | null>(null)
  const warrantyEquipment = live.equipments.find((item) => item.id === warrantyEquipmentId && item.estadoRegistro !== "inativo")
  const [situacaoFilter, setSituacaoFilter] = useState("")
  const equipmentSituations = live.situations.filter((item) => item.ativo)
  const matches = useMemo(() => searchEquipments(equipments, search, situacaoFilter), [equipments, search, situacaoFilter])
  const filteredEquipments = useMemo(() => filterEquipmentRegistration(matches, registrationFilter), [matches, registrationFilter])
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null)
  const [equipmentHistory, setEquipmentHistory] = useState<Maintenance[]>([])
  const loadingHistory = live.loading
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  
  // Estados para modal de alteração de situação
  const [showChangeSituationDialog, setShowChangeSituationDialog] = useState(false)
  const [equipmentToChangeSituation, setEquipmentToChangeSituation] = useState<Equipment | null>(null)
  const [newSituacao, setNewSituacao] = useState("")
  const [motivoAlteracao, setMotivoAlteracao] = useState("")
  const [savingSituation, setSavingSituation] = useState(false)
  
  // Estados para modal de edição
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [equipmentToEdit, setEquipmentToEdit] = useState<Equipment | null>(null)
  
  // Estados para modal de exclusão
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [equipmentToDelete, setEquipmentToDelete] = useState<Equipment | null>(null)
  
  // Estados para modal de importação
  const [showImportDialog, setShowImportDialog] = useState(false)

  const selectedId = selectedEquipment?.id
  useEffect(() => {
    if (!selectedId) return
    const current = live.equipments.find((item) => item.id === selectedId)
    if (!current) { setShowDetailsDialog(false); setSelectedEquipment(null); return }
    setSelectedEquipment(current)
    setEquipmentHistory(live.maintenances.filter((item) => item.equipmentId === current.id || item.numeroRemota === current.numeroRemota))
  }, [selectedId, live.equipments, live.maintenances])

  const handleViewDetails = (equipment: Equipment) => {
    detailsRef.current?.scrollTo({ top: 0 })
    setSelectedEquipment(equipment)
    setShowDetailsDialog(true)
    setEquipmentHistory(live.maintenances.filter((item) => item.equipmentId === equipment.id || item.numeroRemota === equipment.numeroRemota))
  }

  const handleCloseDialog = () => {
    setShowDetailsDialog(false)
    setSelectedEquipment(null)
    setEquipmentHistory([])
  }

  const handleOpenChangeSituation = (equipment: Equipment) => {
    setEquipmentToChangeSituation(equipment)
    setNewSituacao(equipment.situacaoRemota || "")
    setMotivoAlteracao("")
    setShowChangeSituationDialog(true)
  }

  const handleCloseChangeSituation = () => {
    setShowChangeSituationDialog(false)
    setEquipmentToChangeSituation(null)
    setNewSituacao("")
    setMotivoAlteracao("")
  }

  const handleSaveSituation = async () => {
    if (!equipmentToChangeSituation || !newSituacao || !user) return

    setSavingSituation(true)
    try {
      await updateEquipmentSituationManual(equipmentToChangeSituation.id, {
        situacaoAnterior: equipmentToChangeSituation.situacaoRemota,
        situacaoRemota: newSituacao,
        situacaoAtualizadaPor: user.nome,
        motivoAlteracaoSituacao: motivoAlteracao || undefined,
      })

      handleCloseChangeSituation()
    } catch (error) {
      console.error("Erro ao alterar situação:", error)
      toast.error(error instanceof Error ? error.message : "Erro ao alterar situação. Tente novamente.")
    } finally {
      setSavingSituation(false)
    }
  }

  // Handlers de edição
  const handleOpenEdit = (equipment: Equipment) => {
    setEquipmentToEdit(equipment)
    setShowEditDialog(true)
  }

  const handleEquipmentUpdated = (updatedEquipment: Equipment) => {
    if (selectedEquipment?.id === updatedEquipment.id) setSelectedEquipment(updatedEquipment)
  }

  // Handlers de exclusão
  const handleOpenDelete = (equipment: Equipment) => {
    setEquipmentToDelete(equipment)
    setShowDeleteDialog(true)
  }

  const handleEquipmentDeleted = (equipmentId: string) => {
    if (selectedEquipment?.id === equipmentId) handleCloseDialog()
  }

  // Handler de importação
  const handleImportComplete = () => { /* A assinatura recebe os registros gravados. */ }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipamentos</h1>
          <p className="text-muted-foreground">
            Visualize todas as remotas cadastradas no sistema
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowImportDialog(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Importar Planilha
          </Button>
        )}
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
          <div className="mb-4 flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Pesquisar remotas"
                placeholder="Número/IMEI atual ou anterior, modelo, OCM..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-full md:w-64">
              <select
                aria-label="Filtrar por situação"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={situacaoFilter}
                onChange={(e) => setSituacaoFilter(e.target.value)}
              >
                <option value="">Todas as situações</option>
                {equipmentSituations.map((situation) => (
                  <option key={situation.id} value={situation.nome}>
                    {situation.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div role="group" aria-label="Registros exibidos" className="mb-2 flex flex-wrap gap-2">
            {([ ["todas", "Todas"], ["ativas", "Ativas"], ["arquivadas", "Arquivadas"] ] as const).map(([value, label]) => <Button key={value} size="sm" variant={registrationFilter === value ? "default" : "outline"} aria-pressed={registrationFilter === value} onClick={() => setRegistrationFilter(value)}>{label} ({filterEquipmentRegistration(matches, value).length})</Button>)}
          </div>
          <p className="mb-4 text-xs text-muted-foreground">A busca inclui cadastros arquivados e vínculos de substituição. Use os filtros para consultar somente ativas ou arquivadas.</p>
          {canMove && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3"><span className="text-sm">{movementIds.length} remota(s) selecionada(s)</span><Button type="button" variant="outline" onClick={() => setShowBulkMovement(true)}>Movimentação em massa</Button>{!!movementIds.length && <Button type="button" variant="ghost" onClick={() => setMovementIds([])}>Limpar seleção</Button>}</div>}

          {filteredEquipments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma remota encontrada neste filtro.{registrationFilter !== "todas" && matches.length > 0 && <Button variant="link" onClick={() => setRegistrationFilter("todas")}>Ver resultados em todos os registros</Button>}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    {canMove && <th className="pb-3 pr-3"><input type="checkbox" aria-label="Selecionar remotas ativas deste filtro" checked={filteredEquipments.some((item) => item.estadoRegistro !== "inativo") && filteredEquipments.filter((item) => item.estadoRegistro !== "inativo").every((item) => movementIds.includes(item.id))} onChange={(event) => { const ids = filteredEquipments.filter((item) => item.estadoRegistro !== "inativo").map((item) => item.id); setMovementIds((old) => event.target.checked ? [...new Set([...old, ...ids])] : old.filter((id) => !ids.includes(id))) }} /></th>}
                    <th className="pb-3 font-medium">Número</th>
                    <th className="pb-3 font-medium">Modelo</th>
                    <th className="pb-3 font-medium">Ano</th>
                    <th className="pb-3 font-medium">OCM</th>
                    <th className="pb-3 font-medium">Operadora</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Situação</th>
                    <th className="pb-3 font-medium">Cadastro</th>
                    <th className="pb-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipments.map((equipment) => (
                    <tr key={equipment.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      {canMove && <td className="py-3 pr-3"><input type="checkbox" aria-label={`Selecionar remota ${equipment.numeroRemota}`} disabled={equipment.estadoRegistro === "inativo"} checked={movementIds.includes(equipment.id)} onChange={(event) => setMovementIds((old) => event.target.checked ? [...new Set([...old, equipment.id])] : old.filter((id) => id !== equipment.id))} /></td>}
                      <td className="py-3 font-medium"><button className="text-left hover:underline" aria-label={`Ver remota ${equipment.numeroRemota}`} onClick={() => handleViewDetails(equipment)}>{equipment.numeroRemota}</button>
                        {equipment.remotaAnteriorNumero && <p className="text-xs font-normal text-muted-foreground">Anterior: {equipment.remotaAnteriorNumero}</p>}
                        {equipment.substituidaPorNumero && <p className="text-xs font-normal text-muted-foreground">Substituta: {equipment.substituidaPorNumero}</p>}
                        <Badge variant={equipment.estadoRegistro === "inativo" ? "secondary" : "outline"} className="mt-1">{equipment.estadoRegistro === "inativo" ? "Arquivada" : "Ativa"}</Badge>
                      </td>
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
                      <td className="py-3">
                        {equipment.situacaoRemota ? (
                          <Badge variant="outline">{equipment.situacaoRemota}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {format(equipment.dataCadastro, "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewDetails(equipment)}
                            title="Ver Detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isAdmin && equipment.estadoRegistro !== "inativo" && (
                            <>
                              {equipment.garantia?.status === "enviada" && <Button size="sm" variant="ghost" title="Registrar retorno da garantia" onClick={() => setWarrantyEquipmentId(equipment.id)}>
                                <ShieldCheck className="h-4 w-4" />
                              </Button>}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenEdit(equipment)}
                                title="Editar"
                                disabled={equipment.garantia?.status === "enviada"}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenChangeSituation(equipment)}
                                title="Alterar Situação"
                                disabled={equipment.garantia?.status === "enviada"}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenDelete(equipment)}
                                title="Excluir"
                                disabled={equipment.garantia?.status === "enviada"}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
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
        <DialogContent ref={detailsRef} className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
              {selectedEquipment.estadoRegistro === "inativo" && <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"><p className="font-medium">Remota arquivada · consulta do histórico</p><p>{selectedEquipment.substituidaPorNumero ? `Substituída pela remota ${selectedEquipment.substituidaPorNumero} no retorno da garantia.` : "Este cadastro está fora da operação ativa."}</p>{selectedEquipment.arquivadoEm && <p className="text-muted-foreground">Arquivada em {format(selectedEquipment.arquivadoEm, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}{selectedEquipment.arquivadoPor ? ` por ${selectedEquipment.arquivadoPor}` : ""}</p>}</div>}
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
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">OCM</p>
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
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Situação</p>
                      {selectedEquipment.situacaoRemota ? (
                        <Badge variant="outline">{selectedEquipment.situacaoRemota}</Badge>
                      ) : (
                        <span className="text-muted-foreground">Não definida</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Data de Cadastro</p>
                      <p className="font-medium">
                        {format(selectedEquipment.dataCadastro, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>

                  {/* Informações de rastreabilidade da situação (se houver alteração manual) */}
                  {selectedEquipment.situacaoAtualizadaEm && (
                    <div className="mt-4 rounded-lg bg-muted/30 p-3 text-sm">
                      <p className="font-medium text-muted-foreground mb-2">Última alteração de situação:</p>
                      <div className="space-y-1">
                        <p>
                          <span className="text-muted-foreground">De:</span>{" "}
                          <span className="font-medium">{selectedEquipment.situacaoAnterior || "Não definida"}</span>
                          {" → "}
                          <span className="text-muted-foreground">Para:</span>{" "}
                          <span className="font-medium">{selectedEquipment.situacaoRemota}</span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">Por:</span>{" "}
                          <span className="font-medium">{selectedEquipment.situacaoAtualizadaPor}</span>
                          {" em "}
                          {format(selectedEquipment.situacaoAtualizadaEm, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        {selectedEquipment.motivoAlteracaoSituacao && (
                          <p>
                            <span className="text-muted-foreground">Motivo:</span>{" "}
                            {selectedEquipment.motivoAlteracaoSituacao}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {isAdmin && selectedEquipment.estadoRegistro !== "inativo" && (selectedEquipment.garantia?.status === "enviada" ? <Button variant="outline" onClick={() => setWarrantyEquipmentId(selectedEquipment.id)}><ShieldCheck className="mr-2 h-4 w-4" />Registrar retorno da garantia</Button> : <div className="space-y-2 text-sm"><p className="text-muted-foreground">O envio para garantia exige uma manutenção com diagnóstico, serviços e motivo registrados.</p><Button variant="outline" asChild><Link href={`/manutencao?remota=${encodeURIComponent(selectedEquipment.numeroRemota)}`}>Abrir procedimento de manutenção</Link></Button></div>)}
              <WarrantyHistory equipment={selectedEquipment} onViewLinked={(id) => {
                const linked = live.equipments.find((item) => item.id === id)
                if (linked) handleViewDetails(linked)
                else toast.error("Não foi possível localizar a remota vinculada")
              }} />

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

      {/* Dialog de Alteração de Situação (somente Admin) */}
      <Dialog open={showChangeSituationDialog} onOpenChange={handleCloseChangeSituation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Alterar Situação da Remota
            </DialogTitle>
            <DialogDescription>
              Altere a situação da remota {equipmentToChangeSituation?.numeroRemota}
            </DialogDescription>
          </DialogHeader>

          {equipmentToChangeSituation && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">Situação atual:</p>
                <p className="font-medium">
                  {equipmentToChangeSituation.situacaoRemota || "Não definida"}
                </p>
              </div>

              <Field>
                <FieldLabel>Nova Situação</FieldLabel>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={newSituacao}
                  onChange={(e) => setNewSituacao(e.target.value)}
                >
                  <option value="">Selecione a situação...</option>
                  {equipmentSituations.filter((item) => !isWarrantySentSituation(item.nome) && item.nome !== "Manutenção").map((situation) => (
                    <option key={situation.id} value={situation.nome}>
                      {situation.nome}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel>Motivo da Alteração (opcional)</FieldLabel>
                <Textarea
                  value={motivoAlteracao}
                  onChange={(e) => setMotivoAlteracao(e.target.value)}
                  placeholder="Descreva o motivo da alteração..."
                  rows={3}
                />
              </Field>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseChangeSituation}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveSituation}
              disabled={!newSituacao || savingSituation}
            >
              {savingSituation ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Salvando...
                </>
              ) : (
                "Salvar Alteração"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição */}
      <EditEquipmentDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        equipment={equipmentToEdit}
        equipmentSituations={equipmentSituations}
        onUpdated={handleEquipmentUpdated}
      />

      {/* Dialog de Exclusão */}
      <DeleteEquipmentDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        equipment={equipmentToDelete}
        onDeleted={handleEquipmentDeleted}
      />

      {/* Dialog de Importação */}
      <ImportEquipmentDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImported={handleImportComplete}
      />
      {warrantyEquipment && <WarrantyDialog key={warrantyEquipment.id} equipment={warrantyEquipment} situations={equipmentSituations} operators={live.operators} onClose={() => setWarrantyEquipmentId(null)} />}
      {showBulkMovement && <BulkMovementDialog equipments={equipments} selectedIds={movementIds} onClose={() => setShowBulkMovement(false)} onCompleted={(numbers) => setMovementIds((old) => old.filter((id) => !equipments.some((item) => item.id === id && numbers.includes(item.numeroRemota))))} />}
    </div>
  )
}
