import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("@/lib/firebase", () => ({ db: {} }))
vi.mock("@/lib/api-client", () => ({ apiRequest: vi.fn() }))
import { apiRequest } from "@/lib/api-client"
import { runBulkMovements } from "@/lib/services"
import type { BulkCommand } from "@/lib/bulk-movements"

const api = vi.mocked(apiRequest)
beforeEach(() => { api.mockReset() })
function commands(count: number, length = 0): BulkCommand[] {
  return Array.from({ length: count }, (_, index) => ({ number: `Q${index}`, operation: "updateEquipmentSituationManual", args: [`id-${index}`, { situacaoRemota: "Recuperada", motivoAlteracaoSituacao: "x".repeat(length) }] }))
}
describe("envio dos lotes sem exceder o contrato da API", () => {
  it("divide por quantidade e confirma um resultado por linha", async () => {
    api.mockImplementation(async (_path, body) => ({ result: (body as { args: unknown[][] }).args[0].map(() => ({ ok: true })) }))
    const progress = vi.fn()
    expect(await runBulkMovements(commands(21), progress)).toHaveLength(21)
    expect(api).toHaveBeenCalledTimes(2)
    expect(progress.mock.calls.map(([count]) => count)).toEqual([20, 21])
  })
  it("divide por bytes quando os textos são longos", async () => {
    api.mockImplementation(async (_path, body) => {
      expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(28_000)
      return { result: (body as { args: unknown[][] }).args[0].map(() => ({ ok: true })) }
    })
    expect(await runBulkMovements(commands(4, 15_000))).toHaveLength(4)
    expect(api).toHaveBeenCalledTimes(4)
  })
  it("identifica falhas de envio e respostas incompletas sem presumir sucesso", async () => {
    api.mockRejectedValueOnce(new Error("Sem conexão"))
    expect(await runBulkMovements(commands(2))).toEqual([{ ok: false, error: "Sem conexão" }, { ok: false, error: "Sem conexão" }])
    api.mockResolvedValueOnce({ result: [] })
    expect((await runBulkMovements(commands(2))).every((item) => !item.ok && item.error?.includes("não confirmou"))).toBe(true)
  })
})
