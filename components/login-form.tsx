"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { Radio, Lock, User, Zap } from "lucide-react"

export function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { signIn } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await signIn(username, password)
      toast.success("Login realizado com sucesso!")
      router.push("/dashboard")
    } catch (error: unknown) {
      console.error("[v0] Erro ao fazer login:", error)
      if (error instanceof Error) {
        toast.error(error.message)
      } else {
        toast.error("Erro ao fazer login. Tente novamente.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md space-y-8">
      {/* Logo and branding */}
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <Radio className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Sistema de Manutencao
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gerenciamento de remotas de telemetria
        </p>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg font-semibold">Acesse sua conta</CardTitle>
          <CardDescription className="text-sm">
            Entre com suas credenciais para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="username" className="text-sm text-muted-foreground">
                  Usuario
                </FieldLabel>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="seu.usuario"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 bg-secondary/50 pl-10 placeholder:text-muted-foreground/50"
                    autoComplete="username"
                  />
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="password" className="text-sm text-muted-foreground">
                  Senha
                </FieldLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 bg-secondary/50 pl-10 placeholder:text-muted-foreground/50"
                    autoComplete="current-password"
                  />
                </div>
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
                  Entrando...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Entrar
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Footer info */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          Sistema interno de gestao de manutencao
        </p>
      </div>
    </div>
  )
}
