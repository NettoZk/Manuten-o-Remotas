import { beforeEach, describe, expect, it, vi } from "vitest"
import * as XLSX from "xlsx"
import { exportMaintenancesToExcel } from "@/lib/excel-export"
import type { Equipment, Maintenance } from "@/lib/types"

vi.mock("xlsx", async (original) => ({ ...await original<typeof import("xlsx")>(), writeFile: vi.fn() }))
beforeEach(() => vi.mocked(XLSX.writeFile).mockClear())
const current = { id: "e1", numeroRemota: "IMEI-1", modelo: "MODELO-ATUAL", anoFabricacao: "2026", lote: "OCM-ATUAL", status: "Usada", operadoraAtual: "Claro" } as Equipment
const maintenance = { id: "m1", equipmentId: "e1", numeroRemota: "IMEI-1", dataEntrada: new Date("2026-09-01T12:00:00Z"), dataFinalizacao: new Date("2026-09-02T12:00:00Z"), status: "finalizada", situacaoRemota: "Recuperada", servicosRealizados: [], operadoraAntes: "Claro", operadoraDepois: "Claro", tecnicoNome: "Técnico" } as unknown as Maintenance
function exportedRow(item: Maintenance) {
  exportMaintenancesToExcel([item], new Map([[current.numeroRemota, current]]))
  const workbook = vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]])[0]
}
describe("dados cadastrais históricos do atendimento", () => {
  it("preserva campos capturados de um snapshot parcial e não atribui OCM atual ao passado", () => {
    const item = { ...maintenance, equipmentSnapshot: { numeroRemota: "IMEI-1", modelo: "MODELO-ANTIGO", anoFabricacao: "2020", capturedAt: new Date(), source: "opening" } } as Maintenance
    const row = exportedRow(item)
    expect(row.Modelo).toBe("MODELO-ANTIGO")
    expect(row["Ano de Fabricação"]).toBe("2020")
    expect(row.OCM).toBe("-")
    expect(row["Origem dos dados cadastrais"]).toContain("parcial")
  })
  it("preserva modelo, ano e OCM da abertura mesmo depois de editar o cadastro", () => {
    const item: Maintenance = { ...maintenance, equipmentSnapshot: { numeroRemota: "IMEI-1", modelo: "MODELO-ANTIGO", anoFabricacao: "2020", lote: "OCM-ANTIGA", operadoraAtual: "Claro", status: "Usada", capturedAt: new Date("2026-09-01T12:00:00Z"), source: "opening" } }
    const row = exportedRow(item)
    expect(row.Modelo).toBe("MODELO-ANTIGO")
    expect(row["Ano de Fabricação"]).toBe("2020")
    expect(row.OCM).toBe("OCM-ANTIGA")
    expect(row["Origem dos dados cadastrais"]).toBe("Registro do atendimento")
  })
  it("identifica os dados cadastrais atuais quando não existe evidência histórica", () => {
    const row = exportedRow(maintenance)
    expect(row.OCM).toBe("OCM-ATUAL")
    expect(row["Origem dos dados cadastrais"]).toBe("Cadastro atual — sem registro histórico")
  })
})
