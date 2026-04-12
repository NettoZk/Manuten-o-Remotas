# Documentação do Sistema de Manutenção de Remotas

## Visão Geral

Aplicação web de gestão de manutenção de remotas de telemetria construída com Next.js, React e Firebase.
A solução oferece autenticação, painel de controle, cadastro e acompanhamento de equipamentos, registro e finalização de manutenções, histórico e exportação de relatórios.

## Tecnologias Principais

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS / shadcn/ui
- Firebase Firestore
- `bcryptjs` para hash/validação de senha no cliente
- `recharts` para gráficos
- `xlsx` para exportação Excel
- `pnpm` como gerenciador de pacotes

## Comandos Principais

- Instalar dependências:
  - `pnpm install`
- Rodar em desenvolvimento:
  - `pnpm dev`
- Build de produção:
  - `pnpm build`
  - `pnpm start`
- Lint:
  - `pnpm lint`

## Variáveis de Ambiente Necessárias

A configuração do Firebase é feita via variáveis públicas do Next.js.

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## Arquitetura do Projeto

### Layout Global

- `app/layout.tsx`
  - Envolve toda a aplicação com `AuthProvider`
  - Carrega `globals.css`
  - Adiciona `Analytics` e `Toaster`

### Autenticação e Controle de Sessão

- `contexts/auth-context.tsx`
  - `signIn(username, password)`
  - `signOut()`
  - `hasPermission(roles)`
  - Armazena sessão em `localStorage` sob `manutencao_auth_user`
  - Verifica usuário ativo no Firestore

### Conexão com Firebase

- `lib/firebase.ts`
  - Inicializa app Firebase
  - Exporta `auth` e `db`

### Tipos e Modelos

- `lib/types.ts`
  - `User`
  - `Equipment`
  - `Maintenance`
  - `Defect`
  - `Service`
  - `Operator`
  - `EquipmentSituation`
  - `ChecklistItem`

### Regras de Negócio e Serviços

- `lib/services.ts`
  - Funções CRUD para usuários, equipamentos, manutenções, listas auxiliares e dashboard
  - Lógica central de criação, atualização e validação

## Rotas Principais

### Rotas públicas

- `/` - login
- `/setup` - criação do primeiro administrador

### Rotas protegidas (dashboard)

- `/dashboard` - visão geral e métricas
- `/manutencao` - registrar e finalizar manutenções
- `/equipamentos` - gerenciar remotas
- `/historico` - consultar histórico de manutenções
- `/usuarios` - gerenciar usuários (admin)
- `/listas` - gerenciar listas de suporte (admin)

## Permissões e Funções

- `admin`
  - Acesso total
  - Gerencia usuários e listas auxiliares
- `tecnico`
  - Acesso a manutenção, dashboard, equipamentos, histórico
- `usuario`
  - Acesso apenas a dashboard, equipamentos, histórico

## Fluxo de Inicialização

1. Aplicação é iniciada em `app/layout.tsx`.
2. `AuthProvider` tenta restaurar sessão do `localStorage`.
3. Se não houver admin no Firestore, `/setup` permite criar o primeiro admin.
4. Após configuração, usuário acessa `/` e faz login.
5. Usuário autenticado é redirecionado para `/dashboard`.

## Fluxo de Login

1. Usuário entra com `username` e `password` em `LoginForm`.
2. `AuthProvider.signIn()` consulta Firestore na coleção `users`.
3. Compara senha com `bcrypt.compare()` usando `senhaHash`.
4. Verifica se `ativo` é verdadeiro.
5. Salva sessão no `localStorage` e exibe o painel.

## Detalhes das Páginas

### Dashboard (`app/(dashboard)/dashboard/page.tsx`)

- Exibe métricas de remotas e manutenções.
- Busca dados com `getDashboardStats()`.
- Mostra gráficos de:
  - Remotas por situação
  - Manutenções por técnico
  - Manutenções por mês

### Manutenção (`app/(dashboard)/manutencao/page.tsx`)

