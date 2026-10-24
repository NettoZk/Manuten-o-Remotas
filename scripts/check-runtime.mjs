import { createRequire } from "node:module"

if (Number(process.versions.node.split(".")[0]) !== 24) {
  console.error("Use Node.js 24.x para compilar e executar este projeto na Vercel.")
  process.exit(1)
}
if (!process.features.require_module) {
  console.error("O Firebase Admin exige require(ESM). Configure NODE_OPTIONS=--experimental-require-module na Vercel e refaça o deployment.")
  process.exit(1)
}
try {
  createRequire(import.meta.url)("firebase-admin/auth")
  console.log(`Runtime validado: Node ${process.versions.node}; Firebase Admin Auth carregado.`)
} catch {
  console.error("Não foi possível carregar o Firebase Admin Auth. Confira as dependências instaladas e NODE_OPTIONS=--experimental-require-module.")
  process.exit(1)
}
