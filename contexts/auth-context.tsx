"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { User, UserRole } from "@/lib/types"
import bcrypt from "bcryptjs"

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  hasPermission: (roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = "manutencao_auth_user"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Restaurar sessao do localStorage
  useEffect(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (stored) {
      try {
        const userData = JSON.parse(stored)
        // Verificar se o usuario ainda existe e esta ativo
        verifyUser(userData.id).then((isValid) => {
          if (isValid) {
            setUser({
              ...userData,
              criadoEm: new Date(userData.criadoEm)
            })
          } else {
            localStorage.removeItem(AUTH_STORAGE_KEY)
          }
          setLoading(false)
        })
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  async function verifyUser(userId: string): Promise<boolean> {
    try {
      const userDoc = await getDoc(doc(db, "users", userId))
      if (userDoc.exists()) {
        const data = userDoc.data()
        return data.ativo === true
      }
      return false
    } catch (error) {
      console.error("[v0] Erro ao verificar usuario:", error)
      return false
    }
  }

  const signIn = async (username: string, password: string) => {
    console.log("[v0] Tentando login com usuario:", username)
    
    // Buscar usuario pelo username
    const usersRef = collection(db, "users")
    const q = query(usersRef, where("username", "==", username.toLowerCase()))
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      console.log("[v0] Usuario nao encontrado")
      throw new Error("Usuario ou senha invalidos")
    }

    const userDoc = snapshot.docs[0]
    const userData = userDoc.data()
    
    console.log("[v0] Usuario encontrado:", userData.nome)

    // Verificar se usuario esta ativo
    if (!userData.ativo) {
      console.log("[v0] Usuario inativo")
      throw new Error("Usuario desativado. Entre em contato com o administrador.")
    }

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, userData.senhaHash)
    if (!passwordMatch) {
      console.log("[v0] Senha incorreta")
      throw new Error("Usuario ou senha invalidos")
    }

    const userObj: User = {
      id: userDoc.id,
      nome: userData.nome,
      username: userData.username,
      tipo: userData.tipo,
      ativo: userData.ativo,
      criadoEm: userData.criadoEm?.toDate() || new Date(),
    }

    console.log("[v0] Login bem sucedido:", userObj)
    
    // Salvar no localStorage
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj))
    setUser(userObj)
  }

  const signOut = async () => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
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
