# Seis melhorias do app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** entregar as seis frentes aprovadas com dados consistentes, trabalho recuperável e uma interface intuitiva.

**Architecture:** evolução aditiva dos serviços atuais, validação central no servidor e consultas por necessidade. Manter os fluxos de garantia e a busca de IMEIs; separar rascunhos e comprovantes de execução dos registros finais.

**Tech Stack:** Next.js 16, React 19, TypeScript, Firestore/Admin SDK, Zod, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-seis-melhorias-design.md`.

## Global Constraints

- Branch `melhorias/testes-remotas`; trabalho no checkout compartilhado já utilizado pelo usuário.
- OCM continua persistida como `lote`; Node 24; compatibilidade `--no-experimental-require-module`.
- Não capturar imagens, publicar, fazer merge ou gravar no Firebase oficial.
- Preservar dados legados e distinguir ausência de evidência histórica.
- Limites: 500 linhas, 20 operações/chamada, 28.000 bytes, corpo 32.768 bytes.

## Review Focus

- Dois responsáveis/abas tentando salvar rascunhos: rejeitar versões antigas sem perder o texto local.
- Cadastro antigo sem metadados históricos: não inventar uma cópia retroativa e manter a exportação utilizável.
- Resposta de lote perdida depois do commit: consultar comprovante e impedir reexecução automática do incerto.
- Paginação e filtros: exportar todos os resultados e não confundir página vazia com fim da pesquisa.
- Atualização de dependências: preservar importação com zeros iniciais, autenticação e carregamento CommonJS na Vercel.

## Task 1: Coerência de situação e referências essenciais

**Files:** `lib/validation.ts`, `lib/server/operations.ts`, `lib/equipment-import.ts`, `lib/bulk-movements.ts`, formulários de cadastro/edição/conclusão e `tests/unit/equipment-situations.test.ts`, `tests/history/system-regression.test.ts`.

**Interfaces:** produzir `isNewSituation(string): boolean`, `isProtectedSituation(string): boolean`, `equipmentUpdateSchema` e validação da combinação atual + alteração parcial.

- [x] RED: Usada/Nova rejeitada pelo cadastro/importação; conclusão Nova rejeitada; atualização parcial não contorna a combinação; desativar/renomear Triagem rejeitado; referências livres duplicadas rejeitadas.
- [x] GREEN: implementar validação comum, proteção transacional das referências e seletores que orientam a correção.
- [x] Verificar `npm test`, `npm run typecheck` e testes de emulador.

## Task 2: Cópia histórica de dados cadastrais

**Files:** `lib/types.ts`, novo `lib/maintenance-snapshot.ts`, `lib/server/operations.ts`, `lib/firestore-records.ts`, `lib/excel-export.ts`, histórico/detalhes e testes unitários/de emulador.

**Interfaces:** `EquipmentSnapshot`, `maintenanceEquipmentData(maintenance, current?)`, campo opcional `equipmentSnapshot` com data e origem da captura.

- [x] RED: alterar o cadastro não muda modelo/OCM exportados do atendimento; legado é identificado; snapshot nasce na abertura e permanece na conclusão.
- [x] GREEN: gravar cópia imutável, usá-la nos filtros/consulta/exportação e identificar o fallback legado.
- [x] Verificar testes unitários, emuladores e TypeScript.

## Task 3: Rascunho recuperável

**Files:** `lib/validation.ts`, `lib/types.ts`, `lib/services.ts`, `lib/server/operations.ts`, novo utilitário de recuperação, `components/maintenance-form.tsx`, testes de API e navegador.

**Interfaces:** `saveMaintenanceDraft(maintenanceId, equipmentId, data, expectedVersion)`; campos `draft`, `draftVersion`, `draftUpdatedAt`; erro 409 para versão antiga.

- [x] RED: somente responsável salva; dados incompletos válidos como rascunho; finalizado não aceita rascunho; versões concorrentes não sobrescrevem; recarregar recupera o preenchimento.
- [x] GREEN: persistência transacional, salvamento automático/manual, recuperação local por usuário/atendimento e mensagens de conflito/conexão.
- [x] Verificar API, unitários e navegador sem capturas.

## Task 4: Resultados de lote preservados

**Files:** `lib/bulk-movements.ts`, `lib/services.ts`, `lib/server/operations.ts`, `components/bulk-movement-dialog.tsx`, índices TTL e testes de transporte/API/navegador.

**Interfaces:** validação de bytes compartilhada; `BulkResult.uncertain`; `getBulkRun(runId)`; comprovantes privados vinculados ao usuário; identificador único por chamada.

- [x] RED: linha grande não apaga sucessos; confirmação perdida pode ser consultada; execução com identificador repetido não repete operações; outro usuário não consulta o comprovante.
- [x] GREEN: pré-validação integral, comprovantes com resultados por item, recuperação do último lote e exportação de pendências/itens incertos.
- [x] Verificar unitários, API e navegador.

## Task 5: Dependências com alertas

**Files:** `package.json`, `package-lock.json`, `pnpm-lock.yaml` e testes existentes de planilhas/runtime.

**Interfaces:** mesmas APIs de planilha e Firebase; versões e integridades fixadas em ambos os lockfiles.

- [x] Registrar auditoria atual e consultar versões/documentação oficial.
- [x] Atualizar biblioteca de planilhas e transitivas vulneráveis sem atualização principal automática do Admin SDK.
- [x] Verificar auditoria de produção, unidade, API, navegador, `verify:vercel` e build.

## Task 6: Consultas por necessidade e acompanhamento

**Files:** `contexts/live-data-context.tsx`, serviços/rotas, dashboard, Equipamentos, Manutenção, Histórico, novos componentes de timeline, relatórios e testes de consulta/API/navegador.

**Interfaces:** `getMaintenancePage(filters, cursor?)`, `getDashboardMetrics(month)`, `getEquipmentMovements(id, cursor?)`; listener global de manutenção filtrado por `status == em_andamento`; cache histórico limitado com atualização explícita.

- [x] RED: histórico paginado sem duplicar/perder empates; filtros/data e exportação completa; detalhes por remota preservam atendimentos fechados; exclusão detecta histórico; timeline ordenada/autorizada e tempo decorrido correto.
- [x] GREEN: carregar históricos sob demanda, paginar a consulta, calcular totais globais no servidor, carregar distribuição detalhada por técnico sob demanda, timeline recolhível e tempo de espera na garantia.
- [x] Verificar unidade, API, navegador e TypeScript.

## Task 7: Revisão final e entrega

- [x] Atualizar README, instruções de ambientes/índices e POP conforme o comportamento entregue.
- [x] Executar toda a suíte, lint, TypeScript, compatibilidade Vercel, build e auditoria de produção.
- [x] Revisão independente do diff e dos pontos de atenção; corrigir achados importantes com RED→GREEN.
- [x] Entregar alterações locais verificadas e limites reais; não publicar nem fazer merge.
