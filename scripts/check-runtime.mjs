import { spawnSync } from "node:child_process"

if (Number(process.versions.node.split(".")[0]) !== 24) {
  console.error("Use Node.js 24.x para compilar e executar este projeto na Vercel.")
  process.exit(1)
}
// A Vercel desabilita require(ESM). O build precisa testar essa mesma condição,
// mesmo quando o Node local permite o recurso por padrão.
const result = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", "require('firebase-admin/auth'); require('firebase-admin/firestore')"], {
  encoding: "utf8",
  windowsHide: true,
})
if (result.error || result.status !== 0) {
  console.error("Não foi possível carregar o Firebase Admin sem require(ESM). Instale as versões fixadas nos arquivos de dependências antes de publicar.")
  console.error(result.error?.message || result.stderr)
  process.exit(1)
}
console.log(`Runtime validado: Node ${process.versions.node}; Firebase Admin Auth e Firestore carregados sem require(ESM).`)
