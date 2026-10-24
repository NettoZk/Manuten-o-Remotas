"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { LiveDataProvider, SyncStatus } from "@/contexts/live-data-context"
import { canAccessPath } from "@/lib/permissions"
import { useAuth } from "@/contexts/auth-context"
import { Sidebar } from "@/components/sidebar"
import { Spinner } from "@/components/ui/spinner"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (!canAccessPath(user.tipo, pathname)) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-4"><h1 className="text-xl font-semibold">Acesso não permitido</h1><p>Seu perfil não tem acesso a esta página.</p><Link href="/dashboard" className="underline">Voltar ao dashboard</Link></main>
  }

  return (
    <LiveDataProvider key={user.id}>
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen grid-cols-[auto_1fr]">
        <Sidebar />
        <main className="h-screen overflow-y-auto p-6"><SyncStatus />{children}</main>
      </div>
    </div>
    </LiveDataProvider>
  )
}
