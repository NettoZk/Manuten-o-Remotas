import { describe, expect, it } from "vitest"
import { parseEquipmentRow } from "@/lib/equipment-import"
import { passwordSchema, usernameSchema, finalizationSchema } from "@/lib/validation"
import { searchEquipments, filterEquipmentRegistration } from "@/lib/equipment-search"
import { readBody } from "@/lib/server/http"
import type { Equipment } from "@/lib/types"

const row = { numeroRemota: "QA-1", modelo: "RT-1000", anoFabricacao: "2026", OCM: "OCM-QA", operadoraAtual: "Claro", status: "usada", situacaoRemota: "Triagem" }
function equipment(id: string, changes: Partial<Equipment> = {}): Equipment {
  return { id, numeroRemota: id, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-QA", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", dataCadastro: new Date("2026-01-01"), ...changes }
}

describe("importação e campos obrigatórios", () => {
  it("mantém a OCM no campo persistido lote e aceita o cabeçalho anterior", () => {
    expect(parseEquipmentRow(row).data.lote).toBe("OCM-QA")
    expect(parseEquipmentRow({ ...row, OCM: "", lote: "OCM-ANTIGA" }).data.lote).toBe("OCM-ANTIGA")
  })
  it.each(["numeroRemota", "modelo", "anoFabricacao", "OCM", "operadoraAtual"])("recusa importação sem %s", (field) => {
    expect(parseEquipmentRow({ ...row, [field]: "" }).errors.length).toBeGreaterThan(0)
  })
  it.each(["Manutenção", "Enviado para Garantia", "Separado para garantia", "Imei alterado na garantia"])("respeita o procedimento para %s", (situacaoRemota) => {
    expect(parseEquipmentRow({ ...row, situacaoRemota }).errors.length).toBeGreaterThan(0)
  })
  it("aceita situações operacionais distintas e rejeita condição inválida", () => {
    for (const name of ["Nova", "Triagem", "Recuperada", "Sucata", "Disponibilizado para estoque", "Disponibilizada para polo"]) expect(parseEquipmentRow({ ...row, situacaoRemota: name }).errors).toEqual([])
    expect(parseEquipmentRow({ ...row, status: "inexistente" }).errors).toContain("Status inválido. Use nova ou usada")
  })
  it("aplica limites de usuário e tamanho da senha em bytes", () => {
    expect(usernameSchema.safeParse("usuario.teste-1").success).toBe(true)
    expect(usernameSchema.safeParse("nome com espaço").success).toBe(false)
    expect(passwordSchema.safeParse("abc").success).toBe(false)
    expect(passwordSchema.safeParse("á".repeat(36)).success).toBe(true)
    expect(passwordSchema.safeParse("á".repeat(37)).success).toBe(false)
  })
  it("recusa finalização incompleta antes de alterar o equipamento", () => {
    expect(finalizationSchema.safeParse({ operadoraDepois: "Claro", situacaoRemota: "Recuperada" }).success).toBe(false)
  })
})

describe("consulta das remotas e cadeia de garantia", () => {
  const records = [equipment("antiga", { estadoRegistro: "inativo", substituidaPorId: "intermediaria" }), equipment("intermediaria", { estadoRegistro: "inativo", remotaAnteriorId: "antiga", substituidaPorId: "nova" }), equipment("nova", { remotaAnteriorId: "intermediaria", modelo: "Comunicação LTE" }), equipment("outra")]
  it("localiza toda a cadeia pelo número antigo e prioriza o número exato", () => {
    expect(searchEquipments(records, "antiga").map((item) => item.id)).toEqual(["antiga", "nova", "intermediaria"])
  })
  it("filtra arquivadas sem perder a consulta de vínculos", () => {
    expect(filterEquipmentRegistration(searchEquipments(records, "antiga"), "ativas").map((item) => item.id)).toEqual(["nova"])
    expect(filterEquipmentRegistration(records, "arquivadas")).toHaveLength(2)
  })
  it("pesquisa sem acento e aplica a situação selecionada", () => {
    expect(searchEquipments(records, "comunicacao").map((item) => item.id)).toEqual(["nova"])
    expect(searchEquipments(records, "", "Sucata")).toHaveLength(0)
  })
})

describe("contrato de requisições da API", () => {
  it("aceita JSON e recusa conteúdo inválido", async () => {
    expect(await readBody(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: '{"args":[]}' }))).toEqual({ args: [] })
    await expect(readBody(new Request("http://localhost", { method: "POST", body: "texto" }))).rejects.toMatchObject({ status: 415 })
    await expect(readBody(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400 })
  })
  it("limita o corpo mesmo quando o cliente não informa content-length", async () => {
    await expect(readBody(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "a".repeat(33_000) }) }))).rejects.toMatchObject({ status: 413 })
  })
})
