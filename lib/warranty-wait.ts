import type { Equipment } from "./types"
export function warrantyWaitLabel(equipment: Equipment, now = new Date()) {
  const warranty = equipment.garantia
  const at = warranty?.status === "separada" ? warranty.separadaEm : warranty?.status === "enviada" ? warranty.enviadaEm : undefined
  if (!at || !Number.isFinite(at.getTime())) return null
  const days = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86400000))
  return `${days === 0 ? "Menos de 1 dia" : `${days} dia(s)`} ${warranty?.status === "separada" ? "aguardando envio" : "na garantia"}`
}