- Busca equipamento por número de remota.
- Se não existir, abre formulário para cadastro.
- Se existir, carrega histórico e mantém a manutenção em andamento.
- `createMaintenance()` cria registro em `maintenances` e atualiza o equipamento para `Manutenção`.
- `finalizeMaintenance()` finaliza a manutenção e libera o equipamento.
- `forceFinalizeMaintenance()` encerra forçadamente, atualiza o equipamento e salva motivo.

### Equipamentos (`app/(dashboard)/equipamentos/page.tsx`)

- Lista remotas cadastradas.
- Filtra por número, modelo, operadora, situação.
- Visualiza detalhes no componente `EquipmentInfo`.
- Permite edição, exclusão/arquivamento e alteração de situação.
- Admin pode importar planilha.

### Histórico (`app/(dashboard)/historico/page.tsx`)

- Exibe todas as manutenções.
- Filtra por:
  - número da remota
  - modelo
  - técnico
  - operadora
  - intervalo de datas
- Exporta planilha Excel via `exportMaintenancesToExcel()`.

### Usuários (`app/(dashboard)/usuarios/page.tsx`)

- Admin gerencia usuários.
- CRUD completo de usuários.
- Alteração de senha.
- Controle de ativo/inativo.

### Listas (`app/(dashboard)/listas/page.tsx`)

- Admin controla listas de suporte:
  - `defects`
  - `services`
  - `operators`
  - `equipment_status`
- Cada item tem criação, edição e exclusão.

## Modelos de Dados no Firestore

### Coleção `users`

- `nome`
- `username`
- `senhaHash`
- `tipo`
- `ativo`
- `criadoEm`

### Coleção `equipments`

- `numeroRemota`
- `modelo`
- `anoFabricacao`
- `lote`
- `operadoraAtual`
- `status` (`Nova` | `Usada`)
- `situacaoRemota`
- `situacaoAnterior`
- `situacaoAtualizadaEm`
- `situacaoAtualizadaPor`
- `motivoAlteracaoSituacao`
- `dataCadastro`
- `observacoes`
- `ultimaEdicaoEm`
- `ultimaEdicaoPor`
- `estadoRegistro` (`ativo` | `inativo`)
- `arquivadoEm`
- `emManutencaoPor`
- `emManutencaoNome`
- `emManutencaoDesde`
- `manutencaoId`

### Coleção `maintenances`

- `numeroRemota`
- `equipmentId`
- `tecnicoId`
- `tecnicoNome`
- `dataEntrada`
- `dataFinalizacao`
- `operadoraAntes`
- `operadoraDepois`
- `defeitoRelatado`
- `defeitoEncontrado`
- `servicosRealizados`
- `checklist`
- `observacoes`
- `status` (`em_andamento` | `finalizada`)
- `finalizadoForcadamente`
- `finalizadoForcadoPor`
- `motivoFinalizacaoForcada`

### Coleções auxiliares

- `defects`
- `services`
- `operators`
- `equipment_status`

Cada item contém `nome` e `ativo`.

## Regras de Negócio Importantes

- Equipamento em manutenção fica bloqueado em campos `emManutencaoPor`, `emManutencaoNome`, `emManutencaoDesde`, `manutencaoId`.
- Finalização libera o equipamento removendo esses campos.
- Finalização forçada define `situacaoRemota` para `Triagem` e grava o motivo.
- Se equipamento for `Nova`, ao finalizar, pode ser marcado como `Usada` dependendo do update.
- O login usa busca por `username` lowercased e senha hashed.
- As queries de manutenção ordenam em cliente para evitar índices compostos no Firestore.

## Observações Técnicas

- A aplicação não contém um backend próprio além do Firebase e do front-end Next.js.
- A autenticação acontece no cliente usando Firestore + bcrypt, então as regras do Firebase são essenciais para segurança real.
- O uso de `localStorage` mantém sessão ativa até logout. Isso é um ponto de melhoria: implementar expiração de sessão, renovação de token ou login automático após inatividade.
- O app usa componentes `shadcn/ui` e `lucide-react` para interface.

## Sugestões para melhorias e upgrades

Este documento deve ser utilizado como base para:

- Planejar upgrades de dependências e migrações de versão.
- Identificar partes sensíveis à segurança ou arquitetura.
- Definir melhorias de estabilidade, testes e governança de dados.

