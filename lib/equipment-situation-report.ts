import type { Equipment, EquipmentSituationEvent, EquipmentSituationReport } from "./types"
import { monthKey } from "./dashboard"
import { operationalSituation } from "./equipment-situations"

export const UNKNOWN_HISTORY = "Sem histórico no período"
export const UNKNOWN_SITUATION = "Sem situação registrada"

export function situationCounts(names: string[]) {
  const counts = new Map<string, number>()
  for (const value of names) {
    const name = operationalSituation(value) || UNKNOWN_SITUATION
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([name, value]) => ({ name, value }))
}

// O último evento do mês é o fechamento. O estado é carregado para os meses
// seguintes até outra mudança, mesmo quando não há manutenção nesse intervalo.
export function equipmentSituationReport(
  equipments: Pick<Equipment, "id" | "dataCadastro" | "situacaoRemota" | "estadoRegistro" | "arquivadoEm">[],
  history: EquipmentSituationEvent[], month: string, now = new Date(),
): EquipmentSituationReport {
  const isCurrent = month === monthKey(now)
  const inventory = new Map(equipments.map((equipment) => [equipment.id, equipment]))
  const currentIds = new Set(equipments.map((equipment) => equipment.id))
  const latest = new Map<string, EquipmentSituationEvent>()
  let trackedSince: Date | undefined
  for (const event of history) {
    if (event.at > now) continue
    if (!trackedSince || event.at < trackedSince) trackedSince = event.at
    // Mantém também os cadastros excluídos para não apagar meses anteriores.
    if (!currentIds.has(event.equipmentId)) inventory.set(event.equipmentId, {
      id: event.equipmentId, dataCadastro: event.registeredAt,
      estadoRegistro: "inativo", situacaoRemota: undefined,
      arquivadoEm: inventory.get(event.equipmentId)?.arquivadoEm || event.archivedAt,
    })
    if (monthKey(event.at) > month) continue
    const previous = latest.get(event.equipmentId)
    if (!previous || event.at > previous.at || (event.at.getTime() === previous.at.getTime() && event.version > previous.version)) latest.set(event.equipmentId, event)
  }
  const names: string[] = []
  let missingHistory = 0
  let firstYear = Number(monthKey(now).slice(0, 4))
  for (const equipment of inventory.values()) {
    const hasRegistration = equipment.dataCadastro.getTime() > 0
    if (hasRegistration) firstYear = Math.min(firstYear, Number(monthKey(equipment.dataCadastro).slice(0, 4)))
    if (isCurrent) {
      if (equipment.estadoRegistro !== "inativo" && equipment.dataCadastro <= now) names.push(equipment.situacaoRemota?.trim() || UNKNOWN_SITUATION)
      continue
    }
    const event = latest.get(equipment.id)
    if (event) {
      if (event.active) names.push(event.situation || UNKNOWN_SITUATION)
      continue
    }
    if (!hasRegistration || monthKey(equipment.dataCadastro) > month) continue
    if (equipment.arquivadoEm && monthKey(equipment.arquivadoEm) <= month) continue
    // Sem evento anterior ao fechamento, a situação atual não prova o passado.
    names.push(UNKNOWN_HISTORY)
    missingHistory++
  }
  return { month, isCurrent, totalEquipments: names.length, missingHistory,
    situations: situationCounts(names), trackedSince: trackedSince?.toISOString() || null,
    firstYear, generatedAt: now.toISOString() }
}

export function includeSituationCategories(counts: { name: string; value: number }[], categories: { nome: string; ativo: boolean }[]) {
  const values = new Map<string, number>()
  for (const item of counts) {
    const situation = operationalSituation(item.name)
    if (!situation && !item.value) continue
    const name = situation || UNKNOWN_SITUATION
    values.set(name, (values.get(name) || 0) + item.value)
  }
  for (const category of categories) {
    const name = operationalSituation(category.nome)
    if (category.ativo && name && !values.has(name)) values.set(name, 0)
  }
  return [...values].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([name, value]) => ({ name, value }))
}

export function situationColor(name: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (name === UNKNOWN_HISTORY || name === UNKNOWN_SITUATION) return "#94a3b8"
  if (normalized.includes("recuperad")) return "#3b82f6"
  if (normalized.includes("triagem")) return "#22c55e"
  if (normalized.includes("garantia")) return "#ec4899"
  if (normalized.includes("estoque")) return "#06b6d4"
  if (normalized.includes("manutencao")) return "#8b5cf6"
  if (normalized.includes("polo")) return "#ef4444"
  if (normalized.includes("sucata")) return "#f59e0b"
  const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"]
  const hash = [...normalized].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0)
  return colors[hash % colors.length]
}
