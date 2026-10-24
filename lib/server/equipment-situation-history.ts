import "server-only"
import { Timestamp, type DocumentData, type DocumentReference, type Transaction } from "firebase-admin/firestore"
import { equipmentSituationReport } from "@/lib/equipment-situation-report"
import type { Equipment, EquipmentSituationEvent } from "@/lib/types"
import { getAdmin } from "./firebase-admin"

const historyCollection = "equipment_situation_history"
type State = DocumentData

// Só escreve: todos os reads/validações da operação precisam ocorrer antes.
// Estado e histórico são confirmados na mesma transação, inclusive na troca de IMEI.
export function recordEquipmentSituation(tx: Transaction, ref: DocumentReference, before: State | undefined, after: State | undefined, source: string, at = Timestamp.now()) {
  const { db } = getAdmin()
  let version = Number(before?.situationHistoryVersion) || 0
  const since = before?.situationHistorySince || at
  function append(state: State, eventSource: string, active: boolean) {
    version++
    tx.create(db.collection(historyCollection).doc(), {
      equipmentId: ref.id, numeroRemota: String(state.numeroRemota || ""), at,
      registeredAt: state.dataCadastro || at, situation: state.situacaoRemota?.trim() || null,
      archivedAt: state.arquivadoEm || (!active ? at : null),
      active, version, source: eventSource,
    })
  }
  if (before && !before.situationHistorySince) append(before, "baseline", before.estadoRegistro !== "inativo")
  if (source !== "baseline") append(after || before!, source, Boolean(after && after.estadoRegistro !== "inativo"))
  return { situationHistorySince: since, situationHistoryVersion: version }
}

// Registra o estado observado dos cadastros antigos uma única vez, sem inventar
// datas anteriores. O dashboard e a primeira alteração podem chamar em paralelo.
export async function getEquipmentSituationReport(month: string) {
  const { db } = getAdmin()
  const existing = await db.collection("equipments").get()
  const untracked = existing.docs.filter((doc) => !doc.data().situationHistorySince)
  for (let offset = 0; offset < untracked.length; offset += 15) {
    await Promise.all(untracked.slice(offset, offset + 15).map((doc) => db.runTransaction(async (tx) => {
      const current = await tx.get(doc.ref)
      if (!current.exists || current.data()!.situationHistorySince) return
      tx.update(doc.ref, recordEquipmentSituation(tx, doc.ref, current.data(), current.data(), "baseline"))
    })))
  }
  const [equipments, history] = await Promise.all([
    db.collection("equipments").get(), db.collection(historyCollection).get(),
  ])
  const date = (value: Timestamp | undefined) => value?.toDate?.() || new Date(0)
  return equipmentSituationReport(equipments.docs.map((doc) => {
    const data = doc.data()
    return { id: doc.id, dataCadastro: date(data.dataCadastro), situacaoRemota: data.situacaoRemota,
      estadoRegistro: data.estadoRegistro, arquivadoEm: data.arquivadoEm?.toDate?.() } as Equipment
  }), history.docs.map((doc) => {
    const data = doc.data()
    return { ...data, at: date(data.at), registeredAt: date(data.registeredAt), archivedAt: data.archivedAt?.toDate?.() } as EquipmentSituationEvent
  }), month)
}
