import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import bcrypt from "bcryptjs"
import { Timestamp } from "firebase-admin/firestore"
import { getAdmin } from "@/lib/server/firebase-admin"
import { handleError, HttpError, json, readBody } from "@/lib/server/http"
import { userSchema } from "@/lib/validation"

export const runtime = "nodejs"
export async function GET() {
  try {
    const users = await getAdmin().db.collection("users").where("tipo", "==", "admin").limit(1).get()
    return json({ configured: !users.empty, enabled: Boolean(process.env.FIREBASE_SETUP_TOKEN) })
  } catch (error) { return handleError(error) }
}
export async function POST(request: Request) {
  try {
    const expected = process.env.FIREBASE_SETUP_TOKEN
    const supplied = request.headers.get("x-setup-token") || ""
    if (!expected || !timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(supplied).digest())) throw new HttpError(403, "Chave de configuração inválida")
    const data = userSchema.parse({ ...await readBody(request), tipo: "admin" })
    const { db } = getAdmin()
    const uid = randomUUID()
    const senhaHash = await bcrypt.hash(data.password, 12)
    await db.runTransaction(async (tx) => {
      const lock = db.collection("system").doc("setup")
      const [state, admins, existing] = await Promise.all([tx.get(lock), tx.get(db.collection("users").where("tipo", "==", "admin").limit(1)), tx.get(db.collection("users").where("username", "==", data.username).limit(1))])
      if (state.exists || !admins.empty) throw new HttpError(409, "O sistema já foi configurado")
      if (!existing.empty) throw new HttpError(409, "Este nome de usuário já está em uso")
      tx.create(lock, { configuredAt: Timestamp.now() })
      tx.create(db.collection("users").doc(uid), { nome: data.nome, username: data.username, senhaHash, tipo: "admin", ativo: true, criadoEm: Timestamp.now() })
    })
    return json({ success: true }, 201)
  } catch (error) { return handleError(error) }
}
