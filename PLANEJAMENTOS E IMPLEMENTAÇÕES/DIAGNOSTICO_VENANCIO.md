# DIAGNÓSTICO VENÂNCIO AGENTES DE IA
Data: 2026-07-30

**Nota metodológica:** já existia uma auditoria de integração anterior (`AUDITORIA_INTEGRACAO.md`, 2026-07-27), com Fase 3 (implementação) parcialmente executada no mesmo dia — vários itens críticos daquela auditoria (autenticação de webhook, chave da Evolution API em texto plano, ferramenta "Criar Orçamento" desconectada) já foram corrigidos. Este diagnóstico é uma auditoria **nova e independente**, focada especificamente na consistência da criação autônoma de pedidos, reverificando o estado atual do código (que mudou desde 27/07 — `AGENTE_VENDAS.json` foi editado hoje, 30/07) e cobrindo camadas que a auditoria anterior não aprofundou (schema SQL função a função, state machine linha a linha, grafo completo dos workflows n8n).

**Correção de escopo em relação ao pedido original:** a pasta `venancio-ai-ops/WorkflowsN8n/` **não é produção** — é um protótipo inativo (`"active": false`) desde 23/07, não tocado desde então. A produção real e ativamente editada é `chatbot/AGENTES N8N/` (`AGENTE_VENDAS.json`, `AGENTE_ORÇAMENTO.JSON`, `Orçamento (Sub-workflow).json`). Este diagnóstico analisa a pasta de produção real; a outra foi apenas confirmada como inativa/inofensiva no estado atual.

---

## RESUMO EXECUTIVO

O sistema tem uma arquitetura de dados bem desenhada no papel — funções RPC atômicas (`aceitar_orcamento`, `atualizar_status_orcamento`), state machine pura sem I/O, guardas de idempotência por `mensagemId` — mas duas rupturas concretas quebram essa garantia na prática, e as duas apontam para o mesmo padrão: **execuções concorrentes e não canceláveis escrevendo no mesmo registro sem lock**.

A primeira ruptura já está documentada no próprio código como incidente real de hoje (2026-07-30): o timeout de 12s da chamada síncrona ao Agente de Vendas aborta o lado do bot, mas **não cancela a execução no n8n** — que continua rodando e pode gravar no banco depois que o bot já desistiu e acionou a rede de segurança (pausa do bot + aviso ao cliente). Um comentário em `n8nClient.js:93-99`, escrito pelo próprio time nesta mesma data, relata exatamente "respostas duplicadas pro cliente e falha ao gravar o pedido num teste real (30/07/2026)".

A segunda ruptura é arquitetural, no lado do n8n: o sub-workflow `Orçamento (Sub-workflow).json`, raia "Fechar", **reimplementa manualmente** a lógica que deveria vir da RPC `aceitar_orcamento()` — 5 operações Supabase sequenciais (marcar orçamento aceito → criar pedido → buscar itens → copiar itens → gravar histórico) sem transação nem compensação. Isso viola diretamente o contrato do PRD (seção 6: "atualização de status do orçamento... nunca por UPDATE direto na tabela") e reabre exatamente o tipo de falha que a função SQL atômica foi desenhada para prevenir: se o passo 2 falhar depois do passo 1 ter sucesso, o orçamento fica marcado `aceito` sem pedido correspondente.

Nenhuma das duas rupturas é um bug isolado de uma linha — são consequências de uma mesma lacuna estrutural: não existe, em nenhuma camada (bot, banco, n8n), um mecanismo de lock por `conversa_id`/`orcamento_id` que impeça duas execuções concorrentes (retry, timeout-com-execução-órfã, ou mensagem duplicada do cliente) de escrever no mesmo pedido ao mesmo tempo. A dedupe existente (por `mensagemId` no bot) cobre só o caso mais simples — reenvio idêntico do mesmo webhook — e não cobre nenhum dos dois cenários acima.

---

## CAUSA RAIZ DA INCONSISTÊNCIA NA CRIAÇÃO DE PEDIDOS

