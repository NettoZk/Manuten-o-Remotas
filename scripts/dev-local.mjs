import { spawn } from "node:child_process"
const env = {
  ...process.env, NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
  REMOTAS_LOCAL_TESTS: "true",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-remotas-tests",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-remotas-tests.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app", FIREBASE_PROJECT_ID: "demo-remotas-tests",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
}
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", process.env.PORT || "3100"], { env, stdio: "inherit", windowsHide: true })
child.on("exit", (code) => process.exit(code ?? 1))
