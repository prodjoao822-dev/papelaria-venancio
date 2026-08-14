# Implementação e Status do Projeto Venâncio — Análise Consolidada

Última atualização: 2026-08-03. Este documento substitui a versão anterior (só cobria a implementação de 2026-07-30) e consolida três momentos do projeto:

1. **Auditoria de arquitetura** (`AUDITORIA_INTEGRACAO.md`, 2026-07-27) — mapeamento geral bot × dashboard × n8n, achados de segurança e gaps.
2. **Implementação das correções do diagnóstico** (`DIAGNOSTICO_VENANCIO.md`, 2026-07-30) — C1-C4/A1-A8/M1-M8.
3. **Sessão de debugging ao vivo via n8n MCP** (2026-08-03) — o grosso dos bugs reais encontrados testando o Agente de Vendas ponta a ponta pelo WhatsApp, corrigidos direto nos workflows de produção.

Cada seção indica o nível de confiança: **verificado hoje** (testado de ponta a ponta nesta sessão, 03/08), **conforme auditoria** (relatado em 27/07 ou 30/07, não re-testado agora — pode estar desatualizado) ou **não verificado**.

---

## 1. Arquitetura real do sistema

```
Cliente (WhatsApp)
   │
   ▼
Evolution API ──POST /webhook (verifyToken)──► JS Bot (chatbot/papelaria-bot, Node/Express)
                                                   │
                                                   ├─ webhookController.js: dedupe por mensagemId,
                                                   │  lock em memória por conversa, checa bot_ativo
                                                   │  antes da state machine
                                                   ├─ stateMachine.js (pura, sem I/O) ──► actions.js
                                                   │  (todo I/O: Evolution API, Supabase, n8nClient)
                                                   └─ n8nClient.js ──► n8n "Agente vendedor"
                                                        (webhook COM Header Auth, path
                                                        venancio/agente-vendas)

n8n "Agente vendedor" (qqN54gUwSLYq14bZ)
   Webhook → buffer/lock Redis (debounce 3s) → grava msg cliente → checa conversa
   válida → Agente de Vendas (LangChain, Gemini 2.5 Flash via OpenRouter) com tools:
     • Consultar Produtos / Consultar Categorias
     • Criar Orçamento / Adicionar Item ao Orçamento / Fechar Orçamento
       (chamam sub-workflow único "Orçamento (Sub-workflow)", RVwx3aBcDcQBohpg)
   → guarda anti-alucinação de fechamento → valida resposta → responde ao bot
   → grava resposta na conversa

Supabase (1 projeto único — bot usa service_role, dashboard usa anon key + Supabase Auth)

Dashboard (venancio-ai-ops, React/Vite)
   ├─ Realtime genuíno (postgres_changes) em pedidos/atendimento
   ├─ Login real via Supabase Auth + RLS (authenticated + eh_operador_ativo())
   ├─ statusDerivado.js traduz enum de 5 status pra 8 "de vitrine" — bom design
   └─ Envio de mensagem do operador → POST /operador/mensagens/enviar no JS Bot
      → Evolution API (ciclo fechado, ver seção 3)
```

---

## 2. O que está funcionando hoje (verificado)

### Verificado nesta sessão (03/08), testado ponta a ponta via WhatsApp/n8n real
- Fluxo completo de venda pela IA: cliente pergunta produto → agente busca no catálogo → confirma → adiciona ao orçamento → fecha → **pedido real criado no banco** (`status: confirmado`, origem `agente_vendas_n8n`), aparece no dashboard.
- Comprar mais de uma vez na mesma conversa (após já ter fechado um pedido) — cria orçamento novo em vez de travar no antigo.
- Busca de produto tolerante a acento (cliente ou IA escrevendo "fotográfico" encontra "FOTOGRAFICO" no catálogo).
- Reconhecimento de pedido genérico ("material escolar", sem produto específico) como abertura de conversa, não como busca literal.
- Guarda contra a IA inventar sucesso de fechamento sem ter chamado a ferramenta de verdade (ver bug crítico na seção 4).
- Guarda contra a IA inventar `produto_id` que não veio de uma consulta real ao catálogo.
- Reativação/pausa do bot (`bot_ativo`) sincronizada entre timeout do Agente de Vendas, escalonamento humano e reativação automática por inatividade.
- Suíte de testes do bot: **95/95 passando** (sem testes dedicados a `webhookController.js`/`actions.js` — cobertura só manual).

