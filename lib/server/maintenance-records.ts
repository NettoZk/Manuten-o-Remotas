import "server-only"
import type { DocumentData, Timestamp } from "firebase-admin/firestore"

export function captureEquipmentSnapshot(equipment: DocumentData, at: Timestamp, source: "opening" | "closing") {
  const fields = ["numeroRemota", "modelo", "anoFabricacao", "lote", "operadoraAtual", "status"]
  return { ...Object.fromEntries(fields.filter((key) => equipment[key] !== undefined).map((key) => [key, equipment[key]])), capturedAt: at, source }
}
