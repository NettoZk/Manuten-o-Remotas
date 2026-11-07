"use client"
import { useState } from "react"
import { getEquipmentMovements, type EquipmentMovement, type PageCursor } from "@/lib/services"
import { Button } from "@/components/ui/button"
const labels: Record<string, string> = {
  equipment_created: "Cadastro da remota", equipment_updated: "Cadastro / situação atualizados", equipment_archived: "Remota arquivada",
  maintenance_started: "Manutenção iniciada", maintenance_finalized: "Manutenção concluída", maintenance_forced: "Manutenção encerrada pelo administrador",
  warranty_prepared: "Separada para garantia", warranty_sent: "Enviada para garantia", warranty_returned: "Retorno da garantia", warranty_preparation_cancelled: "Separação cancelada",
}
export function EquipmentTimeline({ equipmentId }: { equipmentId: string }) {
  const [records, setRecords] = useState<EquipmentMovement[] | null>(null)
  const [cursor, setCursor] = useState<PageCursor | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  async function load(more = false) {
    if (loading) return
    setLoading(true); setError(false)
    try { const page = await getEquipmentMovements(equipmentId, more ? cursor : null); setRecords((old) => more ? [...(old || []), ...page.records] : page.records); setCursor(page.cursor) }
    catch { setError(true) } finally { setLoading(false) }
  }
  return <details className="rounded-lg border p-4" onToggle={(event) => { if (event.currentTarget.open && records === null) void load() }}>
    <summary className="cursor-pointer font-medium">Linha do tempo de movimentações</summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">Movimentações registradas pelo sistema. Registros antigos podem ter somente o histórico de manutenções abaixo.</p>
      {records?.map((item) => <div key={item.id} className="border-l-2 pl-3 text-sm"><p className="font-medium">{labels[item.action] || "Movimentação registrada"}{item.situation ? ` · ${item.situation}` : ""}</p><p className="text-xs text-muted-foreground">{new Date(item.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {item.userName}</p>{item.reason && <p>{item.reason}</p>}</div>)}
      {records?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada nesta linha do tempo.</p>}
      {loading && <p role="status" className="text-sm">Carregando movimentações…</p>}
      {error && <p role="alert" className="text-sm">Não foi possível consultar. <button className="underline" onClick={() => void load(Boolean(records))}>Tentar novamente</button></p>}
      {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(true)}>Carregar mais movimentações</Button>}
    </div>
  </details>
}
