# Revisão profissional do Sistema de Manutenção de Remotas

Data: 06/11/2026. Branch analisada: `melhorias/testes-remotas`. Commit de referência: `c20e2f0`.

Esta revisão examina código, regras de negócio, testes e dependências. Não foram alteradas regras do aplicativo nem consultados ou modificados dados do Firebase oficial. As reproduções adicionais ficaram em `.local/reanalise-20261106`, com dependências externas simuladas. Os testes de integração e navegador usaram exclusivamente os projetos demo e emuladores locais.

## Avaliação geral

Os fluxos centrais têm uma base consistente: autorização no servidor, bloqueio transacional de manutenção simultânea, conclusão pelo responsável, separação vinculada à avaliação, confirmação da saída física, cancelamento com justificativa e retorno da garantia com preservação dos vínculos de IMEI.

O próximo investimento deve priorizar integridade dos registros, recuperação do trabalho em andamento, atualização controlada de dependências e preparação para volumes maiores. A suíte atual passa, mas não cobre todas as combinações de negócio que o servidor aceita.

## Evidências de verificação

| Verificação | Resultado nesta revisão |
| --- | --- |
| Testes unitários | 54 aprovados |
| Testes de API, transações e Firebase local | 46 aprovados |
| Testes no navegador | 15 aprovados |
| Compatibilidade de respostas, credenciais e runtime da Vercel | 10 aprovados |
| TypeScript | Aprovado |
| ESLint | Aprovado |
| Build de produção | Aprovado com acesso à rede |
| Auditoria npm, dependências de produção | 13 ocorrências: 5 altas, 8 moderadas, nenhuma crítica |
| Reproduções adicionais | Quatro diagnósticos locais concluídos |

São 125 testes existentes aprovados, além das reproduções adicionais. A primeira execução de navegador foi interrompida após dificuldades de rede com Google Fonts; a execução completa com rede passou. O build sem rede falhou ao baixar a fonte Inter e passou ao permitir o download. Nenhuma captura de imagem, vídeo ou trace foi gerada.

Os números de `npm audit` são ocorrências na árvore de pacotes: dependências e seus pacotes pais podem refletir o mesmo aviso. Eles não equivalem a 13 falhas independentes demonstradas no aplicativo, nem comprovam exploração.

## Achados e prioridades

### 1. Alta — condição e situação podem ficar contraditórias

A validação de retorno de garantia exige coerência entre Nova/Usada e a situação recebida. Essa proteção não se aplica ao cadastro geral nem à conclusão normal da manutenção.

**Reprodução:** `finalizationSchema` aceita situação `Nova`; a operação de conclusão grava a condição `Usada` e mantém a situação `Nova`. O cadastro geral também aceita a combinação Usada/Nova. A reprodução executou a operação real com Firestore simulado.

**Impacto:** o cadastro e os indicadores podem classificar a mesma remota de formas contraditórias.

**Recomendação:** definir uma matriz de combinações e transições permitidas e aplicá-la no servidor, nos formulários, nas importações e nos lotes. A regra de garantia já estabelecida deve ser preservada. Combinações adicionais precisam ser justificadas pela operação.

**Evidências:** [validação](../../lib/validation.ts), [conclusão no servidor](../../lib/server/operations.ts), [formulário](../../components/maintenance-form.tsx).

### 2. Alta — exportações antigas usam dados cadastrais atuais

O atendimento guarda defeitos, serviços, operadoras, técnico e situação final, mas não guarda uma cópia de modelo, ano de fabricação e OCM daquela ocasião. A exportação e parte da consulta buscam esses campos no cadastro atual.

**Reprodução:** o mesmo atendimento de setembro foi exportado duas vezes. Ao mudar somente modelo e OCM do cadastro consultado, a segunda exportação apresentou os dados novos no atendimento antigo.

**Impacto:** uma edição cadastral ou um retorno com o mesmo IMEI pode mudar a descrição de um atendimento passado em um relatório emitido posteriormente.

**Recomendação:** preservar no atendimento os dados cadastrais relevantes na data do procedimento. Para registros antigos sem essa evidência, identificar o dado como cadastral atual, sem preencher o passado por suposição.

**Evidências:** [exportação](../../lib/excel-export.ts), [consulta do histórico](../../app/(dashboard)/historico/page.tsx), [modelo de manutenção](../../lib/types.ts).

### 3. Alta — o preenchimento de manutenção não tem rascunho persistente

