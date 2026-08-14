# Auditoria de Integração — Bot (papelaria-bot) × Dashboard (venancio-ai-ops) × n8n

Data: 2026-07-27
Escopo: Fase 1 (somente leitura). Nenhum arquivo de código foi alterado na produção deste relatório.
Método: 4 auditorias paralelas (bot, dashboard, workflows n8n, schema SQL consolidado) + verificação direta de 2 pontos em aberto (Supabase Auth do dashboard, uso real de `PEDIDO_STATUS_NOTIFICAVEIS`).

**Fase 3 (implementação) — status, 2026-07-27:**
- ✅ **Item 1 resolvido** — ciclo operador → WhatsApp real fechado. Nova rota `POST /operador/mensagens/enviar` no JS Bot (`chatbot/papelaria-bot/src/dashboard/operadorController.js`, `src/middlewares/verifyOperador.js`), reaproveitando `evolutionApi.js` (retry + dedup de eco) em vez de duplicar essa lógica. Autenticação por sessão real do operador (Supabase Auth JWT), guarda de `bot_ativo=false` antes de enviar. `venancio-ai-ops/src/services/atendimento.service.js` (`enviarMensagem`) chama essa rota em vez de só gravar em `mensagens`. Novo env var `VITE_BOT_API_URL` (dashboard) e `DASHBOARD_ORIGIN` (bot). 95/95 testes do bot continuam passando.
- ✅ **Item 2 resolvido** — node "Criar Orçamento" conectado em `chatbot/AGENTES N8N/AGENTE_VENDAS.json` (ver consolidação abaixo).
- ✅ **Item 3 resolvido (crítico)** — chave da Evolution API não aparece mais em texto plano em `chatbot/AGENTES N8N/AGENTE_ORÇAMENTO.JSON`. O node "HTTP Request · Envia WhatsApp" agora é o node nativo `evolutionApi` com credential por ID (reaproveitando `evolution_cloudfy`, já configurada no mesmo n8n). **Ação manual pendente do dono**: a chave `ha7oyM5in4JQ6jloYmT1qV5Y289Wskf5` foi exposta neste arquivo até agora — **rotacionar essa chave na Evolution API**, já que ela pode ter sido vista/copiada antes desta correção.
- ✅ **Item 4 resolvido** — os dois webhooks n8n de produção ("Webhook · Agente Vendas" em `AGENTE_VENDAS.json`, "Webhook · Status Atualizado" em `AGENTE_ORÇAMENTO.JSON`) agora exigem Header Auth. Bot (`n8nClient.js`, env `N8N_VENDAS_WEBHOOK_TOKEN`) e dashboard (`pedidos.service.js`, env `VITE_N8N_STATUS_WEBHOOK_TOKEN`) enviam o header correspondente. **Aviso**: o token do lado dashboard é enviado pelo navegador, então fica visível no bundle (variável `VITE_*` é pública) — barra flood/scan automatizado, não é segredo forte; o token do lado bot (servidor-a-servidor) sim é confidencial de verdade. **Ação manual pendente do dono**: criar as 2 credentials "Header Auth" no n8n (uma pra cada webhook, com segredos diferentes) e preencher os 2 novos env vars com os mesmos valores.
- ✅ **Item 5 resolvido (alto)** — guardas de UUID, posse (conversa_id) e status 'rascunho' pra "Adicionar Item ao Orçamento" (ver consolidação abaixo). Mais importante: **valor_unitario deixou de vir de `$fromAI()`** — o preço real é buscado em `produtos.preco` pelo produto_id, então a IA não tem mais controle nenhum sobre o valor gravado.
- ✅ **Consolidação de workflows (27/07/2026, a pedido do dono — plano de n8n limita a poucos workflows)**: os 3 sub-workflows de orçamento (Criar/Buscar, Adicionar Item, Fechar) foram unificados num único arquivo, `chatbot/AGENTES N8N/Orçamento (Sub-workflow).json`, roteado por um campo `acao` (`buscar_ou_criar` | `adicionar_item` | `fechar`) — mesma lógica/guardas de cada raia, zero mudança de comportamento, só reorganizada. Os 3 arquivos separados antigos foram removidos do repo. `AGENTE_VENDAS.json` agora tem exatamente 3 workflows no total na pasta (`AGENTE_VENDAS.json`, `AGENTE_ORÇAMENTO.JSON`, `Orçamento (Sub-workflow).json`). **Ação manual pendente do dono**: (1) importar `Orçamento (Sub-workflow).json`; (2) apontar as 3 ferramentas ("Criar Orçamento", "Adicionar Item ao Orçamento", "Fechar Orçamento") pra ele no campo "Source"; (3) testar um fluxo de venda completo; (4) só depois, se o workflow antigo "Fechar Orçamento (Sub-workflow)" ainda estiver ativo no seu n8n (era o único dos 3 já importado antes desta sessão), pode excluí-lo pra liberar o slot.
- ✅ **Item 9 resolvido** — rate limit (`express-rate-limit`, 300 req/min por IP) adicionado nas rotas `/webhook` e `/webhook/agente-orcamento` do JS Bot (`src/middlewares/rateLimiter.js`). De brinde: `npm audit fix` resolveu uma vulnerabilidade alta transitiva (`brace-expansion`, via `nodemon`) que já existia antes desta sessão.
- 🔎 **Item 7 (parcial)** — corrigida uma imprecisão no `venancio-ai-ops/supabase/README.md` (faltavam 2 arquivos na lista de "fonte de verdade" do schema) e reforçado o aviso sobre a policy `anon` aberta. **Não resolvido de verdade**: só dá pra fechar 100% confirmando se o projeto Supabase antigo (que essas migrations criavam) foi mesmo apagado — isso só o dono consegue checar no console do Supabase.
- ⏸️ **Item 6 (não mexido, de propósito)** — `venancio-ai-ops/WorkflowsN8n/Agente 1 (...).json` parece estar sendo editado ativamente em outra frente (git status mostra mudanças recentes + um backup manual salvo há poucos dias) — não editei esse arquivo pra não sobrescrever trabalho em andamento. Risco de colisão de webhook path continua registrado na memória e neste relatório; avise quando quiser que eu mexa nele.
- ⏳ **Item 8 pendente** — `/novo-pedido` continua sem workflow n8n correspondente (fire-and-forget do dashboard, não quebra nada hoje, mas a notificação de pedido novo não sai). Descoberta adicional: `venancio-ai-ops/src/utils/constants.js` tem MAIS uma dezena de endpoints n8n "preparados" (`N8N_WEBHOOKS`, `N8N_WEBHOOKS_SPRINT2/3` — orçamento criado/aprovado/recusado, alerta de demanda, follow-up, etc.) que não correspondem a nenhum workflow real no repo; fora do escopo original da auditoria, mas vale uma decisão futura sobre manter ou limpar esse código morto.