**Causa raiz nº 1 — ausência de lock/cancelamento entre bot e n8n no Canal Síncrono (Agente de Vendas).**
`n8nClient.consultarAgenteVendas` usa `AbortController` com timeout de 12s (`AGENTE_VENDAS_TIMEOUT_MS`, `.env.example`), mas abortar o `fetch` só desiste do lado do bot — a execução do workflow no n8n continua até o fim, incluindo qualquer escrita em `orcamentos`/`itens_orcamento` feita pelas tool calls do agente. Quando o timeout dispara, o bot já aciona a rede de segurança (mensagem de fallback + `pausarBot` + notificação humana) **enquanto a execução órfã do n8n ainda pode estar em andamento**, gravando dados numa conversa que o bot já considera pausada/escalada. Evidência de primeira mão, no próprio código: `chatbot/papelaria-bot/src/integracoes/n8nClient.js:93-99`.

**Causa raiz nº 2 — bypass da RPC atômica no sub-workflow n8n "Fechar Orçamento".**
Em vez de chamar `aceitar_orcamento()` (que roda como uma única transação PL/pgSQL, `squemanovo.sql:381-405`), o sub-workflow `chatbot/AGENTES N8N/Orçamento (Sub-workflow).json` reimplementa a mesma sequência com 5 nós Supabase separados, sem transação, sem rollback. Combinado com a causa nº 1 (execuções concorrentes possíveis), isso multiplica as janelas em que um pedido pode ficar parcialmente criado — orçamento `aceito` sem pedido, ou pedido sem itens.

**Causa raiz nº 3 (agravante, menor) — dupla fonte de verdade para a regra de transição `rascunho → aceito` no schema SQL.**
`squemanovo.sql` e `extensao_cadastro_fiscal.sql` definem `atualizar_status_orcamento` com `CREATE OR REPLACE FUNCTION` e corpos diferentes; só a última execução vale. Isso já causou um incidente idêntico documentado em 20/07 (orçamento preso em `rascunho` porque a transição para `aceito` foi rejeitada) e permanece um risco de regressão silenciosa se `squemanovo.sql` for reaplicado por engano depois da extensão.

As causas 1 e 2 são as que mais provavelmente explicam a "inconsistência grave" reportada — ambas produzem exatamente o sintoma esperado (pedidos que às vezes não são criados, ou são criados de forma incompleta/duplicada) e uma delas tem confirmação direta em comentário de código datado de hoje.

---

## PROBLEMAS CRÍTICOS (bloqueiam ou corrompem a criação de pedidos)

### C1 — Timeout do Agente de Vendas não cancela a execução no n8n; execução órfã escreve no banco depois da rede de segurança já ter agido
- **Descrição:** `AbortController` aborta o `fetch` do lado do bot ao estourar `AGENTE_VENDAS_TIMEOUT_MS` (12s), mas o workflow n8n não recebe nenhum sinal de cancelamento e continua executando (incluindo tool calls que escrevem em `orcamentos`/`itens_orcamento`).
- **Localização:** `chatbot/papelaria-bot/src/integracoes/n8nClient.js:64-118` (função `consultarAgenteVendas`), comentário explícito em `n8nClient.js:93-99`.
- **Impacto:** o bot já pausou a conversa e notificou um humano, mas a IA de vendas pode gravar um item de orçamento ou até fechar um pedido momentos depois, concorrendo com quem assumiu a conversa. Documentado como causa de "respostas duplicadas pro cliente e falha ao gravar o pedido" em teste real de produção.
- **Evidência:** `n8nClient.js:93-99` — comentário do próprio time, datado 30/07/2026, relatando o incidente.

### C2 — Sub-workflow n8n "Fechar Orçamento" reimplementa `aceitar_orcamento()` manualmente, sem atomicidade nem rollback
- **Descrição:** 5 operações Supabase sequenciais (marcar aceito → criar pedido → buscar itens → copiar item por item → gravar histórico) substituem a chamada à RPC atômica. Nenhuma chamada real a `aceitar_orcamento()`/`atualizar_status_orcamento()` existe nos 3 arquivos de produção — só menções em comentário.
- **Localização:** `chatbot/AGENTES N8N/Orçamento (Sub-workflow).json`, raia "Fechar" (nós `Supabase · Marca Orçamento Aceito`, `Supabase · Cria Pedido`, `Supabase · Busca Itens do Orçamento`, `Supabase · Copia Item pro Pedido`, `Supabase · Grava Histórico Pedido`).
- **Impacto:** viola o contrato do PRD (seção 6) de que toda mudança de status passa pelas funções RPC. Se qualquer etapa falhar após a anterior ter sido commitada, o orçamento fica em estado inconsistente (ex.: `aceito` sem pedido) sem nenhuma lógica de compensação.
- **Evidência:** ausência confirmada de qualquer chamada RPC/`rpc/` nos 3 JSONs de `chatbot/AGENTES N8N/`; presença das 5 operações separadas na raia "Fechar".

