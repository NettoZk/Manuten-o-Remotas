"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { Wrench, CheckSquare } from "lucide-react"
import { finalizeMaintenance, updateEquipment, getServices } from "@/lib/services"
import type { Maintenance, Equipment, Defect, Operator, Service, ChecklistItem, ChecklistStatus } from "@/lib/types"

interface MaintenanceFormProps {
  maintenance: Maintenance
  equipment: Equipment
  defects: Defect[]
  operators: Operator[]
  onFinalized: () => void
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
  const [services, setServices] = useState<Service[]>([])
  
  const [defeitoEncontrado, setDefeitoEncontrado] = useState(maintenance.defeitoEncontrado || "")
  const [defeitoEncontradoOutro, setDefeitoEncontradoOutro] = useState(maintenance.defeitoEncontradoOutro || "")
  const [servicosRealizados, setServicosRealizados] = useState<string[]>(maintenance.servicosRealizados || [])
  const [servicosRealizadosOutro, setServicosRealizadosOutro] = useState(maintenance.servicosRealizadosOutro || "")
  const [operadoraDepois, setOperadoraDepois] = useState(maintenance.operadoraDepois || equipment.operadoraAtual)
  const [checklist, setChecklist] = useState<ChecklistItem>(maintenance.checklist)
  const [observacoes, setObservacoes] = useState(maintenance.observacoes || "")

  useEffect(() => {
    async function loadServices() {
      try {
        const data = await getServices()
        setServices(data.filter((s) => s.ativo))
      } catch (error) {
        console.error("Erro ao carregar serviços:", error)
      }
    }
    loadServices()
  }, [])

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
    if (!defeitoEncontrado) {
      toast.error("Selecione o defeito encontrado")
      return
    }
    if (defeitoEncontrado === "Outro" && !defeitoEncontradoOutro.trim()) {
      toast.error("Descreva o defeito encontrado")
      return
    }
    if (servicosRealizados.length === 0 && !servicosRealizadosOutro.trim()) {
      toast.error("Selecione pelo menos um serviço realizado")
      return
    }

    setIsLoading(true)
    try {
      await finalizeMaintenance(maintenance.id, {
        defeitoEncontrado,
        defeitoEncontradoOutro: defeitoEncontradoOutro || undefined,
        servicosRealizados,
        servicosRealizadosOutro: servicosRealizadosOutro || undefined,
        operadoraDepois,
        checklist,
        observacoes,
      })

      // Update equipment status to "Usada" if it was "Nova"
      if (equipment.status === "Nova") {
        await updateEquipment(equipment.id, { status: "Usada" })
      }

      // Update operator if changed
      if (operadoraDepois !== equipment.operadoraAtual) {
        await updateEquipment(equipment.id, { operadoraAtual: operadoraDepois })
      }

      onFinalized()
    } catch (error) {
      console.error("Erro ao finalizar manutenção:", error)
      toast.error("Erro ao finalizar manutenção")
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
              <FieldLabel>Defeito Encontrado</FieldLabel>
              <select
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
            <FieldLabel>Operadora Após Manutenção</FieldLabel>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={operadoraDepois}
              onChange={(e) => setOperadoraDepois(e.target.value)}
            >
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
        <Button onClick={handleFinalize} disabled={isLoading} size="lg">
          {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
          Finalizar Manutenção
        </Button>
      </div>
    </div>
  )
}
