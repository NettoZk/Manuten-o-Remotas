import type { Maintenance } from "./types"
import { normalizedReferenceName } from "./validation"
export const recurrencePeriods = [30, 90, 180, 365] as const
export interface RecurrenceEntry { equipmentId: string; number: string; count: number; firstAt: string; lastAt: string; maintenanceIds: string[]; repeatedDefects: { name: string; count: number }[] }
export function recurrenceReport(maintenances: Maintenance[], days: number, now = new Date()): RecurrenceEntry[] {
  const groups = new Map<string, Maintenance[]>(), from = now.getTime() - days * 86400000
  for (const maintenance of maintenances) {
    const at = maintenance.dataFinalizacao?.getTime()
    if (!maintenance.equipmentId || maintenance.status !== "finalizada" || maintenance.finalizadoForcadamente || at === undefined || !Number.isFinite(at) || at < from || at > now.getTime()) continue
    groups.set(maintenance.equipmentId, [...(groups.get(maintenance.equipmentId) || []), maintenance])
  }
  return [...groups].filter(([, items]) => items.length >= 2).map(([equipmentId, items]) => {
    items.sort((a, b) => a.dataFinalizacao!.getTime() - b.dataFinalizacao!.getTime() || a.id.localeCompare(b.id))
    const defects = new Map<string, { name: string; count: number }>()
    for (const item of items) {
      const name = (item.defeitoEncontrado === "Outro" ? item.defeitoEncontradoOutro : item.defeitoEncontrado)?.trim()
      if (!name) continue
      const key = normalizedReferenceName(name), previous = defects.get(key)
      defects.set(key, { name: previous?.name || name, count: (previous?.count || 0) + 1 })
    }
    return { equipmentId, number: items.at(-1)!.numeroRemota, count: items.length, firstAt: items[0].dataFinalizacao!.toISOString(), lastAt: items.at(-1)!.dataFinalizacao!.toISOString(), maintenanceIds: items.map((item) => item.id), repeatedDefects: [...defects.values()].filter((item) => item.count >= 2).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) }
  }).sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt) || a.number.localeCompare(b.number))
}
