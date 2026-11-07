import { maintenanceDraftSchema } from "./validation"
export function readDraftBackup(raw: string | null, now = Date.now()) {
  try {
    const value = JSON.parse(raw || "null")
    if (!value || !Number.isInteger(value.version) || value.version < 0 || !Number.isFinite(value.at) || now - value.at > 7 * 86400000 || value.at > now + 60000) return null
    const parsed = maintenanceDraftSchema.safeParse(value.data)
    return parsed.success ? { data: parsed.data, version: value.version as number, at: value.at as number } : null
  } catch { return null }
}
export function listDraftBackups(storage: Storage, prefix: string) {
  const copies = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(`${prefix}:`)) continue
    const value = readDraftBackup(storage.getItem(key))
    if (value) copies.push({ ...value, key })
    else storage.removeItem(key)
  }
  return copies.sort((a, b) => b.at - a.at)
}
