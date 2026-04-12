import SetupClient from "./SetupClient"
import { isSetupAllowed } from "@/lib/server/session"

export default function SetupPage() {
  const setupEnabled = isSetupAllowed()

  if (!setupEnabled) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-size-[64px_64px]" />
        <div className="w-full max-w-xl rounded-3xl border border-destructive/20 bg-card/80 p-12 text-center shadow-xl backdrop-blur">
          <h1 className="text-3xl font-bold text-foreground">Setup desabilitado</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            O acesso à página de configuração inicial foi desabilitado em produção. Para habilitar, defina a variável de ambiente <code>ENABLE_SETUP_ROUTE=true</code>.
          </p>
        </div>
      </main>
    )
  }

  return <SetupClient />
}
