"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { collection, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { equipmentFromDoc, maintenanceFromDoc } from "@/lib/firestore-records"
import { isWarrantyImeiChangeSituation } from "@/lib/equipment-situations"
import type { Equipment, Maintenance, Defect, Service, Operator, EquipmentSituation } from "@/lib/types"

interface LiveData {
  equipments: Equipment[]
  maintenances: Maintenance[]
  defects: Defect[]
  services: Service[]
  operators: Operator[]
  situations: EquipmentSituation[]
}
const empty: LiveData = { equipments: [], maintenances: [], defects: [], services: [], operators: [], situations: [] }
const LiveDataContext = createContext<(LiveData & { loading: boolean; error: string | null; lastUpdate: Date | null; refresh: () => void }) | undefined>(undefined)
export function LiveDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LiveData>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const ready = new Set<string>()
    setLoading(true)
    setError(null)
    function received(key: string) { ready.add(key); if (active && ready.size === 6) setLoading(false) }
    const bindings = [
      ["equipments", "equipments"], ["maintenances", "maintenances"], ["defects", "defects"],
      ["services", "services"], ["operators", "operators"], ["equipment_status", "situations"],
    ] as const
    const unsubscribes = bindings.map(([source, target]) => onSnapshot(collection(db, source), (snapshot) => {
      if (!active) return
      const records = target === "equipments" ? snapshot.docs.map(equipmentFromDoc).sort((a, b) => b.dataCadastro.getTime() - a.dataCadastro.getTime())
        : target === "maintenances" ? snapshot.docs.map(maintenanceFromDoc).sort((a, b) => b.dataEntrada.getTime() - a.dataEntrada.getTime())
          : snapshot.docs.filter((doc) => target !== "situations" || !isWarrantyImeiChangeSituation(String(doc.data().nome || ""))).map((doc) => ({ ...doc.data(), id: doc.id }))
      setData((previous) => ({ ...previous, [target]: records }))
      setLastUpdate(new Date())
      received(source)
    }, () => {
      if (!active) return
      setError("Não foi possível sincronizar os dados. Verifique a conexão e tente novamente.")
      received(source)
    }))
    return () => { active = false; unsubscribes.forEach((unsubscribe) => unsubscribe()) }
  }, [revision])
  return <LiveDataContext.Provider value={{ ...data, loading, error, lastUpdate, refresh: () => setRevision((value) => value + 1) }}>{children}</LiveDataContext.Provider>
}
export function useLiveData() {
  const data = useContext(LiveDataContext)
  if (!data) throw new Error("useLiveData deve estar dentro de LiveDataProvider")
  return data
}
export function SyncStatus() {
  const { error, refresh } = useLiveData()
  if (!error) return null
  return <div role="alert" className="mb-4 rounded-lg border border-destructive/40 p-3 text-sm">{error} <button onClick={refresh} className="ml-2 underline">Tentar novamente</button></div>
}
