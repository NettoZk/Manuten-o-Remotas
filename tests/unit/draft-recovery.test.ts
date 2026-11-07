import { expect, it } from "vitest"
import { readDraftBackup } from "@/lib/draft-recovery"

const data = { defeitoEncontrado: "", servicosRealizados: [], operadoraDepois: "Claro", situacaoRemota: "", observacoes: "texto", checklist: Object.fromEntries(["leituraSIMCard", "firmwareAtualizado", "sinal", "apnEnergiza", "comunicacaoMedidor", "comunicacaoIRIS"].map((key) => [key, "Não testado"])) }
it("recupera texto recente por versão e recusa backups inválidos ou vencidos", () => {
  const now = Date.now()
  const backup = JSON.stringify({ data, version: 2, at: now })
  expect(readDraftBackup(backup, now)).toMatchObject({ version: 2, data: { observacoes: "texto" } })
  expect(readDraftBackup(backup, now + 8 * 86400000)).toBeNull()
  expect(readDraftBackup('{"data":{"observacoes":"texto"}}', now)).toBeNull()
  expect(readDraftBackup("JSON quebrado", now)).toBeNull()
})
