import { NextResponse } from "next/server"
import { getSessionCookieName } from "@/lib/server/session"

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete({ name: getSessionCookieName(), path: "/" })
  return response
}
