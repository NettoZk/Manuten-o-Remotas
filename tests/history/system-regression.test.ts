import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import bcrypt from "bcryptjs"
import { createHash } from "node:crypto"
import { deleteApp, getApps } from "firebase-admin/app"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from "firebase/app"
import { getAuth as clientAuth, connectAuthEmulator, signInWithCustomToken } from "firebase/auth"
import { getFirestore as clientFirestore, connectFirestoreEmulator, getDocs, collection, doc, setDoc, terminate } from "firebase/firestore"
import { executeOperation } from "@/lib/server/operations"
import { getAdmin } from "@/lib/server/firebase-admin"
import { POST as login } from "@/app/api/auth/login/route"
import { POST as dataRoute } from "@/app/api/data/[operation]/route"
import { GET as me } from "@/app/api/auth/me/route"
import { POST as setup } from "@/app/api/setup/route"

if (process.env.FIREBASE_PROJECT_ID !== "demo-remotas-history" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8181" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199") throw new Error("Estes testes aceitam somente os emuladores locais demo-remotas-history")
const { db, auth } = getAdmin()
const admin = { id: "qa-admin", nome: "Admin QA", username: "qa.admin", tipo: "admin" as const, ativo: true as const, criadoEm: null }
const tech = { ...admin, id: "qa-tech", username: "qa.tech", tipo: "tecnico" as const }
const viewer = { ...admin, id: "qa-viewer", username: "qa.viewer", tipo: "usuario" as const }
const equipment = { numeroRemota: "QA-SISTEMA-1", modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-QA", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem" }
const conclusion = { defeitoEncontrado: "Sem comunicação", servicosRealizados: ["Teste de bancada"], operadoraDepois: "Claro", situacaoRemota: "Recuperada", observacoes: "", checklist: { leituraSIMCard: "OK", firmwareAtualizado: "OK", sinal: "OK", apnEnergiza: "OK", comunicacaoMedidor: "OK", comunicacaoIRIS: "OK" } }
const previousSetupToken = process.env.FIREBASE_SETUP_TOKEN
function request(body: unknown, headers: Record<string, string> = {}) { return new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }) }
const call = (operation: string, args: unknown[], token?: string) => dataRoute(request({ args }, token ? { authorization: `Bearer ${token}` } : {}), { params: Promise.resolve({ operation }) })
async function idToken(actor: typeof admin | typeof tech | typeof viewer = admin) {
  const response = await login(request({ username: actor.username, password: "teste1234" }))
  expect(response.status).toBe(200)
  const custom = (await response.json()).token
  const signed = await fetch("http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) })
  expect(signed.ok).toBe(true)
  return (await signed.json()).idToken as string
}
async function openMaintenance() {
  const id = await executeOperation("createEquipment", [equipment], admin) as string
  const maintenanceId = await executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], tech) as string
  return { id, maintenanceId }
}
async function sentWarranty() {
  const { id, maintenanceId } = await openMaintenance()
  await executeOperation("finalizeMaintenance", [maintenanceId, id, { ...conclusion, situacaoRemota: "Separado para garantia", motivoGarantia: "Falha persistente constatada após avaliação técnica" }], tech)
  const warrantyId = (await db.collection("equipments").doc(id).get()).data()!.garantia.id
  await executeOperation("sendWarranty", [id, warrantyId], tech)
  return { id, maintenanceId, warrantyId }
}
beforeEach(async () => {
  for (const url of ["http://127.0.0.1:8181/emulator/v1/projects/demo-remotas-history/databases/(default)/documents", "http://127.0.0.1:9199/emulator/v1/projects/demo-remotas-history/accounts"]) expect((await fetch(url, { method: "DELETE" })).ok).toBe(true)
  const hash = await bcrypt.hash("teste1234", 4)
  const batch = db.batch()
  for (const actor of [admin, tech, viewer]) batch.set(db.collection("users").doc(actor.id), { nome: actor.nome, username: actor.username, tipo: actor.tipo, ativo: true, senhaHash: hash, criadoEm: Timestamp.now() })
  for (const [name, values] of Object.entries({ operators: ["Claro", "Vivo"], equipment_status: ["Nova", "Triagem", "Manutenção", "Recuperada", "Enviado para Garantia", "Separado para garantia", "Sucata"], defects: ["Sem comunicação"], services: ["Teste de bancada"] })) values.forEach((nome, index) => batch.set(db.collection(name).doc(`ref-${index}`), { nome, ativo: true }))
  await batch.commit()
  process.env.FIREBASE_SETUP_TOKEN = "token-ficticio-de-setup"
})
afterAll(async () => {
  if (previousSetupToken === undefined) delete process.env.FIREBASE_SETUP_TOKEN
  else process.env.FIREBASE_SETUP_TOKEN = previousSetupToken
  await db.terminate()
  for (const app of getApps()) await deleteApp(app)
})

describe("login, sessão e autorização real da API", () => {
  it("entra com usuário legado e autentica a sessão via Firebase Auth", async () => {
    const token = await idToken()
    const response = await me(new Request("http://localhost/api/auth/me", { headers: { authorization: `Bearer ${token}` } }))
    expect(response.status).toBe(200)
    expect((await response.json()).user.id).toBe(admin.id)
    expect((await auth.getUser(admin.id)).uid).toBe(admin.id)
  })
  it("recusa senha incorreta, usuário inexistente e usuário inativo com a mesma mensagem", async () => {
    const first = await login(request({ username: admin.username, password: "errada" }))
    const second = await login(request({ username: "nao.existe", password: "errada" }))
    await db.collection("users").doc(admin.id).update({ ativo: false })
    const third = await login(request({ username: admin.username, password: "teste1234" }))
    expect([first.status, second.status, third.status]).toEqual([401, 401, 401])
    expect((await first.json()).error).toBe((await second.json()).error)
  })
  it("bloqueia excesso de tentativas e permite nova janela após expirar", async () => {
    const ref = db.collection("login_attempts").doc(createHash("sha256").update(admin.username).digest("hex"))
    await ref.set({ count: 10, startedAt: Timestamp.now() })
    expect((await login(request({ username: admin.username, password: "teste1234" }))).status).toBe(429)
    await ref.update({ startedAt: Timestamp.fromMillis(Date.now() - 16 * 60_000) })
    expect((await login(request({ username: admin.username, password: "teste1234" }))).status).toBe(200)
  })
  it("recusa API sem sessão e com token inválido", async () => {
    expect((await call("getUsers", [])).status).toBe(401)
    expect((await call("getUsers", [], "invalido")).status).toBe(401)
  })
  it("aplica permissões pelo perfil e retira o acesso de usuário desativado", async () => {
    const token = await idToken(viewer)
    expect((await call("getUsers", [], token)).status).toBe(403)
    expect((await call("createEquipment", [equipment], token)).status).toBe(403)
    await db.collection("users").doc(viewer.id).update({ ativo: false })
    expect((await call("getUsers", [], token)).status).toBe(403)
  })
  it("mantém o setup fechado sem chave e após a instalação", async () => {
    expect((await setup(request({ nome: "QA", username: "novo.admin", password: "teste1234" }))).status).toBe(403)
    expect((await setup(request({ nome: "QA", username: "novo.admin", password: "teste1234" }, { "x-setup-token": "token-ficticio-de-setup" }))).status).toBe(409)
  })
})

