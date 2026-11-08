import { describe, expect, it } from "vitest"
import { recurrenceReport } from "@/lib/recurrence"
import type { Maintenance } from "@/lib/types"
const now = new Date("2026-11-07T12:00:00Z")
const maintenance = (id: string, equipmentId: string, extra: Partial<Maintenance> = {}) => ({ id, equipmentId, numeroRemota: equipmentId, status: "finalizada", dataFinalizacao: new Date("2026-11-06T12:00:00Z"), defeitoEncontrado: "Sem comunicação", ...extra } as Maintenance)
describe("reincidência por equipamento físico", () => {
  it("conta serviços técnicos e defeitos repetidos sem herdar falhas na substituta", () => {
    const rows = recurrenceReport([maintenance("a", "original"), maintenance("b", "original", { defeitoEncontrado: " sem COMUNICAÇÃO " }), maintenance("c", "substituta"), maintenance("d", "original", { finalizadoForcadamente: true }), maintenance("e", "original", { status: "cancelada" })], 30, now)
    expect(rows).toHaveLength(1); expect(rows[0].equipmentId).toBe("original"); expect(rows[0].count).toBe(2)
    expect(rows[0].repeatedDefects[0].count).toBe(2); expect(rows[0].maintenanceIds).toHaveLength(2)
  })
  it("inclui o limite inicial e exclui futuros e conclusões anteriores à janela", () => {
    const boundary = new Date(now.getTime() - 30 * 86400000)
    const rows = recurrenceReport([maintenance("a", "eq", { dataFinalizacao: boundary }), maintenance("b", "eq"), maintenance("c", "eq", { dataFinalizacao: new Date(boundary.getTime() - 1) }), maintenance("d", "eq", { dataFinalizacao: new Date(now.getTime() + 1) })], 30, now)
    expect(rows[0].maintenanceIds.sort()).toEqual(["a", "b"])
  })
})
