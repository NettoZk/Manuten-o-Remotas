export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  const fallback = response.ok
    ? "O servidor retornou uma resposta vazia ou inválida. Tente novamente ou contate o responsável pelo sistema."
    : `Não foi possível concluir a operação (HTTP ${response.status}). Tente novamente ou contate o responsável pelo sistema.`
  let data: unknown
  try {
    const text = await response.text()
    data = JSON.parse(text)
  } catch {
    throw new ApiError(fallback, response.status)
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError(fallback, response.status)
  if (!response.ok) {
    const error = "error" in data && typeof data.error === "string" ? data.error.trim() : ""
    throw new ApiError(error || fallback, response.status)
  }
  return data as T
}