### C3 — `aceitar_orcamento()` (SQL) pode commitar pedido com zero itens
- **Descrição:** `INSERT INTO itens_pedido ... SELECT ... FROM itens_orcamento WHERE orcamento_id = ...` não gera erro se a subquery retornar 0 linhas. Não há checagem de contagem antes de aceitar.
- **Localização:** `chatbot/papelaria-bot/supabase/squemanovo.sql:381-405` (função `aceitar_orcamento`), especificamente linhas 395-398.
- **Impacto:** um orçamento sem itens (possível via C4 abaixo, ou via chamada direta) vira pedido `confirmado` sem nada para separar — e `recalcular_valor_pedido` (`extensao_dashboard.sql:189-206`) recalcula `valor_total = 0` sem erro, mascarando o problema no dashboard.
- **Evidência:** `squemanovo.sql:395-398`.

### C4 — Duas definições divergentes de `atualizar_status_orcamento`, com `CREATE OR REPLACE` silencioso
- **Descrição:** `squemanovo.sql:343-377` proíbe `rascunho → aceito`; `extensao_cadastro_fiscal.sql:63-97` permite. Como é `CREATE OR REPLACE FUNCTION` com assinatura idêntica, só a última execução vale — sem aviso, sem versionamento de schema.
- **Localização:** `squemanovo.sql:360-364` vs. `extensao_cadastro_fiscal.sql:80-84`.
- **Impacto:** já causou o incidente documentado de 20/07 (orçamento preso em `rascunho`, todo fechamento pelo JS Bot falhando com "Transição de orçamento inválida: rascunho -> aceito"). O PRD (seção 3) descreve os dois scripts como "idempotentes, seguro rodar de novo" sem alertar sobre ordem — reaplicar `squemanovo.sql` depois da extensão reintroduz o bug silenciosamente.
- **Evidência:** comentário-relato em `extensao_cadastro_fiscal.sql:52-62`; CASE divergente citado acima.

---

## PROBLEMAS ALTOS (causam inconsistência mas não bloqueiam completamente)

### A1 — Sem lock por `conversa_id` durante a sequência de finalização do pedido no JS Bot
- **Descrição:** o único lock em memória (`mensagensEmProcessamento`) cobre reenvio do mesmo `mensagemId`, não mensagens diferentes da mesma conversa. `finalizarCadastroEPedido` (2 inserts + 1 RPC + até 3 chamadas de rede sequenciais) só persiste o novo `estado_atual` depois de terminar. Uma segunda mensagem real do cliente nesse intervalo é processada contra o estado antigo.
- **Localização:** `chatbot/papelaria-bot/src/webhook/webhookController.js:485-517`, `src/botEngine/actions.js:99-165`.
- **Impacto:** pode reexecutar `FINALIZAR_CADASTRO_E_PEDIDO` uma segunda vez, duplicando orçamento/pedido. Não coberto pelo critério de aceitação do PRD sobre idempotência (que só cobre reenvio do *mesmo* webhook).

### A2 — Timeout de 12s do Agente de Vendas é admitido pelo próprio time como "chute" e já demonstrou ser insuficiente
- **Descrição:** `AGENTE_VENDAS_TIMEOUT_MS=12000` não foi calibrado com medição real; comentário em `env.js:56-58` confirma isso.
- **Localização:** `.env.example:46`, `chatbot/papelaria-bot/src/config/env.js:56-59`.
- **Impacto:** alimenta diretamente a causa raiz C1 — quanto mais frequente o timeout, mais frequentes as execuções órfãs no n8n.

### A3 — Raia "Fechar Orçamento" do sub-workflow não valida posse (`conversa_id`), ao contrário da raia "Adicionar Item"
- **Descrição:** a raia "Adicionar Item ao Orçamento" tem o check `Pertence a Esta Conversa?`; a raia "Fechar" valida UUID + existência + status `rascunho` + tem item, mas **não** compara `conversa_id`.
- **Localização:** `chatbot/AGENTES N8N/Orçamento (Sub-workflow).json`, raia "Fechar" (comparar com raia "Adicionar Item", que tem o check).
- **Impacto:** como `orcamento_id` em "Fechar Orçamento" também vem de `$fromAI()`, um `orcamento_id` válido de **outra conversa** poderia ser fechado, gerando pedido vinculado ao cliente errado.

