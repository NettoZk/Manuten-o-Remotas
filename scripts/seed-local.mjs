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
  for (const number of ["E2E-SEP-ENVIO-A", "E2E-SEP-ENVIO-B", "E2E-SEP-CANCEL-A", "E2E-SEP-CANCEL-B", "E2E-SEP-CANCEL-IND"]) {
    const at = Timestamp.now()
    const warrantyId = `garantia-${number}`
    const maintenanceId = `avaliacao-${number}`
    batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Separado para garantia", estadoRegistro: "ativo", dataCadastro: at, garantia: { id: warrantyId, status: "separada", separadaEm: at, motivo: "Falha persistente após avaliação de bancada", maintenanceId } })
    batch.set(db.collection("maintenances").doc(maintenanceId), { equipmentId: number, numeroRemota: number, tecnicoId: "local-tech", tecnicoNome: "Técnico de testes", status: "finalizada", dataEntrada: at, dataFinalizacao: at, situacaoRemota: "Separado para garantia", defeitoRelatado: "Sem comunicação", defeitoEncontrado: "Sem comunicação", servicosRealizados: ["Atualização de firmware"], operadoraAntes: "Claro", operadoraDepois: "Claro", motivoGarantia: "Falha persistente após avaliação de bancada", observacoes: "", checklist: { leituraSIMCard: "OK", firmwareAtualizado: "OK", sinal: "Falha", apnEnergiza: "OK", comunicacaoMedidor: "Falha", comunicacaoIRIS: "Falha" } })
    batch.set(db.collection("warranties").doc(warrantyId), { equipmentId: number, equipmentIds: [number], numeroRemota: number, status: "separada", separadaEm: at, separadaPor: "Técnico de testes", motivo: "Falha persistente após avaliação de bancada", maintenanceId })
  }
  for (const number of ["E2E-BULK-A", "E2E-BULK-B", "E2E-BULK-C", "E2E-BULK-D"]) batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
  for (const number of ["E2E-RET-MESMO", "E2E-RET-NOVO"]) {
    const warrantyId = `garantia-${number}`
    const at = Timestamp.now()
    batch.set(db.collection("equipments").doc(number), { numeroRemota: number, modelo: "RT-1000", anoFabricacao: "2026", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Enviado para Garantia", estadoRegistro: "ativo", dataCadastro: at, garantia: { id: warrantyId, status: "enviada", enviadaEm: at, motivo: "Defeito observado em bancada" } })
    batch.set(db.collection("warranties").doc(warrantyId), { equipmentId: number, equipmentIds: [number], numeroRemota: number, status: "enviada", enviadaEm: at, enviadaPor: "Administrador de testes", enviadaUserId: "local-admin", motivo: "Defeito observado em bancada", situacaoEnvio: "Enviado para Garantia" })
  }
  batch.set(db.collection("equipments").doc("local-e2e"), { numeroRemota: "E2E-1001", modelo: "RT-1000", anoFabricacao: "2024", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Nova", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
  batch.set(db.collection("equipments").doc("local-e2e-garantia"), { numeroRemota: "E2E-GARANTIA-original", modelo: "RT-1000", anoFabricacao: "2024", lote: "OCM-E2E-GARANTIA", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
  await batch.commit()
}
console.log("Dados locais preparados. Login: teste.admin, teste.tecnico ou teste.consulta. Senha de testes: teste123. Nenhum banco remoto foi acessado.")
await app.delete()
