"use client"

import { useEffect, useRef, useState } from "react"
import { useLiveData } from "@/contexts/live-data-context"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { Search, Plus, Clock, Radio, Eye, ArrowRight, Lock } from "lucide-react"
import { createMaintenance } from "@/lib/services"
import type { Equipment, Maintenance, Defect } from "@/lib/types"
import { NewEquipmentDialog } from "@/components/new-equipment-dialog"
import { MaintenanceForm } from "@/components/maintenance-form"
import { EquipmentInfo } from "@/components/equipment-info"
import { MaintenanceActions } from "@/components/maintenance-actions"
import { MaintenanceResultFields } from "@/components/maintenance-result-fields"
import { MaintenanceHistory } from "@/components/maintenance-history"
import { useEquipmentMaintenanceHistory } from "@/hooks/use-equipment-maintenance-history"
import { ForceFinishedDialog } from "@/components/force-finalize-dialog"
import { BulkMovementDialog } from "@/components/bulk-movement-dialog"
import { isWarrantySeparatedSituation } from "@/lib/validation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function MaintenancePage() {
  const { user } = useAuth()
  const live = useLiveData()
  const [searchNumber, setSearchNumber] = useState("")
  const isSearching = live.loading
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null)
  const equipment = live.equipments.find((item) => item.id === selectedEquipmentId) || null
  const initialSearchApplied = useRef(false)
  const history = useEquipmentMaintenanceHistory(equipment?.numeroRemota, equipment?.operationVersion)
  const maintenanceHistory = history.records
  const currentMaintenance = maintenanceHistory.find((item) => item.status === "em_andamento") || null
  const defects = live.defects.filter((item) => item.ativo)
  const operators = live.operators.filter((item) => item.ativo)
  const maintenancesInProgress = live.maintenances.filter((item) => item.status === "em_andamento")
  const equipmentsList = live.equipments.filter((item) => item.estadoRegistro !== "inativo")
  const loadingInProgress = live.loading
  const [showNewEquipmentDialog, setShowNewEquipmentDialog] = useState(false)
  const [isCreatingMaintenance, setIsCreatingMaintenance] = useState(false)
  const [viewMode, setViewMode] = useState<"edit" | "view">("edit")
  const [showForceFinalize, setShowForceFinalize] = useState(false)
  const [maintenanceToForceFinalize, setMaintenanceToForceFinalize] = useState<Maintenance | null>(null)
  const [equipmentToForceFinalize, setEquipmentToForceFinalize] = useState<Equipment | null>(null)
  const [maintenanceSelection, setMaintenanceSelection] = useState<string[]>([])
  const [bulkMode, setBulkMode] = useState<"conclude" | "separate" | null>(null)
  const ownMaintenanceEquipments = equipmentsList.filter((item) => maintenancesInProgress.some((maintenance) => maintenance.id === item.manutencaoId && maintenance.tecnicoId === user?.id))
  const selectedMaintenanceIds = maintenanceSelection.filter((id) => ownMaintenanceEquipments.some((item) => item.id === id))
  const separationSituation = live.situations.find((item) => item.ativo && isWarrantySeparatedSituation(item.nome))?.nome

  // Verificar se o usuário é admin
  const isAdmin = user?.tipo === "admin"

  const selectEquipment = (numero: string, mode: "view" | "edit") => {
    setSearchNumber(numero)
    const found = live.equipments.find((item) => item.numeroRemota === numero.trim())
    setViewMode(found?.estadoRegistro === "inativo" ? "view" : mode)
    setSelectedEquipmentId(found?.id || null)
    return found
  }
  useEffect(() => {
    if (live.loading || initialSearchApplied.current) return
    initialSearchApplied.current = true
    const numero = new URLSearchParams(window.location.search).get("remota")
    if (!numero) return
    const found = live.equipments.find((item) => item.numeroRemota === numero)
    setSearchNumber(numero)
    setSelectedEquipmentId(found?.id || null)
    setViewMode(found?.estadoRegistro === "inativo" ? "view" : "edit")
    if (!found) toast.error("Remota não encontrada")
  }, [live.loading, live.equipments])
  const handleSearch = () => {
    if (!searchNumber.trim()) { toast.error("Digite o número da remota"); return }
    if (!selectEquipment(searchNumber.trim(), "edit")) {
      setShowNewEquipmentDialog(true)
    }
  }
  const handleSelectRemotaFromList = (maintenance: Maintenance) => { selectEquipment(maintenance.numeroRemota, "edit") }
  const handleViewRemotaDetails = (numero: string) => { selectEquipment(numero, "view") }

  const handleNewEquipmentCreated = (newEquipment: Equipment) => {
    setSelectedEquipmentId(newEquipment.id)
    setShowNewEquipmentDialog(false)
    toast.success("Remota cadastrada com sucesso")
  }

  const handleStartMaintenance = async (defeitoRelatado: string, defeitoRelatadoOutro?: string) => {
    if (!equipment || !user) {
      toast.error("Dados incompletos. Por favor, busque a remota novamente.")
      return
    }

    setIsCreatingMaintenance(true)
    try {
      await createMaintenance({
        numeroRemota: equipment.numeroRemota,
        equipmentId: equipment.id,
        tecnicoId: user.id,
        tecnicoNome: user.nome,
        operadoraAntes: equipment.operadoraAtual,
        operadoraDepois: equipment.operadoraAtual,
        defeitoRelatado,
        defeitoRelatadoOutro,
        defeitoEncontrado: "",
        servicosRealizados: [],
        checklist: {
          leituraSIMCard: "Não testado",
          firmwareAtualizado: "Não testado",
          sinal: "Não testado",
          apnEnergiza: "Não testado",
          comunicacaoMedidor: "Não testado",
          comunicacaoIRIS: "Não testado",
        },
        observacoes: "",
      }, equipment.situacaoRemota) // Passar situação atual para salvar como anterior

      // Dados e bloqueio chegam pela assinatura após a confirmação da transação.
      toast.success("Manutenção iniciada com sucesso!")
    } catch (error) {
      console.error("Erro ao iniciar manutenção:", error)
      toast.error(error instanceof Error ? error.message : "Erro ao iniciar manutenção")
    } finally {
      setIsCreatingMaintenance(false)
    }
  }

  const handleMaintenanceFinalized = () => { toast.success("Manutenção finalizada com sucesso") }
  const getEquipmentForMaintenance = (maintenance: Maintenance) => equipmentsList.find((item) => item.numeroRemota === maintenance.numeroRemota)
  const handleForceFinalized = () => { /* Dados recebidos pela assinatura. */ }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Manutencao</h1>
        <p className="text-muted-foreground">
          Registre e finalize manutencoes de remotas
        </p>
      </div>

      {/* Manutenções em Andamento */}
      {maintenancesInProgress.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="border-b border-warning/20 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-warning/10 p-2">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Remotas em Manutenção ({maintenancesInProgress.length})
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Continue uma manutenção ou selecione várias sob sua responsabilidade para concluir em massa.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-2 border-b border-warning/20 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="Selecionar minhas manutenções em andamento" disabled={!ownMaintenanceEquipments.length} checked={ownMaintenanceEquipments.length > 0 && ownMaintenanceEquipments.every((item) => selectedMaintenanceIds.includes(item.id))} onChange={(event) => setMaintenanceSelection(event.target.checked ? ownMaintenanceEquipments.map((item) => item.id) : [])} />Selecionar minhas manutenções</label>
                <span role="status" className="text-sm">{selectedMaintenanceIds.length} selecionada(s)</span>
                <Button type="button" variant="outline" disabled={!selectedMaintenanceIds.length} onClick={() => setBulkMode("conclude")}>Concluir selecionadas</Button>
                <Button type="button" disabled={!selectedMaintenanceIds.length || !separationSituation} onClick={() => setBulkMode("separate")}>Separar selecionadas para garantia</Button>
                {!!selectedMaintenanceIds.length && <Button type="button" variant="ghost" onClick={() => setMaintenanceSelection([])}>Limpar seleção</Button>}
              </div>
              <p className="text-xs text-muted-foreground">Informe os mesmos resultados para o lote ou dados diferentes por planilha. A separação exige diagnóstico, serviços, checklist e motivo; a saída física é confirmada depois em Equipamentos.</p>
            </div>
            <div className="divide-y divide-border/50">
              {maintenancesInProgress.map((maintenance) => {
                const equipmentData = getEquipmentForMaintenance(maintenance)
                return (
                  <div
                    key={maintenance.id}
                    className="flex items-center justify-between p-4 transition-colors hover:bg-warning/10"
                  >
                    <div className="flex items-center gap-4">
                      <input type="checkbox" aria-label={`Selecionar manutenção da remota ${maintenance.numeroRemota}`} disabled={!equipmentData || !ownMaintenanceEquipments.some((item) => item.id === equipmentData.id)} checked={!!equipmentData && selectedMaintenanceIds.includes(equipmentData.id)} onChange={(event) => { if (equipmentData) setMaintenanceSelection((old) => event.target.checked ? [...new Set([...old, equipmentData.id])] : old.filter((id) => id !== equipmentData.id)) }} />
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                        <Radio className="h-5 w-5 text-warning" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Remota {maintenance.numeroRemota}</p>
                        <p className="text-sm text-muted-foreground">
                          {maintenance.defeitoRelatado === "Outro" 
                            ? maintenance.defeitoRelatadoOutro 
                            : maintenance.defeitoRelatado}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Técnico: {maintenance.tecnicoNome}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Iniciada em {format(maintenance.dataEntrada, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                        {equipmentData && (
                          <p className="text-xs text-muted-foreground">
                            Modelo: {equipmentData.modelo}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewRemotaDetails(maintenance.numeroRemota)}
                          className="gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          Ver
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSelectRemotaFromList(maintenance)}
                          aria-label={`${maintenance.tecnicoId === user?.id ? "Continuar" : isAdmin ? "Ver e transferir" : "Consultar"} manutenção da remota ${maintenance.numeroRemota}`}
                          className="gap-1"
                        >
                          <ArrowRight className="h-4 w-4" />
                          {maintenance.tecnicoId === user?.id ? "Continuar" : isAdmin ? "Ver e transferir" : "Consultar"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {loadingInProgress && (
        <Card className="border-border/50 bg-card">
          <CardContent className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6 text-primary" />
            <span className="ml-2 text-muted-foreground">Carregando manutenções em andamento...</span>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 bg-card">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="text-lg">Buscar Remota</CardTitle>
          <CardDescription>
            Digite o numero da remota para carregar seus dados e historico
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
              aria-label="Número/IMEI da remota"
              placeholder="Número/IMEI atual ou arquivado"
                value={searchNumber}
                onChange={(e) => setSearchNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-11 bg-secondary/50"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || live.loading} className="h-11">
              {isSearching ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {equipment && (
        <>
          {equipment.estadoRegistro === "inativo" && <Card className="border-warning/30 bg-warning/5"><CardContent className="space-y-2 py-4"><p className="font-medium">Remota arquivada · somente consulta</p><p className="text-sm text-muted-foreground">O cadastro e as manutenções anteriores permanecem disponíveis. Uma nova manutenção não pode ser aberta neste registro.</p>{equipment.substituidaPorNumero && <Button variant="outline" onClick={() => selectEquipment(equipment.substituidaPorNumero!, "edit")}>Consultar substituta {equipment.substituidaPorNumero}</Button>}</CardContent></Card>}
          {viewMode === "view" && equipment.estadoRegistro !== "inativo" && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Eye className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Modo visualização - Histórico e cadastro da remota
                  </span>
                </div>
                {(!currentMaintenance || currentMaintenance.tecnicoId === user?.id || isAdmin) && <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewMode("edit")}
                >
                  {currentMaintenance ? currentMaintenance.tecnicoId === user?.id ? "Continuar manutenção" : "Ver opções de transferência" : "Iniciar manutenção"}
                </Button>}
              </CardContent>
            </Card>
          )}

          <EquipmentInfo equipment={equipment} />
          {currentMaintenance && <MaintenanceActions maintenance={currentMaintenance} equipment={equipment} onTransferred={(targetId) => { if (targetId === user?.id) setViewMode("edit") }} />}
          {currentMaintenance && currentMaintenance.tecnicoId !== user?.id && <Card className="border-warning/30 bg-warning/5">
            <CardContent className="space-y-3 py-6">
              <h3 className="font-semibold">Atendimento sob responsabilidade de {currentMaintenance.tecnicoNome}</h3>
              <p className="text-sm text-muted-foreground">{isAdmin ? "Transfira a responsabilidade para continuar este atendimento, mantendo a abertura e o rascunho." : "Para continuar este atendimento, solicite a um administrador a transferência para o seu usuário."}</p>
              {currentMaintenance.draft && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Consultar rascunho salvo · somente leitura</summary><fieldset disabled className="mt-3"><MaintenanceResultFields value={currentMaintenance.draft} onChange={() => {}} resultLocked /></fieldset></details>}
              {isAdmin && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Encerramento excepcional</summary><p className="my-3 text-sm text-muted-foreground">A finalização forçada encerra o atendimento e devolve a remota para Triagem. Para continuar o trabalho com outro responsável, utilize a transferência acima.</p><Button variant="destructive" size="sm" onClick={() => { setMaintenanceToForceFinalize(currentMaintenance); setEquipmentToForceFinalize(equipment); setShowForceFinalize(true) }}>Finalizar Forçadamente (Admin)</Button></details>}
            </CardContent>
          </Card>}

          {viewMode === "edit" && equipment.estadoRegistro !== "inativo" && (
            <>
              {/* Verificar se a remota está bloqueada por outro técnico */}
              {equipment.garantia?.status === "separada" ? <Card className="border-warning/30 bg-warning/5"><CardContent className="py-6"><p className="font-medium">Remota separada para garantia</p><p className="mt-1 text-sm text-muted-foreground">Confirme o envio em Equipamentos na saída física ou cancele a separação com justificativa antes de iniciar outra manutenção.</p></CardContent></Card> : equipment.garantia?.status === "enviada" ? <Card className="border-warning/30 bg-warning/5"><CardContent className="py-6"><p className="font-medium">Remota enviada para garantia</p><p className="mt-1 text-sm text-muted-foreground">Registre o retorno em Equipamentos antes de iniciar uma manutenção.</p></CardContent></Card> : equipment.emManutencaoPor &&
               equipment.emManutencaoPor !== user?.id && 
               !currentMaintenance ? (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="py-6">
                    <div className="flex items-start gap-4">
                      <div className="rounded-full bg-destructive/10 p-3">
                        <Lock className="h-6 w-6 text-destructive" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-destructive">
                          Remota Bloqueada
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Esta remota está em manutenção por <strong>{equipment.emManutencaoNome}</strong>
                          {equipment.emManutencaoDesde && (
                            <> desde {format(equipment.emManutencaoDesde, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</>
                          )}.
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Somente o técnico responsável pode finalizar esta manutenção.
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">O atendimento ainda não foi carregado. Atualize os dados para consultar o responsável e as opções de transferência.</p>
                        <Button variant="outline" className="mt-3" onClick={live.refresh}>Atualizar atendimento</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : currentMaintenance ? (
                /* Técnico responsável ou manutenção atual */
                currentMaintenance.tecnicoId === user?.id ? (
                  <MaintenanceForm
                    key={currentMaintenance.id}
                    maintenance={currentMaintenance}
                    equipment={equipment}
                    defects={defects}
                    operators={operators}
                    onFinalized={handleMaintenanceFinalized}
                  />
                ) : null
              ) : (
                <StartMaintenanceCard
                  defects={defects}
                  onStart={handleStartMaintenance}
                  isLoading={isCreatingMaintenance}
                />
              )}
            </>
          )}

          {history.loading ? <p role="status" className="text-sm">Carregando histórico…</p> : history.error ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar o histórico. <button className="underline" onClick={history.retry}>Tentar novamente</button></p> : <MaintenanceHistory history={maintenanceHistory} equipment={equipment || undefined} />}
        </>
      )}

      <NewEquipmentDialog
        open={showNewEquipmentDialog}
        onOpenChange={setShowNewEquipmentDialog}
        numeroRemota={searchNumber}
        operators={operators}
        onCreated={handleNewEquipmentCreated}
      />

      {bulkMode && <BulkMovementDialog equipments={live.equipments} selectedIds={selectedMaintenanceIds} initialAction="finalizar_manutencao" initialSituation={bulkMode === "separate" ? separationSituation : undefined} onClose={() => setBulkMode(null)} onCompleted={(numbers) => setMaintenanceSelection((old) => old.filter((id) => !live.equipments.some((item) => item.id === id && numbers.includes(item.numeroRemota))))} />}

      {/* Dialog de Finalização Forçada */}
      {maintenanceToForceFinalize && equipmentToForceFinalize && user && (
        <ForceFinishedDialog
          open={showForceFinalize}
          onOpenChange={(open) => {
            setShowForceFinalize(open)
            if (!open) {
              setMaintenanceToForceFinalize(null)
              setEquipmentToForceFinalize(null)
            }
          }}
          maintenance={maintenanceToForceFinalize}
          equipment={equipmentToForceFinalize}
          userId={user.id}
          userName={user.nome}
          onFinalized={handleForceFinalized}
        />
      )}
    </div>
  )
}

function StartMaintenanceCard({
  defects,
  onStart,
  isLoading,
}: {
  defects: Defect[]
  onStart: (defeitoRelatado: string, defeitoRelatadoOutro?: string) => void
  isLoading: boolean
}) {
  const [defeitoRelatado, setDefeitoRelatado] = useState("")
  const [defeitoRelatadoOutro, setDefeitoRelatadoOutro] = useState("")

  const handleStart = () => {
    if (!defeitoRelatado) {
      toast.error("Selecione o defeito relatado")
      return
    }
    if (defeitoRelatado === "Outro" && !defeitoRelatadoOutro.trim()) {
      toast.error("Descreva o defeito relatado")
      return
    }
    onStart(defeitoRelatado, defeitoRelatadoOutro || undefined)
  }

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Iniciar Nova Manutencao</CardTitle>
            <CardDescription>
              Selecione o defeito relatado para iniciar a manutencao
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="defeito-relatado" className="text-sm text-muted-foreground">Defeito relatado *</FieldLabel>
            <select
              id="defeito-relatado"
              className="flex h-11 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={defeitoRelatado}
              onChange={(e) => setDefeitoRelatado(e.target.value)}
            >
              <option value="">Selecione...</option>
              {defects.map((defect) => (
                <option key={defect.id} value={defect.nome}>
                  {defect.nome}
                </option>
              ))}
              <option value="Outro">Outro</option>
            </select>
          </Field>
          {defeitoRelatado === "Outro" && (
            <Field>
              <FieldLabel className="text-sm text-muted-foreground">Descreva o defeito</FieldLabel>
              <Input
                value={defeitoRelatadoOutro}
                onChange={(e) => setDefeitoRelatadoOutro(e.target.value)}
                placeholder="Descricao do defeito..."
                className="h-11 bg-secondary/50"
              />
            </Field>
          )}
        </FieldGroup>
        <Button onClick={handleStart} disabled={isLoading} className="mt-6 h-11">
          {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
          Iniciar Manutencao
        </Button>
      </CardContent>
    </Card>
  )
}
