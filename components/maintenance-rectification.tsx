"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MaintenanceResultFields, maintenanceResult } from "@/components/maintenance-result-fields"
import { getMaintenanceRevisions, rectifyMaintenance, type MaintenanceRevision } from "@/lib/services"
import { finalizationSchema } from "@/lib/validation"
import type { Equipment, Maintenance } from "@/lib/types"
import { toast } from "sonner"

export function MaintenanceRectification({ maintenance, equipment }: { maintenance: Maintenance; equipment: Equipment }) {
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [reason, setReason] = useState("")
  const [value, setValue] = useState(() => maintenanceResult(maintenance))
  const [version, setVersion] = useState(equipment.operationVersion || 0)
  const locked = maintenance.completionRevision === undefined || maintenance.completionRevision !== (equipment.operationVersion || 0) || Boolean(equipment.manutencaoId) || equipment.estadoRegistro === "inativo" || ["separada", "enviada"].includes(equipment.garantia?.status || "") || equipment.placement?.status === "em_transito"
  async function save() {
    const parsed = finalizationSchema.safeParse(value)
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return }
    if (reason.trim().length < 10 || saving) return
    setSaving(true)
    try { await rectifyMaintenance(maintenance.id, equipment.id, parsed.data, reason, version); setOpen(false); toast.success("Conclusão retificada; original preservado") }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível retificar") }
    finally { setSaving(false) }
  }
  return <><Button type="button" size="sm" variant="outline" onClick={() => { setVersion(equipment.operationVersion || 0); setValue(maintenanceResult(maintenance)); setReason(""); setOpen(true) }}>Retificar conclusão</Button><Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next) }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Retificar conclusão</DialogTitle><DialogDescription>Remota {maintenance.numeroRemota}. A conclusão original e sua data serão preservadas. Esta ação corrige o registro; uma nova falha exige outro atendimento.</DialogDescription></DialogHeader>
    <fieldset disabled={saving} className="space-y-4">
      {locked && <p className="rounded-lg border p-3 text-sm">Os dados técnicos podem ser corrigidos. Operadora e situação final estão bloqueadas por movimentação posterior, etapa vinculada ou ausência de referência histórica segura.</p>}
      <MaintenanceResultFields value={value} onChange={setValue} resultLocked={locked} />
      <label className="block space-y-1 text-sm">Motivo da retificação<Textarea aria-label="Motivo da retificação" minLength={10} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </fieldset>
    <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Voltar</Button><Button disabled={saving || reason.trim().length < 10} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar retificação"}</Button></DialogFooter>
  </DialogContent></Dialog></>
}
export function MaintenanceRevisionHistory({ maintenance }: { maintenance: Maintenance }) {
  const [records, setRecords] = useState<MaintenanceRevision[] | null>(null), [error, setError] = useState(false), [loading, setLoading] = useState(false)
  async function load() {
    if (loading) return
    setLoading(true); setError(false)
    try { setRecords(await getMaintenanceRevisions(maintenance.id)) } catch { setError(true) } finally { setLoading(false) }
  }
  if (!maintenance.revisionCount) return null
  const labels = { defeitoEncontrado: "Defeito encontrado", defeitoEncontradoOutro: "Descrição do defeito Outro", servicosRealizados: "Serviços", servicosRealizadosOutro: "Descrição do serviço Outro", operadoraDepois: "Operadora", situacaoRemota: "Situação", observacoes: "Observações", checklist: "Checklist", motivoGarantia: "Motivo da garantia" } as const
  const display = (value: unknown) => Array.isArray(value) ? value.join(", ") : value && typeof value === "object" ? Object.entries(value).map(([key, status]) => `${key}: ${status}`).join("; ") : String(value || "—")
  return <details className="mt-3 rounded-lg border p-3" onToggle={(e) => { if (e.currentTarget.open && records === null) void load() }}><summary className="cursor-pointer text-sm">Correções deste atendimento ({maintenance.revisionCount})</summary>
    {loading && <p role="status" className="mt-2 text-sm">Carregando correções…</p>}{error && <p role="alert" className="mt-2 text-sm">Falha ao consultar. <button className="underline" onClick={() => void load()}>Tentar novamente</button></p>}
    {records?.map((item) => <div key={item.id} className="mt-3 border-t pt-3 text-sm"><p>{new Date(item.at).toLocaleString("pt-BR")} · {item.userName}</p><p>{item.reason}</p><dl className="mt-2 space-y-2">{Object.entries(labels).filter(([key]) => JSON.stringify(item.before[key as keyof Maintenance]) !== JSON.stringify(item.after[key as keyof Maintenance])).map(([key, label]) => <div key={key}><dt className="font-medium">{label}</dt><dd className="text-muted-foreground">{display(item.before[key as keyof Maintenance])} → {display(item.after[key as keyof Maintenance])}</dd></div>)}</dl></div>)}
  </details>
}
