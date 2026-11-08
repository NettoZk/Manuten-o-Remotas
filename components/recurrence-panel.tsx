"use client"
import { useState } from "react"
import Link from "next/link"
import { getRecurrenceReport } from "@/lib/services"
import { recurrencePeriods, type RecurrenceEntry } from "@/lib/recurrence"
import { useLiveData } from "@/contexts/live-data-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function RecurrencePanel({ equipmentId }: { equipmentId?: string }) {
  const live = useLiveData(), [days, setDays] = useState(90), [records, setRecords] = useState<RecurrenceEntry[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [search, setSearch] = useState(""), [includeArchived, setIncludeArchived] = useState(false)
  const [consulted, setConsulted] = useState(0)
  async function load() { setBusy(true); setError(""); try { setRecords(await getRecurrenceReport(days, equipmentId)); setConsulted(days) } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível consultar") } finally { setBusy(false) } }
  const rows = records?.filter((record) => (equipmentId || includeArchived || live.equipments.find((item) => item.id === record.equipmentId)?.estadoRegistro !== "inativo") && record.number.toLowerCase().includes(search.toLowerCase()))
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">Duas ou mais manutenções técnicas concluídas no período escolhido, por cadastro físico. Cancelamentos e encerramentos forçados ficam fora. Falhas da remota anterior não são atribuídas automaticamente à substituta. O indicador orienta análise técnica.</p>
    <div className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-sm">Período de reincidência<select aria-label="Período de reincidência" className="h-10 rounded-md border bg-background px-3" value={days} onChange={(event) => { setDays(Number(event.target.value)); setRecords(null) }}>{recurrencePeriods.map((days) => <option key={days} value={days}>{days} dias</option>)}</select></label><Button disabled={busy} onClick={() => void load()}>{busy ? "Consultando…" : "Consultar reincidência"}</Button>{!equipmentId && <><label className="text-sm">Pesquisar reincidência<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número / IMEI" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />Incluir arquivadas</label></>}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {records && <p className="text-sm">{rows?.length} remota(s) neste filtro · janela de {consulted} dias até a consulta.</p>}
    {rows?.map((record) => <div key={record.equipmentId} className="space-y-2 rounded-lg border p-3 text-sm"><p className="font-semibold">{record.number} · {record.count} conclusões</p><p className="text-xs text-muted-foreground">De {new Date(record.firstAt).toLocaleDateString("pt-BR")} a {new Date(record.lastAt).toLocaleDateString("pt-BR")}</p>{record.repeatedDefects.length ? record.repeatedDefects.map((defect) => <p key={defect.name}>{defect.name} · {defect.count} vezes</p>) : <p>Sem defeito idêntico repetido registrado no período.</p>}
      <details><summary className="cursor-pointer">Atendimentos considerados ({record.count})</summary><div className="flex flex-col items-start">{record.maintenanceIds.map((id) => <Button key={id} variant="link" size="sm" asChild><Link href={`/historico?manutencao=${encodeURIComponent(id)}`}>Ver atendimento {id}</Link></Button>)}</div></details>
    </div>)}
  </div>
}
export function EquipmentRecurrence({ equipmentId }: { equipmentId: string }) {
  const [opened, setOpened] = useState(false)
  return <details className="rounded-lg border p-3" onToggle={(event) => { if (event.currentTarget.open) setOpened(true) }}><summary className="cursor-pointer font-medium">Reincidência desta remota</summary>{opened && <div className="mt-3"><RecurrencePanel equipmentId={equipmentId} /></div>}</details>
}
