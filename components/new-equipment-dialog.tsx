"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"
import { AlertTriangle } from "lucide-react"
import { createEquipment } from "@/lib/services"
import type { Equipment, Operator, EquipmentStatus } from "@/lib/types"

interface NewEquipmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  numeroRemota: string
  operators: Operator[]
  onCreated: (equipment: Equipment) => void
}

export function NewEquipmentDialog({
  open,
  onOpenChange,
  numeroRemota,
  operators,
  onCreated,
}: NewEquipmentDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [modelo, setModelo] = useState("")
  const [anoFabricacao, setAnoFabricacao] = useState("")
  const [lote, setLote] = useState("")
  const [operadoraAtual, setOperadoraAtual] = useState("")
  const [status, setStatus] = useState<EquipmentStatus>("Nova")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!modelo || !anoFabricacao || !lote || !operadoraAtual) {
      toast.error("Preencha todos os campos obrigatorios")
      return
    }

    setIsLoading(true)
    try {
      const id = await createEquipment({
        numeroRemota,
        modelo,
        anoFabricacao,
        lote,
        operadoraAtual,
        status,
      })

      onCreated({
        id,
        numeroRemota,
        modelo,
        anoFabricacao,
        lote,
        operadoraAtual,
        status,
        dataCadastro: new Date(),
        estadoRegistro: "ativo",
        situacaoRemota: status === "Usada" ? "Triagem" : undefined,
      })

      // Reset form
      setModelo("")
      setAnoFabricacao("")
      setLote("")
      setOperadoraAtual("")
      setStatus("Nova")
    } catch (error: unknown) {
      console.error("[v0] Erro ao cadastrar equipamento:", error)
      if (error instanceof Error && error.message.includes("Ja existe")) {
        toast.error(error.message)
      } else {
        toast.error("Erro ao cadastrar equipamento")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">Nova Remota</DialogTitle>
          <DialogDescription>
            A remota <strong className="text-foreground">{numeroRemota}</strong> nao foi encontrada. Preencha os
            dados para cadastra-la.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="py-4 gap-4">
            <Field>
              <FieldLabel className="text-sm text-muted-foreground">Numero da Remota</FieldLabel>
              <Input value={numeroRemota} disabled className="h-11 bg-secondary/50" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel className="text-sm text-muted-foreground">Modelo</FieldLabel>
                <Input
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ex: RT-1000"
                  required
                  className="h-11 bg-secondary/50"
                />
              </Field>
              <Field>
                <FieldLabel className="text-sm text-muted-foreground">Ano de Fabricacao</FieldLabel>
                <Input
                  value={anoFabricacao}
                  onChange={(e) => setAnoFabricacao(e.target.value)}
                  placeholder="Ex: 2024"
                  required
                  className="h-11 bg-secondary/50"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel className="text-sm text-muted-foreground">Lote</FieldLabel>
                <Input
                  value={lote}
                  onChange={(e) => setLote(e.target.value)}
                  placeholder="Ex: L001"
                  required
                  className="h-11 bg-secondary/50"
                />
              </Field>
              <Field>
                <FieldLabel className="text-sm text-muted-foreground">Status</FieldLabel>
                <select
                  className="flex h-11 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EquipmentStatus)}
                  required
                >
                  <option value="Nova">Nova</option>
                  <option value="Usada">Usada</option>
                </select>
              </Field>
            </div>
            {status === "Usada" && (
              <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-600">
                  Remotas usadas sao automaticamente cadastradas com situacao <strong>Triagem</strong>.
                </AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel className="text-sm text-muted-foreground">Operadora</FieldLabel>
              <select
                className="flex h-11 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={operadoraAtual}
                onChange={(e) => setOperadoraAtual(e.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {operators.map((operator) => (
                  <option key={operator.id} value={operator.nome}>
                    {operator.nome}
                  </option>
                ))}
              </select>
            </Field>
          </FieldGroup>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="h-11">
              {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
              Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
