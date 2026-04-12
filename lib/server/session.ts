import { createHmac, timingSafeEqual } from "crypto"

const SESSION_COOKIE_NAME = "manutencao_session"

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is required for session management. Define it in your environment."
    )
  }
  return secret
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  return Buffer.from(padded, "base64").toString("utf8")
}

export interface SessionPayload {
  id: string
  nome: string
  username: string
  tipo: string
  ativo: boolean
  criadoEm: string
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME
}

export function isSetupAllowed(): boolean {
  return String(process.env.ENABLE_SETUP_ROUTE).toLowerCase() === "true"
}

export function createSessionToken(payload: SessionPayload): string {
  const secret = getSessionSecret()
  const body = encodeBase64Url(JSON.stringify(payload))
  const signature = createHmac("sha256", secret).update(body).digest("base64")
  const signatureUrl = signature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${body}.${signatureUrl}`
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [body, signature] = token.split(".")
    if (!body || !signature) {
      return null
    }

    const secret = getSessionSecret()
    const expectedSignature = createHmac("sha256", secret).update(body).digest("base64")
    const expectedUrl = expectedSignature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

    const signatureBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expectedUrl)
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null
    }

    const payload = JSON.parse(decodeBase64Url(body)) as SessionPayload
    return payload
  } catch {
    return null
  }
}
