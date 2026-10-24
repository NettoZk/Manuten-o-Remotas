import { auth } from "./firebase"
import { readApiResponse } from "./api-response"
export { ApiError } from "./api-response"

export async function apiRequest<T>(path: string, body?: unknown, authenticated = true): Promise<T> {
  const token = authenticated ? await auth.currentUser?.getIdToken() : undefined
  if (authenticated && !token) throw new Error("Faça login para continuar")
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  return readApiResponse<T>(response)
}
