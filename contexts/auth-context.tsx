"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { onIdTokenChanged, signInWithCustomToken, signOut as firebaseSignOut } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { ApiError, apiRequest } from "@/lib/api-client"
import type { User, UserRole } from "@/lib/types"

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  hasPermission: (roles: UserRole[]) => boolean
}
const AuthContext = createContext<AuthContextType | undefined>(undefined)
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    localStorage.removeItem("manutencao_auth_user")
    let active = true
    let generation = 0
    async function refresh() {
      const request = ++generation
      if (!auth.currentUser) { if (active) { setUser(null); setLoading(false) }; return }
      try {
        const { user: profile } = await apiRequest<{ user: Omit<User, "criadoEm"> & { criadoEm: string | null } }>("/api/auth/me")
        if (active && request === generation) setUser({ ...profile, criadoEm: new Date(profile.criadoEm || 0) })
      } catch (error) {
        if (active && request === generation && error instanceof ApiError && [401, 403].includes(error.status)) { setUser(null); await firebaseSignOut(auth) }
      } finally { if (active && request === generation) setLoading(false) }
    }
    const unsubscribe = onIdTokenChanged(auth, () => { void refresh() })
    const interval = setInterval(() => { void refresh() }, 60_000)
    const visibility = () => { if (document.visibilityState === "visible") void refresh() }
    document.addEventListener("visibilitychange", visibility)
    return () => { active = false; generation++; unsubscribe(); clearInterval(interval); document.removeEventListener("visibilitychange", visibility) }
  }, [])
  async function signIn(username: string, password: string) {
    const { token } = await apiRequest<{ token: string }>("/api/auth/login", { username, password }, false)
    await signInWithCustomToken(auth, token)
    const { user: profile } = await apiRequest<{ user: Omit<User, "criadoEm"> & { criadoEm: string | null } }>("/api/auth/me")
    setUser({ ...profile, criadoEm: new Date(profile.criadoEm || 0) })
  }
  async function signOut() { setUser(null); await firebaseSignOut(auth) }
  return <AuthContext.Provider value={{ user, loading, signIn, signOut, hasPermission: (roles) => Boolean(user?.ativo && roles.includes(user.tipo)) }}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth deve estar dentro de AuthProvider")
  return context
}