describe("cadastros, referências e administração", () => {
  it("lote impedido conserva IMEI informado e linha da planilha sem depender de diário de sucesso", async () => {
    const runId = "cbb12804-84bf-4aa3-b7e6-259c936cb22e"
    await executeOperation("bulkMovements", [[{ operation: "archiveEquipment", args: ["inexistente"], number: "QA-REMOTA-IMPEDIDA", sourceRow: 42 }], runId], admin)
    const items = await executeOperation("getBatchItems", [runId], admin) as { number: string; sourceRow: number; ok: boolean }[]
    expect(items[0]).toMatchObject({ number: "QA-REMOTA-IMPEDIDA", sourceRow: 42, ok: false })
  })
  it("exclusão preserva equipamento com histórico físico após o recebimento", async () => {
    await db.collection("equipment_status").doc("estoque").set({ nome: "Disponibilizado para estoque", ativo: true })
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    await executeOperation("dispatchEquipment", [id, { type: "estoque", destination: "Estoque central", recipientName: "Equipe responsável" }, 1], tech)
    const eq = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("receiveEquipment", [id, eq.placement.id, "Recebido no estoque", eq.operationVersion], tech)
    await db.collection("equipments").doc(id).update({ placement: FieldValue.delete() })
    expect(await executeOperation("hasEquipmentHistory", [id], admin)).toBe(true)
    await expect(executeOperation("deleteEquipment", [id], admin)).rejects.toThrow("histórico")
    expect((await db.collection("equipments").doc(id).get()).exists).toBe(true)
    await executeOperation("archiveEquipment", [id], admin)
    expect((await db.collection("equipments").doc(id).get()).data()!.estadoRegistro).toBe("inativo")
  })
  it("histórico do lote preserva os dados técnicos anteriores e os da conclusão confirmada", async () => {
    const { id, maintenanceId } = await openMaintenance(), runId = "81b3c535-3dca-45bc-8f3e-15a5a30ce027"
    const result = await executeOperation("bulkMovements", [[{ operation: "finalizeMaintenance", args: [maintenanceId, id, { ...conclusion, observacoes: "Conclusão técnica conferida no lote" }] }], runId], tech) as { ok: boolean }[]
    expect(result[0].ok).toBe(true)
    const items = await executeOperation("getBatchItems", [runId], admin) as { procedure: { before: { status: string }; after: { status: string; observacoes: string } } }[]
    expect(items[0].procedure.before.status).toBe("em_andamento")
    expect(items[0].procedure.after.status).toBe("finalizada")
    expect(items[0].procedure.after.observacoes).toBe("Conclusão técnica conferida no lote")
  })
  it("recusa prévia antiga do lote e mantém a edição posterior intacta", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    const version = (await db.collection("equipments").doc(id).get()).data()!.operationVersion
    await executeOperation("updateEquipment", [id, { modelo: "Modelo conferido por outra pessoa" }], admin)
    const result = await executeOperation("bulkMovements", [[{ operation: "updateEquipmentSituationManual", args: [id, { situacaoRemota: "Recuperada" }], expectedVersion: version }]], admin) as { ok: boolean; error?: string }[]
    expect(result[0].ok).toBe(false); expect(result[0].error).toContain("atualizado")
    const current = (await db.collection("equipments").doc(id).get()).data()!
    expect(current.situacaoRemota).toBe("Triagem"); expect(current.modelo).toBe("Modelo conferido por outra pessoa")
  })
  it("registra destino físico e recebimento identificado sem confundir trânsito com situação técnica", async () => {
    await db.collection("equipment_status").doc("estoque").set({ nome: "Disponibilizado para estoque", ativo: true })
    const id = await executeOperation("createEquipment", [equipment], admin) as string, ref = db.collection("equipments").doc(id)
    await expect(executeOperation("dispatchEquipment", [id, { type: "estoque", destination: "", recipientName: "Equipe estoque" }, 1], tech)).rejects.toThrow()
    await executeOperation("dispatchEquipment", [id, { type: "estoque", destination: "Almoxarifado central", recipientName: "Equipe estoque" }, 1], tech)
    const transit = (await ref.get()).data()!
    expect(transit.situacaoRemota).toBe("Triagem"); expect(transit.placement.status).toBe("em_transito")
    await expect(executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], tech)).rejects.toThrow("trânsito")
    await expect(executeOperation("archiveEquipment", [id], admin)).rejects.toThrow("trânsito")
    await expect(executeOperation("updateEquipment", [id, { modelo: "Outro" }], admin)).rejects.toThrow("trânsito")
    await executeOperation("receiveEquipment", [id, transit.placement.id, "Recebido e conferido pela equipe do estoque", transit.operationVersion], tech)
    const received = (await ref.get()).data()!
    expect(received.placement.status).toBe("recebida"); expect(received.placement.receivedBy).toBe(tech.nome)
    expect(received.situacaoRemota).toBe("Disponibilizado para estoque")
    const movements = await executeOperation("getPhysicalMovements", [id], viewer) as { origin: string; receivedBy: string }[]
    expect(movements[0].origin).toBe("Origem não registrada"); expect(movements[0].receivedBy).toBe(tech.nome)
    await expect(executeOperation("receiveEquipment", [id, transit.placement.id, "Tentativa de recebimento repetido do mesmo equipamento", received.operationVersion], tech)).rejects.toThrow()
  })
  it("movimenta e recebe em massa com permissões, impedimentos e resultado por item", async () => {
    await db.collection("equipment_status").doc("polo").set({ nome: "Disponibilizada para polo", ativo: true })
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    await expect(executeOperation("dispatchEquipment", [id, { type: "polo", destination: "Polo A", recipientName: "Equipe A" }, 1], viewer)).rejects.toThrow("técnicos")
    const result = await executeOperation("bulkMovements", [[{ operation: "dispatchEquipment", args: [id, { type: "polo", destination: "Polo A", recipientName: "Equipe A" }, 1] }]], tech) as { ok: boolean }[]
    expect(result[0].ok).toBe(true)
    const eq = (await db.collection("equipments").doc(id).get()).data()!
    const received = await executeOperation("bulkMovements", [[{ operation: "receiveEquipment", args: [id, eq.placement.id, "Conferido pelo responsável pelo recebimento", eq.operationVersion] }]], tech) as { ok: boolean }[]
    expect(received[0].ok).toBe(true)
  })
  it("conserva lotes com antes/depois e reverte somente itens sem atividade posterior", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string, runId = "c9114157-aedd-4129-8d09-be9a3cd5db04"
    await executeOperation("bulkMovements", [[{ operation: "updateEquipmentSituationManual", args: [id, { situacaoRemota: "Recuperada" }] }, { operation: "archiveEquipment", args: ["inexistente"] }], runId], admin)
    const batches = await executeOperation("getBatchHistory", [], admin) as { id: string }[]
    expect(batches.some((batch) => batch.id === runId)).toBe(true)
    const items = await executeOperation("getBatchItems", [runId], admin) as { id: string; before: Record<string, unknown>; after: Record<string, unknown>; ok: boolean }[]
    const changed = items.find((item) => item.ok)!
    expect(changed.before.situacaoRemota).toBe("Triagem"); expect(changed.after.situacaoRemota).toBe("Recuperada")
    expect(items.some((item) => !item.ok)).toBe(true)
    await executeOperation("reverseBatchItem", [runId, changed.id, "Situação aplicada indevidamente no lote selecionado"], admin)
    expect((await db.collection("equipments").doc(id).get()).data()!.situacaoRemota).toBe("Triagem")
    await expect(executeOperation("reverseBatchItem", [runId, changed.id, "Tentativa repetida de correção de um mesmo item"], admin)).rejects.toThrow()
  })
  it("importação usa lote durável e recusa estorno após edição posterior", async () => {
    const runId = "919df346-b607-4cfb-b158-f23176dba6b3"
    const results = await executeOperation("bulkMovements", [[{ operation: "createEquipment", args: [equipment] }], runId], admin) as { result: string }[]
    const id = results[0].result
    const items = await executeOperation("getBatchItems", [runId], admin) as { id: string }[]
    await executeOperation("updateEquipment", [id, { observacoes: "Conferência posterior do cadastro importado" }], admin)
    await expect(executeOperation("reverseBatchItem", [runId, items[0].id, "Cadastro importado por engano no lote de demonstração"], admin)).rejects.toThrow("posterior")
  })
  it("preserva histórico de um responsável intermediário ao remover seu acesso", async () => {
    const middle = "tecnico-intermediario"
    await db.collection("users").doc(middle).set({ nome: "Intermediário", username: "intermedio", tipo: "tecnico", ativo: true })
    const { id, maintenanceId } = await openMaintenance()
    let eq = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("transferMaintenance", [maintenanceId, id, middle, "Redistribuição do atendimento durante ausência do técnico", eq.operationVersion], admin)
    eq = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("transferMaintenance", [maintenanceId, id, tech.id, "Devolução ao responsável que iniciou o atendimento", eq.operationVersion], admin)
    await expect(executeOperation("deleteUser", [middle], admin)).rejects.toThrow("histórico")
  })
  it("valida condição e situação após combinar a alteração parcial com o cadastro atual", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    await expect(executeOperation("updateEquipment", [id, { situacaoRemota: "Nova" }], admin)).rejects.toThrow("usada")
    await expect(executeOperation("updateEquipmentSituationManual", [id, { situacaoRemota: "Nova" }], admin)).rejects.toThrow("usada")
    const fresh = await executeOperation("createEquipment", [{ ...equipment, numeroRemota: "NOVA-PARCIAL", status: "Nova", situacaoRemota: "Nova" }], admin) as string
    await expect(executeOperation("updateEquipment", [fresh, { status: "Usada" }], admin)).rejects.toThrow("usada")
    expect((await db.collection("equipments").doc(fresh).get()).data()?.status).toBe("Nova")
  })
  it.each(["Nova", "Triagem", "Manutenção", "Separado para garantia", "Enviado para Garantia"])("preserva a situação essencial %s", async (nome) => {
    const ref = (await db.collection("equipment_status").where("nome", "==", nome).get()).docs[0]
    await expect(executeOperation("deleteEquipmentSituation", [ref.id], admin)).rejects.toThrow("essencial")
    await expect(executeOperation("updateEquipmentSituation", [ref.id, { nome: "Outro nome" }], admin)).rejects.toThrow("essencial")
    expect((await ref.ref.get()).data()?.ativo).toBe(true)
  })
  it("não cria referências duplicadas por variações de maiúsculas e espaços", async () => {
    await executeOperation("createOperator", ["Operadora de Teste"], admin)
    await expect(executeOperation("createOperator", ["  operadora  de teste "], admin)).rejects.toThrow("já existe")
  })
  it("cria, atualiza, redefine senha e exclui usuário sem expor hash", async () => {
    const id = await executeOperation("createUser", ["novo.qa", "teste1234", "Novo QA", "tecnico"], admin) as string
    await expect(executeOperation("createUser", ["novo.qa", "teste1234", "Duplicado", "usuario"], admin)).rejects.toThrow("já está em uso")
    await executeOperation("updateUser", [id, { nome: "Nome atualizado" }], admin)
    const users = await executeOperation("getUsers", [], admin) as Record<string, unknown>[]
    expect(users.find((item) => item.id === id)?.nome).toBe("Nome atualizado")
    expect(users.every((item) => !("senhaHash" in item))).toBe(true)
    await executeOperation("updateUserPassword", [id, "novasenha123"], admin)
    expect(await bcrypt.compare("novasenha123", (await db.collection("users").doc(id).get()).data()!.senhaHash)).toBe(true)
    await executeOperation("deleteUser", [id], admin)
    expect((await db.collection("users").doc(id).get()).exists).toBe(false)
  })
  it("protege o próprio administrador e mantém ao menos um administrador em alterações concorrentes", async () => {
    await expect(executeOperation("deleteUser", [admin.id], admin)).rejects.toThrow("próprio acesso")
    const second = { ...admin, id: "segundo-admin", username: "segundo.admin" }
    await db.collection("users").doc(second.id).set({ nome: "Segundo", username: second.username, tipo: "admin", ativo: true })
    const result = await Promise.allSettled([executeOperation("updateUser", [second.id, { tipo: "tecnico" }], admin), executeOperation("updateUser", [admin.id, { tipo: "tecnico" }], second)])
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(1)
    expect((await db.collection("users").where("tipo", "==", "admin").where("ativo", "==", true).get()).size).toBe(1)
  })
  it("não duplica números em cadastros concorrentes e preserva OCM nas alterações", async () => {
    const result = await Promise.allSettled([executeOperation("createEquipment", [equipment], admin), executeOperation("createEquipment", [equipment], admin)])
    const created = result.filter((item): item is PromiseFulfilledResult<unknown> => item.status === "fulfilled")
    expect(created).toHaveLength(1)
    const id = created[0].value as string
    await executeOperation("updateEquipment", [id, { lote: "OCM-ATUALIZADA", modelo: "RT-2000" }], admin)
    expect((await db.collection("equipments").doc(id).get()).data()?.lote).toBe("OCM-ATUALIZADA")
  })
  it("limita o técnico às situações iniciais e impede o perfil de consulta de alterar cadastros", async () => {
    await expect(executeOperation("createEquipment", [{ ...equipment, situacaoRemota: "Recuperada" }], tech)).rejects.toThrow("Situação inicial")
    await expect(executeOperation("createEquipment", [equipment], viewer)).rejects.toThrow("técnicos")
    const id = await executeOperation("createEquipment", [equipment], tech) as string
    await expect(executeOperation("updateEquipment", [id, { modelo: "RT-2000" }], tech)).rejects.toThrow("administradores")
  })
  it("desativa referências sem apagar o histórico e recusa uso futuro da referência", async () => {
    const id = await executeOperation("createEquipment", [{ ...equipment, situacaoRemota: "Recuperada" }], admin) as string
    const reference = (await db.collection("equipment_status").where("nome", "==", "Recuperada").get()).docs[0]
    await executeOperation("deleteEquipmentSituation", [reference.id], admin)
    expect((await reference.ref.get()).data()?.ativo).toBe(false)
    expect((await db.collection("equipments").doc(id).get()).data()?.situacaoRemota).toBe("Recuperada")
    await expect(executeOperation("createEquipment", [{ ...equipment, numeroRemota: "QA-2", situacaoRemota: "Recuperada" }], admin)).rejects.toThrow("Valor indisponível")
  })
})

