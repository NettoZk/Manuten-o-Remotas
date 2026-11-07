# Sistema de Manutenção de Remotas

Next.js 16, React 19 e Firestore para cadastro, atendimento técnico, garantia e relatórios mensais. Use Node.js 24. A OCM continua armazenada em `lote`, preservando a compatibilidade do banco.

## Desenvolvimento e ambientes

```powershell
npm ci
npm run dev
```

Alternativa: `pnpm install --frozen-lockfile` com pnpm 9.15.9. Mantenha os dois lockfiles ao atualizar dependências. O SheetJS segue a [distribuição oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), com versão e hash fixados; `.npmrc` permite URLs de dependências diretas. Preserve Firebase Admin 13.10 e a verificação CommonJS do build; não execute `npm audit fix --force`.

Copie `.env.example` para `.env.local`. Nunca versione credenciais ou arquivos de conta de serviço.

- Cliente: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
- Servidor: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (aceita quebras de linha escapadas). Alternativamente, arquivo em `GOOGLE_APPLICATION_CREDENTIALS`, somente na execução local.
- O setup inicial é protegido por `FIREBASE_SETUP_TOKEN`; consulte `.env.example` e `app/api/setup/route.ts` antes de configurá-lo.

Na Vercel, configure as variáveis no projeto e ambiente correspondente e faça novo deploy após alterá-las. Homologação usa o Firebase de testes; produção mantém as próprias variáveis. Caminhos de arquivos do Windows não funcionam nas funções da Vercel. `.vercelignore` evita o upload de caches, dependências e arquivos locais.

## Operação

- Administrador gerencia usuários, listas, cadastros, retorno de garantia e exceções. Técnico executa seus atendimentos e encaminhamentos. Consulta acessa dados sem movimentá-los. O servidor valida permissões e perfil ativo.
- Remota usada não recebe situação Nova. Conclusão normal produz Usada e exige defeito, serviços, operadora e situação final permitida. Checklist com falha gera aviso de conferência; os critérios técnicos dos ensaios são definidos pela equipe.
- Nova, Triagem, Manutenção, Separado para garantia e Enviado para Garantia são situações protegidas contra renomeação e desativação. Referências duplicadas são recusadas.
- Manutenção avaliada → Separado para garantia, com motivo → confirmação da saída física. Cancelar separação exige justificativa e retorna a Triagem. Não há protocolo obrigatório.
- Retorno com mesmo IMEI exige Usada. IMEI diferente cria outra remota vinculada à anterior e arquiva a original; a condição Nova/Usada depende da análise física. Nova retorna com situação Nova.
- Atendimentos novos guardam uma cópia dos dados cadastrais. Modelo/OCM alterados depois não mudam essa evidência. Legado aberto recebe captura identificada na conclusão; campos históricos ausentes não são inventados.
- Rascunhos aceitam dados incompletos e são salvos automaticamente ou por botão, pelo responsável. Versões concorrentes são rejeitadas. A recuperação local tem validade de 7 dias; preserve o texto antes de carregar outra versão.
- Lotes: até 500 linhas, chamadas de até 20 operações e 28.000 bytes, corpo máximo 32.768 bytes. Confira prévia e resultado por remota. O último lote pode ser consultado por 7 dias. Itens sem confirmação exigem conferência e não são reenviados automaticamente.

## Arquitetura e consultas

Login e senha bcrypt são validados no servidor. O cliente recebe token personalizado do Firebase Auth; a API valida o ID token e o perfil ativo. Não há autenticação baseada em usuário salvo manualmente no localStorage. Escritas passam por `app/api/data/[operation]/route.ts` e validações/transações de `lib/server`; o cliente não grava diretamente no Firestore.

O contexto global sincroniza inventário, referências e somente manutenções abertas. O inventário completo preserva a pesquisa de IMEIs e seus vínculos; inventários muito grandes ainda podem exigir paginação própria. Históricos por remota são consultados ao abrir detalhes. A consulta geral usa páginas e filtros no servidor; a exportação percorre todos os resultados, inclusive os ainda não carregados na tela. Página sem correspondências pode oferecer Continuar busca.

Indicadores usam contagens no servidor. Distribuição por técnico e timeline só carregam ao abrir. A timeline apresenta campos públicos e paginação. Espera na garantia representa dias decorridos, sem presumir SLA.

O dashboard conta todas as remotas ativas no período, independentemente de manutenção. O mês atual usa a situação atual; meses anteriores usam o fechamento no horário de Brasília. O histórico transacional começa no primeiro estado observado; meses sem evidência não são reconstruídos artificialmente. Cache mensal: até 24 períodos por 60 segundos, invalidado por Atualizar.

## Campos novos e índices

Alterações aditivas, sem renomear OCM/coleções. `maintenances` aceita `equipmentSnapshot`, `draft`, `draftVersion`, `draftUpdatedAt`, `draftUpdatedBy`. A coleção privada `bulk_runs` guarda usuário, hash e resultados por item; `expiresAt` controla validade de 7 dias. Uma interrupção entre operação e confirmação pode deixar resultado incerto: confira o cadastro antes de repetir.

`firestore.indexes.json` contém índice da timeline (`audit_logs`: equipmentId/at) e TTL dos comprovantes. Enquanto o índice estiver indisponível, a timeline usa fallback restrito à remota. Comprovantes vencidos são recusados mesmo antes da limpeza física. Para limpeza automática, habilite/publique TTL no Firebase de destino. Deploy da Vercel não publica índices/regras/TTL. Revise o projeto escolhido antes de usar `firebase deploy --only firestore:rules,firestore:indexes`.

## Verificação

```powershell
npm test
npm run test:history
npm run test:e2e
npm run typecheck
npm run lint
npm run verify:vercel
npm run build
npm audit --omit=dev
```

API e navegador iniciam emuladores `demo-*` e recusam bancos remotos; exigem Java e portas livres. Navegador desativa imagens, vídeos e traces. `npm run emulators`, `npm run seed:local` e `npm run dev:local` permitem testes manuais; confira as variáveis dos scripts antes de executar.

O build testa `firebase-admin/auth` e `firebase-admin/firestore` com `--no-experimental-require-module`, reproduzindo a restrição da Vercel. Mantenha o comando inline: `scripts/` é ignorada no upload pela CLI.

## Documentação

- Revisão: `docs/reviews/2026-11-06-reanalise.md`.
- Escopo/plano: `docs/superpowers/specs/2026-11-06-seis-melhorias-design.md` e `docs/superpowers/plans/2026-11-06-seis-melhorias.md`.
- POP: `output/pdf/POP_Manutencao_Remotas_Rev05.pdf`.

Homologue as mudanças antes de integrar a branch de testes à principal. Esta entrega não publica configurações nem altera dados oficiais.
