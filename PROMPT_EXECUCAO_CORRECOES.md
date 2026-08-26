# Prompt de Execução — Correções e Deploy (pós-auditoria 17-18/08/2026)

Este arquivo é **prompt de handoff**: cole-o inteiro num novo chat do Claude Code para executar o que está descrito aqui. Ele parte da auditoria multiagente de 17/08/2026 (documento completo publicado como Artifact — peça ao dono do projeto o link se precisar do detalhe de cada achado) e da vistoria anterior de 15/08 (`PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_MESTRE_IMPLEMENTACAO.md`, que continua a fonte mais granular por fase).

**Objetivo desta etapa**: deixar o sistema funcional (sem regressão silenciosa) e pronto para aguentar o volume declarado (50–200 msg/dia, com pico de 200+ na volta às aulas). Isso é, na maior parte, **corrigir e destravar o que já existe**, não construir do zero.

---

## Regras de execução

1. Trabalhe **uma fase por vez**, na ordem abaixo. Não pule pra Fase 2 sem fechar a Fase 0.
2. Antes de qualquer `git add`, rode `git status --porcelain` e revise o que está sendo staged — este repositório já teve chave de API vazada em commit.
3. Toda escrita crítica no banco passa por RPC atômica — nunca `UPDATE`/`INSERT` direto de tabela a partir de código novo.
4. Nenhuma RPC nova aceita id de ator vindo do client — sempre resolver via `auth.uid()`/`funcionario_atual_id()` dentro da função (padrão já usado em `extensao_separacao_delegada.sql`).
5. Ações que mexem em produção viva (n8n, credenciais, deploy) **pedem confirmação explícita antes de executar** — não são reversíveis com a mesma facilidade que um `git revert`.
6. Ao final de cada fase, rode os testes existentes (`npm test` no bot) antes de seguir.

---

## Fase 0 — Verificação e correção urgente (hoje)

Nenhum destes itens é trabalho de construção — são checagem + correção pontual.

0.1. **Testar um fechamento de orçamento real pelo WhatsApp.** Mandar uma mensagem de teste, seguir o fluxo até "aceitar orçamento", e confirmar que um pedido é criado de fato no banco. Se falhar (erro silencioso, cliente não recebe confirmação, ou pedido não aparece no dashboard), a causa mais provável é a descrita no item 0.2.

0.2. **Verificar a credencial do node "RPC · Aceitar Orçamento"** no workflow n8n `Orçamento (Sub-workflow)` (`RVwx3aBcDcQBohpg`). O arquivo versionado (`chatbot/AGENTES N8N/Orçamento (Sub-workflow).json`) mostra esse node chamando a RPC `aceitar_orcamento` com a chave pública (`SUPABASE_ANON_KEY`), sem credencial gerenciada vinculada. Se a correção de segurança de 15/08 revogou o acesso de `anon` a essa RPC (arquivo `chatbot/papelaria-bot/supabase/extensao_seguranca_b0_orcamentos.sql`), essa chamada pode estar falhando com erro `42501` desde então. **Corrigir**: vincular a credencial gerenciada `service_role` do Supabase nesse node (mesmo padrão já usado nos outros nodes Supabase do mesmo workflow), reexportar o JSON atualizado para `chatbot/AGENTES N8N/`.

0.3. **Só depois de 0.1 e 0.2 confirmados**, commitar os 3 arquivos SQL de segurança que estão pendentes desde 15/08:
   - `chatbot/papelaria-bot/supabase/extensao_seguranca_b0_orcamentos.sql`
   - `chatbot/papelaria-bot/supabase/extensao_auditoria_b1_dashboard.sql`
   - `chatbot/papelaria-bot/supabase/extensao_rls_completa.sql`

   Commit temático único, ex.: `fix(banco): versiona correções de RLS/RPC de orçamento e dashboard (B0/B1/B6)`.

0.4. **Commitar `app-mobile/`.** Hoje o diretório inteiro está fora do git (`git ls-files app-mobile` retorna vazio) — qualquer `git clean`/`stash -u` descuidado apaga o projeto sem deixar rastro. `git add "app-mobile/"` e commitar como está, mesmo sendo protótipo.

0.5. **Limpar o segredo exposto no n8n.** No workflow `Agente vendedor` (`qqN54gUwSLYq14bZ`), o node "Webhook · Agente Vendas" tem `pinData` configurado com o token real do webhook e dados reais de um cliente, em texto plano, visível a qualquer um com acesso de leitura à instância. Remover o `pinData` desse node. Depois, **rotacionar o valor da credencial "Header Auth account"** (id `moWPAht2W5Ah3qDj`) no n8n e atualizar `N8N_VENDAS_WEBHOOK_TOKEN` no `.env` do bot.

**Aceite da Fase 0**: um orçamento de teste fecha e vira pedido de ponta a ponta pelo WhatsApp; os 3 SQLs e `app-mobile/` aparecem em `git log`; o `pinData` do webhook de Vendas não existe mais.

---

## Fase 1 — Disponibilidade barata (esta semana)

Resolve o ponto único de falha mais barato do sistema antes de esperar pelo deploy completo em Docker.

1.1. **Reativar um supervisor de processo mínimo para o bot.** Hoje ele roda manual em terminal — fechar o terminal ou hibernar a máquina derruba o atendimento no WhatsApp sem alarme. Usar PM2 (o `chatbot/papelaria-bot/ecosystem.config.js` já existe, mas está marcado obsoleto por causa do túnel ngrok que foi abandonado) — reescrever a config do PM2 **sem** o bloco de ngrok, só com o processo do bot e `autorestart: true`. Não reativar o ngrok.

