import { describe, expect, it } from "vitest"
import { movementDiff } from "@/lib/movement-preview"
import { buildBulkPreview } from "@/lib/bulk-movements"
import type { Equipment } from "@/lib/types"
const equipment = { id: "eq", numeroRemota: "123", modelo: "RT", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", operationVersion: 4 } as Equipment
describe("prévia operacional", () => {
  it("mostra valores alterados e omite os iguais, conservando a versão conferida", () => {
    const row = buildBulkPreview("alterar_situacao", [{ numeroRemota: "123", situacaoRemota: "Recuperada" }], [equipment])[0]
    expect(row.command?.expectedVersion).toBe(4)
    const preview = movementDiff(equipment, { number: "123", operation: "updateEquipment", args: ["eq", { situacaoRemota: "Recuperada", modelo: "RT" }] })
    expect(preview.changes.find((field) => field.field === "situacaoRemota")).toMatchObject({ before: "Triagem", after: "Recuperada" })
    expect(preview.changes.some((field) => field.field === "modelo")).toBe(false)
  })
  it("explica criação vinculada no IMEI diferente e separa trânsito de situação técnica", () => {
    const returned = movementDiff(equipment, { number: "123", operation: "returnWarranty", args: ["eq", { numeroRemota: "456", modelo: "RT", status: "Nova", situacaoRemota: "Nova" }] })
    expect(returned.changes.find((field) => field.field === "numeroRemota")?.after).toBe("456")
    expect(returned.notes.join(" ")).toContain("arquivado")
    const dispatched = movementDiff(equipment, { number: "123", operation: "dispatchEquipment", args: ["eq", { type: "polo", destination: "Polo A", recipientName: "Equipe A" }, 4] })
    expect(dispatched.changes.some((field) => field.field === "situacaoRemota")).toBe(false)
    expect(dispatched.changes.find((field) => field.field === "placement.status")?.after).toBe("em_transito")
  })
})
