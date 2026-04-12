import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { collection, query, where, getDocs, setDoc, doc, Timestamp } from "firebase/firestore"
import { db } from "@/lib/server/firebase"
import { isSetupAllowed } from "@/lib/server/session"

interface SetupRequest {
  nome?: string
  username?: string
  password?: string
}

export async function GET() {
  if (!isSetupAllowed()) {
    return NextResponse.json({ error: "Setup não está disponível." }, { status: 403 })
  }

  const usersRef = collection(db, "users")
  const q = query(usersRef, where("tipo", "==", "admin"))
  const snapshot = await getDocs(q)

  return NextResponse.json({ hasAdmin: !snapshot.empty })
}

export async function POST(request: Request) {
  if (!isSetupAllowed()) {
    return NextResponse.json({ error: "Setup não está disponível." }, { status: 403 })
  }

  const body = (await request.json()) as SetupRequest
  const { nome, username, password } = body

  if (!nome || !username || !password) {
    return NextResponse.json({ error: "Nome, usuário e senha são obrigatórios." }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "A senha deve ter pelo menos 6 caracteres." }, { status: 400 })
  }

  const usersRef = collection(db, "users")
  const adminQuery = query(usersRef, where("tipo", "==", "admin"))
  const adminSnapshot = await getDocs(adminQuery)
  if (!adminSnapshot.empty) {
    return NextResponse.json({ error: "Já existe um administrador cadastrado." }, { status: 409 })
  }

  const usernameQuery = query(usersRef, where("username", "==", username.toLowerCase()))
  const existingSnapshot = await getDocs(usernameQuery)
  if (!existingSnapshot.empty) {
    return NextResponse.json({ error: "Este nome de usuário já está em uso." }, { status: 409 })
  }

  const senhaHash = await bcrypt.hash(password, 10)
  const userId = `admin_${Date.now()}`

  await setDoc(doc(db, "users", userId), {
    nome,
    username: username.toLowerCase(),
    senhaHash,
    tipo: "admin",
    ativo: true,
    criadoEm: Timestamp.now(),
  })

  return NextResponse.json({ success: true })
}
