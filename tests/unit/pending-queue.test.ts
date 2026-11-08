import { describe, expect, it } from "vitest"
import { pendingQueue } from "@/lib/pending-queue"
import type { Equipment, Maintenance } from "@/lib/types"
const now = new Date("2026-11-07T12:00:00Z"), old = new Date("2026-11-01T12:00:00Z")
const eq = (id: string, extra: Partial<Equipment> = {}) => ({ id, numeroRemota: id, modelo: "RT", lote: "OCM", dataCadastro: new Date(0), status: "Usada", situacaoRemota: "Recuperada", ...extra } as Equipment)
describe("fila operacional", () => {
  it("filtra recebimento pelo destinatário exibido, mesmo quando os envios têm o mesmo autor", () => {
    const equipments = ["Maria", "Carlos"].map((recipientName) => eq(recipientName, { placement: { id: recipientName, type: "polo", destination: "Polo A", recipientName, status: "em_transito", sentAt: old, sentBy: "João", sentUserId: "joao" } }))
    const rows = pendingQueue(equipments, [], now), maria = rows.find((row) => row.ownerName === "Maria")!
    expect(new Set(rows.map((row) => row.ownerId)).size).toBe(2)
    expect(pendingQueue(equipments, [], now, { ownerId: maria.ownerId }).map((row) => row.ownerName)).toEqual(["Maria"])
  })
  it("inclui cinco etapas, exclui arquivadas e ordena conhecidas antes das datas desconhecidas", () => {
    const rows = pendingQueue([eq("triagem", { situacaoRemota: "Triagem" }), eq("aberta", { manutencaoId: "m", emManutencaoPor: "tech" }), eq("separada", { garantia: { id: "g1", status: "separada", separadaEm: old, motivo: "Falha" } }), eq("enviada", { garantia: { id: "g2", status: "enviada", enviadaEm: old, motivo: "Falha" } }), eq("transito", { placement: { id: "p", type: "polo", destination: "Polo A", recipientName: "Equipe A", status: "em_transito", sentAt: old, sentBy: "Admin", sentUserId: "admin" } }), eq("inativa", { situacaoRemota: "Triagem", estadoRegistro: "inativo" })], [{ id: "m", equipmentId: "aberta", status: "em_andamento", dataEntrada: old, tecnicoId: "tech", tecnicoNome: "Técnico" } as Maintenance], now)
    expect(rows).toHaveLength(5); expect(new Set(rows.map((row) => row.stage)).size).toBe(5)
    expect(rows.at(-1)?.equipment.id).toBe("triagem"); expect(rows.at(-1)?.ageDays).toBeNull()
    expect(rows.find((row) => row.stage === "conclusao")?.ownerId).toBe("tech")
  })
  it("filtra antiguidade, etapa, responsável e destino sem atribuir prazo a data desconhecida", () => {
    const equipments = [eq("a", { situacaoRemota: "Triagem", situacaoAtualizadaEm: old }), eq("b", { situacaoRemota: "Triagem" })]
    expect(pendingQueue(equipments, [], now, { minDays: 5 }).map((row) => row.equipment.id)).toEqual(["a"])
    expect(pendingQueue(equipments, [], now, { stage: "retorno" })).toEqual([])
    expect(pendingQueue(equipments, [], now, { search: "inexistente" })).toEqual([])
  })
})
