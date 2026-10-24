import { equipmentSchema, isWarrantySentSituation } from "./validation"
import type { EquipmentStatus } from "./types"

export const equipmentTemplate = [
  { numeroRemota: "12345", modelo: "RT-1000", anoFabricacao: "2024", OCM: "OCM001", operadoraAtual: "Claro", status: "nova", situacaoRemota: "Nova", observacoes: "" },
  { numeroRemota: "67890", modelo: "RT-2000", anoFabricacao: "2023", OCM: "OCM002", operadoraAtual: "Vivo", status: "usada", situacaoRemota: "Triagem", observacoes: "Equipamento de reposição" },
]
export function parseEquipmentRow(row: Record<string, unknown>) {
  const value = (...keys: string[]) => String(keys.map((key) => row[key]).find((item) => item !== undefined && item !== null && String(item).trim() !== "") ?? "").trim()
  const rawStatus = value("status", "Status").toLowerCase()
  const status: EquipmentStatus = ["usada", "used"].includes(rawStatus) ? "Usada" : "Nova"
  const rawSituation = value("situacaoRemota", "situacao_remota", "Situação", "situacao")
  const known: Record<string, string> = { nova: "Nova", new: "Nova", triagem: "Triagem", triage: "Triagem", manutencao: "Manutenção", manutenção: "Manutenção", maintenance: "Manutenção" }
  const data = {
    numeroRemota: value("numeroRemota", "numero_remota", "Número da Remota", "numero"), modelo: value("modelo", "Modelo"),
    anoFabricacao: value("anoFabricacao", "ano_fabricacao", "Ano de Fabricação", "ano"), lote: value("OCM", "ocm", "lote", "Lote"),
    operadoraAtual: value("operadoraAtual", "operadora_atual", "Operadora", "operadora"), status,
    situacaoRemota: rawSituation ? known[rawSituation.toLowerCase()] || rawSituation : status === "Nova" ? "Nova" : "Triagem",
    observacoes: value("observacoes", "Observações"),
  }
  const errors: string[] = []
  if (rawStatus && !["nova", "new", "usada", "used"].includes(rawStatus)) errors.push("Status inválido. Use nova ou usada")
  const fields = { numeroRemota: "Número da remota", modelo: "Modelo", anoFabricacao: "Ano de fabricação", lote: "OCM", operadoraAtual: "Operadora" } as const
  for (const [field, label] of Object.entries(fields)) if (!data[field as keyof typeof fields]) errors.push(`${label} é obrigatório`)
  if (data.situacaoRemota === "Manutenção") errors.push("Inicie a manutenção pela tela de manutenção; a importação não cria atendimentos")
  if (isWarrantySentSituation(data.situacaoRemota)) errors.push("O envio para garantia exige a conclusão de uma manutenção")
  const parsed = equipmentSchema.safeParse(data)
  if (!parsed.success && !errors.length) errors.push(parsed.error.issues[0].message)
  return { data, errors }
}
