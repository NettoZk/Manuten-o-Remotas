"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { User, UserRole } from "@/lib/types"

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  hasPermission: (roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function parseUser(user: any): User {
  return {
    id: user.id,
    nome: user.nome,
    username: user.username,
    tipo: user.tipo,
    ativo: user.ativo,
    criadoEm: new Date(user.criadoEm),
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" })
        if (!response.ok) {
          setUser(null)
          return
        }

        const data = await response.json()
        if (data?.user) {
          setUser(parseUser(data.user))
        }
      } catch (error) {
        console.error("Erro ao restaurar sessão:", error)
      } finally {
        setLoading(false)
      }
    }

    restoreSession()
  }, [])

  const signIn = async (username: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || "Erro ao fazer login")
    }

    setUser(parseUser(data.user))
  }

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    setUser(null)
  }

  const hasPermission = (roles: UserRole[]) => {
    if (!user) return false
    return roles.includes(user.tipo)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signOut, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