describe("procedimentos de manutenção e garantia", () => {
  it("relatório de reincidência exclui cancelamentos e encerramentos forçados e lista os serviços considerados", async () => {
    const { id, maintenanceId } = await openMaintenance()
    await executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], tech)
    const second = await executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], tech)
    await executeOperation("finalizeMaintenance", [second, id, conclusion], tech)
    const third = await executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], tech)
    await executeOperation("forceFinalizeMaintenance", [third, id, null, null, "Abertura encerrada pelo administrador sem serviço técnico"], admin)
    const report = await executeOperation("getRecurrenceReport", [30, id], viewer) as { equipmentId: string; count: number; maintenanceIds: string[] }[]
    expect(report).toHaveLength(1); expect(report[0].count).toBe(2); expect(report[0].maintenanceIds).not.toContain(third)
    await expect(executeOperation("getRecurrenceReport", [9999], viewer)).rejects.toThrow()
  })
  it("retifica número da substituta, preserva cadastro e impede uso de número reservado", async () => {
    const { id, warrantyId } = await sentWarranty()
    const data = { ...equipment, garantiaId: warrantyId, numeroRemota: "IMEI-DIGITADO", situacaoRemota: "Recuperada", observacoesRetorno: "Retorno conferido na bancada pela equipe" }
    await executeOperation("returnWarranty", [id, data], admin)
    const ref = db.collection("equipments").doc(id), eq = (await ref.get()).data()!, replacementId = eq.substituidaPorId
    await executeOperation("rectifyWarrantyReturn", [id, warrantyId, { ...data, numeroRemota: "IMEI-CORRETO" }, "Número digitado incorretamente no retorno da garantia", eq.operationVersion], admin)
    expect((await db.collection("equipments").doc(replacementId).get()).data()!.numeroRemota).toBe("IMEI-CORRETO")
    expect((await ref.get()).data()!.substituidaPorNumero).toBe("IMEI-CORRETO")
    const revisions = await executeOperation("getWarrantyRevisions", [warrantyId], admin) as { before: Record<string, unknown> }[]
    expect(revisions[0].before.novoNumeroRemota).toBe("IMEI-DIGITADO")
    await executeOperation("createEquipment", [{ ...equipment, numeroRemota: "OUTRO-RESERVADO" }], admin)
    await expect(executeOperation("rectifyWarrantyReturn", [id, warrantyId, { ...data, numeroRemota: "OUTRO-RESERVADO" }, "Conferência posterior do número informado no retorno", (await ref.get()).data()!.operationVersion], admin)).rejects.toThrow("número")
  })
  it("corrige substituição indevida para mesmo IMEI e bloqueia alteração após uso da substituta", async () => {
    const { id, warrantyId } = await sentWarranty()
    const data = { ...equipment, garantiaId: warrantyId, numeroRemota: "SUBSTITUTA-ERRO", situacaoRemota: "Recuperada", observacoesRetorno: "Retorno conferido na bancada pela equipe" }
    await executeOperation("returnWarranty", [id, data], admin)
    const eq = (await db.collection("equipments").doc(id).get()).data()!, replacementId = eq.substituidaPorId
    await executeOperation("rectifyWarrantyReturn", [id, warrantyId, { ...data, numeroRemota: equipment.numeroRemota }, "Não houve substituição, o número foi interpretado incorretamente", eq.operationVersion], admin)
    const current = (await db.collection("equipments").doc(id).get()).data()!
    expect(current.estadoRegistro).toBe("ativo"); expect(current.substituidaPorId).toBeUndefined()
    expect((await db.collection("equipments").doc(replacementId).get()).data()!.cadastroAnulado).toBe(true)
    const reused = await executeOperation("createEquipment", [{ ...equipment, numeroRemota: "SUBSTITUTA-ERRO" }], admin)
    expect(reused).toBeTruthy()
    await executeOperation("rectifyWarrantyReturn", [id, warrantyId, { ...data, numeroRemota: "SUBSTITUTA-REAL" }, "Conferência identificou que houve troca de equipamento", current.operationVersion], admin)
    const updated = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("createMaintenance", [{ equipmentId: updated.substituidaPorId, defeitoRelatado: "Sem comunicação" }], tech)
    await expect(executeOperation("rectifyWarrantyReturn", [id, warrantyId, data, "Tentativa após abertura de novo atendimento técnico", updated.operationVersion], admin)).rejects.toThrow("posterior")
  })
  it("retificação técnica do motivo da separação atualiza a garantia vinculada e preserva o anterior", async () => {
    const { id, maintenanceId } = await openMaintenance()
    const data = { ...conclusion, situacaoRemota: "Separado para garantia", motivoGarantia: "Falha de comunicação que permaneceu após a avaliação" }
    await executeOperation("finalizeMaintenance", [maintenanceId, id, data], tech)
    const eq = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("rectifyMaintenance", [maintenanceId, id, { ...data, motivoGarantia: "Falha intermitente confirmada no teste prolongado" }, "Correção da descrição após leitura dos resultados do ensaio", eq.operationVersion], admin)
    expect((await db.collection("warranties").doc(eq.garantia.id).get()).data()!.motivo).toBe("Falha intermitente confirmada no teste prolongado")
    expect((await db.collection("equipments").doc(id).get()).data()!.garantia.motivo).toBe("Falha intermitente confirmada no teste prolongado")
  })
  it("corrige confirmação de envio sem saída física, preservando o lançamento anterior e voltando à separação", async () => {
    const { id, warrantyId } = await sentWarranty()
    const eq = (await db.collection("equipments").doc(id).get()).data()!
    await expect(executeOperation("correctWarrantyDispatch", [id, warrantyId, "Envio confirmado por engano sem saída física", false, eq.operationVersion], admin)).rejects.toThrow()
    await expect(executeOperation("correctWarrantyDispatch", [id, warrantyId, "Envio confirmado por engano sem saída física", true, eq.operationVersion], tech)).rejects.toThrow("administradores")
    await executeOperation("correctWarrantyDispatch", [id, warrantyId, "Envio confirmado por engano sem saída física", true, eq.operationVersion], admin)
    const current = (await db.collection("equipments").doc(id).get()).data()!
    expect(current.garantia.status).toBe("separada")
    expect(current.situacaoRemota).toBe("Separado para garantia")
    const warranty = (await db.collection("warranties").doc(warrantyId).get()).data()!
    expect(warranty.enviadaEm).toBeUndefined()
    const revisions = (await db.collection("warranty_revisions").where("warrantyId", "==", warrantyId).get()).docs.map((doc) => doc.data())
    expect(revisions[0].before.status).toBe("enviada")
    expect(revisions[0].before.enviadaEm).toBeDefined()
    await executeOperation("sendWarranty", [id, warrantyId], tech)
    expect((await db.collection("warranties").doc(warrantyId).get()).data()!.status).toBe("enviada")
  })
  it("bloqueia correção de envio após etapa posterior ou alteração operacional", async () => {
    const { id, warrantyId } = await sentWarranty()
    const ref = db.collection("equipments").doc(id), eq = (await ref.get()).data()!
    await ref.update({ operationVersion: eq.operationVersion + 1 })
    await expect(executeOperation("correctWarrantyDispatch", [id, warrantyId, "Uma justificativa válida para corrigir este envio", true, eq.operationVersion + 1], admin)).rejects.toThrow("posterior")
  })
  it("reativa arquivamento manual conservando o intervalo arquivado no histórico", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    await executeOperation("archiveEquipment", [id], admin)
    const ref = db.collection("equipments").doc(id), archived = (await ref.get()).data()!
    await expect(executeOperation("restoreEquipment", [id, "Remota arquivada por engano durante conferência", archived.operationVersion], tech)).rejects.toThrow("administradores")
    await executeOperation("restoreEquipment", [id, "Remota arquivada por engano durante conferência", archived.operationVersion], admin)
    const current = (await ref.get()).data()!
    expect(current.estadoRegistro).toBe("ativo")
    expect(current.dataCadastro.isEqual(archived.dataCadastro)).toBe(true)
    expect(current.operationVersion).toBe(archived.operationVersion + 1)
    expect(current.arquivadoEm).toBeUndefined()
    const events = (await db.collection("equipment_situation_history").where("equipmentId", "==", id).get()).docs.map((doc) => doc.data()).sort((a, b) => a.version - b.version)
    expect(events.map((e) => [e.source, e.active])).toEqual([["created", true], ["archived", false], ["restored", true]])
  })
  it("não reativa original substituída nem uma prévia desatualizada de arquivamento", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    await executeOperation("archiveEquipment", [id], admin)
    const ref = db.collection("equipments").doc(id), version = (await ref.get()).data()!.operationVersion
    await expect(executeOperation("restoreEquipment", [id, "Motivo completo para reativar o equipamento", version + 1], admin)).rejects.toThrow("atualizado")
    await ref.update({ substituidaPorId: "substituta", substituidaPorNumero: "OUTRO-IMEI" })
    await expect(executeOperation("restoreEquipment", [id, "Motivo completo para reativar o equipamento", version], admin)).rejects.toThrow("substituída")
  })
  it("transfere atendimento e rascunho sem alterar abertura, impedindo gravação pelo responsável anterior", async () => {
    const { id, maintenanceId } = await openMaintenance()
    await executeOperation("saveMaintenanceDraft", [maintenanceId, id, { ...conclusion, observacoes: "Texto técnico já iniciado pelo primeiro responsável" }, 0], tech)
    const before = (await db.collection("maintenances").doc(maintenanceId).get()).data()!
    const version = (await db.collection("equipments").doc(id).get()).data()!.operationVersion
    await executeOperation("transferMaintenance", [maintenanceId, id, admin.id, "Responsável ausente; administrador continuará a avaliação", version], admin)
    const after = (await db.collection("maintenances").doc(maintenanceId).get()).data()!
    expect(after.tecnicoId).toBe(admin.id)
    expect(after.tecnicoAberturaId).toBe(tech.id)
    expect(after.dataEntrada.isEqual(before.dataEntrada)).toBe(true)
    expect(after.draft.observacoes).toBe(before.draft.observacoes)
    expect(after.draftVersion).toBe(before.draftVersion + 1)
    expect((await db.collection("equipments").doc(id).get()).data()!.emManutencaoPor).toBe(admin.id)
    await expect(executeOperation("saveMaintenanceDraft", [maintenanceId, id, before.draft, after.draftVersion], tech)).rejects.toThrow("responsável")
    await executeOperation("saveMaintenanceDraft", [maintenanceId, id, before.draft, after.draftVersion], admin)
    await executeOperation("updateUser", [tech.id, { ativo: false }], admin)
    await expect(executeOperation("deleteUser", [tech.id], admin)).rejects.toThrow("histórico")
  })
  it("bloqueia remoção, desativação ou perfil de consulta com atendimento pendente; destino da transferência deve estar ativo", async () => {
    const { id, maintenanceId } = await openMaintenance()
    const version = (await db.collection("equipments").doc(id).get()).data()!.operationVersion
    for (const [operation, args] of [["deleteUser", [tech.id]], ["updateUser", [tech.id, { ativo: false }]], ["updateUser", [tech.id, { tipo: "usuario" }]]] as const) await expect(executeOperation(operation, [...args], admin)).rejects.toThrow("transfira")
    await expect(executeOperation("transferMaintenance", [maintenanceId, id, viewer.id, "Tentativa de escolher um destino sem perfil técnico", version], admin)).rejects.toThrow("ativo")
    await expect(executeOperation("transferMaintenance", [maintenanceId, id, admin.id, "Uma justificativa válida para transferência", version], tech)).rejects.toThrow("administradores")
  })
  it("retifica conclusão preservando original, data e snapshot; descrição posterior não muda a situação atual", async () => {
    const { id, maintenanceId } = await openMaintenance()
    await executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], tech)
    const ref = db.collection("maintenances").doc(maintenanceId)
    const original = (await ref.get()).data()!
    let eq = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("rectifyMaintenance", [maintenanceId, id, { ...conclusion, observacoes: "Complemento técnico correto após conferência" }, "Correção de informação digitada durante a conclusão", eq.operationVersion], admin)
    const corrected = (await ref.get()).data()!
    expect(corrected.revisionCount).toBe(1)
    expect(corrected.dataFinalizacao.isEqual(original.dataFinalizacao)).toBe(true)
    expect(corrected.equipmentSnapshot).toEqual(original.equipmentSnapshot)
    const revisions = await executeOperation("getMaintenanceRevisions", [maintenanceId], viewer) as { before: { observacoes: string }; after: { observacoes: string } }[]
    expect(revisions).toHaveLength(1)
    expect(revisions[0].before.observacoes).toBe("")
    expect(revisions[0].after.observacoes).toContain("Complemento")
    await executeOperation("updateEquipmentSituationManual", [id, { situacaoRemota: "Sucata", motivoAlteracaoSituacao: "Movimento posterior independente" }], admin)
    eq = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("rectifyMaintenance", [maintenanceId, id, { ...conclusion, observacoes: "Outra informação técnica retificada com histórico" }, "Ajuste descritivo sem alterar a movimentação posterior", eq.operationVersion], admin)
    expect((await db.collection("equipments").doc(id).get()).data()!.situacaoRemota).toBe("Sucata")
  })
  it("só administrador retifica resultado e bloqueia mudança operacional após outra movimentação", async () => {
    const { id, maintenanceId } = await openMaintenance()
    await executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], tech)
    let eq = (await db.collection("equipments").doc(id).get()).data()!
    await expect(executeOperation("rectifyMaintenance", [maintenanceId, id, conclusion, "Uma justificativa válida para retificação", eq.operationVersion], tech)).rejects.toThrow("administradores")
    await executeOperation("rectifyMaintenance", [maintenanceId, id, { ...conclusion, operadoraDepois: "Vivo" }, "Operadora digitada incorretamente na conclusão", eq.operationVersion], admin)
    expect((await db.collection("equipments").doc(id).get()).data()!.operadoraAtual).toBe("Vivo")
    await executeOperation("updateEquipmentSituationManual", [id, { situacaoRemota: "Sucata", motivoAlteracaoSituacao: "Movimentação realizada após a conclusão" }], admin)
    eq = (await db.collection("equipments").doc(id).get()).data()!
    await expect(executeOperation("rectifyMaintenance", [maintenanceId, id, { ...conclusion, situacaoRemota: "Triagem" }, "Tentativa de alterar resultado antigo após movimentação", eq.operationVersion], admin)).rejects.toThrow("posterior")
  })
  it("cancela abertura por engano sem contar como serviço concluído e conserva diário e motivo", async () => {
    const { id, maintenanceId } = await openMaintenance()
    const ref = db.collection("equipments").doc(id)
    const version = (await ref.get()).data()!.operationVersion || 0
    await executeOperation("cancelMaintenance", [maintenanceId, id, "Atendimento aberto no equipamento incorreto", version], tech)
    const cancelled = (await db.collection("maintenances").doc(maintenanceId).get()).data()!
    expect(cancelled.status).toBe("cancelada")
    expect(cancelled.dataFinalizacao).toBeNull()
    expect(cancelled.motivoCancelamento).toContain("incorreto")
    expect(cancelled.equipmentSnapshot.modelo).toBe(equipment.modelo)
    const restored = (await ref.get()).data()!
    expect(restored.situacaoRemota).toBe("Triagem")
    expect(restored.manutencaoId).toBeUndefined()
    expect(restored.operationVersion).toBe(version + 1)
    const change = (await db.collection("operational_changes").doc(restored.lastChangeId).get()).data()!
    expect(change.before.situacaoRemota).toBe("Manutenção")
    expect(change.after.situacaoRemota).toBe("Triagem")
    const metrics = await executeOperation("getDashboardMetrics", ["2026-11"], viewer)
    expect(metrics).toMatchObject({ totalMaintenances: 0, inProgress: 0, completedThisMonth: 0, cancelledMaintenances: 1 })
  })
  it("exige responsável, motivo e estado atual no cancelamento da manutenção", async () => {
    const { id, maintenanceId } = await openMaintenance()
    const version = (await db.collection("equipments").doc(id).get()).data()!.operationVersion || 0
    await expect(executeOperation("cancelMaintenance", [maintenanceId, id, "Justificativa suficiente para cancelar", version], { ...tech, id: "outro-tecnico" })).rejects.toThrow("responsável")
    await expect(executeOperation("cancelMaintenance", [maintenanceId, id, "curto", version], tech)).rejects.toThrow()
    await expect(executeOperation("cancelMaintenance", [maintenanceId, id, "Justificativa suficiente para cancelar", version + 1], tech)).rejects.toThrow("atualizado")
    const results = await Promise.allSettled([executeOperation("cancelMaintenance", [maintenanceId, id, "Primeiro cancelamento da abertura incorreta", version], tech), executeOperation("cancelMaintenance", [maintenanceId, id, "Segundo cancelamento da abertura incorreta", version], tech)])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    await expect(executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], tech)).rejects.toThrow()
  })
  it("mantém resultado incerto quando o transporte falha depois de aplicar uma operação do lote", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    const original = db.runTransaction.bind(db)
    const spy = vi.spyOn(db, "runTransaction").mockImplementationOnce(original).mockImplementationOnce(async (update, options) => { await original(update, options); throw new Error("Conexão caiu após commit") })
    const runId = "c9c005df-7ea5-4a3f-8f86-a357f645ea6a"
    try {
      const result = await executeOperation("bulkMovements", [[{ operation: "createMaintenance", args: [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }] }], runId], tech) as { ok: boolean; uncertain?: boolean }[]
      expect((await db.collection("maintenances").get()).size).toBe(1)
      expect(result[0]).toMatchObject({ ok: false, uncertain: true })
      expect(await executeOperation("getBulkRun", [runId], tech)).toMatchObject({ results: [{ ok: false, uncertain: true }] })
    } finally { spy.mockRestore() }
  })
  it("pagina datas empatadas sem perder itens e aplica filtros ao histórico completo", async () => {
    const at = Timestamp.fromDate(new Date("2026-10-20T12:00:00Z"))
    const batch = db.batch()
    for (let i = 0; i < 85; i++) batch.set(db.collection("maintenances").doc(`page-${String(i).padStart(3, "0")}`), { ...conclusion, numeroRemota: `PAGE-${i}`, tecnicoId: i % 2 ? tech.id : admin.id, tecnicoNome: "QA", status: "finalizada", dataEntrada: at, dataFinalizacao: at, equipmentSnapshot: { ...equipment, modelo: "Histórico", capturedAt: at, source: "opening" } })
    await batch.commit()
    const all: string[] = []
    let cursor: unknown = null
    do {
      const page = await executeOperation("getMaintenancePage", [{}, cursor], viewer) as { records: { id: string }[]; cursor: unknown }
      all.push(...page.records.map((r) => r.id)); cursor = page.cursor
    } while (cursor)
    expect(new Set(all).size).toBe(85)
    expect(all).toHaveLength(85)
    const filtered = await executeOperation("getMaintenancePage", [{ tecnico: tech.id, modelo: "histórico", dateFrom: "2026-10-20", dateTo: "2026-10-20" }], viewer) as { records: unknown[] }
    expect(filtered.records).toHaveLength(42)
    const metrics = await executeOperation("getDashboardMetrics", ["2026-10"], viewer) as { totalMaintenances: number; completedThisMonth: number }
    expect(metrics.totalMaintenances).toBe(85)
    expect(metrics.completedThisMonth).toBe(85)
  })
  it("retorna timeline ordenada e somente os campos públicos de movimentação", async () => {
    const { id } = await openMaintenance()
    const movement = await executeOperation("getEquipmentMovements", [id], viewer) as { records: { action: string; at: string; userName: string; secret?: string }[] }
    expect(movement.records.map((r) => r.action)).toContain("maintenance_started")
    await db.collection("audit_logs").doc("private-field").set({ equipmentId: id, action: "equipment_updated", at: Timestamp.now(), userName: "QA", secret: "não expor", userId: admin.id })
    const next = await executeOperation("getEquipmentMovements", [id], viewer) as typeof movement
    expect(next.records.every((r) => !r.secret)).toBe(true)
    await expect(executeOperation("getEquipmentMovements", ["ausente"], viewer)).rejects.toThrow("encontrado")
  })
  it("recupera comprovante privado de lote sem executar novamente o mesmo identificador", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    const entries = [{ operation: "createMaintenance", args: [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }] }]
    const runId = "2913a9b7-48fe-4ae3-a048-1392aac62358"
    const result = await executeOperation("bulkMovements", [entries, runId], tech)
    expect(await executeOperation("bulkMovements", [entries, runId], tech)).toEqual(result)
    expect((await db.collection("maintenances").get()).size).toBe(1)
    await expect(executeOperation("getBulkRun", [runId], tech)).resolves.toMatchObject({ results: result, state: "completed" })
    await expect(executeOperation("getBulkRun", [runId], admin)).rejects.toThrow("outro usuário")
    await expect(executeOperation("bulkMovements", [[{ operation: "archiveEquipment", args: [id] }], runId], tech)).rejects.toThrow("outros dados")
  })
  it("salva rascunho incompleto sem concluir e rejeita versão antiga e outro responsável", async () => {
    const { id, maintenanceId } = await openMaintenance()
    const draft = { ...conclusion, defeitoEncontrado: "", servicosRealizados: [], situacaoRemota: "", observacoes: "Análise parcial da bancada" }
    await expect(executeOperation("saveMaintenanceDraft", [maintenanceId, id, draft, 0], tech)).resolves.toMatchObject({ version: 1 })
    await expect(executeOperation("saveMaintenanceDraft", [maintenanceId, id, { ...draft, observacoes: "Texto antigo" }, 0], tech)).rejects.toThrow("outra aba")
    await expect(executeOperation("saveMaintenanceDraft", [maintenanceId, id, draft, 1], admin)).rejects.toThrow("responsável")
    const saved = (await db.collection("maintenances").doc(maintenanceId).get()).data()!
    expect(saved.status).toBe("em_andamento")
    expect(saved.observacoes).toBe("")
    expect(saved.draft.observacoes).toBe(draft.observacoes)
    await executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], tech)
    await expect(executeOperation("saveMaintenanceDraft", [maintenanceId, id, draft, 1], tech)).rejects.toThrow("aberta")
  })
  it("registra o cadastro na abertura e preserva a cópia depois de concluir e editar a remota", async () => {
    const { id, maintenanceId } = await openMaintenance()
    const ref = db.collection("maintenances").doc(maintenanceId)
    expect((await ref.get()).data()?.equipmentSnapshot).toMatchObject({ numeroRemota: equipment.numeroRemota, modelo: "RT-1000", lote: "OCM-QA", anoFabricacao: "2026", source: "opening" })
    await executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], tech)
    await executeOperation("updateEquipment", [id, { modelo: "MODELO-ALTERADO", lote: "OCM-ALTERADA" }], admin)
    expect((await ref.get()).data()?.equipmentSnapshot).toMatchObject({ modelo: "RT-1000", lote: "OCM-QA", source: "opening" })
  })
  it("identifica captura na conclusão de um atendimento antigo ainda aberto", async () => {
    const { id, maintenanceId } = await openMaintenance()
    const ref = db.collection("maintenances").doc(maintenanceId)
    await ref.update({ equipmentSnapshot: FieldValue.delete() })
    await executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], tech)
    expect((await ref.get()).data()?.equipmentSnapshot).toMatchObject({ modelo: "RT-1000", lote: "OCM-QA", source: "closing" })
  })
  it("permite somente uma manutenção simultânea e bloqueia edição/arquivamento durante o atendimento", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    const results = await Promise.allSettled([executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], tech), executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], admin)])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    await expect(executeOperation("updateEquipment", [id, { modelo: "RT-2000" }], admin)).rejects.toThrow("Finalize")
    await expect(executeOperation("archiveEquipment", [id], admin)).rejects.toThrow("Finalize")
  })
  it("exige os campos finais, mudança de situação e o técnico responsável", async () => {
    const { id, maintenanceId } = await openMaintenance()
    await expect(executeOperation("finalizeMaintenance", [maintenanceId, id, { situacaoRemota: "Recuperada" }], tech)).rejects.toThrow()
    await expect(executeOperation("finalizeMaintenance", [maintenanceId, id, { ...conclusion, situacaoRemota: "Manutenção" }], tech)).rejects.toThrow("diferente")
    await expect(executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], admin)).rejects.toThrow("responsável")
    expect((await db.collection("maintenances").doc(maintenanceId).get()).data()?.status).toBe("em_andamento")
  })
  it("valida Outro, conclui e não libera uma manutenção posterior ao repetir a solicitação antiga", async () => {
    const { id, maintenanceId } = await openMaintenance()
    await expect(executeOperation("finalizeMaintenance", [maintenanceId, id, { ...conclusion, defeitoEncontrado: "Outro" }], tech)).rejects.toThrow("Descreva")
    await executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], tech)
    const next = await executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], tech) as string
    await executeOperation("finalizeMaintenance", [maintenanceId, id, conclusion], tech)
    expect((await db.collection("equipments").doc(id).get()).data()?.manutencaoId).toBe(next)
  })
  it("exige administrador e motivo detalhado na finalização forçada", async () => {
    const { id, maintenanceId } = await openMaintenance()
    await expect(executeOperation("forceFinalizeMaintenance", [maintenanceId, id, null, null, "Motivo de liberação justificada"], tech)).rejects.toThrow("administradores")
    await expect(executeOperation("forceFinalizeMaintenance", [maintenanceId, id, null, null, "curto"], admin)).rejects.toThrow("10 caracteres")
    await executeOperation("forceFinalizeMaintenance", [maintenanceId, id, null, null, "Liberação autorizada por ausência do técnico responsável"], admin)
    expect((await db.collection("maintenances").doc(maintenanceId).get()).data()?.finalizadoForcadamente).toBe(true)
    expect((await db.collection("equipments").doc(id).get()).data()?.manutencaoId).toBeUndefined()
  })
  it("exige manutenção para enviar à garantia, motivo e bloqueia retorno sem envio", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    await expect(executeOperation("sendWarranty", [id, "inexistente"], admin)).rejects.toThrow("separação pendente")
    await expect(executeOperation("updateEquipmentSituationManual", [id, { situacaoRemota: "Enviado para Garantia" }], admin)).rejects.toThrow("conclusão")
    await expect(executeOperation("returnWarranty", [id, { ...equipment, garantiaId: "inexistente", observacoesRetorno: "Retorno sem envio anterior" }], admin)).rejects.toThrow("Não há envio")
    const maintenanceId = await executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], tech) as string
    await expect(executeOperation("finalizeMaintenance", [maintenanceId, id, { ...conclusion, situacaoRemota: "Separado para garantia", motivoGarantia: "curto" }], tech)).rejects.toThrow("motivo")
  })
  it("mantém garantia aberta ao recusar IMEI já cadastrado e impede excluir cadastros com histórico", async () => {
    const other = await executeOperation("createEquipment", [{ ...equipment, numeroRemota: "JA-EXISTE" }], admin) as string
    await executeOperation("archiveEquipment", [other], admin)
    const { id, maintenanceId } = await openMaintenance()
    await executeOperation("finalizeMaintenance", [maintenanceId, id, { ...conclusion, situacaoRemota: "Separado para garantia", motivoGarantia: "Defeito persistente após os testes de bancada" }], tech)
    const prepared = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("sendWarranty", [id, prepared.garantia.id], tech)
    const sent = (await db.collection("equipments").doc(id).get()).data()!
    await expect(executeOperation("returnWarranty", [id, { ...equipment, numeroRemota: "JA-EXISTE", situacaoRemota: "Recuperada", garantiaId: sent.garantia.id, observacoesRetorno: "Retorno com número já cadastrado" }], admin)).rejects.toThrow("Já existe")
    expect((await db.collection("equipments").doc(id).get()).data()?.garantia.status).toBe("enviada")
    await expect(executeOperation("deleteEquipment", [id], admin)).rejects.toThrow("garantia")
  })
})

