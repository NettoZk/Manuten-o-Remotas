"use client"

import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { returnWarranty, rectifyWarrantyReturn } from "@/lib/services"
import { isMaintenanceSituation, isWarrantySentSituation, isWarrantySeparatedSituation } from "@/lib/validation"
import type { Equipment, EquipmentSituation, Operator, Warranty } from "@/lib/types"

export function WarrantyDialog({ equipment, situations, operators, onClose, correction }: {
  equipment: Equipment; situations: EquipmentSituation[]; operators: Operator[]; onClose: () => void; correction?: Warranty
}) {
  const [openedWarranty] = useState(equipment.garantia)
  const [openedVersion] = useState(equipment.operationVersion || 0)
  const initial = correction?.returnData
  const stale = equipment.garantia?.id !== openedWarranty?.id || equipment.garantia?.status !== openedWarranty?.status
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState(initial?.observacoesRetorno || ""), [correctionReason, setCorrectionReason] = useState("")
  const [situation, setSituation] = useState(initial?.situacaoRemota || "")
  const [changed, setChanged] = useState(!!correction?.imeiAlterado)
  const [number, setNumber] = useState(correction?.novoNumeroRemota || "")
  const [model, setModel] = useState(initial?.modelo || equipment.modelo)
  const [year, setYear] = useState(initial?.anoFabricacao || equipment.anoFabricacao)
  const [ocm, setOcm] = useState(initial?.lote || equipment.lote)
  const [operator, setOperator] = useState(initial?.operadoraAtual || equipment.operadoraAtual)
  const [status, setStatus] = useState<Equipment["status"]>(initial?.status || "Usada")
  const choices = situations.filter((item) => item.ativo && !isMaintenanceSituation(item.nome) && !isWarrantySentSituation(item.nome) && !isWarrantySeparatedSituation(item.nome) && (status === "Nova" ? item.nome === "Nova" : item.nome !== "Nova"))
  const [notes, setNotes] = useState(initial?.observacoes ?? equipment.observacoes ?? "")
  if (!openedWarranty || openedWarranty.status !== (correction ? "retornada" : "enviada")) return null
  const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (stale) { toast.error("O estado da garantia mudou. Feche e abra o cadastro novamente."); return }
    if (changed && (!number.trim() || number.trim() === equipment.numeroRemota)) { toast.error("Informe um novo número/IMEI diferente do anterior"); return }
    setSaving(true)
    try {
      const data = { garantiaId: openedWarranty!.id, numeroRemota: changed ? number.trim() : equipment.numeroRemota,
        modelo: model, anoFabricacao: year, lote: ocm, operadoraAtual: operator, status, situacaoRemota: situation, observacoes: notes, observacoesRetorno: reason }
      if (correction) await rectifyWarrantyReturn(equipment.id, correction.id, data, correctionReason, openedVersion)
      else await returnWarranty(equipment.id, data)
      toast.success(changed ? "Retorno registrado. Nova remota vinculada e cadastro anterior arquivado." : "Retorno da garantia registrado")
      onClose()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar a garantia") }
    finally { setSaving(false) }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />{correction ? "Retificar retorno da garantia" : "Registrar retorno da garantia"}</DialogTitle>
        <DialogDescription>Remota {equipment.numeroRemota}. Confira os dados do equipamento recebido.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {stale && <p role="alert" className="rounded-lg border border-warning/40 p-3 text-sm">O estado da garantia mudou em outra sessão. Feche e abra o cadastro novamente.</p>}
        <fieldset disabled={saving || stale} className="space-y-4">
            <p className="rounded-lg bg-muted/40 p-3 text-sm">Enviada em {openedWarranty.enviadaEm?.toLocaleDateString("pt-BR") || "data não informada"}{openedWarranty.maintenanceId ? " após manutenção." : "."}</p>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={changed} onChange={(event) => { setChanged(event.target.checked); if (!event.target.checked) { setStatus("Usada"); setSituation("") } }} />O número/IMEI mudou na garantia</label>
            {changed && <div className="space-y-2 rounded-lg border border-primary/30 p-3">
              <label className="block space-y-1 text-sm">Novo número/IMEI *<Input required value={number} maxLength={100} onChange={(event) => setNumber(event.target.value)} /></label>
              <p className="text-xs text-muted-foreground">Será criado outro cadastro vinculado a {equipment.numeroRemota}. A remota anterior ficará arquivada e manterá suas manutenções.</p>
              <p className="text-xs text-muted-foreground">Um IMEI diferente também pode resultar de uma alteração interna. Confira fisicamente o equipamento para informar se ele é Novo ou Usado.</p>
            </div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">Modelo recebido *<Input required value={model} maxLength={160} onChange={(event) => setModel(event.target.value)} /></label>
              <label className="space-y-1 text-sm">Ano de fabricação *<Input required value={year} maxLength={20} onChange={(event) => setYear(event.target.value)} /></label>
              <label className="space-y-1 text-sm">OCM *<Input required value={ocm} maxLength={100} onChange={(event) => setOcm(event.target.value)} /></label>
              <label className="space-y-1 text-sm">Operadora no retorno *<select required className={selectClass} value={operator} onChange={(event) => setOperator(event.target.value)}><option value="">Selecione...</option>{operators.filter((item) => item.ativo).map((item) => <option key={item.id} value={item.nome}>{item.nome}</option>)}</select></label>
              <label className="space-y-1 text-sm">Condição no retorno *<select required disabled={!changed} className={selectClass} value={status} onChange={(event) => { const condition = event.target.value as Equipment["status"]; setStatus(condition); setSituation(condition === "Nova" ? "Nova" : "") }}><option value="Nova">Nova</option><option value="Usada">Usada</option></select></label>
            </div>
          <label className="block space-y-1 text-sm">Situação no retorno *
            <select required disabled={status === "Nova"} className={selectClass} value={situation} onChange={(event) => setSituation(event.target.value)}><option value="">Selecione...</option>{choices.map((item) => <option key={item.id} value={item.nome}>{item.nome}</option>)}</select>
          </label>
          <p className="text-xs text-muted-foreground">{!changed ? "Mesmo IMEI: condição Usada. Informe a situação de acordo com o resultado da garantia." : status === "Nova" ? "Equipamento novo: situação Nova definida automaticamente." : "Equipamento usado: selecione a situação apurada na análise do retorno."}</p>
          {!choices.length && <p role="alert" className="text-sm text-destructive">Cadastre uma situação de retorno ativa em Listas.</p>}
          <label className="block space-y-1 text-sm">Descrição do retorno *<Textarea required minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Descreva com pelo menos 10 caracteres" /></label>
          <label className="block space-y-1 text-sm">Observações do cadastro<Textarea value={notes} maxLength={5000} onChange={(event) => setNotes(event.target.value)} /></label>
          {correction && <label className="block space-y-1 text-sm">Motivo da retificação<Textarea required minLength={10} maxLength={2000} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></label>}
        </fieldset>
        <DialogFooter className="gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving || stale || !choices.length || (!!correction && correctionReason.trim().length < 10)}>{saving && <Spinner className="mr-2 h-4 w-4" />}{correction ? "Salvar retificação do retorno" : "Confirmar retorno"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
