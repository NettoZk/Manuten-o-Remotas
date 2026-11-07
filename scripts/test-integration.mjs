import { spawn } from "node:child_process"
const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run"], {
  stdio: "inherit", windowsHide: true, env: { ...process.env, RUN_FIREBASE_TESTS: "true", FIREBASE_PROJECT_ID: "demo-remotas-tests", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" },
})
child.on("exit", (code) => process.exit(code ?? 1))
