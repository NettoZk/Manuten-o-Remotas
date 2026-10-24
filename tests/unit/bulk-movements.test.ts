import { describe, expect, it } from "vitest"
import { buildBulkPreview, checklistKeys, movementTemplate } from "@/lib/bulk-movements"
import type { Equipment } from "@/lib/types"

const equipment: Equipment = { id: "qa-1", numeroRemota: "IMEI-1", modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-1", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", dataCadastro: new Date("2026-01-01") }
const sent: Equipment = { ...equipment, situacaoRemota: "Enviado para Garantia", garantia: { id: "warranty-1", status: "enviada", enviadaEm: new Date(), motivo: "Falha persistente" } }
describe("pré-validação dos lotes por seleção e planilha", () => {
  it("prepara movimentos diferentes e rejeita duplicidade, remota ausente e situação igual", () => {
    const preview = buildBulkPreview("alterar_situacao", [
      { numeroRemota: "IMEI-1", situacaoRemota: "Recuperada" }, { numeroRemota: "IMEI-1", situacaoRemota: "Sucata" }, { numeroRemota: "AUSENTE", situacaoRemota: "Recuperada" },
    ], [equipment])
    expect(preview[0].command?.operation).toBe("updateEquipmentSituationManual")
    expect(preview[1].errors.join()).toContain("repetido")
    expect(preview[2].errors.join()).toContain("não encontrada")
    expect(buildBulkPreview("alterar_situacao", [{ numeroRemota: "IMEI-1", situacaoRemota: "Triagem" }], [equipment])[0].errors.join()).toContain("igual")
  })
  it("não permite mudar situação para pular os procedimentos de garantia ou manutenção", () => {
    for (const situation of ["Manutenção", "Enviado para Garantia", "Imei alterado na garantia"]) expect(buildBulkPreview("alterar_situacao", [{ numeroRemota: "IMEI-1", situacaoRemota: situation }], [equipment])[0].command).toBeUndefined()
  })
  it("exclui arquivadas e bloqueadas e prepara abertura com defeito Outro descrito", () => {
    expect(buildBulkPreview("arquivar", [{ numeroRemota: "IMEI-1" }], [{ ...equipment, estadoRegistro: "inativo" }])[0].errors.join()).toContain("arquivada")
    expect(buildBulkPreview("iniciar_manutencao", [{ numeroRemota: "IMEI-1", defeitoRelatado: "Outro" }], [equipment])[0].command).toBeUndefined()
    expect(buildBulkPreview("iniciar_manutencao", [{ numeroRemota: "IMEI-1", defeitoRelatado: "Outro", defeitoRelatadoOutro: "Defeito observado em bancada" }], [equipment])[0].command?.operation).toBe("createMaintenance")
  })
  it("exige manutenção, campos finais e separa vários serviços por ponto e vírgula", () => {
    const row = { numeroRemota: "IMEI-1", defeitoEncontrado: "Sem sinal", servicosRealizados: "Troca de chip;Atualização de Firmware", operadoraDepois: "Claro", situacaoRemota: "Recuperada", ...Object.fromEntries(checklistKeys.map((key) => [key, "Não testado"])) }
    expect(buildBulkPreview("finalizar_manutencao", [row], [equipment])[0].command).toBeUndefined()
    const result = buildBulkPreview("finalizar_manutencao", [row], [{ ...equipment, manutencaoId: "m1" }])[0]
    expect(result.command?.args[0]).toBe("m1")
    expect(result.command?.args[2]).toMatchObject({ servicosRealizados: ["Troca de chip", "Atualização de Firmware"] })
  })
  it("trata retorno com o mesmo IMEI obrigatoriamente como usado", () => {
    const row = { numeroRemota: "IMEI-1", situacaoRemota: "Recuperada", observacoesRetorno: "Retornou reparada e conferida pela equipe" }
    expect(buildBulkPreview("retornar_garantia", [row], [sent])[0].command?.args[1]).toMatchObject({ status: "Usada", numeroRemota: "IMEI-1" })
    expect(buildBulkPreview("retornar_garantia", [{ ...row, condicaoRetorno: "Nova", situacaoRemota: "Nova" }], [sent])[0].errors.join()).toContain("mesmo IMEI")
  })
  it("diferencia troca interna de IMEI e recebimento de equipamento novo", () => {
    const row = { numeroRemota: "IMEI-1", novoNumeroRemota: "IMEI-2", observacoesRetorno: "IMEI recebido conferido na análise interna" }
    expect(buildBulkPreview("retornar_garantia", [row], [sent])[0].errors.join()).toContain("condição")
    expect(buildBulkPreview("retornar_garantia", [{ ...row, condicaoRetorno: "Nova" }], [sent])[0].command?.args[1]).toMatchObject({ numeroRemota: "IMEI-2", status: "Nova", situacaoRemota: "Nova" })
    expect(buildBulkPreview("retornar_garantia", [{ ...row, condicaoRetorno: "Usada", situacaoRemota: "Recuperada" }], [sent])[0].command?.args[1]).toMatchObject({ status: "Usada", situacaoRemota: "Recuperada" })
    expect(buildBulkPreview("retornar_garantia", [{ ...row, condicaoRetorno: "Nova", situacaoRemota: "Recuperada" }], [sent])[0].command).toBeUndefined()
  })
  it("rejeita novo IMEI repetido e conserva os dados individuais nos modelos", () => {
    const other = { ...sent, id: "qa-2", numeroRemota: "IMEI-2" }
    const preview = buildBulkPreview("retornar_garantia", [sent, other].map((item) => ({ numeroRemota: item.numeroRemota, novoNumeroRemota: "IMEI-NOVO", condicaoRetorno: "Nova", observacoesRetorno: "Equipamento novo recebido e conferido" })), [sent, other])
    expect(preview[0].command).toBeDefined()
    expect(preview[1].errors.join()).toContain("repetido")
    expect(movementTemplate("retornar_garantia", [sent])[0]).toMatchObject({ numeroRemota: "IMEI-1", OCM: "OCM-1", modelo: "RT-1000", condicaoRetorno: "Usada" })
  })
})
