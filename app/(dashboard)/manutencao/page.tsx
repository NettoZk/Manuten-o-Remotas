"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Search, Plus, Clock, Radio, Eye, ArrowRight, Lock, AlertTriangle } from "lucide-react"
import {
  getEquipmentByNumber,
  getMaintenancesByEquipment,
  createMaintenance,
  getDefects,
  getOperators,
  getMaintenancesInProgress,
  getEquipments,
  forceFinalizeMaintenance,
} from "@/lib/services"
import type { Equipment, Maintenance, Defect, Operator, ChecklistItem } from "@/lib/types"
import { NewEquipmentDialog } from "@/components/new-equipment-dialog"
import { MaintenanceForm } from "@/components/maintenance-form"
import { EquipmentInfo } from "@/components/equipment-info"
import { MaintenanceHistory } from "@/components/maintenance-history"
import { ForceFinishedDialog } from "@/components/force-finalize-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function MaintenancePage() {
  const { user } = useAuth()
  const [searchNumber, setSearchNumber] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [maintenanceHistory, setMaintenanceHistory] = useState<Maintenance[]>([])
  const [showNewEquipmentDialog, setShowNewEquipmentDialog] = useState(false)
  const [defects, setDefects] = useState<Defect[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [isCreatingMaintenance, setIsCreatingMaintenance] = useState(false)
  const [currentMaintenance, setCurrentMaintenance] = useState<Maintenance | null>(null)
  const [maintenancesInProgress, setMaintenancesInProgress] = useState<Maintenance[]>([])
  const [equipmentsList, setEquipmentsList] = useState<Equipment[]>([])
  const [loadingInProgress, setLoadingInProgress] = useState(true)
  const [viewMode, setViewMode] = useState<"edit" | "view">("edit")
  const [showForceFinalize, setShowForceFinalize] = useState(false)
  const [maintenanceToForceFinalize, setMaintenanceToForceFinalize] = useState<Maintenance | null>(null)
  const [equipmentToForceFinalize, setEquipmentToForceFinalize] = useState<Equipment | null>(null)

  // Verificar se o usuário é admin
  const isAdmin = user?.tipo === "admin"

  useEffect(() => {
    async function loadData() {
      try {
        // Carregar dados em paralelo com tratamento individual de erros
        const [defectsResult, operatorsResult, inProgressResult, equipmentsResult] = await Promise.allSettled([
          getDefects(),
          getOperators(),
          getMaintenancesInProgress(),
          getEquipments(),
        ])

        if (defectsResult.status === "fulfilled") {
          setDefects(defectsResult.value.filter((d) => d.ativo))
        } else {
          console.error("Erro ao carregar defeitos:", defectsResult.reason)
        }

        if (operatorsResult.status === "fulfilled") {
          setOperators(operatorsResult.value.filter((o) => o.ativo))
        } else {
          console.error("Erro ao carregar operadoras:", operatorsResult.reason)
        }

        if (inProgressResult.status === "fulfilled") {
          setMaintenancesInProgress(inProgressResult.value)
        } else {
          console.error("Erro ao carregar manutenções em andamento:", inProgressResult.reason)
        }

        if (equipmentsResult.status === "fulfilled") {
          setEquipmentsList(equipmentsResult.value)
        } else {
          console.error("Erro ao carregar equipamentos:", equipmentsResult.reason)
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error)
      } finally {
        setLoadingInProgress(false)
      }
    }
    loadData()
  }, [])

  const refreshMaintenancesInProgress = async () => {
    try {
      const inProgressData = await getMaintenancesInProgress()
      setMaintenancesInProgress(inProgressData)
    } catch (error) {
      console.error("Erro ao atualizar manutenções em andamento:", error)
    }
  }

  const handleSearch = async () => {
    if (!searchNumber.trim()) {
      toast.error("Digite o número da remota")
      return
    }

    setIsSearching(true)
    setEquipment(null)
    setMaintenanceHistory([])
    setCurrentMaintenance(null)
    setViewMode("edit")

    try {
      const foundEquipment = await getEquipmentByNumber(searchNumber.trim())

      if (foundEquipment) {
        setEquipment(foundEquipment)
        
        try {
          const history = await getMaintenancesByEquipment(searchNumber.trim())
          setMaintenanceHistory(history)

          // Check if there's an ongoing maintenance
          const ongoing = history.find((m) => m.status === "em_andamento")
          if (ongoing) {
            setCurrentMaintenance(ongoing)
          }
        } catch (historyError) {
          console.error("Erro ao carregar histórico:", historyError)
          // Continua sem o histórico, pelo menos mostra o equipamento
        }
      } else {
        setShowNewEquipmentDialog(true)
      }
    } catch (error) {
      console.error("Erro ao buscar remota:", error)
      toast.error("Erro ao buscar remota. Verifique a conexão e tente novamente.")
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectRemotaFromList = async (maintenance: Maintenance) => {
    setSearchNumber(maintenance.numeroRemota)
    setIsSearching(true)
    setEquipment(null)
    setMaintenanceHistory([])
    setCurrentMaintenance(null)
    setViewMode("edit")

    try {
      const foundEquipment = await getEquipmentByNumber(maintenance.numeroRemota)

      if (foundEquipment) {
        setEquipment(foundEquipment)
        const history = await getMaintenancesByEquipment(maintenance.numeroRemota)
        setMaintenanceHistory(history)
        setCurrentMaintenance(maintenance)
      }
    } catch (error) {
      console.error("Erro ao carregar remota:", error)
      toast.error("Erro ao carregar dados da remota")
    } finally {
      setIsSearching(false)
    }
  }

  const handleViewRemotaDetails = async (numeroRemota: string) => {
    setSearchNumber(numeroRemota)
    setIsSearching(true)
    setEquipment(null)
    setMaintenanceHistory([])
    setCurrentMaintenance(null)
    setViewMode("view")

    try {
      const foundEquipment = await getEquipmentByNumber(numeroRemota)

      if (foundEquipment) {
        setEquipment(foundEquipment)
        const history = await getMaintenancesByEquipment(numeroRemota)
        setMaintenanceHistory(history)

        const ongoing = history.find((m) => m.status === "em_andamento")
        if (ongoing) {
          setCurrentMaintenance(ongoing)
        }
      }
    } catch (error) {
      console.error("Erro ao carregar remota:", error)
      toast.error("Erro ao carregar dados da remota")
    } finally {
      setIsSearching(false)
    }
  }

  const handleNewEquipmentCreated = (newEquipment: Equipment) => {
    setEquipment(newEquipment)
    setShowNewEquipmentDialog(false)
    setEquipmentsList((prev) => [newEquipment, ...prev])
    toast.success("Remota cadastrada com sucesso")
  }

  const handleStartMaintenance = async (defeitoRelatado: string, defeitoRelatadoOutro?: string) => {
    if (!equipment || !user) {
      toast.error("Dados incompletos. Por favor, busque a remota novamente.")
      return
    }

    setIsCreatingMaintenance(true)
    try {
      const maintenanceId = await createMaintenance({
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
      })

      // Criar objeto de manutenção localmente para evitar nova busca
      const newMaintenance: Maintenance = {
        id: maintenanceId,
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
        dataEntrada: new Date(),
        dataFinalizacao: null,
        status: "em_andamento",
      }

      setCurrentMaintenance(newMaintenance)
      setMaintenanceHistory((prev) => [newMaintenance, ...prev])
      setMaintenancesInProgress((prev) => [newMaintenance, ...prev])
      
      toast.success("Manutenção iniciada com sucesso!")
    } catch (error) {
      console.error("Erro ao iniciar manutenção:", error)
      toast.error("Erro ao iniciar manutenção. Verifique os dados e tente novamente.")
    } finally {
      setIsCreatingMaintenance(false)
    }
  }

  const handleMaintenanceFinalized = async () => {
    if (!equipment) return

    const history = await getMaintenancesByEquipment(equipment.numeroRemota)
    setMaintenanceHistory(history)
    setCurrentMaintenance(null)
    await refreshMaintenancesInProgress()
    toast.success("Manutenção finalizada com sucesso")
  }

  const getEquipmentForMaintenance = (maintenance: Maintenance) => {
    return equipmentsList.find((e) => e.numeroRemota === maintenance.numeroRemota)
  }

  const handleForceFinalized = async () => {
    if (!equipment) return

    // Recarregar dados
    const updatedEquipment = await getEquipmentByNumber(equipment.numeroRemota)
    if (updatedEquipment) {
      setEquipment(updatedEquipment)
    }
    
    const history = await getMaintenancesByEquipment(equipment.numeroRemota)
    setMaintenanceHistory(history)
    setCurrentMaintenance(null)
    await refreshMaintenancesInProgress()
    
    // Atualizar lista de equipamentos
    const equipmentsData = await getEquipments()
    setEquipmentsList(equipmentsData)
  }

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
                  Clique em uma remota para continuar a manutenção
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {maintenancesInProgress.map((maintenance) => {
                const equipmentData = getEquipmentForMaintenance(maintenance)
                return (
                  <div
                    key={maintenance.id}
                    className="flex items-center justify-between p-4 transition-colors hover:bg-warning/10"
                  >
                    <div className="flex items-center gap-4">
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
                          className="gap-1"
                        >
                          <ArrowRight className="h-4 w-4" />
                          Continuar
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
                placeholder="Numero da remota"
                value={searchNumber}
                onChange={(e) => setSearchNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-11 bg-secondary/50"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching} className="h-11">
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
          {viewMode === "view" && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Eye className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Modo visualização - Histórico e cadastro da remota
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setViewMode("edit")}
                >
                  Iniciar/Continuar Manutenção
                </Button>
              </CardContent>
            </Card>
          )}

          <EquipmentInfo equipment={equipment} />

          {viewMode === "edit" && (
            <>
              {/* Verificar se a remota está bloqueada por outro técnico */}
              {equipment.emManutencaoPor && 
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
                        {isAdmin && equipment.manutencaoId && (
                          <div className="mt-4">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                const ongoingMaintenance = maintenanceHistory.find(
                                  (m) => m.id === equipment.manutencaoId
                                )
                                if (ongoingMaintenance) {
                                  setMaintenanceToForceFinalize(ongoingMaintenance)
                                  setEquipmentToForceFinalize(equipment)
                                  setShowForceFinalize(true)
                                }
                              }}
                              className="gap-2"
                            >
                              <AlertTriangle className="h-4 w-4" />
                              Finalizar Forçadamente (Admin)
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : currentMaintenance ? (
                /* Técnico responsável ou manutenção atual */
                currentMaintenance.tecnicoId === user?.id ? (
                  <MaintenanceForm
                    maintenance={currentMaintenance}
                    equipment={equipment}
                    defects={defects}
                    operators={operators}
                    onFinalized={handleMaintenanceFinalized}
                  />
                ) : (
                  /* Manutenção de outro técnico - mostrar aviso */
                  <Card className="border-warning/30 bg-warning/5">
                    <CardContent className="py-6">
                      <div className="flex items-start gap-4">
                        <div className="rounded-full bg-warning/10 p-3">
                          <AlertTriangle className="h-6 w-6 text-warning" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-warning">
                            Manutenção de Outro Técnico
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Esta manutenção foi iniciada por <strong>{currentMaintenance.tecnicoNome}</strong>.
                            Você não pode editar esta manutenção.
                          </p>
                          {isAdmin && (
                            <div className="mt-4">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setMaintenanceToForceFinalize(currentMaintenance)
                                  setEquipmentToForceFinalize(equipment)
                                  setShowForceFinalize(true)
                                }}
                                className="gap-2"
                              >
                                <AlertTriangle className="h-4 w-4" />
                                Finalizar Forçadamente (Admin)
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              ) : (
                <StartMaintenanceCard
                  defects={defects}
                  onStart={handleStartMaintenance}
                  isLoading={isCreatingMaintenance}
                />
              )}
            </>
          )}

          <MaintenanceHistory history={maintenanceHistory} />
        </>
      )}

      <NewEquipmentDialog
        open={showNewEquipmentDialog}
        onOpenChange={setShowNewEquipmentDialog}
        numeroRemota={searchNumber}
        operators={operators}
        onCreated={handleNewEquipmentCreated}
      />

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
            <FieldLabel className="text-sm text-muted-foreground">Defeito Relatado</FieldLabel>
            <select
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
