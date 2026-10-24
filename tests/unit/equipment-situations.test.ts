import { describe, expect, it } from "vitest"
import { equipmentFromDoc } from "@/lib/firestore-records"
import { parseEquipmentRow } from "@/lib/equipment-import"
import { isWarrantyImeiChangeSituation } from "@/lib/equipment-situations"
import { equipmentSchema, finalizationSchema, warrantyReturnSchema } from "@/lib/validation"

const obsolete = "IMEI alterado na garantia"
const equipment = { numeroRemota: "NOVO-IMEI", modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-1", operadoraAtual: "Claro", status: "Nova" }

describe("troca de IMEI como vínculo de garantia", () => {
  it("reconhece o rótulo legado e preserva as situações operacionais de garantia", () => {
    expect(isWarrantyImeiChangeSituation("  Imei  Alterado na Garantia  ")).toBe(true)
    expect(isWarrantyImeiChangeSituation("Número/IMEI substituído na garantia")).toBe(true)
    expect(isWarrantyImeiChangeSituation("Enviado para Garantia")).toBe(false)
    expect(isWarrantyImeiChangeSituation("Separado para garantia")).toBe(false)
    expect(isWarrantyImeiChangeSituation("Recuperada")).toBe(false)
  })

  it("preserva as referências entre os cadastros ao ler registros legados", () => {
    const mapped = equipmentFromDoc({ id: "nova", data: () => ({ ...equipment, situacaoRemota: obsolete, remotaAnteriorId: "antiga", remotaAnteriorNumero: "ANTIGO-IMEI", garantiaOrigemId: "garantia-1" }) })
    expect(mapped.situacaoRemota).toBeUndefined()
    expect(mapped.numeroRemota).toBe("NOVO-IMEI")
    expect(mapped.remotaAnteriorId).toBe("antiga")
    expect(mapped.remotaAnteriorNumero).toBe("ANTIGO-IMEI")
    expect(mapped.garantiaOrigemId).toBe("garantia-1")
  })

  it("recusa a classificação obsoleta no cadastro e na importação", () => {
    expect(equipmentSchema.safeParse({ ...equipment, situacaoRemota: obsolete }).success).toBe(false)
    expect(parseEquipmentRow({ ...equipment, situacaoRemota: obsolete }).errors).toContain("A troca de IMEI é registrada no retorno da garantia. Selecione uma situação operacional.")
  })

  it("exige uma situação operacional no retorno de garantia", () => {
    const returned = { ...equipment, garantiaId: "garantia-1", observacoesRetorno: "Fabricante devolveu equipamento com novo IMEI", situacaoRemota: obsolete }
    expect(warrantyReturnSchema.safeParse(returned).success).toBe(false)
    expect(warrantyReturnSchema.safeParse({ ...returned, status: "Usada", situacaoRemota: "Recuperada" }).success).toBe(true)
    expect(warrantyReturnSchema.safeParse({ ...returned, situacaoRemota: "Nova" }).success).toBe(true)
    expect(warrantyReturnSchema.safeParse({ ...returned, status: "Usada", situacaoRemota: "Nova" }).success).toBe(false)
  })

  it("recusa a classificação obsoleta na finalização de manutenção", () => {
    const result = finalizationSchema.safeParse({
      defeitoEncontrado: "Outro", defeitoEncontradoOutro: "Falha de comunicação", servicosRealizados: ["Teste de bancada"],
      operadoraDepois: "Claro", observacoes: "", situacaoRemota: obsolete,
      checklist: { leituraSIMCard: "OK", firmwareAtualizado: "OK", sinal: "OK", apnEnergiza: "OK", comunicacaoMedidor: "OK", comunicacaoIRIS: "OK" },
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["situacaoRemota"], message: "A troca de IMEI é registrada no retorno da garantia. Selecione uma situação operacional." }))
  })
})
