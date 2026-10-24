"use client"

import { useState } from "react"
import { Send, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useLiveData } from "@/contexts/live-data-context"
import { sendWarranty, cancelWarrantyPreparation } from "@/lib/services"
import type { Equipment } from "@/lib/types"

export function WarrantyPreparationActions({ equipment, compact = false }: { equipment: Equipment; compact?: boolean }) {
  const live = useLiveData()
  const [action, setAction] = useState<"send" | "cancel" | null>(null)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const current = live.equipments.find((item) => item.id === equipment.id)
  const warranty = equipment.garantia
  const stale = !current || current.estadoRegistro === "inativo" || current.garantia?.id !== warranty?.id || current.garantia?.status !== "separada"
  if (warranty?.status !== "separada") return null
  async function execute() {
    if (!warranty || stale || saving) return
    if (action === "cancel" && reason.trim().length < 10) { toast.error("Descreva o cancelamento com pelo menos 10 caracteres"); return }
    setSaving(true)
    try {
      if (action === "send") await sendWarranty(equipment.id, warranty.id)
      else await cancelWarrantyPreparation(equipment.id, warranty.id, reason)
      toast.success(action === "send" ? "Envio para garantia confirmado" : "Separação cancelada. Remota encaminhada para Triagem")
      setAction(null); setReason("")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível concluir. Consulte a remota antes de repetir") }
    finally { setSaving(false) }
  }
  return <>
    <Button size={compact ? "sm" : "default"} variant={compact ? "ghost" : "outline"} title="Confirmar envio para garantia" aria-label={`Confirmar envio para garantia da remota ${equipment.numeroRemota}`} onClick={() => setAction("send")}><Send className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"} />{!compact && "Confirmar envio para garantia"}</Button>
    <Button size={compact ? "sm" : "default"} variant={compact ? "ghost" : "outline"} title="Cancelar separação para garantia" aria-label={`Cancelar separação para garantia da remota ${equipment.numeroRemota}`} onClick={() => { setReason(""); setAction("cancel") }}><Undo2 className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"} />{!compact && "Cancelar separação para garantia"}</Button>
    <Dialog open={!!action} onOpenChange={(open) => { if (!open && !saving) setAction(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{action === "send" ? "Confirmar envio para garantia" : "Cancelar separação para garantia"}</DialogTitle><DialogDescription>Remota {equipment.numeroRemota}. {action === "send" ? "Confirme quando o equipamento sair fisicamente para a garantia. A avaliação técnica já registrada será mantida." : "O cancelamento preserva a avaliação e encaminha a remota para Triagem, permitindo uma nova análise."}</DialogDescription></DialogHeader>
        <p className="whitespace-pre-wrap text-sm">Motivo da separação: {warranty.motivo}</p>
        {action === "cancel" && <label className="space-y-1 text-sm">Motivo do cancelamento<Textarea aria-label="Motivo do cancelamento" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} disabled={saving} placeholder="Descreva com pelo menos 10 caracteres" /></label>}
        {stale && <p role="alert" className="text-sm text-destructive">A separação mudou. Feche esta janela e consulte o cadastro novamente.</p>}
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setAction(null)}>Voltar</Button><Button disabled={saving || stale || (action === "cancel" && reason.trim().length < 10)} onClick={() => void execute()}>{saving && <Spinner className="mr-2 h-4 w-4" />}{action === "send" ? "Confirmar saída" : "Confirmar cancelamento"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
