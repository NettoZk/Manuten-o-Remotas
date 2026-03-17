"use client"

import { useState } from "react"
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
import { toast } from "sonner"
import { deleteEquipment, archiveEquipment } from "@/lib/services"
import type { Equipment } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"

interface DeleteEquipmentDialogProps {
  equipment: Equipment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function DeleteEquipmentDialog({
  equipment,
  open,
  onOpenChange,
  onSuccess,
}: DeleteEquipmentDialogProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!equipment || !user) return

    setLoading(true)

    try {
      const result = await deleteEquipment(equipment.id, user.tipo)

      if (result.success) {
        toast.success(result.message)
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Erro ao excluir remota: " + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleArchive = async () => {
    if (!equipment) return

    setLoading(true)

    try {
      await archiveEquipment(equipment.id)
      toast.success("Remota arquivada com sucesso")
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      toast.error("Erro ao arquivar remota: " + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!equipment) return null

  const isAdmin = user?.tipo === "admin"

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isAdmin ? "Excluir ou Arquivar Remota" : "Arquivar Remota"}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Remota: <strong>{equipment.numeroRemota}</strong>
            </p>
            <p>Modelo: {equipment.modelo}</p>
            
            {isAdmin ? (
              <p className="pt-2">
                Você pode <strong>excluir permanentemente</strong> (apenas se não houver histórico de manutenção)
                ou <strong>arquivar</strong> esta remota (ela não aparecerá mais nas listagens, mas o histórico será preservado).
              </p>
            ) : (
              <p className="pt-2">
                Ao arquivar, a remota não aparecerá mais nas listagens, mas o histórico será preservado.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleArchive()
            }}
            disabled={loading}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {loading ? "Processando..." : "Arquivar"}
          </AlertDialogAction>

          {isAdmin && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={loading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {loading ? "Processando..." : "Excluir Permanentemente"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
