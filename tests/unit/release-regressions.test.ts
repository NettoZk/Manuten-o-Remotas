import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import * as dashboard from "@/lib/dashboard"
it("não apresenta contagens parciais como totais quando os indicadores estão indisponíveis", () => {
  expect(dashboard.displayMaintenanceMetrics(null)).toEqual({ totalMaintenances: "—", completedThisMonth: "—" })
  expect(dashboard.displayMaintenanceMetrics({ totalMaintenances: 80, completedThisMonth: 12 })).toEqual({ totalMaintenances: 80, completedThisMonth: 12 })
})
it("fixa a mesma integridade verificada do SheetJS nos dois lockfiles", () => {
  const npm = JSON.parse(readFileSync("package-lock.json", "utf8"))
  const integrity = npm.packages["node_modules/xlsx"].integrity
  const pnpm = readFileSync("pnpm-lock.yaml", "utf8").replace(/\r\n/g, "\n")
  const entry = pnpm.match(/  xlsx@https:\/\/cdn\.sheetjs\.com\/xlsx-0\.20\.3\/xlsx-0\.20\.3\.tgz:\n\s+resolution: (.+)/)?.[1]
  expect(integrity).toMatch(/^sha512-/)
  expect(entry).toContain(`integrity: ${integrity}`)
})
