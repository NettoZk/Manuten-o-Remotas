import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { collection, query, where, getDocs } from "firebase/firestore"
import { getServerDb } from "@/lib/server/firebase"
import { createSessionToken, getSessionCookieName } from "@/lib/server/session"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password } = body || {}

    if (!username || !password) {
      return NextResponse.json({ error: "Nome de usuário e senha são obrigatórios." }, { status: 400 })
    }

    const db = getServerDb()
    const usersRef = collection(db, "users")
    const usersQuery = query(usersRef, where("username", "==", username.toLowerCase()))
    const snapshot = await getDocs(usersQuery)

    if (snapshot.empty) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 })
    }

    const userDoc = snapshot.docs[0]
    const userData = userDoc.data()

    if (!userData.ativo) {
      return NextResponse.json({ error: "Usuário desativado." }, { status: 403 })
    }

    const passwordMatch = await bcrypt.compare(password, userData.senhaHash)
    if (!passwordMatch) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 })
    }

    const user = {
      id: userDoc.id,
      nome: userData.nome,
      username: userData.username,
      tipo: userData.tipo,
      ativo: userData.ativo,
      criadoEm: userData.criadoEm?.toDate()?.toISOString() || new Date().toISOString(),
    }

    const token = createSessionToken(user)
    const response = NextResponse.json({ user })

    response.cookies.set({
      name: getSessionCookieName(),
      value: token,
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })

    return response
  } catch (error) {
    console.error("Erro ao criar sessão de login:", error)

    const isDebug = process.env.DEBUG_API_ERRORS === "true"
    const responseBody = {
      error: "Erro interno ao processar o login. Verifique as variáveis de ambiente e tente novamente.",
      ...(isDebug ? { details: error instanceof Error ? error.message : String(error) } : {}),
    }

    return NextResponse.json(responseBody, { status: 500 })
  }
}
