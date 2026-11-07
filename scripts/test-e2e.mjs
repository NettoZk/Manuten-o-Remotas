import { spawn } from "node:child_process"
import { once } from "node:events"
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Os testes de navegador exigem os emuladores locais, sem conexão com bancos remotos")
const env = { ...process.env, CI: "true", FIREBASE_PROJECT_ID: "demo-remotas-tests", REMOTAS_E2E: "true", REMOTAS_E2E_BASE_URL: "http://127.0.0.1:3101", PORT: "3101", GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" }
for (const args of [["scripts/seed-local.mjs", "--e2e"], ["node_modules/@playwright/test/cli.js", "test", "--reporter=line"]]) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true })
  const [code] = await once(child, "exit")
  if (code !== 0) { process.exitCode = code ?? 1; break }
}