---

## 1. Mapa de arquitetura real (o que o código faz, não o documentado)

```
Cliente (WhatsApp)
   │
   ▼
Evolution API
   │  POST /webhook  (com verifyToken — src/index.js:19)
   ▼
JS Bot (chatbot/papelaria-bot)
   │
   ├─ webhookController.js — dedupe por mensagemId, lock em memória por conversa,
   │  checa conversas.bot_ativo via reativacaoBot.garantirBotAtivo() ANTES de
   │  chamar a state machine (webhookController.js:336-340)
   │
   ├─ stateMachine.js (PURA — sem I/O, confirmado) ──► actions.js (todo I/O real:
   │  Evolution API, Supabase, n8nClient)
   │
   └─ n8nClient.js ──► n8n "Agente de Vendas" (webhook SEM autenticação, path
        venancio/agente-vendas) ──► ferramentas IA:
           • Consultar Produtos / Consultar Categorias (consulta)
           • Adicionar Item ao Orçamento (INSERT direto — orcamento_id e
             valor_unitario vêm de $fromAI() SEM validação de UUID/posse)
           • Fechar Orçamento (sub-workflow COM guarda de UUID + 4 validações)
           • ⚠️ "Criar Orçamento" NÃO está conectada no grafo de produção
             (sticky note pede pra conectar; sub-workflow "Buscar ou Criar
             Orçamento" existe mas não é referenciado em nenhum node)
        resposta: { resposta, encerrar_atendimento_ia }

   n8n "Agente de Orçamento" (na verdade: workflow de NOTIFICAÇÃO de status,
   arquivo nomeado errado) ──► webhook /status-atualizado (SEM autenticação)
        │
        └─ credenciais da Evolution API HARDCODED em texto plano no
           node "Set · Config" (URL + API key reais no JSON exportado)
   │
   ▼
Supabase (1 projeto único, confirmado — bot usa SUPABASE_SERVICE_KEY,
dashboard usa VITE_SUPABASE_ANON_KEY + login real via Supabase Auth)
   │
   ▼
Dashboard (venancio-ai-ops, React/Vite)
   ├─ AuthContext.jsx — login real (signInWithPassword) → sessão →
   │  busca linha em `operadores` pelo auth.uid()
   ├─ Realtime genuíno (postgres_changes) em usePedidos.js e useAtendimento.js;
   │  useKpis é polling de 60s, não realtime
   ├─ statusDerivado.js — traduz os 8 status "de vitrine" (README) a partir do
   │  enum real de 5 valores (status_pedido) + forma_entrega + timestamps de
   │  logística. Funciona corretamente, é um bom design, NÃO mexer.
   ├─ assumirConversa() — UPDATE conversas.bot_ativo=false (mesmo campo que o
   │  bot lê) — handoff bot↔operador está corretamente sincronizado
   ├─ ⚠️ enviarMensagem() — só faz INSERT em `mensagens`. NUNCA chama a
   │  Evolution API. Mensagem do operador NÃO chega ao WhatsApp do cliente.
   └─ dispara POST /novo-pedido e /status-atualizado para VITE_N8N_WEBHOOK_BASE
        • /status-atualizado: existe workflow n8n correspondente
        • /novo-pedido: NENHUM workflow n8n implementa esse path (não
          encontrado em nenhuma das 4 pastas de workflows do monorepo)
```

