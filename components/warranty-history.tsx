"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { getWarrantyHistory } from "@/lib/services"
import type { Equipment, Warranty } from "@/lib/types"

export function WarrantyHistory({ equipment, onViewLinked }: { equipment: Equipment; onViewLinked: (id: string) => void }) {
  const [records, setRecords] = useState<Warranty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const warrantyId = equipment.garantia?.id
  const warrantyStatus = equipment.garantia?.status
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)
    getWarrantyHistory(equipment.id).then((items) => { if (active) setRecords(items) }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [equipment.id, warrantyId, warrantyStatus, revision])
  return <Card className="border-border/50">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Histórico de garantia</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {equipment.remotaAnteriorId && <div className="rounded-lg bg-muted/30 p-3 text-sm">Originada de retorno da garantia. <Button variant="link" className="h-auto px-0" onClick={() => onViewLinked(equipment.remotaAnteriorId!)}>Ver remota anterior {equipment.remotaAnteriorNumero}</Button></div>}
      {equipment.substituidaPorId && <div className="rounded-lg bg-muted/30 p-3 text-sm">Cadastro arquivado após troca de IMEI. <Button variant="link" className="h-auto px-0" onClick={() => onViewLinked(equipment.substituidaPorId!)}>Ver remota substituta {equipment.substituidaPorNumero}</Button></div>}
      {loading ? <Spinner className="h-5 w-5" /> : error ? <p role="alert" className="text-sm">Não foi possível carregar as garantias. <button className="underline" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button></p> : !records.length ? <p className="text-sm text-muted-foreground">Nenhum envio para garantia registrado.</p> : records.map((record) => <div key={record.id} className="space-y-1 rounded-lg border border-border/50 p-3 text-sm">
        <p className="font-medium">{record.status === "enviada" ? "Em garantia" : "Retorno registrado"} · Remota {record.numeroRemota}</p>
        <p>Envio: {record.enviadaEm.toLocaleString("pt-BR")} · {record.enviadaPor}</p>
        {record.maintenanceId ? <Button variant="link" asChild className="h-auto px-0"><Link href={`/historico?manutencao=${encodeURIComponent(record.maintenanceId)}`}>Ver manutenção do envio</Link></Button> : <p className="text-xs text-muted-foreground">Envio anterior sem manutenção vinculada.</p>}
        <p className="whitespace-pre-wrap">Motivo: {record.motivo}</p>
        {record.retornadaEm && <>
          <p>Retorno: {record.retornadaEm.toLocaleString("pt-BR")} · {record.retornadaPor}</p>
          <p>Situação no retorno: {record.situacaoRetorno}</p>
          <p>{record.novoNumeroRemota ? `IMEI anterior: ${record.numeroRemota} → Novo IMEI: ${record.novoNumeroRemota}` : "Retorno com o mesmo número/IMEI"}</p>
          <p className="whitespace-pre-wrap">{record.observacoesRetorno}</p>
        </>}
      </div>)}
    </CardContent>
  </Card>
}