1.2. **Adicionar timeout às chamadas da Evolution API.** `chatbot/papelaria-bot/src/services/evolutionApi.js`, função `fetchComRetentativa` — hoje não usa `AbortController`, então um travamento do proxy prende o handler do webhook indefinidamente. Seguir o mesmo padrão já usado em `chatbot/papelaria-bot/src/integracoes/n8nClient.js` (que já tem `AbortController` com timeout explícito).

1.3. **Adicionar `Error Trigger`/`errorWorkflow` aos 3 workflows n8n ativos** (`Agente vendedor`, `Orçamento (Sub-workflow)`, `Agente Orçamento`). Não precisa ser elaborado — mesmo um workflow simples que grava o erro numa tabela de log ou manda uma notificação de WhatsApp pra um número da equipe técnica já fecha a lacuna de "falha silenciosa" descrita na auditoria (achado B4).

1.4. **Corrigir a referência errada no `venancio-ai-ops/README.md:155`** — hoje aponta para `chatbot/AGENTE DE IA (N8N)/` (pasta legada, desatualizada); deveria apontar para `chatbot/AGENTES N8N/` (fonte de verdade real, versionada).

**Aceite da Fase 1**: o bot sobrevive a um reboot da máquina sem intervenção manual; uma chamada à Evolution API nunca trava o processo por mais que o timeout definido; uma falha em qualquer node dos 3 workflows n8n gera algum sinal visível, não só desaparece na lista de execuções.

---

## Fase 2 — Deploy real (Docker + Oracle)

Executar o plano já escrito em `PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_DEPLOY_DOCKER_ORACLE.md` — nenhuma etapa dele foi executada até hoje. Resumo do desenho: bot em container Docker numa VM Oracle Cloud "Always Free" (Ampere A1, ARM); dashboard na Vercel (hobby); DuckDNS + Caddy para HTTPS automático; n8n e Supabase continuam onde já estão (não mudam). Custo incremental projetado: R$ 0/mês.

2.1. Escrever `Dockerfile` multi-stage para `chatbot/papelaria-bot/` (imagem de produção enxuta, sem devDependencies, rodando como usuário não-root — `USER node`).
2.2. Escrever `docker-compose.yml` com `restart: always`.
2.3. Provisionar a VM Oracle Cloud Always Free e seguir os passos do plano já documentado (ordem de execução sugerida, 11 passos, já detalhados no arquivo).
2.4. Configurar DuckDNS + Caddy para HTTPS.
2.5. Confirmar que o `.env` de produção não é commitado (o `.gitignore` já cobre isso — só confirmar no ambiente novo).
2.6. Deploy do dashboard na Vercel (build estático, `npm run build`).

**Aceite da Fase 2**: o bot responde no WhatsApp rodando na VM, sobrevive a um restart do container, e o processo de terminal do notebook não é mais necessário para o sistema funcionar.

---

## Fase 3 — Escala (só se/quando for necessário rodar mais de uma instância)

Não é bloqueante para o volume atual (uma instância aguenta 50–200 msg/dia, inclusive o pico de 200+). Fazer só quando houver necessidade real de múltiplas réplicas do bot.

3.1. Migrar os locks em memória de processo do bot (`webhookController.js:61,74,78`) para Redis (`SETNX` + TTL) — hoje são `Set()` em memória, incompatíveis com mais de uma instância rodando ao mesmo tempo.
3.2. Migrar o cache de eco de mensagens (`registroDeEcos.js`, hoje um arquivo local `.cache/ecos-do-bot.json`) para Redis com TTL nativo.
3.3. O Redis do plano de n8n já existe (usado hoje só para debounce/lock dentro dos workflows) — pode ser reaproveitado pelo bot, ou provisionar uma instância dedicada, a decidir na hora.

**Aceite da Fase 3**: duas instâncias do bot rodando em paralelo não duplicam mensagem nem processam o mesmo pedido duas vezes.

---

## Fase 4 — Validação de carga

Só depois da Fase 2 (deploy real) estar de pé — testar carga contra um processo de terminal não representa o ambiente de produção.

4.1. Simular o pico de Volta às Aulas (200+ mensagens/dia concentradas) contra o ambiente já deployado.
4.2. Prestar atenção especial à chamada síncrona bot→n8n (Agente de Vendas) — hoje mede 12,9–47,6s em produção normal, perto do timeout de 55s; é o componente com maior chance de estourar sob rajada. Se estourar com frequência no teste, considerar tornar esse handoff assíncrono (fire-and-forget + callback, mesmo padrão já usado pelo workflow `Agente Orçamento`) em vez de aumentar o timeout.

**Aceite da Fase 4**: o sistema processa o volume de pico simulado sem taxa de erro anormal nem degradação perceptível de latência para o cliente.

---

## O que NÃO fazer nesta etapa

- Não reativar o túnel ngrok.
- Não fundir a camada de IA (n8n) para dentro do bot — a separação é intencional e correta (bot testável sem mock de LLM).
- Não migrar para Redis (Fase 3) antes de haver necessidade real de múltiplas réplicas — é esforço adiável.
- Não mexer no `stateMachine.js` do bot nem nas RPCs de separação delegada — já são o padrão de referência do projeto, confirmado correto pela auditoria.
