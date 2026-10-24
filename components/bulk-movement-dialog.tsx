"use client"

import { useState } from "react"
import * as XLSX from "xlsx"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { useLiveData } from "@/contexts/live-data-context"
import { useAuth } from "@/contexts/auth-context"
import { runBulkMovements } from "@/lib/services"
import { actionLabels, buildBulkPreview, bulkActions, checklistKeys, checklistLabels, movementHeaders, movementTemplate, type BulkAction, type BulkPreview, type BulkResult } from "@/lib/bulk-movements"
import { isMaintenanceSituation, isWarrantySentSituation } from "@/lib/validation"
import type { Equipment } from "@/lib/types"

export function BulkMovementDialog({ equipments, selectedIds, onClose, onCompleted }: { equipments: Equipment[]; selectedIds: string[]; onClose: () => void; onCompleted: (numbers: string[]) => void }) {
  const live = useLiveData()
  const { hasPermission } = useAuth()
  const isAdmin = hasPermission(["admin"])
  const actions = bulkActions.filter((action) => isAdmin || action === "iniciar_manutencao" || action === "finalizar_manutencao")
  const selected = equipments.filter((item) => selectedIds.includes(item.id))
  const [action, setAction] = useState<BulkAction>(isAdmin ? "alterar_situacao" : "iniciar_manutencao")
  const [mode, setMode] = useState(selectedIds.length ? "common" : "file")
  const [fields, setFields] = useState<Record<string, string>>(() => ({ ...Object.fromEntries(checklistKeys.map((key) => [key, "Não testado"])), condicaoRetorno: "Usada" }))
  const [newNumbers, setNewNumbers] = useState<Record<string, string>>({})
  const [sheets, setSheets] = useState<Record<string, Record<string, unknown>[]>>({})
  const [sheetName, setSheetName] = useState("")
  const [preview, setPreview] = useState<BulkPreview[]>([])
  const [outcomes, setOutcomes] = useState<(BulkResult & { number: string; row: number })[]>([])
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(0)
  const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
  const valid = preview.filter((item) => item.command)
  function update(key: string, value: string) { setFields((old) => ({ ...old, [key]: value })); setPreview([]); setOutcomes([]) }
  const choices = live.situations.filter((item) => item.ativo && !isMaintenanceSituation(item.nome)
    && (action === "finalizar_manutencao" || !isWarrantySentSituation(item.nome))
    && (action !== "retornar_garantia" || (fields.condicaoRetorno === "Nova" ? item.nome === "Nova" : item.nome !== "Nova")))
  const defects = [...new Set([...live.defects.filter((item) => item.ativo).map((item) => item.nome), "Outro"])]
  const services = [...new Set([...live.services.filter((item) => item.ativo).map((item) => item.nome), "Outro"])]
  function choice(label: string, key: string, values: string[], disabled = false) {
    return <label className="space-y-1 text-sm">{label}<select disabled={disabled} aria-label={label} className={selectClass} value={fields[key] || ""} onChange={(event) => update(key, event.target.value)}><option value="">Selecione...</option>{values.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
  }
  function text(label: string, key: string, multiline = false) {
    const props = { value: fields[key] || "", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, event.target.value), maxLength: key === "observacoes" ? 5000 : 2000, "aria-label": label }
    return <label className="block space-y-1 text-sm">{label}{multiline ? <Textarea {...props} /> : <Input {...props} />}</label>
  }
  function commonRows() {
    return selected.map((item) => ({ ...fields, numeroRemota: item.numeroRemota, novoNumeroRemota: newNumbers[item.id] || "",
      ...(action === "retornar_garantia" ? { modelo: fields.modelo || item.modelo, anoFabricacao: fields.anoFabricacao || item.anoFabricacao, OCM: fields.OCM || item.lote, operadoraAtual: fields.operadoraAtual || item.operadoraAtual } : {}) }))
  }
  function validate(rows = mode === "common" ? commonRows() : sheets[sheetName] || []) {
    setPreview([]); setOutcomes([])
    if (!rows.length) { toast.error("Selecione remotas ou carregue uma planilha com números cadastrados"); return }
    if (rows.length > 500) { toast.error("Divida a carga em lotes de até 500 linhas"); return }
    setPreview(buildBulkPreview(action, rows, equipments)); setOutcomes([])
  }
  async function loadFile(file?: File) {
    if (!file) return
    setPreview([]); setOutcomes([])
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
      const content = Object.fromEntries(workbook.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: "" })]))
      const first = workbook.SheetNames[0]
      if (!first) throw new Error("A planilha não possui abas")
      setSheets(content); setSheetName(first); validate(content[first])
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha") }
  }
  function downloadTemplate() {
    const rows = movementTemplate(action, selected.length ? selected : [])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: movementHeaders[action] }), "Movimentos")
    XLSX.writeFile(workbook, `modelo_${action}.xlsx`)
  }
  async function execute() {
    if (!valid.length || saving) return
    setSaving(true); setDone(0); setOutcomes([])
    try {
      const result = await runBulkMovements(valid.map((item) => item.command!), setDone)
      const completed = [...preview.filter((item) => !item.command).map((item) => ({ ok: false, number: item.number, row: item.row, error: item.errors.join("; ") })), ...result.map((item, index) => ({ ...item, number: valid[index].number, row: valid[index].row }))]
      setOutcomes(completed); onCompleted(completed.filter((item) => item.ok).map((item) => item.number))
      const successes = completed.filter((item) => item.ok).length
      if (successes === completed.length) toast.success(`${successes} movimentação(ões) concluída(s)`)
      else toast.warning(`${successes} concluída(s); ${completed.length - successes} pendente(s). Confira o resultado.`)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Falha no lote. Consulte os cadastros antes de repetir") }
    finally { setSaving(false) }
  }
  function downloadOutcome() {
    const rows = outcomes.length ? outcomes.map((item) => ({ numeroRemota: item.number, acao: action, resultado: item.ok ? "Concluída" : "Pendente", mensagem: item.error || "Concluída" }))
      : preview.map((item) => ({ numeroRemota: item.number, acao: action, resultado: item.command ? "Pronta para executar" : "Impedida", mensagem: item.errors.join("; ") }))
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Resultado")
    XLSX.writeFile(workbook, `resultado_${action}.xlsx`)
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>Movimentação em massa</DialogTitle><DialogDescription>Valide os dados e confira o resultado de cada remota. As regras e permissões de cada procedimento continuam sendo aplicadas.</DialogDescription></DialogHeader>
      <fieldset disabled={saving} className="space-y-4">
        <label className="block space-y-1 text-sm">Ação<select aria-label="Ação do lote" className={selectClass} value={action} onChange={(event) => { setAction(event.target.value as BulkAction); setFields({ ...Object.fromEntries(checklistKeys.map((key) => [key, "Não testado"])), condicaoRetorno: "Usada" }); setNewNumbers({}); setPreview([]); setOutcomes([]); setSheets({}); setSheetName("") }}>{actions.map((item) => <option key={item} value={item}>{actionLabels[item]}</option>)}</select></label>
        <div role="group" aria-label="Forma de preenchimento" className="flex gap-2"><Button type="button" variant={mode === "common" ? "default" : "outline"} onClick={() => { setMode("common"); setPreview([]); setOutcomes([]) }}>Mesmos dados para o lote</Button><Button type="button" variant={mode === "file" ? "default" : "outline"} onClick={() => { setMode("file"); setPreview([]); setOutcomes([]) }}>Dados por planilha</Button></div>
        {mode === "file" ? <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm">Baixe o modelo da ação selecionada. Separe vários serviços com ponto e vírgula. O número da remota deve estar cadastrado.</p>
          <Button type="button" variant="outline" onClick={downloadTemplate}>Baixar modelo desta ação</Button>
          <label className="block text-sm">Planilha de movimentações<Input type="file" accept=".xlsx,.xls" onChange={(event) => void loadFile(event.target.files?.[0])} /></label>
          {!!Object.keys(sheets).length && <label className="block space-y-1 text-sm">Aba da planilha<select aria-label="Aba da planilha" className={selectClass} value={sheetName} onChange={(event) => { setSheetName(event.target.value); validate(sheets[event.target.value]) }}>{Object.keys(sheets).map((name) => <option key={name}>{name}</option>)}</select></label>}
        </div> : <div className="space-y-3">
          <p className="text-sm font-medium">{selected.length} remota(s) selecionada(s)</p>
          {!selected.length && <p className="text-sm text-muted-foreground">Feche esta janela e selecione as remotas na tabela, ou utilize Dados por planilha.</p>}
          {action === "alterar_situacao" && <>{choice("Situação de destino", "situacaoRemota", choices.map((item) => item.nome))}{text("Motivo da movimentação", "motivoAlteracaoSituacao", true)}</>}
          {action === "iniciar_manutencao" && <>{choice("Defeito relatado", "defeitoRelatado", defects)}{fields.defeitoRelatado === "Outro" && text("Descreva o defeito relatado", "defeitoRelatadoOutro", true)}</>}
          {action === "finalizar_manutencao" && <>
            <p className="text-xs text-muted-foreground">Use os mesmos dados somente quando corresponderem aos testes e serviços efetivamente realizados em todas as remotas selecionadas.</p>
            {choice("Operadora após manutenção", "operadoraDepois", live.operators.filter((item) => item.ativo).map((item) => item.nome))}
            {choice("Defeito encontrado", "defeitoEncontrado", defects)}{fields.defeitoEncontrado === "Outro" && text("Descreva o defeito encontrado", "defeitoEncontradoOutro", true)}
            <fieldset className="rounded-lg border p-3"><legend className="text-sm">Serviços realizados</legend><div className="grid gap-2 sm:grid-cols-2">{services.map((name) => <label className="flex items-center gap-2 text-sm" key={name}><input type="checkbox" checked={(fields.servicosRealizados || "").split(";").includes(name)} onChange={(event) => { const checked = (fields.servicosRealizados || "").split(";").filter(Boolean); update("servicosRealizados", (event.target.checked ? [...checked, name] : checked.filter((item) => item !== name)).join(";")) }} />{name}</label>)}</div></fieldset>
            {(fields.servicosRealizados || "").split(";").includes("Outro") && text("Descreva o serviço realizado", "servicosRealizadosOutro", true)}
            <div className="grid gap-3 sm:grid-cols-2">{checklistKeys.map((key, index) => <div key={key}>{choice(checklistLabels[index], key, ["Não testado", "OK", "Falha"])}</div>)}</div>
            {choice("Situação após manutenção", "situacaoRemota", choices.map((item) => item.nome))}
            {isWarrantySentSituation(fields.situacaoRemota || "") && text("Motivo do envio para garantia (mínimo 10 caracteres)", "motivoGarantia", true)}
            {text("Observações da manutenção", "observacoes", true)}
          </>}
          {action === "retornar_garantia" && <>
            <p className="text-sm text-muted-foreground">IMEI diferente exige análise física para classificar como Nova ou Usada. Mesmo IMEI exige Usada. Dados cadastrais em branco serão mantidos por remota.</p>
            <label className="block space-y-1 text-sm">Condição no retorno<select aria-label="Condição no retorno do lote" className={selectClass} value={fields.condicaoRetorno} onChange={(event) => { setFields((old) => ({ ...old, condicaoRetorno: event.target.value, situacaoRemota: event.target.value === "Nova" ? "Nova" : "" })); setPreview([]); setOutcomes([]) }}><option value="Usada">Usada</option><option value="Nova">Nova</option></select></label>
            {choice("Situação no retorno", "situacaoRemota", choices.map((item) => item.nome), fields.condicaoRetorno === "Nova")}
            <div className="max-h-48 overflow-y-auto rounded-lg border p-3"><p className="mb-2 text-xs text-muted-foreground">Informe o novo IMEI por remota. Deixe vazio quando o número não mudou.</p>{selected.map((item) => <label key={item.id} className="mb-2 grid grid-cols-2 items-center gap-2 text-sm">{item.numeroRemota}<Input aria-label={`Novo IMEI de ${item.numeroRemota}`} value={newNumbers[item.id] || ""} onChange={(event) => { setNewNumbers((old) => ({ ...old, [item.id]: event.target.value })); setPreview([]); setOutcomes([]) }} /></label>)}</div>
            <div className="grid gap-3 sm:grid-cols-2">{text("Modelo recebido (opcional)", "modelo")}{text("Ano de fabricação (opcional)", "anoFabricacao")}{text("OCM (opcional)", "OCM")}{choice("Operadora no retorno (opcional)", "operadoraAtual", live.operators.filter((item) => item.ativo).map((item) => item.nome))}</div>
            {text("Descrição do retorno (mínimo 10 caracteres)", "observacoesRetorno", true)}
          </>}
          {action === "arquivar" && <p className="rounded-lg border p-3 text-sm">Os cadastros válidos serão arquivados e deixarão a operação ativa. Seus vínculos e históricos permanecerão disponíveis.</p>}
        </div>}
        <Button type="button" variant="outline" onClick={() => validate()}>Validar lote</Button>
        {!!preview.length && <div className="space-y-2"><p className="text-sm font-medium">{valid.length} válida(s) · {preview.length - valid.length} com impedimento. Somente as linhas válidas serão executadas.</p><div className="max-h-60 overflow-auto rounded-lg border"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Remota</th><th>Pré-validação</th></tr></thead><tbody>{preview.map((item) => <tr key={item.row} className="border-b"><td className="p-2">{item.number || `Linha ${item.row}`}</td><td className={item.command ? "text-success" : "text-destructive"}>{item.command ? "Pronta para executar" : item.errors.join("; ")}</td></tr>)}</tbody></table></div></div>}
        {saving && <p role="status" className="flex items-center gap-2 text-sm"><Spinner className="h-4 w-4" />{done} de {valid.length} movimentações processadas. Aguarde o resultado antes de sair.</p>}
        {!!outcomes.length && <div className="space-y-2"><p className="font-medium">Resultado: {outcomes.filter((item) => item.ok).length} concluída(s) · {outcomes.filter((item) => !item.ok).length} pendente(s)</p><div className="max-h-60 overflow-auto rounded-lg border"><table aria-label="Resultado do lote" className="w-full text-sm"><tbody>{outcomes.map((item) => <tr key={item.row} className="border-b"><td className="p-2">{item.number}</td><td className={item.ok ? "text-success" : "text-destructive"}>{item.ok ? "Concluída" : item.error}</td></tr>)}</tbody></table></div><Button type="button" variant="outline" onClick={downloadOutcome}>Baixar resultado</Button></div>}
      </fieldset>
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Fechar</Button><Button type="button" disabled={saving || !valid.length || !!outcomes.length} onClick={() => void execute()}>Executar {valid.length} movimentação(ões)</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
