import type { Equipment, Maintenance } from "./types"

const monthFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
export function monthKey(date: Date) {
  const parts = monthFormatter.formatToParts(date)
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`
}
export function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number)
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, number - 1, 1)))
}
export function calculateDashboard(equipments: Equipment[], maintenances: Maintenance[], selectedMonth: string, now = new Date()) {
  const active = equipments.filter((equipment) => equipment.estadoRegistro !== "inativo")
  const completed = maintenances.filter((item) => item.status === "finalizada" && item.dataFinalizacao && monthKey(item.dataFinalizacao) === selectedMonth)
  const technicians = new Map<string, number>()
  for (const item of maintenances) technicians.set(item.tecnicoNome || "Desconhecido", (technicians.get(item.tecnicoNome || "Desconhecido") || 0) + 1)
  const [year, month] = monthKey(now).split("-").map(Number)
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1))
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
    return { mes: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date), total: maintenances.filter((item) => item.status === "finalizada" && item.dataFinalizacao && monthKey(item.dataFinalizacao) === key).length }
  })
  return {
    totalEquipments: active.length, totalMaintenances: maintenances.length,
    inProgress: maintenances.filter((item) => item.status === "em_andamento").length,
    completedThisMonth: completed.length,
    recentMaintenances: maintenances.slice(0, 5),
    manutencoesPorTecnico: [...technicians].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 10),
    manutencoesPorMes: months,
  }
}
