"use client"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { correctWarrantyDispatch, getWarrantyRevisions, type WarrantyRevision } from "@/lib/services"
import type { Equipment } from "@/lib/types"

export function WarrantyDispatchCorrection({ equipment }: { equipment: Equipment }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false)
  const [version, setVersion] = useState(equipment.operationVersion || 0)
  if (equipment.garantia?.status !== "enviada") return null
  async function submit() {
    setSaving(true)
    try { await correctWarrantyDispatch(equipment.id, equipment.garantia!.id, reason, confirmed, version); toast.success("Confirmação corrigida. Remota separada, aguardando saída"); setOpen(false) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível corrigir") }
    finally { setSaving(false) }
  }
  return <><Button variant="outline" onClick={() => { setVersion(equipment.operationVersion || 0); setReason(""); setConfirmed(false); setOpen(true) }}>Corrigir confirmação de envio</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value) }}><DialogContent>
      <DialogHeader><DialogTitle>Corrigir confirmação de envio</DialogTitle><DialogDescription>Use somente quando a saída foi confirmada por engano e a remota permanece fisicamente com a equipe. O registro anterior será preservado.</DialogDescription></DialogHeader>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo que não houve saída física</label>
      <label className="space-y-1 text-sm">Motivo da correção<Textarea aria-label="Motivo da correção" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} disabled={saving} /></label>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Voltar</Button><Button disabled={saving || !confirmed || reason.trim().length < 10} onClick={() => void submit()}>Confirmar correção</Button></DialogFooter>
    </DialogContent></Dialog></>
}
export function WarrantyRevisionHistory({ warrantyId, count }: { warrantyId: string; count?: number }) {
  const [records, setRecords] = useState<WarrantyRevision[] | null>(null), [error, setError] = useState(false)
  async function load() { try { setError(false); setRecords(await getWarrantyRevisions(warrantyId)) } catch { setError(true) } }
  if (!count) return null
  const fields = { status: "Etapa", enviadaEm: "Envio", novoNumeroRemota: "IMEI substituto", situacaoRetorno: "Situação de retorno", condicaoRetorno: "Condição", observacoesRetorno: "Descrição do retorno", motivo: "Motivo da separação", "returnData.numeroRemota": "Número recebido", "returnData.modelo": "Modelo recebido", "returnData.anoFabricacao": "Ano de fabricação", "returnData.lote": "OCM", "returnData.operadoraAtual": "Operadora no retorno", "returnData.observacoes": "Observações do cadastro" }
  function read(record: Record<string, unknown>, path: string): unknown { let value: unknown = record; for (const key of path.split(".")) value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined; return value }
  return <details onToggle={(event) => { if (event.currentTarget.open && !records) void load() }}><summary className="cursor-pointer">Correções da garantia ({count})</summary>
    {error && <button className="underline" onClick={() => void load()}>Falha ao consultar. Tentar novamente</button>}
    {records?.map((record) => <div key={record.id} className="my-2 border-l-2 pl-3"><p>{new Date(record.at).toLocaleString("pt-BR")} · {record.userName}</p><p>{record.reason}</p>{Object.entries(fields).filter(([field]) => JSON.stringify(read(record.before, field)) !== JSON.stringify(read(record.after, field))).map(([field, label]) => <p key={field}>{label}: {String(read(record.before, field) ?? "—")} → {String(read(record.after, field) ?? "—")}</p>)}</div>)}
  </details>
}
