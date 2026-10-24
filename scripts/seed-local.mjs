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
for (const [collection, names] of Object.entries({ operators: ["Claro", "Vivo"], defects: ["Sem comunicação", "Sem defeito"], services: ["Atualização de firmware", "Troca de SIM Card"], equipment_status: ["Nova", "Triagem", "Manutenção", "Disponível", "Irrecuperável", "Enviado para Garantia"] })) {
  for (const [index, nome] of names.entries()) await db.collection(collection).doc(`local-${index}`).set({ nome, ativo: true })
}
for (const [index, numeroRemota] of ["1001", "1002", "1003"].entries()) {
  const ref = db.collection("equipments").doc(`local-${numeroRemota}`)
  if (!(await ref.get()).exists) await ref.set({ numeroRemota, modelo: "RT-1000", anoFabricacao: "2024", lote: `OCM00${index + 1}`, operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
}
if (process.argv.includes("--e2e")) {
  const batch = db.batch()
  batch.set(db.collection("equipments").doc("local-e2e"), { numeroRemota: "E2E-1001", modelo: "RT-1000", anoFabricacao: "2024", lote: "OCM-E2E", operadoraAtual: "Claro", status: "Nova", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
  batch.set(db.collection("equipments").doc("local-e2e-garantia"), { numeroRemota: "E2E-GARANTIA-original", modelo: "RT-1000", anoFabricacao: "2024", lote: "OCM-E2E-GARANTIA", operadoraAtual: "Claro", status: "Usada", situacaoRemota: "Triagem", estadoRegistro: "ativo", dataCadastro: Timestamp.now() })
  await batch.commit()
}
console.log("Dados locais preparados. Login: teste.admin, teste.tecnico ou teste.consulta. Senha de testes: teste123. Nenhum banco remoto foi acessado.")
await app.delete()