### A4 — Webhooks de produção n8n com `authentication: headerAuth` declarado mas `credentials.id` vazio
- **Descrição:** ambos os webhooks (`Webhook · Agente Vendas`, `Webhook · Status Atualizado`) têm a intenção de autenticação implementada, mas a credencial real não está vinculada no export — passo manual pendente no n8n.
- **Localização:** `chatbot/AGENTES N8N/AGENTE_VENDAS.json` e `AGENTE_ORÇAMENTO.JSON`, blocos `credentials.httpHeaderAuth`.
- **Impacto:** até essa credencial ser criada e vinculada manualmente no n8n, os webhooks de produção continuam efetivamente sem autenticação real.

### A5 — `N8N_VENDAS_WEBHOOK_URL`/`TOKEN` não são obrigatórios no boot do bot; ausência causa fallback total silencioso
- **Descrição:** nenhuma das duas variáveis está em `VARIAVEIS_OBRIGATORIAS`. Sem elas, toda interação em `AGENTE_VENDAS_ATIVO` cai na rede de segurança (IA de vendas desligada de fato), só visível em log.
- **Localização:** `chatbot/papelaria-bot/src/config/env.js:7-18,50-54`.
- **Impacto:** risco de a IA de vendas rodar "morta" em produção sem nenhum alarme ativo além de log.

### A6 — `notificarAgenteOrcamento` sem timeout, bloqueia a resposta ao webhook indefinidamente se o n8n travar
- **Descrição:** ao contrário de `consultarAgenteVendas`, esta chamada não tem `AbortController`/timeout algum.
- **Localização:** `chatbot/papelaria-bot/src/integracoes/n8nClient.js:16-41`.
- **Impacto:** se o endpoint do n8n nunca responder, a resposta ao webhook da Evolution API fica pendurada sem teto de tempo, arriscando timeout do lado da Evolution API e reenvio do mesmo webhook.

### A7 — Comentário em `actions.js` descreve ordem de mensagens que não corresponde ao código atual
- **Descrição:** o comentário assume que "Perfeito! Já estou confirmando..." já foi enviado ao cliente antes de `finalizarCadastroEPedido` rodar — falso. No caminho de falha, o cliente recebe "tivemos um problema técnico" e **depois** uma mensagem de confirmação contraditória.
- **Localização:** `chatbot/papelaria-bot/src/botEngine/actions.js:99-103` (comentário) vs. `webhookController.js:486,513-517` (ordem real).
- **Impacto:** experiência confusa pro cliente no caminho de erro; também indica que o pressuposto de ordenação do código pode estar desatualizado em relação a outras partes que dependem dele.

---

## PROBLEMAS MÉDIOS (degradam qualidade mas sistema funciona)

| # | Descrição | Localização | Impacto |
|---|---|---|---|
| M1 | `cotacaoEmpresa.js` não valida lista de itens vazia/whitespace (diferente de `listaEscolar.js`, que valida) | `chatbot/papelaria-bot/src/botEngine/states/cotacaoEmpresa.js:22-28` | Permite orçamento/pedido criado com 0 itens por esse fluxo específico |
| M2 | `orcamentosService.criarOrcamentoComItens` faz 2 inserts Supabase separados sem transação | `chatbot/papelaria-bot/src/services/orcamentosService.js:48-77` | Falha no segundo insert deixa orçamento órfão sem itens |
| M3 | Lock em memória descarta silenciosamente mensagens concorrentes durante consulta ao Agente de Vendas (sem fila/reprocessamento) | `chatbot/papelaria-bot/src/webhook/webhookController.js:165-170` | Mensagem legítima do cliente ("oi" + "quero 2 cadernos" em sequência rápida) pode simplesmente desaparecer |
| M4 | Sem job/trigger de expiração automática para orçamentos presos em `rascunho`/`enviado` | ausência confirmada no schema; comparar com `expirar_consultas_operacionais()` (`extensao_dashboard.sql:871-876`) | Falhas de transição futuras (regressão de C4) não geram alarme automático |
| M5 | Regra "1 orçamento/pedido ativo por cliente" só em nível de aplicação, sem constraint de banco | `squemanovo.sql:446-448` | Sob concorrência (webhooks quase simultâneos), nada impede 2 orçamentos `rascunho` simultâneos para o mesmo cliente |
| M6 | 5 endpoints n8n disparados pelo dashboard (navegador) sem workflow real correspondente (`/novo-pedido`, `/orcamento-criado`, `/orcamento-aprovado`, `/orcamento-recusado`, `/orcamento-convertido`) | `venancio-ai-ops/src/services/pedidos.service.js:211-237`, `orcamentos.service.js:146-158` | Notificações correspondentes nunca saem de verdade; falha engolida silenciosamente |
| M7 | Sticky note do node "Criar Orçamento" diz que `workflowId.value` foi deixado vazio de propósito, mas o JSON real já tem o ID preenchido | `chatbot/AGENTES N8N/AGENTE_VENDAS.json` | Documentação desalinhada com o estado real; risco de confusão em reimportações futuras |
| M8 | Node "Resposta Válida?" no Agente de Vendas não tem branch de erro (diferente de "Payload Válido?") | `chatbot/AGENTES N8N/AGENTE_VENDAS.json` | Se `output` do agente vier vazio, execução não conecta a nada — JS Bot espera até estourar timeout, sem fallback explícito do lado n8n |

