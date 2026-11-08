"use client"
import { useLiveData } from "@/contexts/live-data-context"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { checklistKeys, checklistLabels } from "@/lib/bulk-movements"
import { isMaintenanceSituation, isNewSituation, isWarrantySentSituation, isWarrantySeparatedSituation, type MaintenanceDraft } from "@/lib/validation"
import type { Maintenance } from "@/lib/types"

export function maintenanceResult(maintenance: Maintenance): MaintenanceDraft {
  return { defeitoEncontrado: maintenance.defeitoEncontrado || "", defeitoEncontradoOutro: maintenance.defeitoEncontradoOutro || "", servicosRealizados: maintenance.servicosRealizados || [], servicosRealizadosOutro: maintenance.servicosRealizadosOutro || "", operadoraDepois: maintenance.operadoraDepois || maintenance.operadoraAntes || "", checklist: maintenance.checklist, observacoes: maintenance.observacoes || "", situacaoRemota: maintenance.situacaoRemota || "", motivoGarantia: maintenance.motivoGarantia || "" }
}
export function MaintenanceResultFields({ value, onChange, resultLocked = false }: { value: MaintenanceDraft; onChange: (value: MaintenanceDraft) => void; resultLocked?: boolean }) {
  const live = useLiveData()
  const update = <K extends keyof MaintenanceDraft>(key: K, next: MaintenanceDraft[K]) => onChange({ ...value, [key]: next })
  const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
  const defects = [...new Set([value.defeitoEncontrado, ...live.defects.filter((v) => v.ativo).map((v) => v.nome), "Outro"].filter(Boolean))]
  const services = [...new Set([...value.servicosRealizados, ...live.services.filter((v) => v.ativo).map((v) => v.nome), "Outro"])]
  const situations = [...new Set([value.situacaoRemota, ...live.situations.filter((v) => v.ativo && !isMaintenanceSituation(v.nome) && !isNewSituation(v.nome) && !isWarrantySentSituation(v.nome)).map((v) => v.nome)].filter(Boolean))]
  return <div className="space-y-4">
    <label className="block space-y-1 text-sm">Defeito encontrado<select className={selectClass} aria-label="Defeito encontrado na retificação" value={value.defeitoEncontrado} onChange={(e) => update("defeitoEncontrado", e.target.value)}><option value="">Selecione...</option>{defects.map((name) => <option key={name}>{name}</option>)}</select></label>
    {value.defeitoEncontrado === "Outro" && <label className="block text-sm">Descrição do defeito<Input aria-label="Descrição do defeito" value={value.defeitoEncontradoOutro} maxLength={2000} onChange={(e) => update("defeitoEncontradoOutro", e.target.value)} /></label>}
    <fieldset className="rounded-lg border p-3"><legend className="text-sm">Serviços realizados</legend><div className="grid gap-2 sm:grid-cols-2">{services.map((name) => <label key={name} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.servicosRealizados.includes(name)} onChange={(e) => update("servicosRealizados", e.target.checked ? [...value.servicosRealizados, name] : value.servicosRealizados.filter((v) => v !== name))} />{name}</label>)}</div></fieldset>
    {value.servicosRealizados.includes("Outro") && <label className="block text-sm">Descrição do serviço<Input aria-label="Descrição do serviço" value={value.servicosRealizadosOutro} maxLength={2000} onChange={(e) => update("servicosRealizadosOutro", e.target.value)} /></label>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Operadora após manutenção<select className={selectClass} aria-label="Operadora após manutenção na retificação" disabled={resultLocked} value={value.operadoraDepois} onChange={(e) => update("operadoraDepois", e.target.value)}>{[...new Set([value.operadoraDepois, ...live.operators.filter((v) => v.ativo).map((v) => v.nome)])].map((name) => <option key={name}>{name}</option>)}</select></label>
      <label className="space-y-1 text-sm">Situação final<select className={selectClass} aria-label="Situação final na retificação" disabled={resultLocked} value={value.situacaoRemota} onChange={(e) => update("situacaoRemota", e.target.value)}><option value="">Selecione...</option>{situations.map((name) => <option key={name}>{name}</option>)}</select></label>
    </div>
    {isWarrantySeparatedSituation(value.situacaoRemota) && <label className="block text-sm">Motivo da separação para garantia<Textarea aria-label="Motivo da separação na retificação" value={value.motivoGarantia} maxLength={2000} onChange={(e) => update("motivoGarantia", e.target.value)} /></label>}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Checklist do atendimento</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{checklistKeys.map((key, index) => <label className="space-y-1 text-sm" key={key}>{checklistLabels[index]}<select className={selectClass} aria-label={checklistLabels[index]} value={value.checklist[key]} onChange={(e) => update("checklist", { ...value.checklist, [key]: e.target.value as MaintenanceDraft["checklist"][typeof key] })}>{["Não testado", "OK", "Falha"].map((status) => <option key={status}>{status}</option>)}</select></label>)}</div></details>
    <label className="block space-y-1 text-sm">Observações da manutenção<Textarea aria-label="Observações da manutenção" value={value.observacoes} maxLength={5000} onChange={(e) => update("observacoes", e.target.value)} /></label>
  </div>
}
