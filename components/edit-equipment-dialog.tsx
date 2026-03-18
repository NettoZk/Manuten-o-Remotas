"use client"

import { useState, useEffect } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { updateEquipmentWithLog } from "@/lib/services"
import type { Equipment, EquipmentSituation, EquipmentStatus } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"
import { Pencil } from "lucide-react"

interface EditEquipmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipment: Equipment | null
  equipmentSituations: EquipmentSituation[]
  onUpdated: (updatedEquipment: Equipment) => void
}

export function EditEquipmentDialog({
  open,
  onOpenChange,
  equipment,
  equipmentSituations,
  onUpdated,
}: EditEquipmentDialogProps) {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [modelo, setModelo] = useState("")
  const [status, setStatus] = useState<EquipmentStatus>("Nova")
  const [situacaoRemota, setSituacaoRemota] = useState("")
  const [observacoes, setObservacoes] = useState("")

  useEffect(() => {
    if (equipment) {
      setModelo(equipment.modelo)
      setStatus(equipment.status)
      setSituacaoRemota(equipment.situacaoRemota || "")
      setObservacoes(equipment.observacoes || "")
    }
  }, [equipment])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!equipment || !user) return

    if (!modelo.trim()) {
      toast.error("O campo modelo é obrigatório")
      return
    }

    setIsLoading(true)
    try {
      await updateEquipmentWithLog(
        equipment.id,
        {
          modelo: modelo.trim(),
          status,
          situacaoRemota: situacaoRemota || undefined,
          observacoes: observacoes.trim() || undefined,
        },
        user.id,
        user.nome
      )

      const updatedEquipment: Equipment = {
        ...equipment,
        modelo: modelo.trim(),
        status,
        situacaoRemota: situacaoRemota || undefined,
        observacoes: observacoes.trim() || undefined,
        ultimaEdicaoEm: new Date(),
        ultimaEdicaoPor: user.nome,
      }

      onUpdated(updatedEquipment)
      toast.success("Remota atualizada com sucesso")
      onOpenChange(false)
    } catch (error) {
      console.error("[v0] Erro ao atualizar equipamento:", error)
      toast.error("Erro ao atualizar remota. Tente novamente.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!equipment) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Editar Remota
          </DialogTitle>
          <DialogDescription>
            Edite os dados da remota <strong className="text-foreground">{equipment.numeroRemota}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="py-4 gap-4">
            <Field>
              <FieldLabel className="text-sm text-muted-foreground">Número da Remota</FieldLabel>
              <Input value={equipment.numeroRemota} disabled className="h-11 bg-secondary/50" />
            </Field>
            
            <Field>
              <FieldLabel className="text-sm text-muted-foreground">Modelo *</FieldLabel>
              <Input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="Ex: RT-1000"
                required
                className="h-11 bg-secondary/50"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
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

              <Field>
                <FieldLabel className="text-sm text-muted-foreground">Situação</FieldLabel>
                <select
                  className="flex h-11 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={situacaoRemota}
                  onChange={(e) => setSituacaoRemota(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {equipmentSituations.map((situation) => (
                    <option key={situation.id} value={situation.nome}>
                      {situation.nome}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field>
              <FieldLabel className="text-sm text-muted-foreground">Observações</FieldLabel>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Adicione observações sobre a remota..."
                rows={3}
                className="bg-secondary/50"
              />
            </Field>

            {equipment.ultimaEdicaoEm && (
              <div className="rounded-lg bg-muted/30 p-3 text-sm">
                <p className="text-muted-foreground">
                  Última edição por <span className="font-medium text-foreground">{equipment.ultimaEdicaoPor}</span>
                  {" em "}
                  {new Date(equipment.ultimaEdicaoEm).toLocaleString("pt-BR")}
                </p>
              </div>
            )}
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
              Salvar Alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