---

## GAPS DE IMPLEMENTAÇÃO (PRD definido mas não codificado)

| Item do PRD | Implementado? | Observação |
|---|---|---|
| Passo 0: checagem silenciosa `cliente_tem_cadastro_completo()` | ✅ Sim | `webhookController.js:451-453`, injetado como parâmetro na state machine pura, conforme decisão de design da seção 5 |
| Passo 1: atalho "já tem cadastro?" | ✅ Sim | `cadastroFiscal.js:67-101` |
| Atalho "sim" pula pra CPF/CNPJ | ✅ Sim | testado em `stateMachine.test.js:256-268` |
| Passo 2 PF: CPF | ✅ Sim | `cadastroFiscal.js:103-192` |
| Passo 2 PJ: CNPJ+Razão+Fantasia+IE | ✅ Sim | idem, testado 276-360 |
| IE=contribuinte obriga Inscrição Estadual | ✅ Sim | `cadastroFiscal.js:200-211`, testado 337-379 |
| Agrupamento de mensagens em blocos | ✅ Sim | consistente com o padrão de `cotacaoEmpresa.js` |
| Pergunta de entrega / CEP / endereço | ✅ Implementado (sem o refinamento "só se entrega" mencionado como risco aberto no PRD seção 9) | `cadastroFiscal.js` |
| `aceitar_orcamento()` chamado ao final | ✅ Sim, mas ver C1-C4 | `actions.js:147-148` |
| Agente de Vendas sem tag `[INTENT:...]` | ✅ Sim | confirmado no system prompt do workflow: "Não existe mais classificação de intenção por tags" |
| Agente de Orçamento processa payload e grava itens | ⚠️ Parcial / nome enganoso | Quem de fato grava itens/orçamento é o sub-workflow `Orçamento (Sub-workflow).json`, chamado pelo próprio `AGENTE_VENDAS.json`. O arquivo literalmente chamado `AGENTE_ORÇAMENTO.JSON` na verdade só notifica status por WhatsApp — não corresponde ao "Agente de Orçamento" descrito no PRD seção 7 |
| Comando global `atendente`/`reclamação` | ✅ Sim, e testado | `comandosGlobais.js`, `stateMachine.js:110-115`, `webhookController.js:471-473`, teste 575-595. PRD seção 5 está desatualizado ao listar isso como pendente |
| Idempotência: mesmo webhook não duplica orçamento | ⚠️ Parcial | Cobre reenvio do *mesmo* `mensagemId` (`webhookController.js:296-311`), mas não cobre a race de mensagens diferentes durante a finalização (achado A1) nem a execução órfã do n8n pós-timeout (achado C1) |

---

## DÍVIDAS TÉCNICAS (código existe mas precisa ser refatorado)

