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
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { forceFinalizeMaintenance } from "@/lib/services"
import type { Maintenance, Equipment } from "@/lib/types"

interface ForceFinishedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  maintenance: Maintenance
  equipment: Equipment
  userId: string
  userName: string
  onFinalized: () => void
}

export function ForceFinishedDialog({
  open,
  onOpenChange,
  maintenance,
  equipment,
  userId,
  userName,
  onFinalized,
}: ForceFinishedDialogProps) {
  const [motivo, setMotivo] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleForceFinalize = async () => {
    if (!motivo.trim()) {
      toast.error("Informe o motivo da finalização forçada")
      return
    }

    if (motivo.trim().length < 10) {
      toast.error("O motivo deve ter pelo menos 10 caracteres")
      return
    }

    setIsLoading(true)
    try {
      await forceFinalizeMaintenance(
        maintenance.id,
        equipment.id,
        userId,
        userName,
        motivo.trim()
      )

      toast.success("Manutenção finalizada forçadamente")
      setMotivo("")
      onOpenChange(false)
      onFinalized()
    } catch (error) {
      console.error("Erro ao finalizar forçadamente:", error)
      toast.error("Erro ao finalizar manutenção")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-destructive/10 p-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle>Finalização Forçada</DialogTitle>
              <DialogDescription>
                Remota {maintenance.numeroRemota}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">
              Esta manutenção foi iniciada por <strong>{maintenance.tecnicoNome}</strong>.
              Ao finalizar forçadamente, a remota voltará para <strong>Triagem</strong> e 
              o registro será marcado como finalização forçada.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Motivo da finalização forçada <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Técnico não está mais disponível, remota precisa ser reatribuída..."
              rows={3}
              className="resize-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Este motivo ficará registrado no histórico da manutenção
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleForceFinalize}
            disabled={isLoading || !motivo.trim()}
          >
            {isLoading && <Spinner className="mr-2 h-4 w-4" />}
            Finalizar Forçadamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
