import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getSessionCookieName, verifySessionToken } from "@/lib/server/session"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getSessionCookieName())?.value

  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const session = verifySessionToken(token)
  if (!session) {
    const response = NextResponse.json({ user: null }, { status: 401 })
    response.cookies.delete({ name: getSessionCookieName(), path: "/" })
    return response
  }

  return NextResponse.json({ user: session })
}
