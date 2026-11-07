import { expect, it, vi } from "vitest"
vi.mock("@/lib/firebase", () => ({ db: {} }))
vi.mock("@/lib/api-client", () => ({ apiRequest: vi.fn() }))
import { apiRequest } from "@/lib/api-client"
import { getAllMaintenanceResults } from "@/lib/services"
import { warrantyWaitLabel } from "@/lib/warranty-wait"
import type { Equipment } from "@/lib/types"

it("exporta todas as páginas mesmo quando uma busca parcial ainda não encontrou correspondências", async () => {
  const cursor = { seconds: 1, nanoseconds: 5, id: "fim-da-primeira-leitura" }
  const api = vi.mocked(apiRequest)
  api.mockResolvedValueOnce({ result: { records: [], cursor } })
  api.mockResolvedValueOnce({ result: { records: [{ id: "atendimento", dataEntrada: "2026-10-20T12:00:00Z", dataFinalizacao: null }], cursor: null } })
  const result = await getAllMaintenanceResults({ numero: "filtro" })
  expect(result.map((item) => item.id)).toEqual(["atendimento"])
  expect(result[0].dataEntrada).toEqual(new Date("2026-10-20T12:00:00Z"))
  expect(api.mock.calls[1][1]).toEqual({ args: [{ numero: "filtro" }, cursor] })
})
it("calcula espera pela data da etapa correspondente e não inventa prazo para legado sem data", () => {
  const equipment = { garantia: { status: "separada", separadaEm: new Date("2026-10-01T12:00:00Z") } } as Equipment
  expect(warrantyWaitLabel(equipment, new Date("2026-10-04T13:00:00Z"))).toBe("3 dia(s) aguardando envio")
  expect(warrantyWaitLabel({ ...equipment, garantia: { ...equipment.garantia!, status: "enviada", enviadaEm: new Date("2026-10-03T12:00:00Z") } }, new Date("2026-10-04T13:00:00Z"))).toBe("1 dia(s) na garantia")
  expect(warrantyWaitLabel({ garantia: { status: "separada" } } as Equipment)).toBeNull()
})
