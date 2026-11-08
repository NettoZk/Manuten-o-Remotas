"use client"
import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { cancelMaintenance, getAssignableTechnicians, transferMaintenance } from "@/lib/services"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import type { Equipment, Maintenance } from "@/lib/types"
import { MaintenanceRectification } from "@/components/maintenance-rectification"

type MaintenanceActionsProps = {
  maintenance: Maintenance
  equipment: Equipment
  onTransferred?: (targetId: string) => void
}

export function MaintenanceActions({ maintenance, equipment, onTransferred }: MaintenanceActionsProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [version, setVersion] = useState(equipment.operationVersion || 0)
  if (maintenance.status === "finalizada" && !maintenance.finalizadoForcadamente && user?.tipo === "admin") return <MaintenanceRectification maintenance={maintenance} equipment={equipment} />
  if (maintenance.status !== "em_andamento" || (user?.tipo !== "admin" && maintenance.tecnicoId !== user?.id)) return null
  async function confirm() {
    if (saving || reason.trim().length < 10) return
    setSaving(true)
    try { await cancelMaintenance(maintenance.id, equipment.id, reason, version); setOpen(false); toast.success("Abertura cancelada") }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível cancelar a abertura") }
    finally { setSaving(false) }
  }
  return <div className="flex flex-wrap gap-2">
    {user?.tipo === "admin" && <MaintenanceTransfer maintenance={maintenance} equipment={equipment} onTransferred={onTransferred} />}
    <Button variant="outline" type="button" onClick={() => { setVersion(equipment.operationVersion || 0); setReason(""); setOpen(true) }}>Cancelar abertura</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value) }}><DialogContent>
      <DialogHeader><DialogTitle>Cancelar abertura de manutenção</DialogTitle><DialogDescription>Remota {equipment.numeroRemota}. Use para uma abertura feita por engano. O atendimento ficará registrado como cancelado, com sua justificativa, e a remota será liberada.</DialogDescription></DialogHeader>
      <label className="space-y-2 text-sm">Motivo do cancelamento<Textarea aria-label="Motivo do cancelamento" minLength={10} maxLength={2000} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} /></label>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Voltar</Button><Button disabled={saving || reason.trim().length < 10} onClick={() => void confirm()}>{saving ? "Cancelando…" : "Confirmar cancelamento"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>
}

function MaintenanceTransfer({ maintenance, equipment, onTransferred }: MaintenanceActionsProps) {
  const [version, setVersion] = useState(equipment.operationVersion || 0)
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [loading, setLoading] = useState(false)
  const [reason, setReason] = useState(""), [target, setTarget] = useState("")
  const [choices, setChoices] = useState<{ id: string; nome: string }[]>([])
  async function show() {
    setVersion(equipment.operationVersion || 0)
    setReason(""); setTarget(""); setChoices([]); setOpen(true); setLoading(true)
    try { setChoices((await getAssignableTechnicians()).filter((item) => item.id !== maintenance.tecnicoId)) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível consultar responsáveis") }
    finally { setLoading(false) }
  }
  async function save() {
    if (!target || saving || reason.trim().length < 10) return
    setSaving(true)
    try {
      await transferMaintenance(maintenance.id, equipment.id, target, reason, version)
      setOpen(false)
      onTransferred?.(target)
      toast.success("Responsável transferido; atendimento e rascunho preservados")
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível transferir") }
    finally { setSaving(false) }
  }
  return <><Button variant="outline" type="button" onClick={() => void show()}>Transferir responsável</Button><Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value) }}><DialogContent>
    <DialogHeader><DialogTitle>Transferir responsável</DialogTitle><DialogDescription>Remota {equipment.numeroRemota}. Responsável atual: {maintenance.tecnicoNome}. O atendimento continuará aberto, com a data de entrada e o rascunho preservados.</DialogDescription></DialogHeader>
    <fieldset disabled={saving} className="space-y-3"><label className="block space-y-1 text-sm">Novo responsável<select aria-label="Novo responsável" value={target} disabled={loading} className="h-10 w-full rounded-md border bg-background px-3" onChange={(event) => setTarget(event.target.value)}><option value="">{loading ? "Carregando…" : "Selecione..."}</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      {!loading && !choices.length && <p className="text-sm text-muted-foreground">Nenhum outro técnico ou administrador ativo disponível.</p>}
      <label className="block space-y-1 text-sm">Motivo da transferência<Textarea aria-label="Motivo da transferência" minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </fieldset>
    <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Voltar</Button><Button disabled={saving || !target || reason.trim().length < 10} onClick={() => void save()}>{saving ? "Transferindo…" : "Confirmar transferência"}</Button></DialogFooter>
  </DialogContent></Dialog></>
}