**Confusão de pastas de workflow n8n (achado à parte, relevante para qualquer trabalho futuro):** existem 4 pastas com JSONs de n8n no monorepo. `chatbot/AGENTES N8N/` é a produção confirmada (re-export mais recente, 25/07). `chatbot/AGENTE DE IA (N8N)/` e `n8n-workflows/` (raiz) são predecessoras/protótipos, ambas no `.gitignore`. `venancio-ai-ops/WorkflowsN8n/` é a mais preocupante: está sob controle de versão normal, e o arquivo `Agente 1 (Gateway...).json` foi **reescrito quase por completo em 23/07** (212 inserções / 1912 remoções, com backup manual salvo um minuto antes) para um protótipo novo chamado internamente `"Agente de Vendas (Webhook Síncrono - Supabase)"`, `"active": false`, que **reaproveita o mesmo path de webhook** (`venancio/agente-vendas`) da produção atual — se algum dia for importado/ativado na mesma instância n8n da produção, colide com o workflow real.

---

## 2. Tabela de gaps

| # | Item | Onde | Risco | Esforço estimado | Prioridade |
|---|---|---|---|---|---|
| 1 | Mensagem do operador não chega ao WhatsApp — só grava em `mensagens` | `venancio-ai-ops/src/services/atendimento.service.js:170-185` | **Crítico** — dashboard não serve pra operação real | Médio (decidir Evolution API direta vs Edge Function vs webhook n8n dedicado; credencial, retry, checar `bot_ativo` antes de enviar) | **1** |
| 2 | Ferramenta "Criar Orçamento" ausente do grafo do Agente de Vendas de produção — IA não consegue abrir orçamento novo | `chatbot/AGENTES N8N/AGENTE_VENDAS.json` (falta node "Call n8n Workflow Tool" → sub-workflow "Buscar ou Criar Orçamento") | **Crítico** — bloqueia o fluxo de vendas via IA desde a raiz | Baixo (a sticky note do próprio arquivo já documenta o passo — parece só não ter sido feito no export) | **1** |
| 3 | Evolution API key + URL em texto plano no workflow de produção | `chatbot/AGENTES N8N/AGENTE_ORÇAMENTO.JSON`, node "Set · Config" | **Crítico** — segredo real exposto em arquivo JSON no repo | Baixo (mover pra credential do n8n, rotacionar a chave exposta) | **1** |
| 4 | Webhooks de produção do n8n sem autenticação (`Webhook · Agente Vendas`, `Webhook · Status Atualizado`) | `AGENTE_VENDAS.json`, `AGENTE_ORÇAMENTO.JSON` | Alto — qualquer um que descubra a URL injeta mensagens/status falsos | Baixo-Médio (replicar padrão de `verifyToken` já usado no bot) | 2 |
| 5 | `$fromAI()` controla `orcamento_id` e `valor_unitario` sem validação em "Adicionar Item ao Orçamento" | `AGENTE_VENDAS.json`, node "Adicionar Item ao Orçamento" | Alto — prompt injection pode gravar preço arbitrário ou item em orçamento de outra conversa | Baixo-Médio (replicar a guarda de UUID + checagem de posse já usada em "Fechar Orçamento") | 2 |
| 6 | `venancio-ai-ops/WorkflowsN8n/` tem protótipo reaproveitando o path de webhook da produção | `venancio-ai-ops/WorkflowsN8n/Agente 1 (...).json` | Alto (colisão operacional se ativado sem querer) | Baixo (decidir arquivar/renomear o path) | 2 |
| 7 | Schema legado (`venancio-ai-ops/supabase/migrations/002...008`) ainda no repo com policy `anon` aberta em `clientes`/`pedidos`/etc | `venancio-ai-ops/supabase/migrations/002_dev_anon_policy.sql` e seguintes | Alto **se** o projeto Supabase antigo referenciado não estiver de fato apagado — precisa confirmação manual no console Supabase | Baixo (confirmar exclusão; se existir, apagar o projeto ou revogar as policies) | 2 |
| 8 | `POST /novo-pedido` disparado pelo dashboard não tem workflow n8n correspondente em nenhuma pasta do repo | `venancio-ai-ops/src/services/pedidos.service.js` dispara; nenhum n8n implementa | Médio — integração incompleta (é fire-and-forget, não quebra nada hoje) | Médio | 3 |
| 9 | Sem rate limiting / proteção contra flood no webhook do bot | `chatbot/papelaria-bot/src/index.js` e middlewares | Médio — risco real no pico de Volta às Aulas | Médio | 3 |
| 10 | Documentação desatualizada: menção órfã a "AI Service" na tabela de deploy; README do bot não lista as extensões SQL; ARCHITECTURE_REVIEW.md diz que multi-tenant "não existe" (já existe) | `venancio-ai-ops/README.md:176`; `chatbot/papelaria-bot/README.md`; `ARCHITECTURE_REVIEW.md:93` | Baixo | Baixo | 4 |
| 11 | `PEDIDO_STATUS_NOTIFICAVEIS` definido mas nunca importado/usado | `venancio-ai-ops/src/utils/constants.js:271` | Baixo — código morto, confunde quem audita | Baixo | 4 |