describe("regras do Firestore para o cliente", () => {
  it.each([admin, tech, viewer])("permite consulta e impede gravação direta para $tipo", async (actor) => {
    await executeOperation("createEquipment", [equipment], admin)
    await auth.createUser({ uid: actor.id })
    const app = initializeClientApp({ projectId: "demo-remotas-history", apiKey: "demo-key", appId: "demo-app" }, `rules-${actor.id}`)
    const client = clientAuth(app)
    connectAuthEmulator(client, "http://127.0.0.1:9199", { disableWarnings: true })
    const store = clientFirestore(app)
    connectFirestoreEmulator(store, "127.0.0.1", 8181)
    try {
      await signInWithCustomToken(client, await auth.createCustomToken(actor.id))
      expect((await getDocs(collection(store, "equipments"))).size).toBe(1)
      await expect(setDoc(doc(store, "equipments", "direto"), equipment)).rejects.toMatchObject({ code: "permission-denied" })
      await expect(getDocs(collection(store, "users"))).rejects.toMatchObject({ code: "permission-denied" })
      await expect(getDocs(collection(store, "equipment_situation_history"))).rejects.toMatchObject({ code: "permission-denied" })
    } finally {
      await terminate(store)
      await deleteClientApp(app)
    }
  })
})

describe("separação, saída física e cancelamento da garantia", () => {
  async function prepare() {
    const { id, maintenanceId } = await openMaintenance()
    await executeOperation("finalizeMaintenance", [maintenanceId, id, { ...conclusion, situacaoRemota: "Separado para garantia", motivoGarantia: "Defeito persistente após os testes de bancada" }], tech)
    const current = (await db.collection("equipments").doc(id).get()).data()!
    return { id, maintenanceId, warrantyId: current.garantia.id as string }
  }
  it("separa após avaliação e confirma a saída em outro registro, sem duplicar manutenção", async () => {
    const { id, maintenanceId, warrantyId } = await prepare()
    const warranty = db.collection("warranties").doc(warrantyId)
    expect((await warranty.get()).data()).toMatchObject({ status: "separada", maintenanceId, separadaPor: tech.nome })
    expect((await warranty.get()).data()?.enviadaEm).toBeUndefined()
    await expect(executeOperation("returnWarranty", [id, { ...equipment, garantiaId: warrantyId, situacaoRemota: "Recuperada", observacoesRetorno: "Retorno ainda não enviado" }], admin)).rejects.toThrow("Não há envio")
    const history = await executeOperation("getWarrantyHistory", [id], viewer) as { status: string; enviadaEm?: string }[]
    expect(history[0]).toMatchObject({ status: "separada" })
    expect(history[0].enviadaEm).toBeUndefined()
    await executeOperation("sendWarranty", [id, warrantyId], tech)
    expect((await warranty.get()).data()).toMatchObject({ status: "enviada", maintenanceId, enviadaPor: tech.nome })
    expect((await warranty.get()).data()?.enviadaEm.toMillis()).toBeGreaterThanOrEqual((await warranty.get()).data()?.separadaEm.toMillis())
    expect((await db.collection("maintenances").get()).size).toBe(1)
    expect((await db.collection("equipments").doc(id).get()).data()?.situacaoRemota).toBe("Enviado para Garantia")
    const events = (await db.collection("equipment_situation_history").where("equipmentId", "==", id).get()).docs.map((doc) => doc.data().source)
    expect(events).toContain("warranty_sent")
    await expect(executeOperation("sendWarranty", [id, warrantyId], tech)).rejects.toThrow("separação pendente")
  })
  it("bloqueia edição, importação via cadastro, arquivamento e nova manutenção na separação pendente", async () => {
    const { id, warrantyId } = await prepare()
    for (const [operation, args] of [
      ["updateEquipment", [id, { modelo: "Outro modelo" }]], ["updateEquipmentSituationManual", [id, { situacaoRemota: "Recuperada" }]],
      ["archiveEquipment", [id]], ["deleteEquipment", [id]], ["createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }]],
    ] as const) await expect(executeOperation(operation, [...args], admin)).rejects.toThrow("separação")
    await expect(executeOperation("sendWarranty", [id, warrantyId], viewer)).rejects.toThrow("técnicos")
    await expect(executeOperation("cancelWarrantyPreparation", [id, warrantyId, "Cancelamento autorizado para reavaliação"], viewer)).rejects.toThrow("técnicos")
  })
  it("cancela com justificativa, retorna a Triagem e rejeita o procedimento antigo após nova avaliação", async () => {
    const { id, warrantyId } = await prepare()
    await expect(executeOperation("cancelWarrantyPreparation", [id, warrantyId, "curto"], tech)).rejects.toThrow("10 caracteres")
    await executeOperation("cancelWarrantyPreparation", [id, warrantyId, "Equipamento precisa de nova avaliação interna"], admin)
    expect((await db.collection("equipments").doc(id).get()).data()).toMatchObject({ situacaoRemota: "Triagem", garantia: { status: "cancelada" } })
    expect((await db.collection("warranties").doc(warrantyId).get()).data()).toMatchObject({ status: "cancelada", motivoCancelamento: "Equipamento precisa de nova avaliação interna", canceladaPor: admin.nome })
    const maintenanceId = await executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], tech)
    await executeOperation("finalizeMaintenance", [maintenanceId, id, { ...conclusion, situacaoRemota: "Separado para garantia", motivoGarantia: "Nova avaliação confirmou defeito persistente" }], tech)
    await expect(executeOperation("sendWarranty", [id, warrantyId], tech)).rejects.toThrow("separação pendente")
    const current = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("sendWarranty", [id, current.garantia.id], admin)
    expect((await db.collection("warranties").get()).size).toBe(2)
  })
  it.each([false, true])("resolve confirmações concorrentes sem duplicidade; concorrência com cancelamento=%s", async (cancel) => {
    const { id, warrantyId } = await prepare()
    const outcomes = await Promise.allSettled([
      executeOperation("sendWarranty", [id, warrantyId], tech),
      executeOperation(cancel ? "cancelWarrantyPreparation" : "sendWarranty", cancel ? [id, warrantyId, "Reavaliar equipamento antes de enviar"] : [id, warrantyId], admin),
    ])
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1)
    const sent = await db.collection("audit_logs").where("equipmentId", "==", id).where("action", "==", "warranty_sent").get()
    const cancelled = await db.collection("audit_logs").where("equipmentId", "==", id).where("action", "==", "warranty_preparation_cancelled").get()
    expect(sent.size + cancelled.size).toBe(1)
  })
  it("recusa separação avulsa e registro legado sem avaliação, permitindo reavaliar pelo atendimento", async () => {
    await expect(executeOperation("createEquipment", [{ ...equipment, situacaoRemota: "Separado para garantia" }], admin)).rejects.toThrow("avaliação")
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    await expect(executeOperation("updateEquipment", [id, { situacaoRemota: "Separado para garantia" }], admin)).rejects.toThrow("avaliação")
    await db.collection("equipments").doc(id).update({ situacaoRemota: "Separado para garantia" })
    await expect(executeOperation("sendWarranty", [id, "avulsa"], admin)).rejects.toThrow("separação pendente")
    await executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], tech)
  })
  it("processa confirmação e cancelamento em massa com falhas individuais", async () => {
    const { id, warrantyId } = await prepare()
    const results = await executeOperation("bulkMovements", [[{ operation: "sendWarranty", args: [id, "outro-id"] }, { operation: "sendWarranty", args: [id, warrantyId] }, { operation: "cancelWarrantyPreparation", args: [id, warrantyId, "Cancelamento após saída não permitido"] }]], tech) as { ok: boolean }[]
    expect(results.map((row) => row.ok)).toEqual([false, true, false])
  })
})

