import type { Equipment, Maintenance } from "./types"

export function maintenanceEquipmentData(maintenance: Maintenance, current?: Equipment) {
  const snapshot = maintenance.equipmentSnapshot
  const historical = Boolean(snapshot)
  const complete = Boolean(snapshot && snapshot.modelo && snapshot.anoFabricacao && snapshot.lote && snapshot.numeroRemota)
  return { equipment: snapshot || current, historical, complete,
    sourceLabel: historical ? complete ? "Registro do atendimento" : "Registro parcial do atendimento — campos ausentes não informados" : "Cadastro atual — sem registro histórico" }
}
