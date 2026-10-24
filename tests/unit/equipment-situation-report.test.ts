import { describe, expect, it } from "vitest"
import { equipmentSituationReport, includeSituationCategories, situationColor, UNKNOWN_HISTORY, UNKNOWN_SITUATION } from "@/lib/equipment-situation-report"
import type { EquipmentSituationEvent } from "@/lib/types"

const now = new Date("2026-12-15T15:00:00Z")
const registeredAt = new Date("2026-09-01T12:00:00Z")
function equipment(id: string, situation = "Triagem", estadoRegistro: "ativo" | "inativo" = "ativo", dataCadastro = registeredAt, arquivadoEm?: Date) {
  return { id, situacaoRemota: situation, estadoRegistro, dataCadastro, arquivadoEm }
}
function event(equipmentId: string, situation: string, at: string, version = 1, active = true, registration = registeredAt): EquipmentSituationEvent {
  return { equipmentId, numeroRemota: equipmentId, situation, at: new Date(at), version, active, registeredAt: registration, source: "situation_changed" }
}
function rows(report: ReturnType<typeof equipmentSituationReport>) {
  return Object.fromEntries(report.situations.map((item) => [item.name, item.value]))
}

describe("situação mensal de todas as remotas", () => {
  it("conta cada cadastro ativo, inclusive sem manutenção e em manutenção", () => {
    const report = equipmentSituationReport([
      equipment("nova", "Nova"), equipment("triagem"), equipment("recuperada", "Recuperada"),
      equipment("em-atendimento", "Manutenção"), equipment("antiga", "Enviado para Garantia", "inativo"),
    ], [], "2026-12", now)
    expect(report.totalEquipments).toBe(4)
    expect(rows(report)).toEqual({ Nova: 1, Triagem: 1, Recuperada: 1, "Manutenção": 1 })
    expect(report.missingHistory).toBe(0)
  })

  it("usa o estado no fechamento e o carrega para meses sem movimentação", () => {
    const history = [event("a", "Triagem", "2026-09-01T12:00:00Z"), event("a", "Recuperada", "2026-11-04T12:00:00Z", 2)]
    const equipments = [equipment("a", "Recuperada")]
    expect(rows(equipmentSituationReport(equipments, history, "2026-09", now))).toEqual({ Triagem: 1 })
    expect(rows(equipmentSituationReport(equipments, history, "2026-10", now))).toEqual({ Triagem: 1 })
    expect(rows(equipmentSituationReport(equipments, history, "2026-11", now))).toEqual({ Recuperada: 1 })
  })

  it("conta só a última situação quando há várias mudanças no mesmo mês", () => {
    const history = [event("a", "Triagem", "2026-10-01T12:00:00Z"), event("a", "Manutenção", "2026-10-05T12:00:00Z", 2), event("a", "Recuperada", "2026-10-10T12:00:00Z", 3)]
    const report = equipmentSituationReport([equipment("a", "Recuperada")], history, "2026-10", now)
    expect(report.totalEquipments).toBe(1)
    expect(rows(report)).toEqual({ Recuperada: 1 })
  })

  it("desempata alterações no mesmo milissegundo pela versão da transação", () => {
    const history = [event("a", "Recuperada", "2026-10-10T12:00:00Z", 3), event("a", "Triagem", "2026-10-10T12:00:00Z", 1)]
    expect(rows(equipmentSituationReport([equipment("a")], history, "2026-10", now))).toEqual({ Recuperada: 1 })
  })

  it("respeita a virada do mês no horário de Brasília", () => {
    const history = [event("a", "Triagem", "2026-11-01T02:59:59.999Z"), event("a", "Recuperada", "2026-11-01T03:00:00.000Z", 2)]
    expect(rows(equipmentSituationReport([equipment("a")], history, "2026-10", now))).toEqual({ Triagem: 1 })
    expect(rows(equipmentSituationReport([equipment("a")], history, "2026-11", now))).toEqual({ Recuperada: 1 })
  })

  it("não coloca um cadastro novo em meses anteriores", () => {
    const registered = new Date("2026-11-01T03:00:00Z")
    const equipments = [equipment("a", "Nova", "ativo", registered)]
    const history = [event("a", "Nova", registered.toISOString(), 1, true, registered)]
    expect(equipmentSituationReport(equipments, history, "2026-10", now).totalEquipments).toBe(0)
  })

  it("preserva o IMEI original antes do arquivamento e conta só o substituto depois", () => {
    const returnedAt = new Date("2026-11-05T12:00:00Z")
    const equipments = [equipment("original", "Enviado para Garantia", "inativo", registeredAt, returnedAt), equipment("substituta", "Recuperada", "ativo", returnedAt)]
    const history = [event("original", "Enviado para Garantia", "2026-09-20T12:00:00Z"), event("original", "Enviado para Garantia", returnedAt.toISOString(), 2, false), event("substituta", "Recuperada", returnedAt.toISOString(), 1, true, returnedAt)]
    expect(rows(equipmentSituationReport(equipments, history, "2026-10", now))).toEqual({ "Enviado para Garantia": 1 })
    expect(rows(equipmentSituationReport(equipments, history, "2026-11", now))).toEqual({ Recuperada: 1 })
    expect(equipmentSituationReport(equipments, history, "2026-12", now).totalEquipments).toBe(1)
  })

  it("mantém meses anteriores mesmo quando um cadastro foi excluído", () => {
    const history = [event("excluida", "Triagem", "2026-09-01T12:00:00Z"), event("excluida", "Triagem", "2026-11-03T12:00:00Z", 2, false)]
    expect(rows(equipmentSituationReport([], history, "2026-10", now))).toEqual({ Triagem: 1 })
    expect(equipmentSituationReport([], history, "2026-11", now).totalEquipments).toBe(0)
    expect(equipmentSituationReport([], history, "2026-12", now).totalEquipments).toBe(0)
  })

  it("não usa a situação atual para inventar histórico anterior à primeira observação", () => {
    const history = [event("legada", "Recuperada", "2026-12-01T12:00:00Z")]
    const report = equipmentSituationReport([equipment("legada", "Recuperada")], history, "2026-10", now)
    expect(rows(report)).toEqual({ [UNKNOWN_HISTORY]: 1 })
    expect(report.missingHistory).toBe(1)
    expect(rows(equipmentSituationReport([equipment("legada", "Recuperada")], history, "2026-12", now))).toEqual({ Recuperada: 1 })
  })

  it("considera a data de arquivamento dos registros antigos sem eventos no período", () => {
    const archivedAt = new Date("2026-10-15T12:00:00Z")
    const equipments = [equipment("legada", "Triagem", "inativo", registeredAt, archivedAt)]
    expect(equipmentSituationReport(equipments, [], "2026-10", now).totalEquipments).toBe(0)
    expect(rows(equipmentSituationReport(equipments, [], "2026-09", now))).toEqual({ [UNKNOWN_HISTORY]: 1 })
  })

  it("preserva a data de arquivamento de um registro legado depois da exclusão", () => {
    const history = [{ ...event("legada", "Triagem", "2026-12-01T12:00:00Z", 1, false), archivedAt: new Date("2026-10-01T12:00:00Z") }]
    expect(equipmentSituationReport([], history, "2026-11", now).totalEquipments).toBe(0)
  })

  it("não inventa existência histórica quando falta a data de cadastro", () => {
    expect(equipmentSituationReport([equipment("sem-data", "Nova", "ativo", new Date(0))], [], "2026-10", now).totalEquipments).toBe(0)
  })

  it("identifica cadastros atuais sem situação", () => {
    expect(rows(equipmentSituationReport([equipment("a", "  ")], [], "2026-12", now))).toEqual({ [UNKNOWN_SITUATION]: 1 })
  })

  it("mostra categorias ativas zeradas sem alterar os totais", () => {
    const result = includeSituationCategories([{ name: "Triagem", value: 30 }, { name: "Situação antiga", value: 1 }], [{ nome: "Triagem", ativo: true }, { nome: "Sucata", ativo: true }, { nome: "Desativada", ativo: false }])
    expect(result).toContainEqual({ name: "Sucata", value: 0 })
    expect(result).toContainEqual({ name: "Situação antiga", value: 1 })
    expect(result.some((item) => item.name === "Desativada")).toBe(false)
    expect(result.reduce((total, item) => total + item.value, 0)).toBe(31)
  })

  it("mantém a cor de cada situação entre meses", () => {
    expect(situationColor("Recuperada")).toBe("#3b82f6")
    expect(situationColor("Manutenção")).toBe(situationColor("Manutencao"))
    expect(situationColor("Disponibilizado para estoque")).toBe("#06b6d4")
  })
})