---

## 3. Divergências de schema

**Achado estrutural mais importante:** existem duas linhagens de schema completamente separadas no repo, não uma sequência única:

- **Linhagem A** — `chatbot/papelaria-bot/supabase/*.sql` (schema.sql → squemanovo.sql → extensao_cadastro_fiscal.sql → extensao_dashboard.sql → extensao_notificacoes_e_retomada.sql → extensao_rls_status_historico.sql). **Esta é a que está realmente em produção** — confirmado porque tanto os workflows n8n de produção (`chatbot/AGENTES N8N/*.json`) quanto o código real do dashboard (`venancio-ai-ops/src/services/*.js`) usam exclusivamente nomes de tabela/coluna desta linhagem.
- **Linhagem B** — `venancio-ai-ops/supabase/migrations/000...008` + `seeds/`. O próprio `venancio-ai-ops/supabase/README.md` admite que descreve um **projeto Supabase separado que já foi apagado** e que a fonte de verdade passou a ser a Linhagem A. Nenhum código vivo usa os nomes desta linhagem.

**Por que isso importa mesmo sendo "morto":** a Linhagem B tem funções com o **mesmo nome mas assinatura/corpo diferentes** da Linhagem A (`recalcular_valor_pedido`, `get_metricas_comerciais`, `buscar_produto_fuzzy`, `registrar_demanda_produto`, `aprender_de_resposta_operador`, `get_top_demanda`, `get_oportunidades_perdidas`, `get_activity_feed`) — se algum dia esses arquivos forem reaplicados por engano no projeto Supabase real (ex.: alguém tentando "recriar o ambiente de dev"), o `CREATE OR REPLACE FUNCTION` sobrescreve silenciosamente as versões de produção. Também recria a policy `anon` aberta em `clientes` (ver item de segurança crítico abaixo). Recomendação para a Fase 2: mover essas migrations para uma pasta claramente marcada como histórico morto (ex. `_deprecated/`) ou removê-las, com uma nota no commit.