- **`atualizar_status_orcamento`/`atualizar_status_pedido` duplicados em dois arquivos SQL** com `CREATE OR REPLACE` — deveria haver um único arquivo de verdade por função, com as extensões apenas *adicionando* funções novas, nunca redefinindo as mesmas com lógica diferente sem uma migration explícita de versão.
- **Sub-workflow "Fechar Orçamento"** deveria chamar a RPC `aceitar_orcamento()` via HTTP `/rest/v1/rpc/aceitar_orcamento` (ou node Postgres direto executando `select aceitar_orcamento(...)`) em vez de reimplementar a lógica manualmente — isso já existe como padrão funcionando (a própria função SQL), só não está sendo reaproveitado do lado n8n.
- **19 endpoints n8n "preparados" em `constants.js`** (`N8N_WEBHOOKS`, `_SPRINT2`, `_SPRINT3`) sem workflow correspondente, dos quais 14 nunca são sequer chamados — candidatos a limpeza ou a uma decisão explícita de backlog.
- **Timeout do Agente de Vendas** precisa de medição real de produção (não um valor-chute) antes de qualquer ajuste — junto com um mecanismo real de cancelamento de execução no n8n (ex.: o workflow verificar um "ainda vale a pena responder?" antes de escrever, ou o bot enviar um sinal explícito de cancelamento).

---

## PLANO DE CORREÇÃO PRIORIZADO

### Correção 1 — Lock por `conversa_id`/`orcamento_id` cobrindo toda a janela de finalização
- **Arquivos afetados:** `chatbot/papelaria-bot/src/webhook/webhookController.js`, `src/botEngine/actions.js`
- **Descrição da mudança:** estender o lock em memória existente (hoje só por `mensagemId`) para cobrir `conversaId` durante toda a execução de `finalizarCadastroEPedido` e de `consultarAgenteVendasComRedeDeSeguranca`; mensagens que chegarem nesse intervalo devem ser enfileiradas (não descartadas) e reprocessadas ao final, não perdidas nem processadas contra estado obsoleto.
- **Risco de regressão:** Médio — precisa não travar conversas legítimas nem introduzir deadlock; recomendável cobrir com testes de concorrência.
- **Estimativa de complexidade:** Média

### Correção 2 — Sub-workflow "Fechar Orçamento" passa a chamar a RPC `aceitar_orcamento()` em vez de reimplementar a lógica
- **Arquivos afetados:** `chatbot/AGENTES N8N/Orçamento (Sub-workflow).json`
- **Descrição da mudança:** substituir os 5 nós Supabase da raia "Fechar" por uma única chamada RPC (`select aceitar_orcamento(orcamento_id, 'agente_vendas')`), preservando as guardas de validação (UUID, existe, `rascunho`, tem item, **e adicionar o check de posse por `conversa_id`** que falta hoje — achado A3).
- **Risco de regressão:** Baixo — a função SQL já é usada com sucesso pelo caminho JS Bot; é substituir lógica duplicada por lógica já testada.
- **Estimativa de complexidade:** Baixa-Média

### Correção 3 — Mecanismo de cancelamento/checagem de validade antes de escrever, no Agente de Vendas
- **Arquivos afetados:** `chatbot/AGENTES N8N/AGENTE_VENDAS.json`, possivelmente `n8nClient.js` (para propagar um identificador de tentativa/timestamp que o workflow possa checar)
- **Descrição da mudança:** antes de qualquer tool call que escreva no banco, o workflow deveria confirmar que a execução ainda é "a mais recente" para aquela conversa (ex.: comparar um timestamp/nonce gravado no início da chamada) — ou, no mínimo, aumentar o timeout com base em medição real (achado A2) para reduzir a frequência do problema enquanto uma solução definitiva não é implementada.
- **Risco de regressão:** Médio-Alto — mexe no core do agente de IA; testar exaustivamente antes de produção.
- **Estimativa de complexidade:** Alta

### Correção 4 — Consolidar `atualizar_status_orcamento`/`atualizar_status_pedido` numa única fonte de verdade
- **Arquivos afetados:** `chatbot/papelaria-bot/supabase/squemanovo.sql`, `extensao_cadastro_fiscal.sql`, `extensao_dashboard.sql`
- **Descrição da mudança:** mover a versão correta (a que permite `rascunho → aceito`) para o arquivo "principal" e remover a definição divergente do arquivo antigo, ou documentar explicitamente no topo de `squemanovo.sql` que essa função foi substituída e apontar para onde está a versão vigente.
- **Risco de regressão:** Baixo — é reorganização de arquivo-fonte, sem mudança de comportamento pretendida (a versão vigente já está em produção).
- **Estimativa de complexidade:** Baixa

