import type { UserRole } from "./types"
export function canAccessPath(role: UserRole, path: string) {
  const page = path.split("/")[1]
  if (["usuarios", "listas"].includes(page)) return role === "admin"
  if (page === "manutencao") return role === "admin" || role === "tecnico"
  return ["dashboard", "equipamentos", "historico"].includes(page)
}
