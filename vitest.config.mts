import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)), "server-only": fileURLToPath(new URL("./tests/empty.ts", import.meta.url)) } },
  test: {
    include: process.env.RUN_SITUATION_HISTORY_TESTS === "true" ? ["tests/history/**/*.test.ts"]
      : process.env.RUN_FIREBASE_TESTS === "true" ? ["tests/integration/**/*.test.ts"] : ["tests/unit/**/*.test.ts"],
    environment: "node", fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000,
  },
})
