"use client"
import { useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { dispatchEquipment, receiveEquipment, getPhysicalMovements } from "@/lib/services"
import type { Equipment } from "@/lib/types"

export function PhysicalMovementActions({ equipment }: { equipment: Equipment }) {
  const { hasPermission } = useAuth(), [open, setOpen] = useState(false), [saving, setSaving] = useState(false)
  const [type, setType] = useState<"polo" | "estoque">("polo"), [destination, setDestination] = useState(""), [recipient, setRecipient] = useState(""), [notes, setNotes] = useState("")
  const [records, setRecords] = useState<Record<string, string>[] | null>(null), [error, setError] = useState(false)
  const [version, setVersion] = useState(equipment.operationVersion || 0)
  const placement = equipment.placement, transit = placement?.status === "em_transito"
  const allowed = hasPermission(["admin", "tecnico"]) && equipment.estadoRegistro !== "inativo" && !equipment.manutencaoId && !equipment.emManutencaoPor && !["separada", "enviada"].includes(equipment.garantia?.status || "")
  async function load() { try { setError(false); setRecords(await getPhysicalMovements(equipment.id)) } catch { setError(true) } }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      if (transit) await receiveEquipment(equipment.id, placement!.id, notes, version)
      else await dispatchEquipment(equipment.id, { type, destination, recipientName: recipient, notes }, version)
      toast.success(transit ? "Recebimento confirmado" : "Movimentação física registrada"); setOpen(false); setRecords(null)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível concluir") }
    finally { setSaving(false) }
  }
  return <section className="space-y-2 rounded-lg border p-3"><h3 className="font-medium">Destino e recebimento</h3>
    {placement ? <><p className="text-sm">{transit ? "Em trânsito" : "Recebida"} · {placement.destination}</p><p className="text-xs text-muted-foreground">Saída: {placement.sentAt?.toLocaleString("pt-BR")} · {placement.sentBy}. Responsável previsto: {placement.recipientName}</p>{placement.receivedAt && <p className="text-xs text-muted-foreground">Recebimento: {placement.receivedAt.toLocaleString("pt-BR")} · {placement.receivedBy}</p>}</> : <p className="text-sm text-muted-foreground">Destino físico ainda não registrado.</p>}
    {allowed && <Button variant="outline" onClick={() => { setVersion(equipment.operationVersion || 0); setNotes(""); setOpen(true) }}>{transit ? "Confirmar recebimento" : "Movimentar para polo ou estoque"}</Button>}
    <details onToggle={(event) => { if (event.currentTarget.open && !records) void load() }}><summary className="cursor-pointer text-sm">Histórico de destinos</summary>{error && <button className="underline text-sm" onClick={() => void load()}>Falha ao consultar. Tentar novamente</button>}{records?.map((record) => <div className="my-2 border-l-2 pl-2 text-xs" key={record.id}><p>{record.origin} → {record.destination} · {record.status === "em_transito" ? "Em trânsito" : "Recebida"}</p><p>Saída {new Date(record.sentAt).toLocaleString("pt-BR")} · {record.sentBy}</p>{record.receivedAt && <p>Recebida {new Date(record.receivedAt).toLocaleString("pt-BR")} · {record.receivedBy}</p>}{record.notes && <p>{record.notes}</p>}{record.receiptNotes && <p>{record.receiptNotes}</p>}</div>)}</details>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value) }}><DialogContent><DialogHeader><DialogTitle>{transit ? "Confirmar recebimento" : "Movimentar para polo ou estoque"}</DialogTitle><DialogDescription>{transit ? `Confirme após conferir fisicamente a remota em ${placement.destination}. Seu nome e a data atual serão registrados.` : `Remota ${equipment.numeroRemota}. Confirme quando ocorrer a saída física. A situação técnica será mantida durante o trânsito.`}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-3"><fieldset disabled={saving} className="space-y-3">{!transit && <><label className="block text-sm">Tipo de destino<select aria-label="Tipo de destino" className="h-10 w-full rounded-md border bg-background px-3" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="polo">Polo</option><option value="estoque">Estoque</option></select></label><label className="block text-sm">Destino<Input required minLength={2} maxLength={160} value={destination} onChange={(event) => setDestination(event.target.value)} /></label><label className="block text-sm">Responsável previsto pelo recebimento<Input required minLength={2} maxLength={160} value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label></>}
      <label className="block text-sm">Observações<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></label></fieldset><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Voltar</Button><Button type="submit" disabled={saving}>{transit ? "Registrar recebimento" : "Confirmar movimentação física"}</Button></DialogFooter></form>
    </DialogContent></Dialog>
  </section>
}
