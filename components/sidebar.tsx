"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Wrench,
  Radio,
  History,
  Users,
  Settings,
  LogOut,
  ChevronRight,
  FileSpreadsheet,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "tecnico", "usuario"] },
  { name: "Manutencao", href: "/manutencao", icon: Wrench, roles: ["admin", "tecnico"] },
  { name: "Equipamentos", href: "/equipamentos", icon: Radio, roles: ["admin", "tecnico", "usuario"] },
  { name: "Historico", href: "/historico", icon: History, roles: ["admin", "tecnico", "usuario"] },
  { name: "Importacoes", href: "/importacoes", icon: FileSpreadsheet, roles: ["admin"] },
  { name: "Usuarios", href: "/usuarios", icon: Users, roles: ["admin"] },
  { name: "Listas", href: "/listas", icon: Settings, roles: ["admin"] },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, signOut, hasPermission } = useAuth()

  const filteredNavigation = navigation.filter((item) =>
    hasPermission(item.roles as ("admin" | "tecnico" | "usuario")[])
  )

  const getRoleName = (role: string) => {
    switch (role) {
      case "admin":
        return "Administrador"
      case "tecnico":
        return "Tecnico"
      case "usuario":
        return "Usuario"
      default:
        return role
    }
  }

  return (
    <aside className="flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Radio className="h-5 w-5 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-sidebar-foreground">Remotas</span>
          <span className="text-xs text-muted-foreground">Manutencao</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Menu
        </p>
        {filteredNavigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn(
                  "h-4 w-4 transition-colors",
                  isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-sidebar-foreground"
                )} />
                {item.name}
              </div>
              {isActive && <ChevronRight className="h-4 w-4" />}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="mb-3 rounded-lg bg-sidebar-accent/50 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <span className="text-sm font-semibold text-primary">
                {user?.nome?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{user?.nome}</p>
              <p className="text-xs text-muted-foreground">
                {user?.tipo ? getRoleName(user.tipo) : ""}
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Sair do sistema
        </Button>
        <div className="mt-4 px-4 pb-4 text-center">
          <p className="text-[10px] text-muted-foreground opacity-70">
            Engineered by
          </p>
          <p className="text-xs font-semibold text-primary">
            Adeuvaldo N. F. Paiva
          </p>
          <p className="text-[10px] text-muted-foreground opacity-70">
            Instagram
          </p>
          <p className="text-xs font-semibold text-primary">
            @adeuvaldo_paiva
          </p>
        </div>
      </div>
    </aside>
  )
}
