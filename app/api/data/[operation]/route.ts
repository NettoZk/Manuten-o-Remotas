import { z } from "zod"
import { executeOperation } from "@/lib/server/operations"
import { handleError, json, readBody, requireUser } from "@/lib/server/http"

export const runtime = "nodejs"
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  try {
    const actor = await requireUser(request)
    const { operation } = await context.params
    const { args } = z.object({ args: z.array(z.unknown()).max(6) }).parse(await readBody(request))
    return json({ result: await executeOperation(operation, args, actor) })
  } catch (error) { return handleError(error) }
}
