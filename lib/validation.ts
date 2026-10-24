import { z } from "zod"

const text = z.string().trim().min(1, "Preencha os campos obrigatórios")
export const roleSchema = z.enum(["admin", "tecnico", "usuario"])
export const usernameSchema = z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9._-]+$/, "Use letras, números, ponto, hífen ou sublinhado no usuário")
export const passwordSchema = z.string().min(6).max(72).refine((value) => new TextEncoder().encode(value).length <= 72, "A senha deve ter no máximo 72 bytes")
export const userSchema = z.object({ username: usernameSchema, password: passwordSchema, nome: text.max(160), tipo: roleSchema })
export function isMaintenanceSituation(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "manutencao" }
export function isWarrantySentSituation(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ")
  return normalized === "em garantia" || /^enviad[ao]s? (para |a |para a )?garantia$/.test(normalized)
}
export const equipmentSchema = z.object({
  numeroRemota: text.max(100), modelo: text.max(160), anoFabricacao: text.max(20),
  // O nome persistido continua sendo lote; seu significado na interface é OCM.
  lote: text.max(100), operadoraAtual: text.max(100), status: z.enum(["Nova", "Usada"]),
  situacaoRemota: text.max(100).optional(), observacoes: z.string().trim().max(5000).optional(),
})
export const warrantyReturnSchema = equipmentSchema.extend({
  garantiaId: text.max(200).refine((value) => !value.includes("/"), "Identificador inválido"),
  situacaoRemota: text.max(100).refine((value) => !isMaintenanceSituation(value) && !isWarrantySentSituation(value), "Escolha uma situação de retorno fora de manutenção e garantia"),
  observacoesRetorno: text.min(10, "Descreva o retorno com pelo menos 10 caracteres").max(2000),
})
export type WarrantyReturnInput = z.infer<typeof warrantyReturnSchema>
export const checklistSchema = z.object({
  leituraSIMCard: z.enum(["OK", "Falha", "Não testado"]),
  firmwareAtualizado: z.enum(["OK", "Falha", "Não testado"]),
  sinal: z.enum(["OK", "Falha", "Não testado"]),
  apnEnergiza: z.enum(["OK", "Falha", "Não testado"]),
  comunicacaoMedidor: z.enum(["OK", "Falha", "Não testado"]),
  comunicacaoIRIS: z.enum(["OK", "Falha", "Não testado"]),
})
export const finalizationSchema = z.object({
  defeitoEncontrado: text.max(160), defeitoEncontradoOutro: z.string().trim().max(2000).optional(),
  servicosRealizados: z.array(text.max(160)).min(1, "Selecione pelo menos um serviço").max(100),
  servicosRealizadosOutro: z.string().trim().max(2000).optional(),
  operadoraDepois: text.max(100), checklist: checklistSchema,
  observacoes: z.string().trim().max(5000),
  situacaoRemota: text.max(100).refine((value) => !isMaintenanceSituation(value), "Escolha uma situação final diferente de Manutenção"),
  motivoGarantia: z.string().trim().max(2000).optional(),
}).superRefine((data, ctx) => {
  if (isWarrantySentSituation(data.situacaoRemota) && (data.motivoGarantia?.length || 0) < 10) ctx.addIssue({ code: "custom", path: ["motivoGarantia"], message: "Descreva o motivo do envio para garantia com pelo menos 10 caracteres" })
  if (data.defeitoEncontrado === "Outro" && !data.defeitoEncontradoOutro) ctx.addIssue({ code: "custom", path: ["defeitoEncontradoOutro"], message: "Descreva o defeito encontrado" })
  if (data.servicosRealizados.includes("Outro") && !data.servicosRealizadosOutro) ctx.addIssue({ code: "custom", path: ["servicosRealizadosOutro"], message: "Descreva o serviço realizado" })
})
export type FinalizationInput = z.infer<typeof finalizationSchema>

export function cleanUndefined<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
}
