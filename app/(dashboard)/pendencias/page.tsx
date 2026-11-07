"use client"
import { useMemo, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { useLiveData } from "@/contexts/live-data-context"
import { pendingQueue, pendingLabels, type PendingStage } from "@/lib/pending-queue"
import { BulkMovementDialog } from "@/components/bulk-movement-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { BulkAction } from "@/lib/bulk-movements"
const actions: Record<PendingStage, BulkAction> = { avaliacao: "iniciar_manutencao", conclusao: "finalizar_manutencao", envio: "enviar_garantia", retorno: "retornar_garantia", recebimento: "confirmar_recebimento" }
const labels: Record<PendingStage, string> = { avaliacao: "Iniciar avaliação", conclusao: "Concluir manutenção", envio: "Confirmar envio", retorno: "Registrar retorno", recebimento: "Confirmar recebimento" }
export default function PendingPage() {
  const live = useLiveData(), { user, hasPermission } = useAuth()
  const [search, setSearch] = useState(""), [stage, setStage] = useState(""), [owner, setOwner] = useState(""), [minDays, setMinDays] = useState(0), [selected, setSelected] = useState<string[]>([]), [bulk, setBulk] = useState(false)
  const all = useMemo(() => pendingQueue(live.equipments, live.maintenances), [live.equipments, live.maintenances])
  const rows = pendingQueue(live.equipments, live.maintenances, new Date(), { search, stage, ownerId: owner, minDays })
  const owners = [...new Map(all.filter((item) => item.ownerId).map((item) => [item.ownerId, item.ownerName])).entries()]
  const chosen = rows.filter((item) => selected.includes(item.equipment.id)), chosenStage = chosen[0]?.stage
  const canAct = (item: typeof rows[number]) => hasPermission(["admin", "tecnico"]) && (item.stage !== "retorno" || hasPermission(["admin"])) && (item.stage !== "conclusao" || item.ownerId === user?.id)
  const canBulk = chosen.length > 0 && chosen.length === selected.length && chosen.every((item) => item.stage === chosenStage && canAct(item))
  function resetFilter() { setSelected([]) }
  const selectClass = "h-10 rounded-md border bg-background px-3 text-sm"
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Pendências operacionais</h1><p className="text-sm text-muted-foreground">Antigas primeiro; datas não registradas ao final.</p></div>
    <div className="flex flex-wrap gap-3">{Object.entries(pendingLabels).map(([key, label]) => <Button key={key} variant={stage === key ? "default" : "outline"} onClick={() => { setStage(stage === key ? "" : key); resetFilter() }}>{label} ({all.filter((item) => item.stage === key).length})</Button>)}</div>
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Pesquisar pendências<Input value={search} onChange={(event) => { setSearch(event.target.value); resetFilter() }} placeholder="IMEI, OCM, modelo ou destino" /></label><label className="flex flex-col gap-1 text-sm">Etapa pendente<select aria-label="Etapa pendente" className={selectClass} value={stage} onChange={(event) => { setStage(event.target.value); resetFilter() }}><option value="">Todas</option>{Object.entries(pendingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="flex flex-col gap-1 text-sm">Responsável da pendência<select aria-label="Responsável da pendência" className={selectClass} value={owner} onChange={(event) => { setOwner(event.target.value); resetFilter() }}><option value="">Todos / equipe</option>{owners.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label><label className="text-sm">Antiguidade mínima (dias)<Input type="number" min={0} max={36500} value={minDays} onChange={(event) => { setMinDays(Math.max(0, Number(event.target.value) || 0)); resetFilter() }} /></label></div>
    <p className="text-xs text-muted-foreground">O tempo é de acompanhamento, sem prazo de atendimento automático. Triagem sem data de mudança usa o cadastro, identificado na linha. Datas desconhecidas não entram no filtro de antiguidade mínima.</p>
    {hasPermission(["admin", "tecnico"]) && <div className="flex items-center gap-3"><Button disabled={!canBulk} onClick={() => setBulk(true)}>Executar etapa em massa</Button><span className="text-sm">{selected.length} selecionada(s). Selecione uma única etapa; conclusões exigem o responsável atual.</span><Button variant="ghost" onClick={() => setSelected([])}>Limpar seleção</Button></div>}
    <div className="overflow-auto rounded-lg border"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Seleção / remota</th><th>Etapa</th><th>Desde / dias</th><th>Responsável / destino</th><th>Procedimento</th></tr></thead><tbody>{rows.map((item) => <tr key={item.equipment.id} className="border-b"><td className="p-3">{canAct(item) && <input type="checkbox" className="mr-2" aria-label={`Selecionar pendência ${item.equipment.numeroRemota}`} checked={selected.includes(item.equipment.id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, item.equipment.id] : old.filter((id) => id !== item.equipment.id))} />}{item.equipment.numeroRemota}</td><td>{pendingLabels[item.stage]}</td><td>{item.since ? `${item.since.toLocaleDateString("pt-BR")} · ${item.ageDays} dia(s)` : "Data não registrada"}<p className="text-xs text-muted-foreground">{item.dateSource}</p></td><td>{item.ownerName}{item.stage === "recebimento" && <p className="text-xs">{item.equipment.placement?.destination}</p>}</td><td><Button size="sm" variant="link" asChild><Link href={hasPermission(["admin", "tecnico"]) && (item.stage === "avaliacao" || item.stage === "conclusao") ? `/manutencao?remota=${encodeURIComponent(item.equipment.numeroRemota)}` : `/equipamentos?remota=${encodeURIComponent(item.equipment.numeroRemota)}&ver=1`}>{hasPermission(["admin", "tecnico"]) ? labels[item.stage] : "Consultar remota"}</Link></Button></td></tr>)}</tbody></table></div>
    {!rows.length && <p>{live.loading ? "Carregando pendências…" : "Nenhuma pendência neste filtro."}</p>}
    {bulk && chosenStage && <BulkMovementDialog equipments={live.equipments} selectedIds={selected} initialAction={actions[chosenStage]} onClose={() => setBulk(false)} onCompleted={(numbers) => setSelected((ids) => ids.filter((id) => !live.equipments.some((item) => item.id === id && numbers.includes(item.numeroRemota))))} />}
  </div>
}
