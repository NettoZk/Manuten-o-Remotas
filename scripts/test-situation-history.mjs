import { spawn } from "node:child_process"

// Usa somente o projeto demo e portas reservadas para este conjunto de testes.
const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run"], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, RUN_SITUATION_HISTORY_TESTS: "true", FIREBASE_PROJECT_ID: "demo-remotas-history",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8181", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199",
    GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" },
})
child.on("error", (error) => { console.error(error.message); process.exitCode = 1 })
child.on("exit", (code) => { process.exitCode = code ?? 1 })
