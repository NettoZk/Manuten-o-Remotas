import type { Equipment, Maintenance } from "./types"
import { normalizedReferenceName } from "./validation"
export type PendingStage = "avaliacao" | "conclusao" | "envio" | "retorno" | "recebimento"
export const pendingLabels: Record<PendingStage, string> = { avaliacao: "Avaliação técnica", conclusao: "Conclusão de manutenção", envio: "Saída para garantia", retorno: "Retorno da garantia", recebimento: "Recebimento no destino" }
export interface PendingItem { equipment: Equipment; stage: PendingStage; since: Date | null; ageDays: number | null; ownerId: string; ownerName: string; dateSource: string }
export interface PendingFilters { stage?: string; minDays?: number; ownerId?: string; search?: string }
function valid(value?: Date): Date | null { return value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() > 0 ? value : null }
export function pendingQueue(equipments: Equipment[], maintenances: Maintenance[], now = new Date(), filters: PendingFilters = {}): PendingItem[] {
  const open = new Map(maintenances.filter((item) => item.status === "em_andamento").map((item) => [item.equipmentId, item]))
  return equipments.flatMap((equipment): PendingItem[] => {
    if (equipment.estadoRegistro === "inativo" || equipment.cadastroAnulado) return []
    const maintenance = open.get(equipment.id)
    let stage: PendingStage, since: Date | null = null, ownerId = "", ownerName = "Equipe técnica", dateSource = "Data não registrada"
    if (equipment.placement?.status === "em_transito") { stage = "recebimento"; since = valid(equipment.placement.sentAt); ownerId = `recipient:${normalizedReferenceName(equipment.placement.recipientName)}`; ownerName = equipment.placement.recipientName; dateSource = "Saída física" }
    else if (equipment.garantia?.status === "enviada") { stage = "retorno"; since = valid(equipment.garantia.enviadaEm); dateSource = "Envio à garantia" }
    else if (equipment.garantia?.status === "separada") { stage = "envio"; since = valid(equipment.garantia.separadaEm); dateSource = "Separação após avaliação" }
    else if (maintenance || equipment.manutencaoId || equipment.emManutencaoPor) { stage = "conclusao"; since = valid(maintenance?.dataEntrada || equipment.emManutencaoDesde); ownerId = maintenance?.tecnicoId || equipment.emManutencaoPor || ""; ownerName = maintenance?.tecnicoNome || equipment.emManutencaoNome || "Responsável não registrado"; dateSource = "Abertura da manutenção" }
    else if (normalizedReferenceName(equipment.situacaoRemota || "") === "triagem") { stage = "avaliacao"; since = valid(equipment.situacaoAtualizadaEm); dateSource = "Mudança para Triagem"; if (!since) { since = valid(equipment.dataCadastro); dateSource = "Desde cadastro; mudança de situação sem data registrada" } }
    else return []
    const ageDays = since ? Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86400000)) : null
    if ((filters.stage && stage !== filters.stage) || (filters.ownerId && ownerId !== filters.ownerId) || ((filters.minDays || 0) > 0 && (ageDays === null || ageDays < filters.minDays!))) return []
    const search = normalizedReferenceName(filters.search || "")
    if (search && !normalizedReferenceName([equipment.numeroRemota, equipment.modelo, equipment.lote, ownerName, equipment.placement?.destination].join(" ")).includes(search)) return []
    return [{ equipment, stage, since, ageDays, ownerId, ownerName, dateSource: since ? dateSource : "Data não registrada" }]
  }).sort((a, b) => (a.since?.getTime() ?? Infinity) - (b.since?.getTime() ?? Infinity) || a.equipment.numeroRemota.localeCompare(b.equipment.numeroRemota))
}