**Status de pedido — resolvido corretamente, não é bug:** o enum real `status_pedido` (Linhagem A) tem só 5 valores (`confirmado, em_separacao, pronto, concluido, cancelado`), enquanto o README/UI falam de 8 status "de vitrine" (`NOVO_PEDIDO, AGUARDANDO_CONFIRMACAO, EM_SEPARACAO, SEPARADO, PRONTO_RETIRADA, SAIU_ENTREGA, FINALIZADO, CANCELADO`). Isso parecia, à primeira vista, uma divergência crítica — mas `venancio-ai-ops/src/utils/statusDerivado.js` já resolve isso corretamente, derivando os 8 status a partir do enum de 5 + `forma_entrega` + `pronto_para_retirada_em`/`saiu_para_entrega_em`. **Não mexer nisso.** A única sobra é a constante `PEDIDO_STATUS_NOTIFICAVEIS` (`constants.js:271`), que replica os 8 valores mas nunca é importada em lugar nenhum — código morto, não um bug funcional.

**Tabelas equivalentes com nomes divergentes entre as linhagens** (relevante só se alguém for arquivar/comparar a Linhagem B, não afeta produção hoje): histórico de status (`pedidos_status_historico` vs `historico_status`), itens de orçamento (tabela própria vs jsonb inline), memória de produto (`memoria_produtos` vs `products_memory`), consultas de demanda, templates de mensagem, log de eventos, produtos relacionados, empresa (`empresa` vs `empresa_config` — este último referenciado em `008_n8n_agentes_integracao.sql` mas **nunca criado em nenhum `.sql` do repo**, foi feito manualmente fora de versionamento).

---

## 4. Achados de segurança (por severidade)

### Crítico
- **Chave real da Evolution API em texto plano** no workflow de produção `chatbot/AGENTES N8N/AGENTE_ORÇAMENTO.JSON` (node "Set · Config"): URL + API key expostas no JSON exportado, diferente do padrão correto (credential por ID) usado em todos os outros nós do mesmo arquivo.
- **Policy `anon` totalmente aberta em `clientes` e outras tabelas com PII/dados comerciais**, na Linhagem B de schema (`venancio-ai-ops/supabase/migrations/002_dev_anon_policy.sql` em diante). Marcada no próprio arquivo como "apenas dev", nunca revogada nos arquivos seguintes. Risco real depende de o projeto Supabase antigo referenciado ainda existir — **precisa confirmação manual**, não veriricável só pelos arquivos do repo.
- **Envio de mensagem do operador não sai de fato pro WhatsApp** (funcional, mas também um risco de confiança operacional — ver item 1 da tabela de gaps).

### Alto
- Webhooks de entrada do n8n de produção (`Webhook · Agente Vendas`, `Webhook · Status Atualizado`) sem nenhuma verificação de token/origem — em contraste com o bot, que valida as duas rotas de entrada via `verifyToken` (`src/index.js:19,23`, `src/middlewares/verifyToken.js`).
- `$fromAI()` controlando `orcamento_id` e `valor_unitario` no node "Adicionar Item ao Orçamento" sem validação de formato UUID nem de posse do orçamento pela conversa atual — risco de prompt injection alterar preço ou gravar item no orçamento errado. (O node "Fechar Orçamento" tem a guarda correta — o padrão existe no sistema, só não foi replicado aqui.)
- `venancio-ai-ops/WorkflowsN8n/` reaproveitando o mesmo path de webhook (`venancio/agente-vendas`) da produção — risco de colisão operacional.

### Médio
- Sem rate limiting/proteção contra flood no webhook do bot — relevante no pico de Volta às Aulas.
- Os arquivos de produção do n8n (`chatbot/AGENTES N8N/`) estão hoje como não versionados (`git status: ??`) — enquanto ficarem assim, um `git add -A` descuidado os comitaria, incluindo a chave da Evolution API, permanentemente no histórico do git.

### Baixo
- Lacuna de RLS em `orcamentos_status_historico`/`pedidos_status_historico` (faltavam policies de `authenticated`) — **já corrigida** por `extensao_rls_status_historico.sql`. Mantido aqui só como registro histórico, não é uma ação pendente.
- CORS: nenhuma configuração encontrada no dashboard (`vite.config.js`) — não é um risco ativo porque não há necessidade identificada de CORS restritivo neste momento (app não expõe API própria).
- Supabase Storage/buckets: não usado em nenhum dos dois projetos — nada a auditar aqui.

