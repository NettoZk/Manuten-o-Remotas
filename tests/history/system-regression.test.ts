import { afterAll, beforeEach, describe, expect, it } from "vitest"
import bcrypt from "bcryptjs"
import { createHash } from "node:crypto"
import { deleteApp, getApps } from "firebase-admin/app"
import { Timestamp } from "firebase-admin/firestore"
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
    const id = await executeOperation("createEquipment", [equipment], admin) as string
    await executeOperation("deleteEquipmentSituation", ["ref-1"], admin)
    expect((await db.collection("equipment_status").doc("ref-1").get()).data()?.ativo).toBe(false)
    expect((await db.collection("equipments").doc(id).get()).data()?.situacaoRemota).toBe("Triagem")
    await expect(executeOperation("createEquipment", [{ ...equipment, numeroRemota: "QA-2" }], admin)).rejects.toThrow("Valor indisponível")
  })
})

describe("procedimentos de manutenção e garantia", () => {
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
