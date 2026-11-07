"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/lib/api-response"
import { saveMaintenanceDraft } from "@/lib/services"
import { listDraftBackups, readDraftBackup } from "@/lib/draft-recovery"
import type { Maintenance, Equipment } from "@/lib/types"
import type { MaintenanceDraft } from "@/lib/validation"
let browserTabId: string | undefined

function initial(maintenance: Maintenance, equipment: Equipment): MaintenanceDraft {
  return maintenance.draft || {
    defeitoEncontrado: maintenance.defeitoEncontrado || "", defeitoEncontradoOutro: maintenance.defeitoEncontradoOutro || "",
    servicosRealizados: maintenance.servicosRealizados || [], servicosRealizadosOutro: maintenance.servicosRealizadosOutro || "",
    operadoraDepois: maintenance.operadoraDepois || equipment.operadoraAtual, checklist: maintenance.checklist,
    observacoes: maintenance.observacoes || "", situacaoRemota: "", motivoGarantia: maintenance.motivoGarantia || "",
  }
}
export function useMaintenanceDraft(maintenance: Maintenance, equipment: Equipment, userId: string) {
  const [fields, setFields] = useState(() => initial(maintenance, equipment))
  const [message, setMessage] = useState(maintenance.draft ? "Rascunho salvo" : "O preenchimento será salvo automaticamente")
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const fieldsRef = useRef(fields)
  const saved = useRef(JSON.stringify(fields))
  const version = useRef(maintenance.draftVersion || 0)
  const localVersion = useRef(maintenance.draftVersion || 0)
  const pending = useRef<Promise<void> | null>(null)
  const stopped = useRef(false)
  const prefix = `remotas:draft:${userId}:${maintenance.id}`
  const storageKey = useRef<string | null>(null)
  const [localCopies, setLocalCopies] = useState<ReturnType<typeof listDraftBackups>>([])
  const latest = useRef({ maintenance, equipment })
  useEffect(() => { latest.current = { maintenance, equipment } }, [maintenance, equipment])
  const backup = useCallback((data: MaintenanceDraft) => {
    try { if (storageKey.current) localStorage.setItem(storageKey.current, JSON.stringify({ data, version: localVersion.current, at: Date.now() })); setLocalCopies(listDraftBackups(localStorage, prefix)) } catch { /* O servidor continua disponível sem armazenamento local. */ }
  }, [prefix])
  const update = <K extends keyof MaintenanceDraft>(key: K, value: MaintenanceDraft[K]) => {
    const next = { ...fieldsRef.current, [key]: value }
    fieldsRef.current = next
    setFields(next)
    backup(next)
    setMessage("Alterações ainda não salvas no servidor")
  }
  useEffect(() => {
    let recovered: ReturnType<typeof readDraftBackup> = null
    try {
      if (!browserTabId) {
        const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
        browserTabId = (navigation?.type === "reload" ? sessionStorage.getItem("remotas:draft-tab") : null) || crypto.randomUUID()
        sessionStorage.setItem("remotas:draft-tab", browserTabId)
      }
      storageKey.current = `${prefix}:${browserTabId}`
      const copies = listDraftBackups(localStorage, prefix)
      setLocalCopies(copies)
      recovered = readDraftBackup(localStorage.getItem(storageKey.current)) || copies[0] || readDraftBackup(localStorage.getItem(prefix))
    } catch { /* Sem armazenamento local. */ }
    if (recovered && JSON.stringify(recovered.data) !== saved.current) {
      localVersion.current = recovered.version
      fieldsRef.current = recovered.data
      setFields(recovered.data)
      const stale = recovered.version !== version.current
      setConflict(stale)
      setMessage(stale ? "Há texto local e uma versão mais recente no servidor. Baixe seu texto antes de carregar a versão salva." : "Preenchimento recuperado deste navegador")
    }
    const refreshCopies = (event: StorageEvent) => { if (event.key?.startsWith(`${prefix}:`)) { try { setLocalCopies(listDraftBackups(localStorage, prefix)) } catch { /* Sem armazenamento local. */ } } }
    window.addEventListener("storage", refreshCopies)
    return () => window.removeEventListener("storage", refreshCopies)
  }, [prefix])
  const save = useCallback(async () => {
    if (pending.current) await pending.current
    if (stopped.current || JSON.stringify(fieldsRef.current) === saved.current) return
    const data = fieldsRef.current
    const serialized = JSON.stringify(data)
    setSaving(true)
    const work = (async () => {
      try {
        const result = await saveMaintenanceDraft(maintenance.id, equipment.id, data, version.current)
        version.current = result.version
        localVersion.current = result.version
        saved.current = serialized
        backup(fieldsRef.current)
        setMessage(JSON.stringify(fieldsRef.current) === serialized ? "Rascunho salvo" : "Alterações ainda não salvas no servidor")
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) setConflict(true)
        setMessage(error instanceof Error ? error.message : "Não foi possível salvar. Seu texto permanece neste navegador")
        throw error
      } finally { pending.current = null; setSaving(false) }
    })()
    pending.current = work
    await work
  }, [maintenance.id, equipment.id, backup])
  useEffect(() => {
    if (conflict || stopped.current || JSON.stringify(fields) === saved.current) return
    const timer = setTimeout(() => { void save().catch(() => {}) }, 1500)
    return () => clearTimeout(timer)
  }, [fields, conflict, save])
  useEffect(() => {
    if (saving || pending.current || (maintenance.draftVersion || 0) <= version.current) return
    if (JSON.stringify(fieldsRef.current) !== saved.current) {
      setConflict(true)
      setMessage("Rascunho atualizado em outra aba. Seu texto foi preservado; baixe uma cópia antes de carregar a versão salva.")
    } else {
      const data = initial(maintenance, equipment)
      version.current = maintenance.draftVersion || 0
      localVersion.current = version.current
      saved.current = JSON.stringify(data)
      fieldsRef.current = data
      setFields(data)
      setMessage("Rascunho salvo")
    }
  }, [maintenance, equipment, saving])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(fieldsRef.current) !== saved.current) { event.preventDefault(); event.returnValue = "" }
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [])
  const reload = () => {
    const { maintenance: current, equipment: eq } = latest.current
    const data = initial(current, eq)
    version.current = current.draftVersion || 0
    localVersion.current = version.current
    saved.current = JSON.stringify(data)
    fieldsRef.current = data
    setFields(data)
    setConflict(false)
    setMessage("Rascunho salvo carregado")
    backup(data)
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(fieldsRef.current, null, 2)], { type: "application/json" }))
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `rascunho-${maintenance.numeroRemota}.json`; anchor.click(); URL.revokeObjectURL(url)
  }
  const recoverCopy = (key: string) => {
    try {
      if (!key.startsWith(`${prefix}:`)) return
      const copy = readDraftBackup(localStorage.getItem(key))
      if (!copy) return
      fieldsRef.current = copy.data; setFields(copy.data)
      localVersion.current = copy.version
      setConflict(copy.version !== version.current)
      setMessage(copy.version !== version.current ? "Versão local recuperada. Baixe seu texto antes de carregar a versão salva no servidor." : "Versão local recuperada; confira antes de salvar")
      backup(copy.data)
    } catch { setMessage("Não foi possível recuperar esta cópia local") }
  }
  const clear = () => { stopped.current = true; saved.current = JSON.stringify(fieldsRef.current); try { if (storageKey.current) localStorage.removeItem(storageKey.current) } catch { /* Sem armazenamento local. */ } }
  return { fields, update, save, clear, reload, download, conflict, saving, message, localCopies, recoverCopy }
}
