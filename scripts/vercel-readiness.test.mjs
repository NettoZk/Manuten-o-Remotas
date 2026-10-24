import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { generateKeyPairSync, verify } from "node:crypto"
import { runInNewContext } from "node:vm"
import { spawnSync } from "node:child_process"
import ts from "typescript"
import { getApps, deleteApp, SDK_VERSION } from "firebase-admin/app"
import { ApiError, readApiResponse } from "../lib/api-response.ts"

test("resposta JSON válida preserva resultado e erros da aplicação", async () => {
  assert.deepEqual(await readApiResponse(new Response('{"result":null}')), { result: null })
  await assert.rejects(readApiResponse(new Response('{"error":"Usuário ou senha inválidos"}', { status: 401 })), (error) => error instanceof ApiError && error.status === 401 && error.message === "Usuário ou senha inválidos")
})
test("resposta vazia da plataforma não causa erro de JSON", async () => {
  await assert.rejects(readApiResponse(new Response("", { status: 500 })), (error) => error instanceof ApiError && error.status === 500 && error.message.includes("HTTP 500") && !error.message.includes("JSON"))
})
test("HTML de falha não é exibido como mensagem nem interpretado como sucesso", async () => {
  await assert.rejects(readApiResponse(new Response("<html>PRIVATE_PLATFORM_DETAILS</html>", { status: 502 })), (error) => error instanceof ApiError && error.status === 502 && !error.message.includes("PRIVATE_PLATFORM_DETAILS"))
})
test("JSON truncado, vazio e valores fora do contrato são recusados", async () => {
  for (const text of ['{"token":', "", "null", "[]", '"texto"']) {
    await assert.rejects(readApiResponse(new Response(text)), (error) => error instanceof ApiError && error.message.includes("resposta vazia ou inválida"))
  }
})
test("Firebase Auth e Firestore carregam com require(ESM) desabilitado como na Vercel", () => {
  const code = "require('firebase-admin/auth');require('firebase-admin/firestore');console.log('loaded')"
  const success = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", code], { encoding: "utf8", windowsHide: true })
  assert.equal(success.status, 0, success.stderr)
  assert.match(success.stdout, /loaded/)
})
test("manifestos fixam a versão compatível do Firebase Admin e Node 24", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"))
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"))
  assert.equal(pkg.engines.node, "24.x")
  assert.equal(lock.packages[""].engines.node, pkg.engines.node)
  const installed = SDK_VERSION
  assert.match(pkg.dependencies["firebase-admin"], /^13\.\d+\.\d+$/)
  assert.equal(installed, pkg.dependencies["firebase-admin"])
  assert.equal(lock.packages[""].dependencies["firebase-admin"], installed)
  assert.equal(lock.packages["node_modules/firebase-admin"].version, installed)
})

// Executa o módulo real com um ambiente isolado. Nenhum .env ou credencial real é lido.
function loadAdmin(env) {
  const filename = resolve("lib/server/firebase-admin.ts")
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loadedModule = { exports: {} }
  const require = createRequire(filename)
  runInNewContext(compiled, { module: loadedModule, exports: loadedModule.exports, require: (name) => name === "server-only" ? {} : require(name), process: { env } }, { filename })
  return loadedModule.exports.getAdmin
}
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const pem = privateKey.export({ type: "pkcs8", format: "pem" })
const base = { FIREBASE_PROJECT_ID: "demo-remotas-tests", FIREBASE_CLIENT_EMAIL: "verification@demo-remotas-tests.iam.gserviceaccount.com" }
async function checkSigning(env) {
  const { auth, db } = loadAdmin(env)()
  try {
    const [header, payload, signature] = (await auth.createCustomToken("verificacao-local-sem-conta" )).split(".")
    assert.equal(JSON.parse(Buffer.from(payload, "base64url")).uid, "verificacao-local-sem-conta")
    assert(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")))
  } finally {
    await db.terminate()
    for (const app of getApps().filter((item) => item.name === "remotas-server")) await deleteApp(app)
  }
}
test("Vercel assina com variáveis sem abrir o caminho do arquivo local", async () => {
  await checkSigning({ ...base, VERCEL: "1", GOOGLE_APPLICATION_CREDENTIALS: "C:/arquivo-que-nao-existe.json", FIREBASE_PRIVATE_KEY: pem })
})
test("chave com quebras escapadas também é válida na Vercel", async () => {
  await checkSigning({ ...base, VERCEL: "1", FIREBASE_PRIVATE_KEY: pem.replace(/\n/g, "\\n") })
})
test("Vercel sem o par de credenciais falha com orientação sem ler arquivo local", () => {
  assert.throws(loadAdmin({ ...base, VERCEL: "1", GOOGLE_APPLICATION_CREDENTIALS: "C:/arquivo-que-nao-existe.json" }), /Configure FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY/)
})
test("arquivo JSON permanece compatível no computador local", async () => {
  const directory = mkdtempSync(join(tmpdir(), "remotas-vercel-verification-"))
  const filename = join(directory, "service-account.json")
  writeFileSync(filename, JSON.stringify({ type: "service_account", project_id: base.FIREBASE_PROJECT_ID, client_email: base.FIREBASE_CLIENT_EMAIL, private_key: pem }))
  try { await checkSigning({ FIREBASE_PROJECT_ID: base.FIREBASE_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS: filename }) }
  finally { unlinkSync(filename); rmdirSync(directory) }
})