describe("análise física e condição do retorno de garantia", () => {
  it.each([
    [false, "Nova", "Nova", false], [false, "Usada", "Recuperada", true], [false, "Usada", "Nova", false],
    [true, "Nova", "Nova", true], [true, "Nova", "Recuperada", false], [true, "Usada", "Recuperada", true], [true, "Usada", "Nova", false],
  ] as const)("IMEI diferente=%s, condição=%s, situação=%s, permitido=%s", async (changed, status, situation, allowed) => {
    const ref = db.collection("equipments").doc("retorno-qa")
    await ref.set({ ...equipment, dataCadastro: Timestamp.now(), estadoRegistro: "ativo", garantia: { id: "garantia-qa", status: "enviada", enviadaEm: Timestamp.now() } })
    await db.collection("warranties").doc("garantia-qa").set({ equipmentId: ref.id, equipmentIds: [ref.id], status: "enviada", enviadaEm: Timestamp.now() })
    const input = { ...equipment, numeroRemota: changed ? "NOVO-NUMERO-QA" : equipment.numeroRemota, garantiaId: "garantia-qa", status, situacaoRemota: situation, observacoesRetorno: "Equipamento recebido e condição conferida na análise interna" }
    const operation = executeOperation("returnWarranty", [ref.id, input], admin)
    if (!allowed) {
      await expect(operation).rejects.toThrow()
      expect((await db.collection("warranties").doc("garantia-qa").get()).data()?.status).toBe("enviada")
      expect((await db.collection("equipments").get()).size).toBe(1)
    } else {
      await operation
      const original = (await ref.get()).data()!
      const target = changed ? (await db.collection("equipments").doc(original.substituidaPorId).get()).data()! : original
      expect(target.status).toBe(status)
      expect(target.situacaoRemota).toBe(situation)
      expect((await db.collection("warranties").doc("garantia-qa").get()).data()).toMatchObject({ condicaoRetorno: status, imeiAlterado: changed })
    }
  })
})

