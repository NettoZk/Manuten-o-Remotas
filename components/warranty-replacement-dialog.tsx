"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"
import { AlertTriangle, ArrowRight } from "lucide-react"
import { markAsWarrantyReplaced, getOperators, getEquipmentSituations } from "@/lib/services"
import type { Equipment, Operator, EquipmentSituation, EquipmentStatus } from "@/lib/types"
import useSWR from "swr"

interface WarrantyReplacementDialogProps {
  equipment: Equipment
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function WarrantyReplacementDialog({
  equipment,
  open,
  onOpenChange,
  onSuccess,
}: WarrantyReplacementDialogProps) {
  const [loading, setLoading] = useState(false)
  const [newEquipment, setNewEquipment] = useState({
    numeroRemota: "",
    modelo: equipment.modelo,
    anoFabricacao: new Date().getFullYear().toString(),
    lote: "",
    operadoraAtual: equipment.operadoraAtual,
    status: "Nova" as EquipmentStatus,
    situacaoRemota: "",
  })

  const { data: operators = [] } = useSWR<Operator[]>("operators", getOperators)
  const { data: situations = [] } = useSWR<EquipmentSituation[]>("situations", getEquipmentSituations)

  const activeOperators = operators.filter((op) => op.ativo)
  const activeSituations = situations.filter((s) => s.ativo)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newEquipment.numeroRemota.trim()) {
      toast.error("Informe o número da nova remota")
      return
    }

    setLoading(true)

    try {
      await markAsWarrantyReplaced(equipment.id, {
        numeroRemota: newEquipment.numeroRemota.trim(),
        modelo: newEquipment.modelo,
        anoFabricacao: newEquipment.anoFabricacao,
        lote: newEquipment.lote,
        operadoraAtual: newEquipment.operadoraAtual,
        status: newEquipment.status,
        situacaoRemota: newEquipment.status === "Usada" ? "Triagem" : newEquipment.situacaoRemota,
      })

      toast.success("Substituição por garantia registrada com sucesso")
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      toast.error("Erro ao registrar substituição: " + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Substituição por Garantia</DialogTitle>
          <DialogDescription>
            Registrar substituição da remota por garantia do fabricante
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription>
              A remota <strong>{equipment.numeroRemota}</strong> será marcada como{" "}
              <strong>substituída por garantia</strong> e uma nova remota será cadastrada.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4">
            {/* Remota antiga */}
            <div className="space-y-4 rounded-lg border p-4">
              <h4 className="font-medium text-muted-foreground">Remota Antiga</h4>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Número</Label>
                  <p className="font-medium">{equipment.numeroRemota}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Modelo</Label>
                  <p>{equipment.modelo}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Situação Atual</Label>
                  <p>{equipment.situacaoRemota || "Não definida"}</p>
                </div>
              </div>
              <div className="flex items-center justify-center pt-2 text-muted-foreground">
                <ArrowRight className="h-5 w-5" />
                <span className="ml-2 text-sm">Será marcada como substituída</span>
              </div>
            </div>

            {/* Nova remota */}
            <div className="space-y-4 rounded-lg border border-primary/50 p-4">
              <h4 className="font-medium text-primary">Nova Remota</h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="numeroRemota">Número da Remota *</Label>
                  <Input
                    id="numeroRemota"
                    value={newEquipment.numeroRemota}
                    onChange={(e) =>
                      setNewEquipment((prev) => ({ ...prev, numeroRemota: e.target.value }))
                    }
                    placeholder="Ex: REM-00123"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="modelo">Modelo</Label>
                  <Input
                    id="modelo"
                    value={newEquipment.modelo}
                    onChange={(e) =>
                      setNewEquipment((prev) => ({ ...prev, modelo: e.target.value }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="anoFabricacao">Ano</Label>
                    <Input
                      id="anoFabricacao"
                      value={newEquipment.anoFabricacao}
                      onChange={(e) =>
                        setNewEquipment((prev) => ({ ...prev, anoFabricacao: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lote">Lote</Label>
                    <Input
                      id="lote"
                      value={newEquipment.lote}
                      onChange={(e) =>
                        setNewEquipment((prev) => ({ ...prev, lote: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="operadora">Operadora</Label>
                  <Select
                    value={newEquipment.operadoraAtual}
                    onValueChange={(value) =>
                      setNewEquipment((prev) => ({ ...prev, operadoraAtual: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeOperators.map((op) => (
                        <SelectItem key={op.id} value={op.nome}>
                          {op.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={newEquipment.status}
                    onValueChange={(value) =>
                      setNewEquipment((prev) => ({
                        ...prev,
                        status: value as EquipmentStatus,
                        situacaoRemota: value === "Usada" ? "Triagem" : prev.situacaoRemota,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Nova">Nova</SelectItem>
                      <SelectItem value="Usada">Usada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newEquipment.status === "Nova" && (
                  <div className="space-y-1">
                    <Label htmlFor="situacao">Situação</Label>
                    <Select
                      value={newEquipment.situacaoRemota}
                      onValueChange={(value) =>
                        setNewEquipment((prev) => ({ ...prev, situacaoRemota: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeSituations.map((sit) => (
                          <SelectItem key={sit.id} value={sit.nome}>
                            {sit.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {newEquipment.status === "Usada" && (
                  <p className="text-xs text-muted-foreground">
                    * Remotas usadas são automaticamente definidas com situação "Triagem"
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Processando..." : "Confirmar Substituição"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
