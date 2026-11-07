import "server-only"
import { NextResponse } from "next/server"
import { ZodError } from "zod"
import type { UserRole } from "@/lib/types"
import { getAdmin } from "./firebase-admin"

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export async function readBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new HttpError(415, "Envie dados em JSON")
  if (Number(request.headers.get("content-length")) > 32_768) throw new HttpError(413, "Solicitação muito grande")
  const reader = request.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 32_768) { await reader.cancel(); throw new HttpError(413, "Solicitação muito grande") }
      chunks.push(value)
    }
  }
  const body = Buffer.concat(chunks).toString("utf8")
  try { return JSON.parse(body) } catch { throw new HttpError(400, "Dados inválidos") }
}
export async function requireUser(request: Request, roles?: UserRole[]) {
  const bearer = request.headers.get("authorization")
  if (!bearer?.startsWith("Bearer ")) throw new HttpError(401, "Faça login para continuar")
  const { auth, db } = getAdmin()
  let uid: string
  try { uid = (await auth.verifyIdToken(bearer.slice(7), true)).uid } catch { throw new HttpError(401, "Sessão expirada. Faça login novamente") }
  const snapshot = await db.collection("users").doc(uid).get()
  const data = snapshot.data()
  if (!data?.ativo || !["admin", "tecnico", "usuario"].includes(data.tipo)) throw new HttpError(403, "Usuário desativado ou sem acesso")
  if (roles && !roles.includes(data.tipo)) throw new HttpError(403, "Você não tem permissão para esta ação")
  return { id: uid, nome: String(data.nome), username: String(data.username), tipo: data.tipo as UserRole, ativo: true, criadoEm: data.criadoEm?.toDate?.()?.toISOString() ?? null }
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })
}
export function handleError(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status)
  if (error instanceof ZodError) return json({ error: error.issues[0]?.message || "Dados inválidos" }, 400)
  console.error("Falha na operação do servidor:", error instanceof Error ? error.message : "Erro desconhecido")
  return json({ error: "Não foi possível concluir a operação. Tente novamente" }, 500)
}
