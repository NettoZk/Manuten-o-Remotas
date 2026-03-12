"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Equipment } from "@/lib/types"
import { Radio, Calendar, Layers, Signal } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface EquipmentInfoProps {
  equipment: Equipment
}

export function EquipmentInfo({ equipment }: EquipmentInfoProps) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Radio className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg">Remota {equipment.numeroRemota}</span>
          </div>
          <Badge 
            variant={equipment.status === "Nova" ? "default" : "secondary"}
            className={equipment.status === "Nova" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}
          >
            {equipment.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Modelo</p>
            <p className="font-medium text-foreground">{equipment.modelo}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Ano de Fabricacao</p>
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Calendar className="h-4 w-4 text-primary" />
              {equipment.anoFabricacao}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Lote</p>
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Layers className="h-4 w-4 text-primary" />
              {equipment.lote}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Operadora Atual</p>
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Signal className="h-4 w-4 text-primary" />
              {equipment.operadoraAtual}
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-secondary/50 px-4 py-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          Cadastrada em{" "}
          {format(equipment.dataCadastro, "dd/MM/yyyy 'as' HH:mm", {
            locale: ptBR,
          })}
        </div>
      </CardContent>
    </Card>
  )
}
