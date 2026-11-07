import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals, ...nextTs,
  globalIgnores([".next/**", ".next-local/**", ".next-e2e/**", "node_modules/**", "next-env.d.ts", "test-results/**", "playwright-report/**", ".local/**"]),
  { rules: {
    // A base existente usa efeitos para sincronizar formulários e filtros.
    "react-hooks/set-state-in-effect": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  } },
])