### Conforme auditoria de 27/07 (não re-testado nesta sessão, mas com Fase 3 marcada como resolvida no próprio relatório)
- Handoff bot ↔ operador via `conversas.bot_ativo` — corretamente sincronizado dos dois lados.
- Envio de mensagem do operador pelo dashboard chegando de fato ao WhatsApp (rota `POST /operador/mensagens/enviar`, criada na Fase 3 da auditoria).
- Verificação de token nas rotas de entrada do bot (`/webhook`, `/webhook/agente-orcamento`).
- Pureza da `stateMachine.js` (zero I/O) — arquitetura limpa.
- Realtime do dashboard (`usePedidos.js`, `useAtendimento.js`) genuinamente ligado a `postgres_changes`.
- Login/RLS do dashboard via Supabase Auth real.
- Rate limiting (`express-rate-limit`, 300 req/min) nas rotas de webhook do bot.
- Header Auth exigido nos webhooks n8n de produção (confirmado hoje que o webhook do Agente de Vendas tem credential real vinculada, não placeholder vazio).
- Fluxo "outra escola" (`listaEscolar.js`) coletando lista de materiais na ordem certa.

---

## 3. Bugs corrigidos nesta sessão (03/08) — sessão de debugging ao vivo

Encontrados testando o Agente de Vendas de ponta a ponta pelo WhatsApp real. Todos corrigidos direto nos workflows de produção via n8n MCP e revalidados com `n8n_validate_workflow` + teste real.

| # | Bug | Sintoma pro cliente | Causa raiz | Correção |
|---|---|---|---|---|
| 1 | `Marca Fim Agente` perdia o campo `output` | Toda resposta da IA (desde 29/07) substituída por "Desculpe, não consegui processar..." | `includeOtherFields` no lugar errado no node Set (deveria ser parâmetro de topo, não dentro de `options`) | Movido pro lugar certo |
| 2 | `Conversa Ainda Ativa?` exigia `estado_atual='AGENTE_VENDAS_ATIVO'` | 1ª mensagem de toda sessão de vendas sempre ignorada (sem resposta) | Bot só grava esse estado **depois** de a chamada retornar — checagem via n8n rodava antes da escrita | Condição passou a aceitar também `SUBMENU_VENDAS` |
| 3 | Timeout do bot (20s) menor que a latência real do workflow | Cliente recebia aviso de "conectando com equipe" mesmo quando a IA ia responder certo, só mais devagar | Overhead de Redis/Supabase + chamada da IA passava de 25-48s em fluxos com múltiplas ferramentas | Timeout ajustado pra 55s; pausa de debounce 7s→3s; `maxIterations` do agente 10→6 |
| 4 | Prompt do agente e descrição de `Consultar Produtos` truncados | Respostas genéricas demais, sem as regras de negócio (nunca inventar preço, etc.) | Gravação anterior (fora desta sessão) nunca persistiu o texto completo — ficou uma frase só | Reescritos por completo, confirmado por leitura direta na API do n8n (bypass do MCP) |
| 5 | IA buscava produto genérico ("material escolar") como termo literal | "Não temos nenhum produto com o termo 'material escolar'" | Prompt não deixava claro que isso vale mesmo como 1ª mensagem da conversa | Reforço explícito no prompt |
| 6 | IA inventava `produto_id` | "Adicionar Item" rejeitava (corretamente) um ID falso, item nunca era adicionado | Produtos têm campo `descricao` tipo "Código original: 22839" (resquício de migração) que a IA confundia com o ID real | Reforço no prompt avisando especificamente sobre essa armadilha |
| 7 | `Supabase · Cria Orçamento Novo` lia `cliente_id`/`conversa_id` de `$json` | Erro de banco (`null value in column "cliente_id"`) toda vez que não havia orçamento aberto ainda (1º item da conversa) | Devia referenciar o node `Normaliza Entrada` diretamente, não o item corrente | Corrigido |
| 8 | `Normaliza Entrada` perdia o campo `quantidade` | "Adicionar Item" sempre rejeitava por "quantidade inválida" | Campo não listado explicitamente nas atribuições do Set, e o passthrough implícito não preservou esse campo numérico | Adicionado como atribuição explícita |
| 9 | **IA alucinava "Fechado!" sem chamar a ferramenta de fechar** | Cliente recebia confirmação de pedido que não existia no banco | Falha de aderência ao prompt do modelo (Gemini Flash) | Guarda adicionada: verifica no banco se o pedido existe de verdade antes de deixar passar a mensagem de sucesso (não depende de reler o node da ferramenta, que é pouco confiável para chamadas de IA) |
| 10 | `Fechar Orçamento` nunca enviava `conversa_id` ao sub-workflow | Fechamento sempre falhava com "orçamento não pertence a esta conversa" | Mapeamento de parâmetros do node incompleto (só `acao` e `orcamento_id`) | Adicionado `conversa_id` ao mapeamento |
| 11 | `RPC · Aceitar Orçamento` usava `$env.SUPABASE_URL`/`SUPABASE_ANON_KEY` | Erro "access to env vars denied" | Esta instância n8n bloqueia acesso a `$env` em expressões de node (config de instância, fora do meu alcance mudar) | Node reconfigurado pra usar a credencial Supabase já existente + URL do projeto fixa (não é segredo) |
| 12 | `Respond to Webhook` quebrava com resposta vazia | Bot recebia corpo vazio quando "Fechar Orçamento" lançava erro não tratado | Expressão `$('Fechar Orçamento').first()` lança exceção quando o node não tem dados de saída "main" | Checagem envolvida em try/catch, default seguro (`false`) |
| 13 | Filtro "orçamento em aberto" ignorava o critério de status | Depois de fechar 1 pedido, qualquer tentativa de comprar de novo na mesma conversa travava | Node Supabase (`getAll`, typeVersion 1) com 2 condições de filtro aplica só a primeira silenciosamente — bug de compatibilidade do node, confirmado comparando com query direta ao Postgres | Checagem de status movida pra dentro da condição do IF seguinte, independente do filtro quebrado |
| 14 | Busca de produto sensível a acento | "Não encontrei papel fotográfico" mesmo havendo 6 produtos correspondentes | Catálogo grava nomes sem acento (`FOTOGRAFICO`), `ilike` do Postgres é sensível a acento | Termo de busca normalizado (remoção de diacríticos via `.normalize('NFD')`) antes do filtro |