### Áreas prioritárias para melhoria

- Autenticação e sessão:
  - mover a validação de login para um backend ou para Firebase Authentication.
  - implementar expiração de sessão e renovação por tempo de inatividade.
  - evitar armazenamento exclusivo em `localStorage` para dados de sessão.
- Segurança do Firestore:
  - criar regras de segurança explícitas para `users`, `equipments`, `maintenances` e coleções auxiliares.
  - validar dados no servidor ou via regras antes de gravar.
- Separação de responsabilidades:
  - refatorar `lib/services.ts` em serviços menores (`userService`, `equipmentService`, `maintenanceService`, `referenceDataService`).
  - reduzir lógica de negócios diretamente em componentes de página.
- Testes e qualidade:
  - adicionar testes unitários para serviços e componentes críticos.
  - adicionar testes de integração para o fluxo de login e finalização de manutenção.
- Observabilidade:
  - acrescentar logs de auditoria e histórico de ações administrativas.
  - registrar eventos de usuário e ações de manutenção.
- Dados em tempo real:
  - implementar listeners do Firestore para atualizar telas automaticamente quando dados mudarem.
  - garantir sincronização imediata de manutenções, status de equipamentos e alterações de usuário para todos os clientes conectados.
  - considerar uso de `onSnapshot` em vez de fetch manual para dashboards e páginas de lista.
- Experiência de usuário:
  - melhorar mensagens de erro e validações de formulário.
  - adicionar tratamento de erros mais robusto para falhas de rede e Firestore.

### Melhorias de arquitetura

- Avaliar a adoção de Firebase Authentication em vez de autenticação manual por Firestore.
- Modularizar o código para facilitar upgrades de Next.js, React e dependências.
- Adicionar camadas de API ou funções serverless se for necessário suporte a regras de negócio mais complexas.
- Usar `useEffect` e hooks personalizados para separar lógica de estado e efeitos colaterais.

### Roadmap de upgrade sugerido

1. Documentar regras de segurança do Firestore e dependências atuais.
2. Separar a lógica de serviço em módulos menores e testáveis.
3. Adicionar expiração de sessão e/ou autenticação token-based.
4. Criar testes automatizados e validar fluxos principais.
5. Atualizar dependências de framework e bibliotecas com um plano de rollback.

## Como usar este documento para melhorias

- Use-o como guia para entender o contexto funcional do sistema.
- Antes de alterar qualquer fluxo, identifique o impacto nas coleções do Firestore.
- Priorize correções de segurança e autenticação.
- Registre no documento novas decisões arquiteturais ou mudanças nos dados.

## Pontos de atenção para upgrades

- `lib/services.ts` concentra grande parte da lógica; mudanças aqui afetam várias telas.
- A página `/setup` depende da ausência de admin e não deve ser exposta em produção sem controle.
- Alguns filtros e ordenações são feitos no cliente, o que pode impactar desempenho com muitos dados.
- A exportação Excel depende de dados carregados em memória e deve ser testada com grandes volumes.


## Recomendações de Uso

1. Configure as variáveis de ambiente do Firebase.
2. Acesse `/setup` na primeira execução para criar o admin.
3. Crie dados auxiliares em `/listas` antes de usar `/manutencao`.
4. Cadastre remotas em `/equipamentos` ou busque diretamente na página de manutenção.
5. Use `/historico` para gerar relatórios Excel.

## Como o sistema funciona, passo a passo

1. Usuário acessa a aplicação.
2. Se não existir admin, `/setup` cria o primeiro administrador.
3. O usuário realiza login em `/`.
4. `AuthProvider` valida credenciais e carrega sessão.
5. A rota `/dashboard` exibe o painel de controle.
6. O menu lateral mostra apenas páginas permitidas para o tipo de usuário.
7. O usuário técnico registra manutenção em `/manutencao`.
8. O sistema cria a manutenção e bloqueia a remota.
9. Ao finalizar, a manutenção recebe data de conclusão e o equipamento é liberado.
10. O histórico pode ser consultado e exportado em Excel.