# Seis melhorias de confiabilidade e uso

Escopo autorizado: as seis frentes aprovadas pelo usuário após a revisão de 06/11/2026, com a exigência de manter o aplicativo fácil e intuitivo. Referência: `docs/reviews/2026-11-06-reanalise.md`.

## Abordagem

Evoluir o app existente por domínios, preservando Next.js/React/Firebase, a branch `melhorias/testes-remotas` e os dados legados. Essa abordagem mantém a rotina conhecida e permite testar cada entrega. Uma reescrita completa ampliaria o risco sem necessidade; correções apenas nos formulários deixariam importações e APIs aceitando registros inconsistentes. A escolha técnica é aplicar as regras no servidor e orientar a interface com as mesmas validações.

## Requisitos e escolhas de implementação

1. **Regras:** bloquear Usada/Nova em cadastro, alteração, importação, lote e conclusão. A conclusão técnica produz Usada e não aceita situação Nova. Manter as regras de garantia já aprovadas e proteger nomes/situações essenciais nas Listas. Não inventar uma política nova sobre quais testes técnicos devem obrigatoriamente estar OK; sinalizar inconsistências de checklist para conferência.
2. **Histórico:** novos atendimentos guardam uma cópia de número, modelo, ano, OCM, operadora e condição na abertura. Exportações e consultas usam essa cópia. Atendimentos antigos sem cópia são identificados como dados cadastrais atuais; não se atribui um cadastro atual a uma data passada como se fosse comprovado.
3. **Rascunho:** salvamento automático e botão Salvar rascunho, recuperação de preenchimento, mensagem de estado e proteção contra sobrescrita entre abas. Somente o responsável salva um atendimento em andamento. Rascunho é separado do resultado final.
4. **Lotes:** pré-validar bytes por linha; preservar resultados parciais; distinguir falha confirmada de resultado incerto. Registrar comprovantes de execução por lote no servidor e permitir consultar o último lote após falha/reabertura, sem reexecutar automaticamente uma operação incerta.
5. **Dependências:** corrigir os avisos de produção com versões verificadas e lockfiles coerentes. Preservar a compatibilidade CommonJS do Firebase Admin e Node 24. Validar a biblioteca oficial de planilhas e as dependências transitivas antes de considerar mudança de versão principal.
6. **Acompanhamento e escala:** linha do tempo de movimentações carregada quando aberta; tempo nas etapas de garantia; histórico de atendimentos paginado e exportação completa dos filtros; assinatura global somente das manutenções em andamento; indicadores globais consultados no servidor; consulta histórica mensal com cache limitado. O inventário permanece sincronizado para preservar a busca completa por IMEI e suas substituições.

## Experiência de uso

Usar os mesmos nomes e botões que a equipe já conhece. Preencher automaticamente apenas valores seguros; erros junto aos campos; detalhes adicionais recolhidos; Carregar mais nas listas; rascunho com estado visível; resultados do lote por remota. Preservar seleção, vínculos e consultas a arquivadas. Não solicitar protocolo de garantia. Não capturar imagens de testes.

## Compatibilidade e limites

- OCM continua persistida como `lote`.
- Meses anteriores à implantação continuam sem reconstrução automática.
- Novos campos e coleções são aditivos. Nenhum dado oficial será migrado, apagado ou modificado durante o desenvolvimento.
- Nomes essenciais são protegidos; referências legadas inativas podem ser reativadas. Metadados antigos ausentes permanecem explicitamente desconhecidos.
- Assinatura de inventário completo é mantida nesta entrega; o maior crescimento histórico deixa de ser carregado globalmente.
- Limites de lote: até 500 linhas na interface, chamadas de até 20 operações e 28.000 bytes, corpo máximo 32.768 bytes.
- Prazos exibem tempo decorrido; não se inventa um SLA contratual ou uma data de vencimento.
- Não fazer merge, publicar ou alterar a configuração do Firebase oficial nesta implementação.

## Verificação

Regressões reproduzidas antes das correções; testes unitários, emuladores, navegador, TypeScript, lint, build e auditoria de dependências. Uma revisão independente ao final verificará as interações entre as seis frentes.