describe("processamento em massa com as mesmas regras individuais", () => {
  it("continua as linhas válidas e informa o erro de cada linha impedida", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    const result = await executeOperation("bulkMovements", [[
      { operation: "updateEquipmentSituationManual", args: [id, { situacaoRemota: "Recuperada" }] },
      { operation: "archiveEquipment", args: ["nao-existe"] },
    ]], admin) as { ok: boolean; error?: string }[]
    expect(result.map((item) => item.ok)).toEqual([true, false])
    expect(result[1].error).toContain("não encontrado")
    expect((await db.collection("equipments").doc(id).get()).data()?.situacaoRemota).toBe("Recuperada")
  })
  it("preserva permissões por linha e impede execução pelo perfil de consulta", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    const batch = [{ operation: "archiveEquipment", args: [id] }, { operation: "createMaintenance", args: [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }] }]
    await expect(executeOperation("bulkMovements", [batch], viewer)).rejects.toThrow("técnicos")
    const result = await executeOperation("bulkMovements", [batch], tech) as { ok: boolean; error?: string }[]
    expect(result.map((item) => item.ok)).toEqual([false, true])
    expect(result[0].error).toContain("administradores")
    expect((await db.collection("equipments").doc(id).get()).data()?.estadoRegistro).toBe("ativo")
  })
  it("recusa operações fora da lista, lote recursivo e excesso de linhas antes de gravar", async () => {
    for (const operation of ["createUser", "bulkMovements"]) await expect(executeOperation("bulkMovements", [[{ operation, args: [] }]], admin)).rejects.toThrow()
    await expect(executeOperation("bulkMovements", [Array.from({ length: 51 }, () => ({ operation: "archiveEquipment", args: ["ausente"] }))], admin)).rejects.toThrow()
    expect((await db.collection("equipments").get()).empty).toBe(true)
  })
  it("não repete situação nem altera a data de um cadastro já arquivado", async () => {
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    await expect(executeOperation("updateEquipmentSituationManual", [id, { situacaoRemota: "Triagem" }], admin)).rejects.toThrow("igual")
    await executeOperation("archiveEquipment", [id], admin)
    const previous = (await db.collection("equipments").doc(id).get()).data()!.arquivadoEm.toMillis()
    const result = await executeOperation("bulkMovements", [[{ operation: "archiveEquipment", args: [id] }]], admin) as { ok: boolean; error?: string }[]
    expect(result[0].ok).toBe(false)
    expect(result[0].error).toContain("já está arquivada")
    expect((await db.collection("equipments").doc(id).get()).data()!.arquivadoEm.toMillis()).toBe(previous)
  })
})