### Correção 5 — Checagem de contagem de itens antes de aceitar orçamento
- **Arquivos afetados:** `chatbot/papelaria-bot/supabase/squemanovo.sql` (função `aceitar_orcamento`)
- **Descrição da mudança:** adicionar `IF NOT EXISTS (SELECT 1 FROM itens_orcamento WHERE orcamento_id = p_orcamento_id) THEN RAISE EXCEPTION ...` antes de criar o pedido.
- **Risco de regressão:** Baixo, mas cobrir com teste de `cotacaoEmpresa.js` (achado M1) para não quebrar um fluxo que hoje "funciona" (mesmo que incorretamente) com 0 itens.
- **Estimativa de complexidade:** Baixa

### Correção 6 — Vincular credenciais reais de Header Auth nos dois webhooks de produção
- **Arquivos afetados:** configuração manual no n8n (não é mudança de arquivo no repo)
- **Descrição da mudança:** criar as 2 credentials "Header Auth" no n8n e vinculá-las aos webhooks `Webhook · Agente Vendas` e `Webhook · Status Atualizado`, preenchendo `N8N_VENDAS_WEBHOOK_TOKEN` e o equivalente do dashboard com os mesmos valores.
- **Risco de regressão:** Baixo
- **Estimativa de complexidade:** Baixa (ação manual do dono)

### Correção 7 — Validação de itens vazios em `cotacaoEmpresa.js`
- **Arquivos afetados:** `chatbot/papelaria-bot/src/botEngine/states/cotacaoEmpresa.js`
- **Descrição da mudança:** replicar a validação já existente em `listaEscolar.js:165-173`.
- **Risco de regressão:** Baixo
- **Estimativa de complexidade:** Baixa

---

## PERGUNTAS ABERTAS

1. O timeout de 12s do Agente de Vendas — existe alguma medição real de quanto tempo o workflow leva hoje (p50/p95), considerando as tool calls de LLM? Sem esse dado, qualquer novo valor escolhido continua sendo um chute.
2. A infraestrutura n8n atual (Cloudfy, mencionada em comentário como derrubando conexão ocasionalmente) é a infraestrutura definitiva, ou há plano de migração? Isso afeta se vale a pena investir em cancelamento de execução (Correção 3) ou se o problema de fundo é a instabilidade da infra.
3. Confirma-se que `chatbot/AGENTES N8N/` continua sendo a pasta de produção ativa (ela foi editada hoje) — há algum trabalho em andamento nela que este diagnóstico deveria esperar terminar antes de propor mudanças?
4. Os 19 endpoints n8n "preparados" em `constants.js` sem workflow real (achado M6 e itens relacionados) — mantém como backlog documentado ou remove o código morto?
5. Vale abrir uma frente específica de teste de carga/concorrência (2 mensagens quase simultâneas da mesma conversa) antes de liberar a Correção 1, já que é a mudança de maior risco de regressão deste plano?

---

## O QUE NÃO TOCAR (funciona e não deve ser alterado)

- **Pureza da `stateMachine.js`** — confirmado sem I/O, decisão de design do PRD respeitada (`webhookController.js` resolve `cadastroCompleto` e injeta como parâmetro).
- **Handoff bot ↔ operador via `conversas.bot_ativo`** — sincronizado corretamente nos dois lados (bot e dashboard).
- **Dedupe por `mensagemId`** — cobre corretamente o caso de reenvio idêntico do mesmo webhook da Evolution API.
- **Fluxo "outra escola" (`listaEscolar.js`)** — transição completa e testada, sem etapa faltando.
- **Atalho de cliente com cadastro completo** (`cotacaoEmpresa.js:50-57`, `listaEscolar.js:234-241`) — implementado corretamente nos dois pontos de entrada.
- **Comando global `atendente`/`reclamação`** — implementado, testado, funciona em qualquer estado.
- **Guardas de UUID/posse/status na raia "Adicionar Item ao Orçamento"** do sub-workflow n8n — bom padrão, inclusive deveria inspirar a Correção 2 (replicar na raia "Fechar").
- **`verifyOperador.js`** — autenticação real via Supabase Auth + checagem de operador ativo, correto e isolado.
- **Índices parciais em `orcamentos`/`pedidos` por `cliente_id`** — bem desenhados, casam com os padrões de consulta reais (`orcamento_ativo_cliente`/`pedido_ativo_cliente`).
- **Remoção da tag `[INTENT:...]` e da chamada direta à Evolution API no Agente de Vendas** — confirmado migrado corretamente para o contrato `{resposta, encerrar_atendimento_ia}`.