Diagnóstico, serviços, checklist e observações ficam no estado do componente até a conclusão. Não há operação de salvamento parcial no serviço. O atendimento aberto e seu bloqueio continuam no banco, mas o texto digitado e ainda não concluído não é preservado ao desmontar o formulário.

**Impacto:** navegação, atualização da página ou perda da sessão podem obrigar o técnico a repetir o preenchimento.

**Recomendação:** permitir salvar rascunho vinculado ao atendimento e ao responsável, com data de salvamento e tratamento de conflitos. Um aviso de alterações pendentes ajuda, mas a persistência deve resolver a perda do trabalho.

**Evidências:** [estado do formulário e gravação na conclusão](../../components/maintenance-form.tsx), [operações disponíveis](../../lib/services.ts).

### 4. Alta — dependências de produção têm alertas pendentes

A auditoria pública do npm sinalizou `xlsx`, a cadeia do Firebase/gRPC e outras dependências transitivas. O pacote `xlsx` declarado é da linha 0.18.5, usada para ler as planilhas enviadas pela equipe. A documentação do mantenedor informa que o pacote no registro npm está desatualizado e que as distribuições atuais são publicadas no CDN oficial.

**Impacto:** há componentes com avisos conhecidos que precisam de triagem e atualização. O uso específico necessário para explorar cada aviso não foi demonstrado nesta revisão; por exemplo, o aviso de gRPC depende de determinadas configurações de servidor.

**Recomendação:** atualizar por grupos pequenos, começando pela biblioteca de planilhas e avaliando a cadeia Firebase/gRPC. Manter os dois lockfiles coerentes e repetir os testes de importação, login, assinatura, transações e build. Não aplicar automaticamente as sugestões de mudança de versão do `npm audit`, que podem envolver downgrade ou mudanças incompatíveis com a correção anterior do Firebase Admin.

