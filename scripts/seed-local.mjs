import { initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import bcrypt from "bcryptjs"

// Dados fictícios. Este script nunca aceita o endereço de um banco remoto.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
const app = initializeApp({ projectId: "demo-remotas-tests" }, "seed-local")
const db = getFirestore(app)
if (process.argv.includes("--e2e")) {
  const response = await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-remotas-tests/databases/(default)/documents", { method: "DELETE" })
  if (!response.ok) throw new Error("Não foi possível preparar o banco fictício dos testes de navegador")
}
const senhaHash = await bcrypt.hash("teste123", 10)
for (const [uid, username, nome, tipo] of [["local-admin", "teste.admin", "Administrador de testes", "admin"], ["local-tech", "teste.tecnico", "Técnico de testes", "tecnico"], ["local-viewer", "teste.consulta", "Consulta de testes", "usuario"]]) {
  await db.collection("users").doc(uid).set({ username, nome, tipo, ativo: true, senhaHash, criadoEm: Timestamp.now() })
}
for (const [collection, names] of Object.entries({ operators: ["Claro", "Vivo"], defects: ["Sem comunicação", "Sem defeito"], services: ["Atualização de firmware", "Troca de SIM Card"], equipment_status: ["Nova", "Triagem", "Manutenção", "Disponível", "Irrecuperável", "Enviado para Garantia", "Recuperada", "Sucata", "Separado para garantia", "Disponibilizado para estoque", "Disponibilizada para polo"] })) {
  for (const [index, nome] of names.entries()) await db.collection(collection).doc(`local-${index}`).set({ nome, ativo: true })
}
for (const [index, numeroRemota] of ["1001", "1002", "1003"].entries()) {
  const ref = db.collection("equipments").doc(`local-${numeroRemota}`)
  if (!(await ref.get()).exists) await ref.set({ numeroRemota, modelo: "RT-1000", anoFabricacao: "2024", lote: `OCM00${index + 1}`, operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
}
if (process.argv.includes("--e2e")) {
  const batch = db.batch()
  for (const number of ["E2E-CONTINUAR-OUTRO", "E2E-CONTINUAR-CONSULTA"]) {
    const maintenanceId = `manutencao-${number}`, at = Timestamp.now()
    const checklist = { leituraSIMCard: "Não testado", firmwareAtualizado: "Não testado", sinal: "Não testado", apnEnergiza: "Não testado", comunicacaoMedidor: "Não testado", comunicacaoIRIS: "Não testado" }
    batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Manutenção", estadoRegistro: "ativo", dataCadastro: at, manutencaoId: maintenanceId, emManutencaoPor: "local-tech", emManutencaoNome: "Técnico de testes" })
    batch.set(db.collection("maintenances").doc(maintenanceId), { equipmentId: number, numeroRemota: number, tecnicoId: "local-tech", tecnicoNome: "Técnico de testes", status: "em_andamento", dataEntrada: at, dataFinalizacao: null, defeitoRelatado: "Sem comunicação", defeitoEncontrado: "", servicosRealizados: [], operadoraAntes: "Claro", operadoraDepois: "Claro", observacoes: "", checklist,
      draft: { defeitoEncontrado: "Sem comunicação", defeitoEncontradoOutro: "", servicosRealizados: ["Atualização de firmware"], servicosRealizadosOutro: "", operadoraDepois: "Claro", situacaoRemota: "Recuperada", motivoGarantia: "", observacoes: "Rascunho original preservado para continuidade por outro responsável", checklist }, draftVersion: 1 })
  }
  batch.set(db.collection("equipments").doc("E2E-REINCIDENTE"), { numeroRemota: "E2E-REINCIDENTE", modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Recuperada", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
  for (const index of [1, 2]) batch.set(db.collection("maintenances").doc(`reincidente-${index}`), { equipmentId: "E2E-REINCIDENTE", numeroRemota: "E2E-REINCIDENTE", tecnicoId: "local-tech", tecnicoNome: "Técnico de testes", status: "finalizada", dataEntrada: Timestamp.now(), dataFinalizacao: Timestamp.now(), situacaoRemota: "Recuperada", defeitoRelatado: "Sem comunicação", defeitoEncontrado: "Sem comunicação", servicosRealizados: ["Atualização de firmware"], operadoraAntes: "Claro", operadoraDepois: "Claro", observacoes: "", checklist: {} })
  {
    const original = "E2E-RET-CORRIGIR", replacement = "E2E-RET-DIGITADO", warrantyId = "garantia-retificar", at = Timestamp.now()
    const base = { modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Recuperada", dataCadastro: at, operationVersion: 0 }
    batch.set(db.collection("equipments").doc(original), { ...base, numeroRemota: original, estadoRegistro: "inativo", substituidaPorId: replacement, substituidaPorNumero: replacement, garantia: { id: warrantyId, status: "retornada", motivo: "Falha persistente", retornadaEm: at } })
    batch.set(db.collection("equipments").doc(replacement), { ...base, numeroRemota: replacement, estadoRegistro: "ativo", remotaAnteriorId: original, remotaAnteriorNumero: original, garantiaOrigemId: warrantyId })
    batch.set(db.collection("warranties").doc(warrantyId), { equipmentId: original, equipmentIds: [original, replacement], numeroRemota: original, status: "retornada", retornadaEm: at, motivo: "Falha persistente", imeiAlterado: true, novoEquipmentId: replacement, novoNumeroRemota: replacement, returnOriginalVersion: 0, returnReplacementVersion: 0, situacaoRetorno: "Recuperada", condicaoRetorno: "Usada", returnData: { ...base, numeroRemota: replacement, observacoesRetorno: "Retorno conferido pela equipe técnica" } })
  }
  batch.set(db.collection("equipments").doc("E2E-RESTORE"), { numeroRemota: "E2E-RESTORE", modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", estadoRegistro: "inativo", dataCadastro: Timestamp.now(), arquivadoEm: Timestamp.now(), arquivadoPor: "Administrador de testes", operationVersion: 0 })
  for (const number of ["E2E-RECTIFY", "E2E-RECTIFY-OUTRO"]) {
    const at = Timestamp.now(), maintenanceId = `manutencao-${number}`
    batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Recuperada", estadoRegistro: "ativo", dataCadastro: at, operationVersion: 0 })
    batch.set(db.collection("maintenances").doc(maintenanceId), { equipmentId: number, numeroRemota: number, tecnicoId: "local-tech", tecnicoNome: "Técnico de testes", status: "finalizada", dataEntrada: at, dataFinalizacao: at, completionRevision: 0, situacaoRemota: "Recuperada", defeitoRelatado: "Sem comunicação", defeitoEncontrado: "Sem comunicação", servicosRealizados: ["Atualização de firmware"], operadoraAntes: "Claro", operadoraDepois: "Claro", observacoes: "", checklist: { leituraSIMCard: "OK", firmwareAtualizado: "OK", sinal: "OK", apnEnergiza: "OK", comunicacaoMedidor: "OK", comunicacaoIRIS: "OK" } })
    if (number.endsWith("OUTRO")) batch.update(db.collection("maintenances").doc(maintenanceId), { defeitoEncontrado: "Outro", defeitoEncontradoOutro: "Falha inicial de antena", servicosRealizados: ["Outro"], servicosRealizadosOutro: "Reparo inicial de antena" })
  }
  for (const recipientName of ["Maria", "Carlos"]) {
    const number = `E2E-TRANSITO-${recipientName.toUpperCase()}`
    batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Recuperada", estadoRegistro: "ativo", dataCadastro: Timestamp.now(), placement: { id: `movimento-${number}`, type: "polo", destination: "Polo de demonstração", recipientName, status: "em_transito", sentAt: Timestamp.now(), sentBy: "Administrador de testes", sentUserId: "local-admin" } })
  }
  for (const number of ["E2E-TRANSFER-RUN", "E2E-CANCEL-RUN", "E2E-RASCUNHO-CONFLITO", "E2E-RASCUNHO", "E2E-ATALHO-A", "E2E-ATALHO-B", "E2E-ATALHO-C", "E2E-ATALHO-D", "E2E-OUTRO-TECNICO"]) {
    const at = Timestamp.now()
    const maintenanceId = `manutencao-${number}`
    batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Manutenção", estadoRegistro: "ativo", dataCadastro: at, manutencaoId: maintenanceId, emManutencaoPor: number === "E2E-OUTRO-TECNICO" ? "local-admin" : "local-tech" })
    batch.set(db.collection("maintenances").doc(maintenanceId), { equipmentId: number, numeroRemota: number, tecnicoId: number === "E2E-OUTRO-TECNICO" ? "local-admin" : "local-tech", tecnicoNome: number === "E2E-OUTRO-TECNICO" ? "Administrador de testes" : "Técnico de testes", status: "em_andamento", dataEntrada: at, dataFinalizacao: null, defeitoRelatado: "Sem comunicação", defeitoEncontrado: "", servicosRealizados: [], operadoraAntes: "Claro", operadoraDepois: "Claro", observacoes: "", checklist: { leituraSIMCard: "Não testado", firmwareAtualizado: "Não testado", sinal: "Não testado", apnEnergiza: "Não testado", comunicacaoMedidor: "Não testado", comunicacaoIRIS: "Não testado" } })
  }
  for (const number of ["E2E-SEP-ENVIO-A", "E2E-SEP-ENVIO-B", "E2E-SEP-CANCEL-A", "E2E-SEP-CANCEL-B", "E2E-SEP-CANCEL-IND", "E2E-SEP-CANCEL-ATALHO-A", "E2E-SEP-CANCEL-ATALHO-B"]) {
    const at = Timestamp.now()
    const warrantyId = `garantia-${number}`
    const maintenanceId = `avaliacao-${number}`
    batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Separado para garantia", estadoRegistro: "ativo", dataCadastro: at, garantia: { id: warrantyId, status: "separada", separadaEm: at, motivo: "Falha persistente após avaliação de bancada", maintenanceId } })
    batch.set(db.collection("maintenances").doc(maintenanceId), { equipmentId: number, numeroRemota: number, tecnicoId: "local-tech", tecnicoNome: "Técnico de testes", status: "finalizada", dataEntrada: at, dataFinalizacao: at, situacaoRemota: "Separado para garantia", defeitoRelatado: "Sem comunicação", defeitoEncontrado: "Sem comunicação", servicosRealizados: ["Atualização de firmware"], operadoraAntes: "Claro", operadoraDepois: "Claro", motivoGarantia: "Falha persistente após avaliação de bancada", observacoes: "", checklist: { leituraSIMCard: "OK", firmwareAtualizado: "OK", sinal: "Falha", apnEnergiza: "OK", comunicacaoMedidor: "Falha", comunicacaoIRIS: "Falha" } })
    batch.set(db.collection("warranties").doc(warrantyId), { equipmentId: number, equipmentIds: [number], numeroRemota: number, status: "separada", separadaEm: at, separadaPor: "Técnico de testes", motivo: "Falha persistente após avaliação de bancada", maintenanceId })
  }
  for (const number of ["E2E-BULK-A", "E2E-BULK-B", "E2E-BULK-C", "E2E-BULK-D"]) batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
  for (const number of ["E2E-CORRIGE-ENVIO", "E2E-RET-MESMO", "E2E-RET-NOVO"]) {
    const warrantyId = `garantia-${number}`
    const at = Timestamp.now()
    batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Enviado para Garantia", estadoRegistro: "ativo", dataCadastro: at, garantia: { id: warrantyId, status: "enviada", enviadaEm: at, motivo: "Defeito observado em bancada" } })
    batch.set(db.collection("warranties").doc(warrantyId), { equipmentId: number, equipmentIds: [number], numeroRemota: number, status: "enviada", enviadaEm: at, enviadaPor: "Administrador de testes", enviadaUserId: "local-admin", motivo: "Defeito observado em bancada", situacaoEnvio: "Enviado para Garantia", sentOperationVersion: 0 })
  }
  batch.set(db.collection("equipments").doc("local-e2e"), { numeroRemota: "E2E-1001", modelo: "RT-1000", anoFabricacao: "2024", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Nova", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
  batch.update(db.collection("equipments").doc("E2E-CORRIGE-ENVIO"), { "garantia.maintenanceId": "avaliacao-corrige-envio" })
  batch.update(db.collection("warranties").doc("garantia-E2E-CORRIGE-ENVIO"), { maintenanceId: "avaliacao-corrige-envio" })
  batch.set(db.collection("maintenances").doc("avaliacao-corrige-envio"), { equipmentId: "E2E-CORRIGE-ENVIO", numeroRemota: "E2E-CORRIGE-ENVIO", tecnicoId: "local-tech", tecnicoNome: "Técnico de testes", status: "finalizada", dataEntrada: Timestamp.now(), dataFinalizacao: Timestamp.now(), situacaoRemota: "Separado para garantia", defeitoRelatado: "Sem comunicação", defeitoEncontrado: "Sem comunicação", servicosRealizados: ["Atualização de firmware"], operadoraAntes: "Claro", operadoraDepois: "Claro", observacoes: "", checklist: {} })
  batch.set(db.collection("equipments").doc("local-e2e-garantia"), { numeroRemota: "E2E-GARANTIA-original", modelo: "RT-1000", anoFabricacao: "2024", lote: "OCM-E2E-GARANTIA", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
  await batch.commit()
}
console.log("Dados locais preparados. Login: teste.admin, teste.tecnico ou teste.consulta. Senha de testes: teste123. Nenhum banco remoto foi acessado.")
await app.delete()
