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
import { finalizationSchema, isWarrantySentSituation, isWarrantySeparatedSituation, isNewSituation } from "@/lib/validation"
import { useLiveData } from "@/contexts/live-data-context"
import { useAuth } from "@/contexts/auth-context"
import { useMaintenanceDraft } from "@/hooks/use-maintenance-draft"
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
  const { user } = useAuth()
  const draft = useMaintenanceDraft(maintenance, equipment, user?.id || "")
  const services = live.services.filter((item) => item.ativo)
  const equipmentSituations = live.situations.filter((item) => item.ativo && !isNewSituation(item.nome) && !isWarrantySentSituation(item.nome) && !["manutenção", "manutencao"].includes(item.nome.toLocaleLowerCase("pt-BR")))
  
  const { defeitoEncontrado, defeitoEncontradoOutro, servicosRealizados, servicosRealizadosOutro, operadoraDepois, checklist, observacoes, situacaoRemota, motivoGarantia } = draft.fields
  const setDefeitoEncontrado = (value: string) => draft.update("defeitoEncontrado", value)
  const setDefeitoEncontradoOutro = (value: string) => draft.update("defeitoEncontradoOutro", value)
  const setServicosRealizadosOutro = (value: string) => draft.update("servicosRealizadosOutro", value)
  const setOperadoraDepois = (value: string) => draft.update("operadoraDepois", value)
  const setObservacoes = (value: string) => draft.update("observacoes", value)
  const setSituacaoRemota = (value: string) => draft.update("situacaoRemota", value)
  const setMotivoGarantia = (value: string) => draft.update("motivoGarantia", value)
  const sendingToWarranty = isWarrantySeparatedSituation(situacaoRemota)

  const handleChecklistChange = (key: keyof ChecklistItem, value: ChecklistStatus) => {
    draft.update("checklist", { ...checklist, [key]: value })
  }

  const handleServiceToggle = (serviceName: string) => {
    draft.update("servicosRealizados", servicosRealizados.includes(serviceName) ? servicosRealizados.filter((s) => s !== serviceName) : [...servicosRealizados, serviceName])
  }

  const handleFinalize = async () => {
    const result = finalizationSchema.safeParse({ defeitoEncontrado, defeitoEncontradoOutro, servicosRealizados, servicosRealizadosOutro, operadoraDepois, checklist, observacoes, situacaoRemota, ...(sendingToWarranty ? { motivoGarantia } : {}) })
    if (!result.success) { toast.error(result.error.issues[0].message); return }
    if (!operators.some((item) => item.ativo && item.nome === operadoraDepois)) { toast.error("Selecione uma operadora ativa"); return }
    if (!equipmentSituations.some((item) => item.nome === situacaoRemota)) { toast.error("Selecione uma situação final válida"); return }
    setIsLoading(true)
    try {
      await draft.save()
      await finalizeMaintenance(maintenance.id, equipment.id, result.data)
      draft.clear()
      await onFinalized()
    } catch (error) {
      console.error("Erro ao finalizar manutenção:", error)
      toast.error(error instanceof Error ? error.message : "Erro ao finalizar manutenção")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <fieldset disabled={isLoading} className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <p role="status" aria-live="polite" className="flex-1 text-sm text-muted-foreground">{draft.saving ? "Salvando rascunho…" : draft.message}</p>
        <Button type="button" variant="outline" disabled={draft.saving || draft.conflict} onClick={() => { void draft.save().catch(() => {}) }}>Salvar rascunho</Button>
        {draft.conflict && <><Button type="button" variant="outline" onClick={draft.download}>Baixar meu texto</Button><Button type="button" variant="outline" onClick={draft.reload}>Carregar versão salva</Button></>}
      </div>
      {draft.localCopies.length > 1 && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">Outros rascunhos deste navegador</summary><p className="my-2 text-muted-foreground">Cópias independentes por aba, disponíveis por até 7 dias. Baixe seu texto atual antes de recuperar outra cópia.</p>{draft.localCopies.map((copy) => <div className="my-2 flex flex-wrap items-center gap-2" key={copy.key}><span className="flex-1">{new Date(copy.at).toLocaleString("pt-BR")} · {copy.data.observacoes.slice(0, 50) || "Preenchimento parcial"}</span><Button type="button" size="sm" variant="outline" onClick={() => draft.recoverCopy(copy.key)}>Recuperar cópia</Button></div>)}</details>}
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
            <FieldLabel htmlFor="motivo-garantia">Motivo da separação para garantia *</FieldLabel>
            <Textarea id="motivo-garantia" required minLength={10} maxLength={2000} value={motivoGarantia} onChange={(event) => setMotivoGarantia(event.target.value)} placeholder="Descreva os testes realizados e por que a remota precisa seguir para garantia" />
            <p className="text-xs text-muted-foreground">Ao concluir, a remota ficará separada e vinculada a esta avaliação. Confirme o envio em Equipamentos somente quando ocorrer a saída física.</p>
          </Field>}

          <Field>
            <FieldLabel htmlFor="observacoes-atendimento">Observações do atendimento</FieldLabel>
            <Textarea
              id="observacoes-atendimento"
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
        {Object.values(checklist).includes("Falha") && <p className="mr-auto max-w-md text-sm text-warning">O checklist contém falha. Confira se os testes e a situação final descrevem corretamente o resultado da avaliação.</p>}
        <Button onClick={handleFinalize} disabled={isLoading || draft.conflict || live.loading || Boolean(live.error)} size="lg">
          {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
        {sendingToWarranty ? "Finalizar manutenção e separar para garantia" : "Finalizar Manutenção"}
        </Button>
      </div>
    </fieldset>
  )
}
