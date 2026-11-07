import bcrypt from "bcryptjs"
import { createHash } from "node:crypto"
import { Timestamp } from "firebase-admin/firestore"
import { z } from "zod"
import { getAdmin } from "@/lib/server/firebase-admin"
import { handleError, HttpError, json, readBody } from "@/lib/server/http"

export const runtime = "nodejs"
const credentials = z.object({ username: z.string().trim().toLowerCase().min(1).max(80), password: z.string().min(1).max(72) })
// Comparação equivalente para usuários inexistentes, sem expor sua existência.
const dummyHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
export async function POST(request: Request) {
  try {
    const { username, password } = credentials.parse(await readBody(request))
    const { auth, db } = getAdmin()
    const attemptRef = db.collection("login_attempts").doc(createHash("sha256").update(username).digest("hex"))
    const now = Date.now()
    await db.runTransaction(async (tx) => {
      const attempt = (await tx.get(attemptRef)).data()
      const sameWindow = attempt && attempt.startedAt.toMillis() > now - 15 * 60_000
      if (sameWindow && attempt.count >= 10) throw new HttpError(429, "Muitas tentativas. Tente novamente em 15 minutos")
      tx.set(attemptRef, { count: sameWindow ? attempt.count + 1 : 1, startedAt: sameWindow ? attempt.startedAt : Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + 15 * 60_000) })
    })
    const users = await db.collection("users").where("username", "==", username).limit(2).get()
    const user = users.size === 1 ? users.docs[0] : null
    const data = user?.data()
    const matches = await bcrypt.compare(password, data?.senhaHash || dummyHash)
    if (!user || !data?.ativo || !matches || !["admin", "tecnico", "usuario"].includes(data.tipo)) throw new HttpError(401, "Usuário ou senha inválidos")
    try { await auth.getUser(user.id) } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") throw error
      try { await auth.createUser({ uid: user.id, displayName: data.nome }) } catch (creationError) {
        if ((creationError as { code?: string }).code !== "auth/uid-already-exists") throw creationError
      }
    }
    const token = await auth.createCustomToken(user.id)
    await attemptRef.delete()
    return json({ token })
  } catch (error) { return handleError(error) }
}
