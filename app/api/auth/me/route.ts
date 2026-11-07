import { handleError, json, requireUser } from "@/lib/server/http"
export const runtime = "nodejs"
export async function GET(request: Request) {
  try { return json({ user: await requireUser(request) }) } catch (error) { return handleError(error) }
}