**Fontes:** [distribuição oficial do SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [aviso publicado pelos mantenedores do gRPC](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j).

**Evidência local:** [manifesto de dependências](../../package.json). A saída integral do npm foi preservada em `.local/reanalise-20261106-dependencias.json`.

### 5. Média/alta — nomes editáveis controlam etapas essenciais

O sistema identifica Manutenção, Triagem, Nova e situações de garantia por textos e comparações. O administrador consegue renomear ou desativar referências essenciais em Listas.

**Reprodução:** a operação real de desativação, executada com Firestore simulado, aceitou desativar Triagem. O cancelamento de separação exige uma referência Triagem ativa; portanto, essa alteração administrativa pode impedir o procedimento até a referência ser corrigida.

**Recomendação:** proteger referências essenciais e distinguir o identificador do processo do nome exibido. Para listas operacionais livres, tratar duplicidade e renomeação sem perder a identidade dos registros. Isso pode ser feito incrementalmente, preservando o significado de OCM no campo persistido `lote`.

**Evidências:** [validação por nomes](../../lib/validation.ts), [manutenção das referências e cancelamento](../../lib/server/operations.ts), [tela de listas](../../app/(dashboard)/listas/page.tsx).

### 6. Média — um lote pode perder o resumo de sucessos parciais

A divisão por bytes ocorre antes do bloco que trata os erros de cada envio. Uma linha acima do limite pode interromper a função depois de um lote anterior já ter sido confirmado.

**Reprodução:** a primeira linha foi confirmada pela API simulada. A segunda passou na validação do formulário, mas excedeu o limite de bytes. A função lançou erro sem devolver os resultados da primeira linha. Trata-se de um caso de limite com textos/serviços extensos, e não de uma falha observada em todos os lotes usuais.

**Impacto:** a tela pode não limpar a seleção de itens já processados, exigindo conferência manual antes de repetir.

**Recomendação:** verificar o tamanho de todas as linhas antes de iniciar a gravação e preservar o resultado de cada item em qualquer falha. Uma evolução posterior é identificar as execuções e permitir consultar e retomar pendências após perda de conexão.

**Evidências:** [transporte dos lotes](../../lib/services.ts), [resultado e seleção na interface](../../components/bulk-movement-dialog.tsx).

### 7. Média — consultas carregam todo o acervo

O contexto global assina as coleções completas de equipamentos e manutenções. O relatório mensal lê equipamentos e todos os eventos históricos, inclusive ao consultar o mês atual. Uma alteração cadastral dispara nova consulta do relatório. A importação também consulta cada número sequencialmente na validação.

**Impacto:** trabalho de rede, memória e processamento cresce com o acervo e o número de usuários. Não foi realizado ensaio de carga nem medição da conta oficial, portanto não se atribui um tempo ou custo específico a esse comportamento.

**Recomendação:** paginar listas, consultar histórico por período e necessidade, evitar releituras completas e avaliar agregados mensais. A busca por IMEI anterior, os totais globais e a seleção em massa precisam continuar corretos quando houver paginação.

**Evidências:** [assinaturas globais](../../contexts/live-data-context.tsx), [relatório no servidor](../../lib/server/equipment-situation-history.ts), [disparo do relatório](../../app/(dashboard)/dashboard/page.tsx), [importação](../../components/import-equipment-dialog.tsx).

### 8. Média — rastreabilidade operacional ainda pode ser mais acessível

Há eventos mensais e registros de auditoria, mas a consulta de equipamentos mostra principalmente a última alteração de situação, manutenções e o histórico específico da garantia. Falta uma linha do tempo consultável de todas as movimentações administrativas, com autor, data, situação anterior, nova situação e motivo.

O motivo da alteração manual é opcional. O arquivamento administrativo comum registra autor e data, mas não exige uma justificativa como o cancelamento da garantia.

**Recomendação:** apresentar a linha do tempo e tornar justificativas obrigatórias nas ações que exigem prestação de contas, preservando os perfis de acesso. Revisar quais justificativas são necessárias com base no impacto da movimentação.

**Evidências:** [detalhes de equipamentos](../../app/(dashboard)/equipamentos/page.tsx), [registros de auditoria e alterações](../../lib/server/operations.ts), [eventos de situação](../../lib/server/equipment-situation-history.ts).

## Decisões de negócio para a próxima evolução

Estes pontos são propostas de evolução; não devem ser tratados como erros sem definir a política da operação:

- **Critérios para declarar Recuperada:** hoje a validação aceita Recuperada com itens em Falha ou Não testado. Definir quais verificações são indispensáveis e quais exceções podem ser justificadas.
- **Transferência de atendimento:** um técnico indisponível pode deixar uma manutenção sob sua responsabilidade. A finalização forçada existe, mas não substitui uma transferência formal de responsabilidade quando outro técnico vai continuar o trabalho.
- **Localização e destino:** se houver movimentações físicas para polos ou estoque, diferenciar disponibilidade de entrega e registrar destino, responsável e data, conforme a operação precisar.
- **Prazos e indicadores:** acompanhar tempo em manutenção, tempo separado aguardando saída, tempo na garantia, reincidência e recuperação. Distinguir conclusão técnica de encerramento administrativo nas métricas apropriadas.
- **Correção de arquivamento:** avaliar desarquivamento justificado de um cadastro arquivado por engano, mantendo protegidos os cadastros antigos substituídos por outro IMEI.
- **Meses anteriores à implantação:** as manutenções antigas não reconstroem automaticamente o relatório mensal. Uma eventual migração deve aproveitar evidências existentes e manter explícitos os períodos sem informação suficiente.

## Manutenção do projeto

O README ainda descreve autenticação com bcrypt no cliente, sessão manual em localStorage e ausência de backend próprio. Isso diverge da implementação atual, que usa rotas de API, Firebase Authentication e verificação no servidor. Também descreve testes e migração de autenticação como trabalhos futuros que já foram executados em parte.

Não foi encontrada configuração de CI versionada em `.github` nesta revisão. Recomenda-se automatizar as verificações existentes na revisão de código, documentar os ambientes e a rotina de publicação, e definir backup/restauração e recuperação operacional para a instalação oficial. A ausência de um arquivo no repositório não demonstra ausência de configuração feita diretamente em serviços externos; esses serviços não foram auditados.

O código concentra muitas operações em um único arquivo e mantém tipos de persistência, validações e regras de transição em locais diferentes. Uma separação gradual por domínio — equipamentos, manutenção, garantia, usuários e relatórios — facilita revisar e testar as regras sem exigir reescrita do aplicativo.

## Ordem recomendada

1. **Integridade e dependências:** corrigir combinações contraditórias, preservar os dados históricos dos atendimentos, proteger situações essenciais e planejar a atualização das bibliotecas com alertas.
2. **Trabalho diário:** adicionar rascunho, completar a trilha de movimentações e fortalecer a confirmação/retomada dos lotes.
3. **Escala e gestão:** paginar consultas, otimizar agregações, introduzir indicadores e tratar transferência de responsabilidade e destinos físicos conforme a política definida.

As mudanças podem ser feitas por entregas pequenas na branch de testes. Cada correção de uma inconsistência demonstrada deve receber um caso de teste específico antes da alteração, mantendo os fluxos de garantia e os dados legados compatíveis.
