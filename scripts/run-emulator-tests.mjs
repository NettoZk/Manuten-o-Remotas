import { spawn } from "node:child_process"
import { once } from "node:events"

const mode = process.argv[2]
if (!["history", "browser"].includes(mode)) throw new Error("Informe history ou browser")
const history = mode === "history"
const args = ["node_modules/firebase-tools/lib/bin/firebase.js", "emulators:exec", "--project", history ? "demo-remotas-history" : "demo-remotas-tests", "--only", "auth,firestore", "--log-verbosity", "QUIET"]
if (history) args.push("--config", "firebase.history-tests.json")
args.push(history ? "node scripts/test-situation-history.mjs" : "node scripts/test-e2e.mjs")
const env = { ...process.env }
// O terminal pode ter DEBUG ou credenciais de outro ambiente. Os emuladores
// usam somente projetos demo e não precisam herdar esses dados.
for (const name of ["DEBUG", "NODE_ENV", "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) delete env[name]
const child = spawn(process.execPath, args, { stdio: "inherit", windowsHide: true, env })
const [code] = await once(child, "exit")
process.exitCode = code ?? 1
