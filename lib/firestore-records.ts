import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore"
import type { Equipment, Maintenance } from "./types"
import { operationalSituation } from "./equipment-situations"

function date(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate()
  return undefined
}
type RecordDoc = Pick<QueryDocumentSnapshot<DocumentData>, "id" | "data">
export function equipmentFromDoc(doc: RecordDoc): Equipment {
  const data = doc.data()
  return { ...data, id: doc.id, situacaoRemota: operationalSituation(data.situacaoRemota), dataCadastro: date(data.dataCadastro) || new Date(0),
    situacaoAtualizadaEm: date(data.situacaoAtualizadaEm), ultimaEdicaoEm: date(data.ultimaEdicaoEm),
    arquivadoEm: date(data.arquivadoEm), emManutencaoDesde: date(data.emManutencaoDesde),
    garantia: data.garantia ? { ...data.garantia, separadaEm: date(data.garantia.separadaEm), enviadaEm: date(data.garantia.enviadaEm), retornadaEm: date(data.garantia.retornadaEm), canceladaEm: date(data.garantia.canceladaEm) } : undefined,
    emManutencaoPor: data.emManutencaoPor || undefined, emManutencaoNome: data.emManutencaoNome || undefined,
    manutencaoId: data.manutencaoId || undefined, estadoRegistro: data.estadoRegistro || "ativo",
  } as Equipment
}
export function maintenanceFromDoc(doc: RecordDoc): Maintenance {
  const data = doc.data()
  return { ...data, id: doc.id, dataEntrada: date(data.dataEntrada) || new Date(0), dataFinalizacao: date(data.dataFinalizacao) || null } as Maintenance
}