**Observação importante sobre o achado #13**: é evidência de um problema sistêmico — o node Supabase `typeVersion: 1` usado em várias partes dos workflows pode **ignorar silenciosamente** condições de filtro além da primeira. Só um caso foi encontrado e corrigido (a busca de orçamento aberto), mas qualquer outro node com múltiplas condições de filtro nesses workflows merece re-checagem manual (ver seção 5).

---

## 4. Pontos soltos / riscos conhecidos (não resolvidos)

### Alto
- **Node Supabase com filtro multi-condição pode ignorar condições silenciosamente** (achado #13 acima). Só foi auditado e corrigido o ponto que quebrou meu teste; não houve varredura sistemática de todos os nodes Supabase com mais de 1 condição de filtro nos dois workflows de produção.
- **Categorias vazias no banco** (`categorias`, 0 linhas). A ferramenta "Consultar Categorias" sempre vai retornar vazio até essa tabela ser populada — a IA hoje contorna isso pedindo mais detalhes ao cliente, mas a experiência "me mostra as categorias" nunca vai funcionar de verdade.
- **3 ferramentas do agente sem `toolDescription`**: `Criar Orçamento`, `Adicionar Item ao Orçamento`, `Fechar Orçamento` (confirmado hoje por `n8n_validate_workflow`, ainda não corrigido). Isso deixa a decisão de quando chamá-las inteiramente a cargo do nome do node — funcionou nos testes, mas é um ponto frágil.
- **Sem tratamento de erro formal (`onError`) na maioria dos nodes** dos dois workflows de produção — quando algo falha de forma inesperada (ex.: rate limit do modelo, falha de rede pontual), o comportamento depende de cada node individualmente, não de uma estratégia consistente.
- **`venancio-ai-ops/WorkflowsN8n/Agente 1 (...).json`** (conforme auditoria de 27/07, não re-verificado): reaproveita o mesmo path de webhook (`venancio/agente-vendas`) da produção. Risco de colisão se algum dia for importado/ativado na mesma instância n8n. Registrado também em memória — checar timestamps antes de mexer, já mudou de dono/estado 1x no mesmo dia da auditoria.

### Médio
- **`POST /novo-pedido` do dashboard sem workflow n8n correspondente** (conforme auditoria) — fire-and-forget, não quebra nada hoje, mas a notificação de pedido novo não sai de fato.
- **Uma dezena de endpoints n8n "preparados" em `venancio-ai-ops/src/utils/constants.js`** (`N8N_WEBHOOKS_SPRINT2/3`) sem workflow real correspondente — código morto ou funcionalidade nunca implementada, decisão pendente (manter vs limpar).
- **Rate limit do modelo (Gemini 2.5 Flash via OpenRouter)**: observado pelo menos 1 vez nesta sessão (`429 temporarily rate-limited upstream`), sem modelo de fallback configurado no node `OpenRouter Chat`.
- **Latência do fluxo de fechamento ainda alta** (25-50s típico, picos observados de até ~108s antes do ajuste de `maxIterations`) — aceitável para o volume esperado, mas vale medir p50/p95 reais em produção (item A2 do backlog original, nunca calibrado com dado real).
- **Schema legado ("Linhagem B")** em `venancio-ai-ops/supabase/migrations/002...008` com policy `anon` aberta — depende de confirmação manual do dono se o projeto Supabase antigo referenciado ainda existe (não verificável só pelos arquivos).

### Baixo
- Documentação com menções desatualizadas (`ai-service` órfão, README do bot sem listar extensões SQL) — conforme auditoria, baixo impacto.
- `PEDIDO_STATUS_NOTIFICAVEIS` definido em `constants.js` e nunca importado — código morto.

---

## 5. Integrações que faltam ou estão incompletas

| Integração | Status | Observação |
|---|---|---|
| Notificação de pedido novo (dashboard → n8n) | **Faltando** | `POST /novo-pedido` disparado pelo dashboard sem workflow n8n que o implemente |
| Categorias de produto (IA → cliente) | **Bloqueada por dado, não por código** | Tabela `categorias` vazia |
| Job de expiração automática de orçamentos presos (M4 do backlog original) | **Não implementado** | Orçamento em rascunho esquecido fica assim para sempre |
| Constraint de unicidade de orçamento ativo por cliente (M5) | **Não implementado** | Nada no banco impede 2 orçamentos "rascunho" simultâneos pro mesmo cliente fora do fluxo do agente (o agente evita isso na prática, mas não há garantia no schema) |
| Fila de mensagens concorrentes (M3) | **Descartada com aviso, não resolvida** | Mensagens simultâneas da mesma conversa são descartadas com log, não enfileiradas |
| Endpoints do dashboard sem workflow n8n (M6) | **Parcial** | Ver `N8N_WEBHOOKS_SPRINT2/3` acima |
| Fallback de modelo de IA (Gemini → outro provider em caso de rate limit) | **Não implementado** | Um único modelo configurado no node `OpenRouter Chat` |

---

## 6. Backlog priorizado (revisado)

1. Varrer os dois workflows de produção por outros nodes Supabase com filtro multi-condição (mesma classe do bug #13) — risco de bugs silenciosos equivalentes ainda não descobertos.
2. Adicionar `toolDescription` em `Criar Orçamento`, `Adicionar Item ao Orçamento`, `Fechar Orçamento`.
3. Popular a tabela `categorias` (ou remover a ferramenta "Consultar Categorias" do agente até existir conteúdo real).
4. Decidir sobre `venancio-ai-ops/WorkflowsN8n/` (arquivar/renomear o path do webhook duplicado).
5. Medir p50/p95 reais de latência do Agente de Vendas em produção (A2) — hoje o timeout foi calibrado por observação pontual, não por dado agregado.
6. Job de expiração de orçamentos presos (M4) + constraint de unicidade (M5).
7. Implementar ou remover os webhooks "preparados" sem workflow real (`N8N_WEBHOOKS_SPRINT2/3`, `/novo-pedido`).
8. Confirmar com o dono se o projeto Supabase antigo (Linhagem B de schema) ainda existe — se sim, apagar ou revogar a policy `anon`.
9. Modelo de fallback pro Agente de Vendas em caso de rate limit do provider atual.

---

## 7. Ações manuais pendentes (dono do projeto)

- Confirmar se o projeto Supabase antigo referenciado pela Linhagem B de migrations ainda existe (só verificável no console Supabase).
- Decidir o destino de `venancio-ai-ops/WorkflowsN8n/Agente 1 (...).json` (protótipo com path de webhook duplicado).
- Popular a tabela `categorias` com conteúdo real, se a funcionalidade "ver categorias" for desejada no curto prazo.
- Rotacionar a chave da Evolution API que ficou exposta em texto plano no histórico do git antes da correção de 27/07 (se ainda não foi feito).

---

## Histórico

- **2026-07-27**: Auditoria de arquitetura (`AUDITORIA_INTEGRACAO.md`) — Fase 1 (diagnóstico) + Fase 3 (implementação parcial no mesmo dia).
- **2026-07-30**: Implementação das correções do `DIAGNOSTICO_VENANCIO.md` (C1-C4, A1/A3/A5/A6/A7, M1/M2/M8) em 3 subagentes paralelos.
- **2026-08-03**: Conexão do n8n via MCP, limpeza de 51 workflows obsoletos/duplicados, deploy das correções nos 2 workflows de produção, ativação, e sessão extensa de debugging ao vivo testando o Agente de Vendas pelo WhatsApp — 14 bugs reais encontrados e corrigidos (seção 3), todos revalidados com teste real de ponta a ponta.
