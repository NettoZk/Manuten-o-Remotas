"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { Wrench, CheckSquare } from "lucide-react"
import { finalizeMaintenance } from "@/lib/services"
import { finalizationSchema, isWarrantySentSituation } from "@/lib/validation"
import { useLiveData } from "@/contexts/live-data-context"
import type { Maintenance, Equipment, Defect, Operator, ChecklistItem, ChecklistStatus } from "@/lib/types"

interface MaintenanceFormProps {
  maintenance: Maintenance
  equipment: Equipment
  defects: Defect[]
  operators: Operator[]
  onFinalized: () => void | Promise<void>
}

const checklistItems: { key: keyof ChecklistItem; label: string }[] = [
  { key: "leituraSIMCard", label: "Leitura do SIM Card" },
  { key: "firmwareAtualizado", label: "Firmware Atualizado" },
  { key: "sinal", label: "Sinal" },
  { key: "apnEnergiza", label: "APN Energiza" },
  { key: "comunicacaoMedidor", label: "Comunicação com Medidor" },
  { key: "comunicacaoIRIS", label: "Comunicação com IRIS" },
]

const statusOptions: ChecklistStatus[] = ["OK", "Falha", "Não testado"]

export function MaintenanceForm({
  maintenance,
  equipment,
  defects,
  operators,
  onFinalized,
}: MaintenanceFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const live = useLiveData()
  const services = live.services.filter((item) => item.ativo)
  const equipmentSituations = live.situations.filter((item) => item.ativo && !["manutenção", "manutencao"].includes(item.nome.toLocaleLowerCase("pt-BR")))
  
  const [defeitoEncontrado, setDefeitoEncontrado] = useState(maintenance.defeitoEncontrado || "")
  const [defeitoEncontradoOutro, setDefeitoEncontradoOutro] = useState(maintenance.defeitoEncontradoOutro || "")
  const [servicosRealizados, setServicosRealizados] = useState<string[]>(maintenance.servicosRealizados || [])
  const [servicosRealizadosOutro, setServicosRealizadosOutro] = useState(maintenance.servicosRealizadosOutro || "")
  const [operadoraDepois, setOperadoraDepois] = useState(maintenance.operadoraDepois || equipment.operadoraAtual)
  const [checklist, setChecklist] = useState<ChecklistItem>(maintenance.checklist)
  const [observacoes, setObservacoes] = useState(maintenance.observacoes || "")
  const [situacaoRemota, setSituacaoRemota] = useState("")
  const [motivoGarantia, setMotivoGarantia] = useState(maintenance.motivoGarantia || "")
  const sendingToWarranty = isWarrantySentSituation(situacaoRemota)

  const handleChecklistChange = (key: keyof ChecklistItem, value: ChecklistStatus) => {
    setChecklist((prev) => ({ ...prev, [key]: value }))
  }

  const handleServiceToggle = (serviceName: string) => {
    setServicosRealizados((prev) =>
      prev.includes(serviceName)
        ? prev.filter((s) => s !== serviceName)
        : [...prev, serviceName]
    )
  }

  const handleFinalize = async () => {
    const result = finalizationSchema.safeParse({ defeitoEncontrado, defeitoEncontradoOutro, servicosRealizados, servicosRealizadosOutro, operadoraDepois, checklist, observacoes, situacaoRemota, ...(sendingToWarranty ? { motivoGarantia } : {}) })
    if (!result.success) { toast.error(result.error.issues[0].message); return }
    if (!operators.some((item) => item.ativo && item.nome === operadoraDepois)) { toast.error("Selecione uma operadora ativa"); return }
    if (!equipmentSituations.some((item) => item.nome === situacaoRemota)) { toast.error("Selecione uma situação final válida"); return }
    setIsLoading(true)
    try {
      await finalizeMaintenance(maintenance.id, equipment.id, result.data)

      await onFinalized()
    } catch (error) {
      console.error("Erro ao finalizar manutenção:", error)
      toast.error(error instanceof Error ? error.message : "Erro ao finalizar manutenção")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Manutenção em Andamento
          </CardTitle>
          <CardDescription>
            Defeito relatado: {maintenance.defeitoRelatado === "Outro" ? maintenance.defeitoRelatadoOutro : maintenance.defeitoRelatado}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="defeito-encontrado">Defeito encontrado *</FieldLabel>
              <select
                id="defeito-encontrado"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={defeitoEncontrado}
                onChange={(e) => setDefeitoEncontrado(e.target.value)}
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
            {defeitoEncontrado === "Outro" && (
              <Field>
                <FieldLabel>Descreva o defeito encontrado</FieldLabel>
                <Input
                  value={defeitoEncontradoOutro}
                  onChange={(e) => setDefeitoEncontradoOutro(e.target.value)}
                  placeholder="Descrição do defeito..."
                />
              </Field>
            )}
          </FieldGroup>

          <div>
            <FieldLabel className="mb-3 block">Serviços Realizados</FieldLabel>
            <div className="grid gap-3 md:grid-cols-2">
              {services.map((service) => (
                <label
                  key={service.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={servicosRealizados.includes(service.nome)}
                    onCheckedChange={() => handleServiceToggle(service.nome)}
                  />
                  <span className="text-sm">{service.nome}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={servicosRealizados.includes("Outro")}
                  onCheckedChange={() => handleServiceToggle("Outro")}
                />
                <span className="text-sm">Outro</span>
              </label>
            </div>
            {servicosRealizados.includes("Outro") && (
              <Field className="mt-3">
                <Input
                  value={servicosRealizadosOutro}
                  onChange={(e) => setServicosRealizadosOutro(e.target.value)}
                  placeholder="Descreva o serviço..."
                />
              </Field>
            )}
          </div>

          <Field>
            <FieldLabel htmlFor="operadora-depois">Operadora após manutenção *</FieldLabel>
            <select
              id="operadora-depois"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={operadoraDepois}
              onChange={(e) => setOperadoraDepois(e.target.value)}
            >
              <option value="">Selecione a operadora...</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.nome}>
                  {operator.nome}
                </option>
              ))}
            </select>
            {operadoraDepois !== equipment.operadoraAtual && (
              <p className="mt-1 text-sm text-muted-foreground">
                Operadora será alterada de {equipment.operadoraAtual} para {operadoraDepois}
              </p>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="situacao-final">Situação após a manutenção *</FieldLabel>
            <select
              id="situacao-final"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={situacaoRemota}
              onChange={(e) => setSituacaoRemota(e.target.value)}
            >
              <option value="">Selecione a situação...</option>
              {equipmentSituations.map((situation) => (
                <option key={situation.id} value={situation.nome}>
                  {situation.nome}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Escolha a situação de saída. A remota não pode continuar em Manutenção.
            </p>
          </Field>

          {sendingToWarranty && <Field>
            <FieldLabel htmlFor="motivo-garantia">Motivo do envio para garantia *</FieldLabel>
            <Textarea id="motivo-garantia" required minLength={10} maxLength={2000} value={motivoGarantia} onChange={(event) => setMotivoGarantia(event.target.value)} placeholder="Descreva os testes realizados e por que a remota precisa seguir para garantia" />
            <p className="text-xs text-muted-foreground">Ao concluir, esta manutenção ficará vinculada ao envio para garantia, com o técnico, defeitos, serviços e checklist registrados.</p>
          </Field>}

          <Field>
            <FieldLabel>Observações</FieldLabel>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Observações adicionais..."
              rows={3}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Checklist de Manutenção
          </CardTitle>
          <CardDescription>
            Preencha o status de cada item verificado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {checklistItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
              >
                <span className="font-medium">{item.label}</span>
                <div className="flex gap-2">
                  {statusOptions.map((status) => (
                    <Button
                      key={status}
                      type="button"
                      size="sm"
                      variant={checklist[item.key] === status ? "default" : "outline"}
                      onClick={() => handleChecklistChange(item.key, status)}
                      className={
                        checklist[item.key] === status
                          ? status === "OK"
                            ? "bg-green-600 hover:bg-green-700"
                            : status === "Falha"
                            ? "bg-red-600 hover:bg-red-700"
                            : ""
                          : ""
                      }
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleFinalize} disabled={isLoading || live.loading || Boolean(live.error)} size="lg">
          {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
        {sendingToWarranty ? "Finalizar manutenção e enviar para garantia" : "Finalizar Manutenção"}
        </Button>
      </div>
    </div>
  )
}