### Verificado e correto (não é achado, mas responde a pergunta explícita do escopo)
- Uso de anon key no dashboard é apropriado — RLS real (via `authenticated` + `eh_operador_ativo()`) protege as tabelas da Linhagem A, e o dashboard implementa login de verdade via Supabase Auth (`AuthContext.jsx`), então `auth.uid()` está populado corretamente nas policies.
- Bot usa `service_role` (bypassa RLS) — consistente com o desenho, e a Linhagem A não tem nenhuma policy `anon`.
- `stateMachine.js` continua pura, sem I/O — confirmado por leitura completa; nenhuma violação do princípio arquitetural.

---

## 5. Bugs confirmados

| Bug | Status | Evidência |
|---|---|---|
| (a) Duplo processamento (confirmação + "opção inválida" simultâneas) | **Corrigido** | Causa raiz: nome+telefone numa mensagem só, quebrada em duas pelo Enter do WhatsApp. Corrigido separando `ESTADO_NOME`/`ESTADO_TELEFONE_CONTATO` (`cadastroFiscal.js:300-331`). Teste de regressão em `test/botEngine/stateMachine.test.js:311-319`. |
| (b) "Outra escola" pulando coleta de lista de materiais | **Não existe / fluxo correto** | `listaEscolar.js:141-142` insere `ESTADO_ESCOLA_OUTRA_LISTA_MATERIAL` entre `ESTADO_ANO` e `ESTADO_OBSERVACAO`, antes de ir para `cadastroFiscal`. Teste cobrindo em `stateMachine.test.js:456-471`. |
| (c, novo) Ferramenta "Criar Orçamento" ausente do grafo de produção do Agente de Vendas | **Presente — bloqueia criação de orçamento via IA** | `AGENTE_VENDAS.json` tem sticky note com instruções pra conectar o node, mas ele não existe no arquivo; comparado com a versão anterior (`chatbot/AGENTE DE IA (N8N)/Agente Vendas (corrigido...).json`), que tinha essa ferramenta conectada. |
| (d, novo) `$fromAI()` sem guarda em "Adicionar Item ao Orçamento" | **Presente** | Ver seção de segurança, item Alto. |

---

## 6. O que já está 100% funcional — não mexer sem motivo

- **Handoff bot ↔ operador** (`conversas.bot_ativo`): os dois lados usam exatamente o mesmo nome de campo e estão corretamente sincronizados, inclusive a lógica de reativação automática por timeout (`ultima_interacao_em`, coordenada entre `atendimento.service.js` e `reativacaoBot.js`). Nenhum bug de duplicidade de resposta encontrado aqui.
- **Verificação de token do bot** (`verifyToken` em `/webhook` e `/webhook/agente-orcamento`) — cobre as duas rotas de entrada corretamente.
- **Pureza da state machine** (`stateMachine.js` sem I/O, `actions.js` concentrando todo I/O) — arquitetura limpa, confirmada por leitura completa.
- **Idempotência/dedupe** por `mensagemId` + lock em memória contra processamento concorrente da mesma conversa (`webhookController.js`).
- **Realtime do dashboard** (`usePedidos.js`, `useAtendimento.js`) — genuinamente ligado a `postgres_changes`, não é mock.
- **`statusDerivado.js`** — camada de tradução entre os 8 status "de vitrine" e o enum real de 5 valores. Bem desenhada, resolve exatamente o problema que parecia ser um bug de divergência de schema.
- **Login/RLS do dashboard** (`AuthContext.jsx` + policies `authenticated`/`eh_operador_ativo()`) — autenticação real via Supabase Auth, coerente com as policies do banco.
- **Sub-workflow "Fechar Orçamento"** — cadeia de 4 guardas (UUID válido → orçamento encontrado → ainda em rascunho → tem item) antes de qualquer escrita. Bom padrão, deveria inspirar a correção do item 5 da tabela de gaps, mas ele mesmo não precisa de mudança.
- **`ai-service/` já foi depreciado corretamente no código** — não existe fisicamente, `ConfigPage.jsx` já não o referencia. Só sobrou uma linha órfã na documentação (baixa prioridade, item 10 da tabela de gaps).
- **Fluxo "outra escola"** (`listaEscolar.js`) — coleta a lista de materiais no momento certo, antes do cadastro fiscal.

---

## Próximos passos

Aguardando sua aprovação deste relatório antes de montar o plano de execução da Fase 2, priorizado conforme as instruções originais (fechar item 1 e 2 desta tabela primeiro — envio real de WhatsApp e ferramenta de criação de orçamento — depois os achados de segurança críticos/altos, depois o resto).
