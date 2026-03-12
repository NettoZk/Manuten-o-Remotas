"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { doc, setDoc, collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { Radio, Shield, CheckCircle, AlertCircle, User } from "lucide-react"
import bcrypt from "bcryptjs"

export default function SetupPage() {
  const [nome, setNome] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [hasAdmin, setHasAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Check if admin already exists
  useEffect(() => {
    async function checkAdmin() {
      try {
        console.log("[v0] Verificando se ja existe admin...")
        const usersRef = collection(db, "users")
        const q = query(usersRef, where("tipo", "==", "admin"))
        const snapshot = await getDocs(q)
        console.log("[v0] Admins encontrados:", snapshot.size)
        setHasAdmin(!snapshot.empty)
        setError(null)
      } catch (err) {
        console.error("[v0] Erro ao verificar admin:", err)
        setError("Erro ao conectar com o Firebase. Verifique se as variaveis de ambiente estao configuradas.")
      } finally {
        setIsChecking(false)
      }
    }
    checkAdmin()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      toast.error("As senhas nao coincidem")
      return
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres")
      return
    }

    if (username.length < 3) {
      toast.error("O usuario deve ter pelo menos 3 caracteres")
      return
    }

    setIsLoading(true)

    try {
      // Verificar se username ja existe
      const usersRef = collection(db, "users")
      const q = query(usersRef, where("username", "==", username.toLowerCase()))
      const existingUser = await getDocs(q)
      
      if (!existingUser.empty) {
        toast.error("Este nome de usuario ja esta em uso")
        setIsLoading(false)
        return
      }

      // Hash da senha
      const senhaHash = await bcrypt.hash(password, 10)
      
      // Criar ID unico para o usuario
      const userId = `admin_${Date.now()}`
      
      // Criar usuario no Firestore
      await setDoc(doc(db, "users", userId), {
        nome,
        username: username.toLowerCase(),
        senhaHash,
        tipo: "admin",
        ativo: true,
        criadoEm: new Date(),
      })

      console.log("[v0] Usuario admin criado com sucesso:", userId)
      toast.success("Usuario administrador criado com sucesso!")
      router.push("/")
    } catch (err) {
      console.error("[v0] Erro ao criar usuario:", err)
      toast.error("Erro ao criar usuario. Verifique a conexao com o Firebase.")
    } finally {
      setIsLoading(false)
    }
  }

  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Spinner className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Verificando configuracao...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        
        <Card className="w-full max-w-md border-destructive/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center py-12">
            <div className="mb-4 rounded-full bg-destructive/10 p-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Erro de Conexao</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              {error}
            </p>
            <div className="w-full space-y-4 rounded-lg bg-secondary/50 p-4 text-left">
              <p className="text-sm font-medium text-foreground">Como configurar o Firebase:</p>
              <ol className="list-inside list-decimal space-y-2 text-xs text-muted-foreground">
                <li>Acesse o <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Console do Firebase</a></li>
                <li>Crie um novo projeto ou selecione um existente</li>
                <li>Ative o Firestore Database em modo de teste</li>
                <li>Va em Configuracoes do Projeto e copie as credenciais</li>
                <li>Configure as variaveis de ambiente no projeto</li>
              </ol>
            </div>
            <Button onClick={() => window.location.reload()} className="mt-6 w-full">
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (hasAdmin) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        
        <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center py-12">
            <div className="mb-4 rounded-full bg-green-500/10 p-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Sistema ja configurado</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Um administrador ja existe no sistema. Faca login para continuar.
            </p>
            <Button onClick={() => router.push("/")} className="w-full">
              Ir para Login
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />

      <div className="w-full max-w-md space-y-8">
        {/* Logo and branding */}
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Configuracao Inicial
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Crie o primeiro usuario administrador do sistema
          </p>
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-lg font-semibold">Criar Administrador</CardTitle>
            </div>
            <CardDescription className="text-sm">
              Este usuario tera acesso total ao sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="nome" className="text-sm text-muted-foreground">
                    Nome completo
                  </FieldLabel>
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Seu nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 bg-secondary/50 placeholder:text-muted-foreground/50"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="username" className="text-sm text-muted-foreground">
                    Nome de usuario
                  </FieldLabel>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                      required
                      disabled={isLoading}
                      className="h-11 bg-secondary/50 pl-10 lowercase placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sera usado para fazer login (sem espacos)
                  </p>
                </Field>
                <Field>
                  <FieldLabel htmlFor="password" className="text-sm text-muted-foreground">
                    Senha
                  </FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Minimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 bg-secondary/50 placeholder:text-muted-foreground/50"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword" className="text-sm text-muted-foreground">
                    Confirmar senha
                  </FieldLabel>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 bg-secondary/50 placeholder:text-muted-foreground/50"
                  />
                </Field>
              </FieldGroup>
              <Button 
                type="submit" 
                className="h-11 w-full bg-primary font-medium text-primary-foreground hover:bg-primary/90" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Radio className="mr-2 h-4 w-4" />
                    Criar Administrador
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="rounded-lg bg-card/30 p-4 ring-1 ring-border/50">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Importante:</strong> Certifique-se de que as variaveis de ambiente do Firebase estao configuradas corretamente no projeto antes de criar o usuario.
          </p>
        </div>
      </div>
    </main>
  )
}
