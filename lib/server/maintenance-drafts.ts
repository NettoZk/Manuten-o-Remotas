import "server-only"
import { Timestamp } from "firebase-admin/firestore"
import { z } from "zod"
import { maintenanceDraftSchema } from "@/lib/validation"
import { getAdmin } from "./firebase-admin"
import { HttpError } from "./http"

export async function saveDraft(maintenanceId: string, equipmentId: string, input: unknown, revision: unknown, userId: string) {
  const data = maintenanceDraftSchema.parse(input)
  const version = z.number().int().nonnegative().parse(revision)
  const { db } = getAdmin()
  const ref = db.collection("maintenances").doc(maintenanceId)
  return db.runTransaction(async (tx) => {
    const [maintenance, equipment] = await Promise.all([tx.get(ref), tx.get(db.collection("equipments").doc(equipmentId))])
    const current = maintenance.data()
    if (!current || !equipment.exists) throw new HttpError(404, "Atendimento não encontrado")
    if (current.tecnicoId !== userId) throw new HttpError(403, "Somente o responsável pode salvar este rascunho")
    if (current.status !== "em_andamento" || current.equipmentId !== equipmentId || equipment.data()?.manutencaoId !== maintenanceId || equipment.data()?.estadoRegistro === "inativo") throw new HttpError(409, "A manutenção precisa estar aberta e vinculada à remota")
    if ((current.draftVersion || 0) !== version) throw new HttpError(409, "Este rascunho foi atualizado em outra aba. Preserve seu texto e carregue a versão salva")
    const now = Timestamp.now()
    tx.update(ref, { draft: data, draftVersion: version + 1, draftUpdatedAt: now, draftUpdatedBy: userId })
    return { version: version + 1, updatedAt: now.toDate().toISOString() }
  })
}
