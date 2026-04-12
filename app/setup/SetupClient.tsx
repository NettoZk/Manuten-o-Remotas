"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { Radio, Shield, CheckCircle, AlertCircle } from "lucide-react"

interface SetupStatus {
  hasAdmin: boolean
}

export default function SetupClient() {
  const [nome, setNome] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [hasAdmin, setHasAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function checkAdmin() {
      try {
        const response = await fetch("/api/setup", { cache: "no-store" })
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          setError(data?.error || "Setup indisponível.")
          return
        }

        const data = (await response.json()) as SetupStatus
        setHasAdmin(data.hasAdmin)
      } catch (err) {
        console.error("Erro ao verificar setup:", err)
        setError("Erro ao verificar setup. Verifique a conexão.")
      } finally {
        setIsChecking(false)
      }
    }

    checkAdmin()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem")
      return
    }

    if (username.length < 3) {
      toast.error("O usuário deve ter pelo menos 3 caracteres")
      return
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, username, password }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || "Erro ao criar administrador")
      }

      toast.success("Usuário administrador criado com sucesso!")
      router.push("/")
    } catch (err) {
      console.error("Erro ao criar admin:", err)
      if (err instanceof Error) {
        toast.error(err.message)
      } else {
        toast.error("Erro ao criar admin. Tente novamente.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Spinner className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Verificando configuração...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-size-[64px_64px]" />
        <Card className="w-full max-w-md border-destructive/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center py-12">
            <div className="mb-4 rounded-full bg-destructive/10 p-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Setup indisponível</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => window.location.reload()} className="mt-6 w-full">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (hasAdmin) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-size-[64px_64px]" />
        <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center py-12">
            <div className="mb-4 rounded-full bg-green-500/10 p-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Sistema já configurado</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Um administrador já existe no sistema. Faça login para continuar.
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
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-size-[64px_64px]" />
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuração Inicial</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Crie o primeiro usuário administrador do sistema
          </p>
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold">Criar Administrador</CardTitle>
            <CardDescription className="text-sm">
              Este usuário terá acesso total ao sistema
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
                    Nome de usuário
                  </FieldLabel>
                  <Input
                    id="username"
                    type="text"
                    placeholder="seu.usuario"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 bg-secondary/50 placeholder:text-muted-foreground/50"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password" className="text-sm text-muted-foreground">
                    Senha
                  </FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    placeholder="********"
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
              <Button type="submit" className="h-11 w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Criando...
                  </>
                ) : (
                  "Criar Administrador"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
