"use client"
import { useEffect, useState } from "react"
import { useLiveData } from "@/contexts/live-data-context"
import { getMaintenancesByEquipment } from "@/lib/services"
import type { Maintenance } from "@/lib/types"

export function useEquipmentMaintenanceHistory(number?: string) {
  const live = useLiveData()
  const [records, setRecords] = useState<Maintenance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const revision = live.maintenances.filter((item) => item.numeroRemota === number).map((item) => item.id).join(",")
  useEffect(() => {
    let active = true
    setRecords([]); setError(false)
    if (!number) { setLoading(false); return }
    setLoading(true)
    getMaintenancesByEquipment(number).then((data) => { if (active) setRecords(data) }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [number, revision, attempt])
  const byId = new Map(records.filter((item) => item.status === "finalizada").map((item) => [item.id, item]))
  for (const item of live.maintenances) if (item.numeroRemota === number) byId.set(item.id, item)
  return { records: [...byId.values()].sort((a, b) => b.dataEntrada.getTime() - a.dataEntrada.getTime()), loading, error, retry: () => setAttempt((value) => value + 1) }
}
