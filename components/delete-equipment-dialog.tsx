"use client"

import { useState, useEffect } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { deleteEquipment, archiveEquipment, hasMaintenanceHistory } from "@/lib/services"
import type { Equipment } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"
import { AlertTriangle, Archive } from "lucide-react"

interface DeleteEquipmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  equipment: Equipment | null
  onDeleted: (equipmentId: string, archived: boolean) => void
}

export function DeleteEquipmentDialog({
  open,
  onOpenChange,
  equipment,
  onDeleted,
}: DeleteEquipmentDialogProps) {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [hasHistory, setHasHistory] = useState<boolean | null>(null)

  useEffect(() => {
    if (open && equipment) {
      checkMaintenanceHistory()
    } else {
      setHasHistory(null)
    }
  }, [open, equipment])

  const checkMaintenanceHistory = async () => {
    if (!equipment) return
    
    setChecking(true)
    try {
      const result = await hasMaintenanceHistory(equipment.numeroRemota)
      setHasHistory(result)
    } catch (error) {
      console.error("[v0] Erro ao verificar histórico:", error)
      setHasHistory(true) // Por segurança, assume que tem histórico
    } finally {
      setChecking(false)
    }
  }

  const handleConfirm = async () => {
    if (!equipment || !user) return

    setIsLoading(true)
    try {
      if (hasHistory) {
        // Arquivar em vez de excluir
        await archiveEquipment(equipment.id, user.id, user.nome)
        toast.success("Remota arquivada com sucesso")
        onDeleted(equipment.id, true)
      } else {
        // Excluir definitivamente
        await deleteEquipment(equipment.id)
        toast.success("Remota excluída com sucesso")
        onDeleted(equipment.id, false)
      }
      onOpenChange(false)
    } catch (error) {
      console.error("[v0] Erro ao excluir/arquivar equipamento:", error)
      toast.error("Erro ao processar. Tente novamente.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!equipment) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {hasHistory ? (
              <Archive className="h-5 w-5 text-warning" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            {hasHistory ? "Arquivar Remota" : "Excluir Remota"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {checking ? (
                <div className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  <span>Verificando histórico de manutenção...</span>
                </div>
              ) : hasHistory ? (
                <>
                  <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-warning">
                    Esta remota possui histórico de manutenção e não pode ser excluída. 
                    O registro será mantido como inativo para preservar os dados.
                  </div>
                  <p>
                    Deseja arquivar a remota <strong className="text-foreground">{equipment.numeroRemota}</strong>?
                  </p>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-destructive">
                    Atenção: Esta ação não pode ser desfeita. A remota será excluída permanentemente do sistema.
                  </div>
                  <p>
                    Tem certeza que deseja excluir a remota <strong className="text-foreground">{equipment.numeroRemota}</strong>?
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading || checking}
            className={hasHistory ? "bg-warning text-warning-foreground hover:bg-warning/90" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Processando...
              </>
            ) : hasHistory ? (
              "Arquivar"
            ) : (
              "Excluir"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
