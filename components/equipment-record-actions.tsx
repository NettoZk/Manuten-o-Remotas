"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { restoreEquipment } from "@/lib/services"
import type { Equipment } from "@/lib/types"

export function EquipmentRecordActions({ equipment }: { equipment: Equipment }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(""), [saving, setSaving] = useState(false)
  const [version, setVersion] = useState(equipment.operationVersion || 0)
  if (equipment.estadoRegistro !== "inativo" || equipment.substituidaPorId || equipment.cadastroAnulado) return null
  async function submit() {
    setSaving(true)
    try { await restoreEquipment(equipment.id, reason, version); toast.success("Remota reativada"); setOpen(false) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível reativar") }
    finally { setSaving(false) }
  }
  return <><Button variant="outline" onClick={() => { setVersion(equipment.operationVersion || 0); setReason(""); setOpen(true) }}>Reativar remota</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value) }}><DialogContent>
      <DialogHeader><DialogTitle>Reativar remota</DialogTitle><DialogDescription>Remota {equipment.numeroRemota}. O intervalo arquivado e os registros anteriores serão preservados.</DialogDescription></DialogHeader>
      <label className="space-y-1 text-sm">Motivo da reativação<Textarea aria-label="Motivo da reativação" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} disabled={saving} /></label>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Voltar</Button><Button disabled={saving || reason.trim().length < 10} onClick={() => void submit()}>Confirmar reativação</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
