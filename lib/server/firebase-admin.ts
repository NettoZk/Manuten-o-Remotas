import "server-only"
import { readFileSync } from "node:fs"
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

function getCredential(projectId: string) {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return cert({ projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") })
  }
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credentialPath) {
    let type: unknown
    try { type = JSON.parse(readFileSync(credentialPath, "utf8")).type }
    catch { throw new Error("Não foi possível ler o arquivo de credenciais do servidor") }
    // cert usa a chave privada local. ADC usa assinatura IAM remota nesta versão do SDK.
    if (type === "service_account") return cert(credentialPath)
  }
  return applicationDefault()
}

export function getAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!projectId) throw new Error("Configure FIREBASE_PROJECT_ID no servidor")
  const emulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST)
  if (process.env.NODE_ENV === "production" && emulator) throw new Error("Emuladores não podem ser usados em produção")
  const app = getApps().find((item) => item.name === "remotas-server") || initializeApp({
    projectId,
    ...(!emulator ? { credential: getCredential(projectId) } : {}),
  }, "remotas-server")
  return { auth: getAuth(app), db: getFirestore(app) }
}
