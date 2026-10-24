import { auth } from "./firebase"

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export async function apiRequest<T>(path: string, body?: unknown, authenticated = true): Promise<T> {
  const token = authenticated ? await auth.currentUser?.getIdToken() : undefined
  if (authenticated && !token) throw new Error("Faça login para continuar")
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json()
  if (!response.ok) throw new ApiError(data.error || "Não foi possível concluir a operação", response.status)
  return data as T
}
