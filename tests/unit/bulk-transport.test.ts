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
  it("mantém sucessos quando uma linha posterior excede o limite", async () => {
    api.mockImplementation(async (_path, body) => ({ result: (body as { args: unknown[][] }).args[0].map(() => ({ ok: true })) }))
    const list = [...commands(20), ...commands(1, 30_000), ...commands(1)]
    const result = await runBulkMovements(list)
    expect(result).toHaveLength(22)
    expect(result.slice(0, 20).every((item) => item.ok)).toBe(true)
    expect(result[20]).toMatchObject({ ok: false, error: expect.stringContaining("excede") })
    expect(result[21].ok).toBe(true)
  })
  it("consulta o comprovante se a resposta da execução se perder", async () => {
    api.mockRejectedValueOnce(new Error("Conexão interrompida"))
    api.mockResolvedValueOnce({ result: { results: [{ ok: true }, { ok: false, error: "Impedimento confirmado" }] } })
    const result = await runBulkMovements(commands(2))
    expect(result).toEqual([{ ok: true }, { ok: false, error: "Impedimento confirmado" }])
    expect(api.mock.calls[1][0]).toContain("getBulkRun")
  })
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
    expect((await runBulkMovements(commands(2))).every((item) => !item.ok && item.uncertain && item.error?.includes("Sem conexão"))).toBe(true)
    api.mockResolvedValueOnce({ result: [] })
    expect((await runBulkMovements(commands(2))).every((item) => !item.ok && item.error?.includes("não confirmou"))).toBe(true)
  })
})
