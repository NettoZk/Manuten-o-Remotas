"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { readApiResponse } from "@/lib/api-response"

export default function SetupPage() {
  const router = useRouter()
  const [state, setState] = useState<{ configured: boolean; enabled: boolean } | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome: "", username: "", password: "", confirmation: "", token: "" })
  useEffect(() => {
    let active = true
    fetch("/api/setup", { cache: "no-store" }).then(async (response) => {
      const data = await readApiResponse<{ configured: boolean; enabled: boolean }>(response)
      if (active) setState(data)
    }).catch(() => { if (active) setError("Não foi possível verificar a configuração do sistema. Contate o administrador.") })
    return () => { active = false }
  }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (form.password !== form.confirmation) { toast.error("As senhas não coincidem"); return }
    setSaving(true)
    try {
      const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json", "X-Setup-Token": form.token }, body: JSON.stringify({ nome: form.nome, username: form.username, password: form.password }) })
      await readApiResponse<{ success: boolean }>(response)
      toast.success("Administrador criado com sucesso")
      router.replace("/")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao configurar o sistema") }
    finally { setSaving(false) }
  }
  return <main className="flex min-h-screen items-center justify-center p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>Configuração inicial</CardTitle><CardDescription>Criação do primeiro administrador.</CardDescription></CardHeader><CardContent>
    {error ? <p role="alert">{error}</p> : !state ? <Spinner /> : state.configured ? <p>O sistema já possui um administrador.</p> : !state.enabled ? <p>A configuração inicial está desabilitada. Contate o responsável pelo sistema.</p> : <form onSubmit={submit} className="space-y-4">
      {([
        ["nome", "Nome completo", "text"], ["username", "Nome de usuário", "text"],
        ["password", "Senha (mínimo de 6 caracteres)", "password"], ["confirmation", "Confirmar senha", "password"],
        ["token", "Chave de configuração fornecida pelo responsável", "password"],
      ] as const).map(([key, label, type]) => <label className="block space-y-2 text-sm" key={key}>{label}<Input type={type} required disabled={saving} value={form[key]} onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))} /></label>)}
      <Button type="submit" disabled={saving} className="w-full">{saving ? <Spinner /> : "Criar administrador"}</Button>
    </form>}
    <Link href="/" className="mt-5 block text-sm underline">Voltar ao login</Link>
  </CardContent></Card></main>
}
