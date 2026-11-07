"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { recordedDiff, previewValue, operationTitles } from "@/lib/movement-preview"
import { getBatchHistory, getBatchItems, reverseBatchItem, type OperationBatch, type OperationBatchItem } from "@/lib/services"

const simple = ["createEquipment", "updateEquipment", "updateEquipmentWithLog", "updateEquipmentSituationManual"]
function identity(item: OperationBatchItem) { const input = item.args[0] as Record<string, unknown> | undefined; return item.after?.numeroRemota || item.before?.numeroRemota || item.number || input?.numeroRemota }
function number(item: OperationBatchItem) { return String(identity(item) || "Número não registrado") }
export default function BatchesPage() {
  const { hasPermission } = useAuth(), [batches, setBatches] = useState<OperationBatch[]>([]), [items, setItems] = useState<OperationBatchItem[]>([])
  const [batchId, setBatchId] = useState(""), [selected, setSelected] = useState<string[]>([]), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const [lookup, setLookup] = useState("")
  async function load() { try { setError(""); setBatches(await getBatchHistory()) } catch (error) { setError(error instanceof Error ? error.message : "Falha ao consultar") } }
  useEffect(() => { void load() }, [])
  async function open(id: string) {
    setBusy(true); setSelected([]); setReason(""); setItems([]); setBatchId(id)
    try { setItems(await getBatchItems(id)) } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao consultar itens") }
    finally { setBusy(false) }
  }
  async function reverse() {
    setBusy(true)
    for (const id of selected) {
      try { await reverseBatchItem(batchId, id, reason) }
      catch (error) { toast.error(`${number(items.find((item) => item.id === id)!)}: ${error instanceof Error ? error.message : "Não foi possível corrigir"}`) }
    }
    try { setItems(await getBatchItems(batchId)); setSelected([]) } finally { setBusy(false) }
  }
  function download() {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(items.map((item) => ({ execucao: batches.find((batch) => batch.id === batchId)?.executionId || batchId, lote: batchId, remota: number(item), linhaOriginal: item.sourceRow || "Não registrada", linhaNoBloco: item.row + 1, operacao: operationTitles[item.operation] || "Movimentação", resultado: item.ok ? "Concluída" : item.uncertain ? "Verificar resultado" : "Impedida", mensagem: item.error || "", alteracoes: recordedDiff(item.before, item.after, item.procedure).map((change) => `${change.label}: ${previewValue(change.before)} → ${previewValue(change.after)}`).join("\n"), corrigidoEm: item.reversedAt || "", motivoCorrecao: item.reversalReason || "" }))), "Lote")
    XLSX.writeFile(workbook, `lote_${batchId}.xlsx`)
  }
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Lotes e importações</h1><p className="text-sm text-muted-foreground">Últimos 50 lotes. O histórico permanece após o vencimento do comprovante de recuperação de 7 dias.</p></div>
    <div className="flex items-end gap-2"><label className="text-sm">Identificador de lote<Input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Consulte também um lote anterior pelo identificador" /></label><Button variant="outline" disabled={busy || !lookup.trim()} onClick={() => void open(lookup.trim())}>Consultar identificador</Button><Button variant="outline" disabled={busy} onClick={() => void load()}>Atualizar lotes</Button></div>
    {error && <p role="alert">{error} <button className="underline" onClick={() => void load()}>Tentar novamente</button></p>}
    {!batches.length && !error && <p>Nenhum lote registrado nesta versão.</p>}
    <div className="max-h-64 overflow-auto rounded-lg border"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Data / responsável</th><th>Itens / processamento</th><th>Consulta</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id} className="border-b"><td className="p-3">{new Date(batch.createdAt).toLocaleString("pt-BR")} · {batch.userName}<details><summary className="cursor-pointer text-xs">Identificador</summary><p>Lote: {batch.id}</p>{batch.executionId && <p>Execução: {batch.executionId}</p>}</details></td><td>{batch.count} · {batch.state === "completed" ? `${batch.successes || 0} concluídos` : "Processamento a conferir"}</td><td><Button variant="outline" size="sm" disabled={busy} onClick={() => void open(batch.id)}>Ver itens</Button></td></tr>)}</tbody></table></div>
    {batchId && <section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Itens do lote</h2><p className="text-sm text-muted-foreground">Correções de cadastro sem movimento posterior podem ser aplicadas aqui. Arquivamento, manutenção e garantia usam seus procedimentos específicos. Resultados incertos exigem conferência antes de repetir.</p><Button variant="outline" disabled={!items.length} onClick={download}>Exportar lote</Button>
      {items.map((item) => <div key={item.id} className="space-y-2 rounded-lg border p-3 text-sm"><div className="flex flex-wrap items-center gap-3"><strong>{number(item)}</strong><span className="text-xs text-muted-foreground">{item.sourceRow ? `Linha original ${item.sourceRow}` : "Linha original não registrada"}{item.numberInferred && " · Número recuperado do cadastro atual"}</span><span>{item.ok ? "Concluída" : item.error || "Resultado a conferir"}</span>{item.reversedAt ? <span className="text-success">Item corrigido</span> : hasPermission(["admin"]) && item.ok && simple.includes(item.operation) && <label className="flex items-center gap-2"><input type="checkbox" aria-label={`Selecionar correção da remota ${number(item)}`} disabled={busy} checked={selected.includes(item.id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, item.id] : old.filter((id) => id !== item.id))} />Corrigir</label>}{!!identity(item) && <Button variant="link" size="sm" asChild><Link href={`/equipamentos?remota=${encodeURIComponent(number(item))}&ver=1`}>Consultar remota e procedimentos</Link></Button>}</div>
        <details><summary className="cursor-pointer">Antes e depois</summary><p className="text-xs">{operationTitles[item.operation] || "Movimentação"}</p>{recordedDiff(item.before, item.after, item.procedure).map((change) => <p key={change.field}><strong>{change.label}: </strong>{previewValue(change.before)} → {previewValue(change.after)}</p>)}{!item.hasCommittedChange && <p>Sem alteração confirmada no diário. Confira o cadastro antes de repetir um resultado incerto.</p>}</details>
        {item.reversedAt && <p>{new Date(item.reversedAt).toLocaleString("pt-BR")} · {item.reversedBy} · {item.reversalReason}</p>}
      </div>)}
      {hasPermission(["admin"]) && <div className="space-y-2"><label className="block text-sm">Motivo da correção do lote<Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} disabled={busy} /></label><Button disabled={busy || !selected.length || reason.trim().length < 10} onClick={() => void reverse()}>Corrigir itens selecionados</Button></div>}
    </section>}
  </div>
}
