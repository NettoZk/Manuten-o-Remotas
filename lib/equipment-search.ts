import type { Equipment } from "./types"

export type EquipmentRegistrationFilter = "todas" | "ativas" | "arquivadas"
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() }

export function searchEquipments(equipments: Equipment[], query: string, situation = "") {
  const search = normalize(query)
  const related = new Set<string>()
  const neighbours = new Map<string, Set<string>>()
  function connect(a: string, b: string) {
    if (!neighbours.has(a)) neighbours.set(a, new Set())
    neighbours.get(a)!.add(b)
  }
  for (const item of equipments) {
    for (const linked of [item.remotaAnteriorId, item.substituidaPorId]) if (linked) { connect(item.id, linked); connect(linked, item.id) }
    if (search && normalize(item.numeroRemota).includes(search)) related.add(item.id)
  }
  const queue = [...related]
  for (let index = 0; index < queue.length; index++) {
    for (const linked of neighbours.get(queue[index]) || []) if (!related.has(linked)) { related.add(linked); queue.push(linked) }
  }
  const matches = equipments.filter((item) => (!situation || item.situacaoRemota === situation) && (!search || related.has(item.id) ||
    [item.numeroRemota, item.modelo, item.lote, item.operadoraAtual, item.situacaoRemota, item.remotaAnteriorNumero, item.substituidaPorNumero].some((value) => value && normalize(value).includes(search))))
  const rank = (item: Equipment) => search && normalize(item.numeroRemota) === search ? 0 : search && normalize(item.numeroRemota).includes(search) ? 1 : 2
  return matches.sort((a, b) => rank(a) - rank(b) || Number(a.estadoRegistro === "inativo") - Number(b.estadoRegistro === "inativo") || b.dataCadastro.getTime() - a.dataCadastro.getTime() || a.numeroRemota.localeCompare(b.numeroRemota))
}

export function filterEquipmentRegistration(equipments: Equipment[], filter: EquipmentRegistrationFilter) {
  return equipments.filter((item) => filter === "todas" || (filter === "arquivadas" ? item.estadoRegistro === "inativo" : item.estadoRegistro !== "inativo"))
}
