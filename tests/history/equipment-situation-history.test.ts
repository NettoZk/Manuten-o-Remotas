import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { deleteApp, getApps } from "firebase-admin/app"
import { Timestamp } from "firebase-admin/firestore"
import { executeOperation } from "@/lib/server/operations"
import { getAdmin } from "@/lib/server/firebase-admin"
import { monthKey } from "@/lib/dashboard"
import { UNKNOWN_HISTORY } from "@/lib/equipment-situation-report"
import type { EquipmentSituationReport } from "@/lib/types"

// Este conjunto recusa qualquer ambiente que não seja o projeto fictício local.
if (process.env.FIREBASE_PROJECT_ID !== "demo-remotas-history" || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8181" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199") {
  throw new Error("Use o emulador isolado demo-remotas-history nas portas 8181/9199; nenhum banco remoto é permitido nestes testes")
}
const actor = { id: "admin-history", username: "admin.history", nome: "Administrador fictício", tipo: "admin" as const, ativo: true as const, criadoEm: null }
const viewer = { ...actor, id: "viewer-history", tipo: "usuario" as const }
const { db } = getAdmin()
const data = { numeroRemota: "TEST-HIST-001", modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-TESTE", operadoraAtual: "Claro", status: "Nova", situacaoRemota: "Triagem" }
const currentMonth = () => monthKey(new Date())
const report = (month = currentMonth()) => executeOperation("getEquipmentSituationReport", [month], viewer) as Promise<EquipmentSituationReport>
async function events(equipmentId: string) {
  return (await db.collection("equipment_situation_history").where("equipmentId", "==", equipmentId).get()).docs.map((doc) => doc.data()).sort((a, b) => a.version - b.version)
}

beforeEach(async () => {
  const response = await fetch("http://127.0.0.1:8181/emulator/v1/projects/demo-remotas-history/databases/(default)/documents", { method: "DELETE" })
  expect(response.ok).toBe(true)
  const batch = db.batch()
  for (const [collection, names] of Object.entries({ operators: ["Claro"], equipment_status: ["Nova", "Triagem", "Manutenção", "Recuperada", "Enviado para Garantia", "Separado para garantia"], defects: ["Sem comunicação"], services: ["Teste de bancada"] })) {
    names.forEach((nome, index) => batch.set(db.collection(collection).doc(`ref-${index}`), { nome, ativo: true }))
  }
  await batch.commit()
})
afterAll(async () => {
  await db.terminate()
  for (const app of getApps()) await deleteApp(app)
})

describe("histórico gravado nas transações reais do Firestore", () => {
  it("registra cadastro e mudança manual, contando uma remota sem manutenção", async () => {
    const id = await executeOperation("createEquipment", [data], actor) as string
    expect((await events(id)).map((event) => event.source)).toEqual(["created"])
    expect((await report()).situations).toEqual([{ name: "Triagem", value: 1 }])
    await executeOperation("updateEquipmentSituationManual", [id, { situacaoRemota: "Recuperada" }], actor)
    expect((await events(id)).map((event) => [event.version, event.situation])).toEqual([[1, "Triagem"], [2, "Recuperada"]])
    expect((await report()).situations).toEqual([{ name: "Recuperada", value: 1 }])
  })

  it("inicializa legados uma vez e não atribui seu estado atual ao mês passado", async () => {
    const [year, month] = currentMonth().split("-").map(Number)
    const registration = new Date(Date.UTC(year, month - 3, 10, 12))
    const previousMonth = monthKey(new Date(Date.UTC(year, month - 2, 15, 12)))
    await db.collection("equipments").doc("legada").set({ ...data, dataCadastro: Timestamp.fromDate(registration), estadoRegistro: "ativo" })
    const first = await report(previousMonth)
    expect(first.situations).toEqual([{ name: UNKNOWN_HISTORY, value: 1 }])
    expect(first.missingHistory).toBe(1)
    await report()
    expect((await events("legada")).map((event) => event.source)).toEqual(["baseline"])
    expect((await db.collection("equipments").doc("legada").get()).data()?.situationHistoryVersion).toBe(1)
  })

  it("concorre inicialização e alteração sem duplicar o ponto inicial nem perder a mudança", async () => {
    await db.collection("equipments").doc("legada").set({ ...data, dataCadastro: Timestamp.now(), estadoRegistro: "ativo" })
    await Promise.all([report(), executeOperation("updateEquipmentSituationManual", ["legada", { situacaoRemota: "Recuperada" }], actor), report()])
    const history = await events("legada")
    expect(history.filter((event) => event.source === "baseline")).toHaveLength(1)
    expect(history.map((event) => event.version)).toEqual([1, 2])
    expect(history.at(-1)?.situation).toBe("Recuperada")
    expect((await report()).situations).toEqual([{ name: "Recuperada", value: 1 }])
  })

  it("acompanha manutenção e garantia com novo IMEI sem contar a remota arquivada", async () => {
    const id = await executeOperation("createEquipment", [data], actor) as string
    const maintenanceId = await executeOperation("createMaintenance", [{ equipmentId: id, defeitoRelatado: "Sem comunicação" }], actor) as string
    expect((await report()).situations).toEqual([{ name: "Manutenção", value: 1 }])
    const finalization = {
      defeitoEncontrado: "Sem comunicação", servicosRealizados: ["Teste de bancada"], operadoraDepois: "Claro", observacoes: "",
      situacaoRemota: "Separado para garantia", motivoGarantia: "Falha persistente após os testes em bancada",
      checklist: { leituraSIMCard: "OK", firmwareAtualizado: "OK", sinal: "Falha", apnEnergiza: "OK", comunicacaoMedidor: "Falha", comunicacaoIRIS: "Falha" },
    }
    await executeOperation("finalizeMaintenance", [maintenanceId, id, finalization], actor)
    const beforeRepeat = (await events(id)).length
    await executeOperation("finalizeMaintenance", [maintenanceId, id, finalization], actor)
    expect(await events(id)).toHaveLength(beforeRepeat)
    const prepared = (await db.collection("equipments").doc(id).get()).data()!
    expect(prepared.garantia.status).toBe("separada")
    await executeOperation("sendWarranty", [id, prepared.garantia.id], actor)
    const sent = (await db.collection("equipments").doc(id).get()).data()!
    await executeOperation("returnWarranty", [id, { ...data, status: "Usada", numeroRemota: "TEST-HIST-002", situacaoRemota: "Recuperada", garantiaId: sent.garantia.id, observacoesRetorno: "Fabricante substituiu o equipamento e informou novo IMEI" }], actor)
    const old = (await db.collection("equipments").doc(id).get()).data()!
    expect(old.estadoRegistro).toBe("inativo")
    expect((await events(id)).at(-1)?.active).toBe(false)
    expect((await events(old.substituidaPorId)).map((event) => event.source)).toEqual(["warranty_replacement_created"])
    expect((await report()).totalEquipments).toBe(1)
    expect((await report()).situations).toEqual([{ name: "Recuperada", value: 1 }])
  })

  it("retorno de garantia com o mesmo IMEI preserva o cadastro e registra a nova situação", async () => {
    const id = await executeOperation("createEquipment", [data], actor) as string
    const sentAt = Timestamp.now()
    await db.collection("warranties").doc("warranty-test").set({ equipmentId: id, equipmentIds: [id], status: "enviada", enviadaEm: sentAt })
    await db.collection("equipments").doc(id).update({ garantia: { id: "warranty-test", status: "enviada", enviadaEm: sentAt }, situacaoRemota: "Enviado para Garantia" })
    await executeOperation("returnWarranty", [id, { ...data, status: "Usada", situacaoRemota: "Recuperada", garantiaId: "warranty-test", observacoesRetorno: "Equipamento reparado e devolvido com o mesmo IMEI" }], actor)
    expect((await db.collection("equipments").get()).size).toBe(1)
    expect((await events(id)).at(-1)?.source).toBe("warranty_returned")
    expect((await report()).situations).toEqual([{ name: "Recuperada", value: 1 }])
  })

  it("arquivamento retira do gráfico e exclusão mantém os eventos", async () => {
    const archivedId = await executeOperation("createEquipment", [data], actor) as string
    const deletedId = await executeOperation("createEquipment", [{ ...data, numeroRemota: "TEST-HIST-003" }], actor) as string
    await executeOperation("archiveEquipment", [archivedId], actor)
    await executeOperation("deleteEquipment", [deletedId], actor)
    expect((await report()).totalEquipments).toBe(0)
    expect((await events(archivedId)).at(-1)?.source).toBe("archived")
    expect((await events(deletedId)).at(-1)?.source).toBe("deleted")
    expect((await db.collection("equipments").doc(deletedId).get()).exists).toBe(false)
  })

  it("não grava situação inválida e mantém histórico somente no servidor", async () => {
    const id = await executeOperation("createEquipment", [data], actor) as string
    await expect(executeOperation("updateEquipmentSituationManual", [id, { situacaoRemota: "Inexistente" }], actor)).rejects.toThrow("Valor indisponível")
    await expect(executeOperation("updateEquipmentSituationManual", [id, { situacaoRemota: "Recuperada" }], viewer)).rejects.toThrow("administradores")
    expect(await events(id)).toHaveLength(1)
    expect((await report()).situations).toEqual([{ name: "Triagem", value: 1 }])
    await expect(report("9999-12")).rejects.toThrow("mês válido")
  })

  it("bloqueia o rótulo de troca de IMEI mesmo quando ele já existe nas referências do banco", async () => {
    const obsolete = "IMEI alterado na garantia"
    await db.collection("equipment_status").doc("legada-imei").set({ nome: obsolete, ativo: true })
    const id = await executeOperation("createEquipment", [data], actor) as string
    await expect(executeOperation("updateEquipmentSituationManual", [id, { situacaoRemota: obsolete }], actor)).rejects.toThrow("A troca de IMEI")
    await expect(executeOperation("createEquipment", [{ ...data, numeroRemota: "NOVO-INVALIDO", situacaoRemota: obsolete }], actor)).rejects.toThrow("A troca de IMEI")
    await expect(executeOperation("createEquipmentSituation", [obsolete], actor)).rejects.toThrow("A troca de IMEI")
    await expect(executeOperation("updateEquipmentSituation", ["ref-1", { nome: obsolete }], actor)).rejects.toThrow("A troca de IMEI")
    expect(await events(id)).toHaveLength(1)
    expect((await report()).situations).toEqual([{ name: "Triagem", value: 1 }])
  })
})
