# Guia de Importação dos Workflows n8n — 2026-07-30

Mudanças feitas para corrigir os achados C2, A3, C1 (lado n8n) e M8 do
`DIAGNOSTICO_VENANCIO.md`. Nenhum JSON foi importado no n8n — isso é ação manual
do dono do projeto, feita a partir deste guia.

## Workflows a reimportar
1. `Orçamento (Sub-workflow).json`
2. `AGENTE_VENDAS.json`

`AGENTE_ORÇAMENTO.JSON` (que na verdade só notifica status por WhatsApp — nome
enganoso, ver achado da tabela de gaps do diagnóstico) **não foi tocado** neste
lote de correções.

## Como importar (vale para os dois arquivos acima)
1. Abrir n8n → Workflows → localizar o workflow existente (mesmo nome).
2. Abrir o workflow → menu de 3 pontos (⋯) → "Import from file".
3. Selecionar o JSON correspondente desta pasta.
4. Confirmar substituição do conteúdo do workflow atual.
5. **Não ativar ainda** — primeiro revisar a seção "Ação manual obrigatória" abaixo
   (credenciais/variáveis de ambiente), senão os novos nós vão falhar na primeira
   execução.

---

## O que mudou — `Orçamento (Sub-workflow).json`

Alterações só na raia 3 ("Fechar Orçamento"). As raias 1 ("Buscar ou Criar") e 2
("Adicionar Item") não foram tocadas.

### Removidos (5 nós — Tarefa C.1, corrige achado C2)
- `Supabase · Marca Orçamento Aceito` (UPDATE orcamentos SET status='aceito')
- `Supabase · Cria Pedido` (INSERT pedidos)
- `Supabase · Busca Itens do Orçamento` (SELECT itens_orcamento)
- `Supabase · Copia Item pro Pedido` (INSERT itens_pedido, uma vez por item)
- `Supabase · Grava Histórico Pedido` (INSERT pedidos_status_historico, `executeOnce`)

Essa sequência de 5 operações separadas, sem transação, reimplementava
manualmente exatamente o que a função SQL `aceitar_orcamento()`
(`chatbot/papelaria-bot/supabase/squemanovo.sql:385-409`) já faz numa única
transação PL/pgSQL atômica. Se qualquer nó falhasse depois do anterior ter
commitado, o orçamento ficava em estado inconsistente (ex.: `aceito` sem pedido).

### Adicionados (Tarefas C.1 e C.2)
- **`Pertence a Esta Conversa? · Fechar`** (nó IF, id `ad1732bf-a3f3-413d-bc6f-b4cfce8edaf1`)
  — corrige achado A3. Compara
  `$('Supabase · Buscar Orçamento · Fechar').item.json.conversa_id` com
  `$('Normaliza Entrada').item.json.conversa_id`. Inserido logo depois de "Tem
  Pelo Menos 1 Item?" (mantendo as validações já existentes de UUID, existência,
  status `rascunho` e presença de itens) e ANTES da chamada de fechamento.
  Mesmo padrão do nó já existente `Pertence a Esta Conversa?` da raia "Adicionar
  Item" (que serviu de referência).
- **`Set · Resultado Outra Conversa · Fechar`** (ramo `false` do nó acima, id
  `f5e17942-7861-4d57-9be6-e427509226ab`) — retorna
  `{ sucesso: false, motivo: "...", error: "orcamento_id não pertence a esta conversa", encerrar: true }`
  e NÃO executa nenhum fechamento. Sem conexão de saída (fim de linha).
- **`RPC · Aceitar Orçamento`** (nó HTTP Request, id
  `da5af887-9572-4e2e-b697-77161da16648`) — substitui os 5 nós removidos. Chama
  `POST {{ $env.SUPABASE_URL }}/rest/v1/rpc/aceitar_orcamento` com body
  `{ p_orcamento_id, p_origem: "agente_vendas_n8n" }`. Retorna a linha de
  `pedidos` criada pela função (id, protocolo, cliente_id, orcamento_id,
  conversa_id, status...).

### Modificado
- **`Set · Resultado Sucesso · Fechar`** — antes lia `pedido_id`/`protocolo` de
  `$('Supabase · Cria Pedido')` (nó removido); agora lê da resposta do novo nó
  `RPC · Aceitar Orçamento`, com uma expressão defensiva
  (`Array.isArray($json) ? $json[0].id : $json.id`) que cobre tanto o PostgREST
  devolver um objeto único quanto um array de 1 elemento para função que
  retorna tipo composto (`returns pedidos`). **Confirmar o formato real da
  resposta após reimportar** (rodar um teste manual) e simplificar a expressão
  se necessário.

### Nós de conexão que precisam ser reverificados após importar
- `Tem Pelo Menos 1 Item?` (ramo `true`) agora aponta para `Pertence a Esta
  Conversa? · Fechar` (antes apontava direto para `Supabase · Marca Orçamento
  Aceito`, removido).
- `Pertence a Esta Conversa? · Fechar` → `true`: `RPC · Aceitar Orçamento`;
  `false`: `Set · Resultado Outra Conversa · Fechar`.
- `RPC · Aceitar Orçamento` → `Set · Resultado Sucesso · Fechar`.
- Validado programaticamente (script Node) que não sobrou nenhuma referência
  de conexão para os 5 nós removidos, e que todo nó de destino existe.

---

## O que mudou — `AGENTE_VENDAS.json`

### Tarefa C.3 — corrige achado C1 (lado n8n)
Problema: o timeout de 12s do JS Bot (`AGENTE_VENDAS_TIMEOUT_MS`,
`n8nClient.js:64-118`) aborta o `fetch` do lado do bot, mas não cancela a
execução n8n — que antes ia direto para o nó do agente de IA (que tem as tool
calls de escrita) mesmo que a conversa já tivesse sido pausada
(`pausarBot`/rede de segurança) ou passada para um humano enquanto a execução
estava em andamento.

Inseridos entre `Marca Início Agente` e `Agente de Vendas`:
- **`Verifica Validade da Conversa`** (nó Supabase, `getAll` em `conversas`,
  filtro `id = {{ $('Prepara Sessão').item.json.conversa_id }}`, id
  `7764c3a7-3778-4ba7-8c90-497d1ce58994`) — lê o estado mais recente de
  `bot_ativo` e `estado_atual`.
- **`Conversa Ainda Ativa?`** (nó IF, id `c6e452a8-3e90-4b7b-9e5e-74ea7b405fee`)
  — `true` quando `bot_ativo === true` E `estado_atual === 'AGENTE_VENDAS_ATIVO'`.
  - `true` → segue normalmente para `Agente de Vendas`.
  - `false` → **`Set · Execução Cancelada (Conversa Inválida)`** (id
    `3e2dd828-7c95-4ad3-b91b-2cc6a63dfbc6`), que grava
    `{ execucao_cancelada: true, motivo: "conversa_pausada_ou_estado_invalido" }`
    **e não tem nenhuma conexão de saída** — a execução termina ali, sem chamar
    `Respond to Webhook` e sem nenhuma tool call de escrita. Isso é intencional:
    o JS Bot já considerou essa chamada perdida (timeout) ou um humano já
    assumiu a conversa, então uma resposta tardia da IA só arriscaria concorrer
    com quem já está atendendo.

Nova sequência: `Marca Início Agente` → `Verifica Validade da Conversa` →
`Conversa Ainda Ativa?` → (`true`) `Agente de Vendas` / (`false`) `Set ·
Execução Cancelada (Conversa Inválida)` [fim de linha].

### Tarefa C.4 — corrige achado M8
Problema: o nó IF `Resposta Válida?` só tinha o ramo `true` conectado
(`main: [[Respond to Webhook]]`, sem segunda entrada de array para o ramo
`false`). Se `output` do agente viesse vazio/null, a execução simplesmente
parava ali, e o JS Bot ficava esperando até estourar o timeout de 12s sem
nenhuma resposta.

- Adicionado **`Fallback Resposta Inválida`** (nó Set, id
  `f4b551ea-3529-4a2c-8e5b-119386fd0584`), conectado ao ramo `false` de
  `Resposta Válida?`, com:
  ```json
  { "resposta": "Desculpe, não consegui processar sua mensagem agora. Estamos verificando o problema.", "encerrar_atendimento_ia": false }
  ```
  Conectado ao mesmo destino do ramo `true`: `Respond to Webhook`.
- **Desvio do plano original, com justificativa:** só conectar o novo nó Set a
  `Respond to Webhook` não seria suficiente — a expressão de `responseBody` do
  nó `Respond to Webhook` lia os campos **sempre** direto de
  `$('Agente de Vendas').first().json.output`, ignorando o item de entrada. Ou
  seja, mesmo no ramo de fallback, a resposta continuaria vazia. Para o fallback
  realmente chegar ao cliente, a expressão de `Respond to Webhook` foi ajustada
  para preferir `$json.resposta` / `$json.encerrar_atendimento_ia` quando
  presentes (caso do fallback) e só cair no cálculo antigo baseado em
  `$('Agente de Vendas')` / `$('Fechar Orçamento')` quando ausentes (ramo
  `true`, fluxo normal):
  ```
  "resposta": $json.resposta !== undefined ? $json.resposta : $('Agente de Vendas').first().json.output,
  "encerrar_atendimento_ia": $json.encerrar_atendimento_ia !== undefined ? $json.encerrar_atendimento_ia : ($('Fechar Orçamento').isExecuted && $('Fechar Orçamento').first().json.sucesso === true)
  ```
  `_debug_tempo_agente_ms` não precisou de ajuste — `Marca Fim Agente` roda
  antes de `Resposta Válida?` nos dois ramos (o novo ramo `false` de `Conversa
  Ainda Ativa?`, da Tarefa C.3, é um fim de linha separado que nem chega a
  `Marca Fim Agente`/`Resposta Válida?`).

### Nós de conexão que precisam ser reverificados após importar
- `Marca Início Agente` → `Verifica Validade da Conversa` (antes → `Agente de
  Vendas` direto).
- `Verifica Validade da Conversa` → `Conversa Ainda Ativa?`.
- `Conversa Ainda Ativa?` → `true`: `Agente de Vendas`; `false`: `Set ·
  Execução Cancelada (Conversa Inválida)` (sem saída).
- `Resposta Válida?` → `true`: `Respond to Webhook` (igual antes); `false`
  (novo): `Fallback Resposta Inválida`.
- `Fallback Resposta Inválida` → `Respond to Webhook`.
- Validado programaticamente que não sobrou nenhuma referência de conexão
  quebrada e que todo nó citado em `connections` existe em `nodes`.

---

## Ação manual obrigatória — Credenciais

### 1. Header Auth dos webhooks (Correção 6, achado A4 — pré-existente, não criado por este lote)
Os dois webhooks de produção (`Webhook · Agente Vendas` neste arquivo e
`Webhook · Status Atualizado` em `AGENTE_ORÇAMENTO.JSON`) já declaram
`authentication: headerAuth` mas com `credentials.httpHeaderAuth.id` vazio.
Isso não foi alterado neste lote (fora de escopo), mas continua pendente:
1. Criar uma credential "Header Auth" no n8n para cada webhook (nome de header
   sugerido: `x-n8n-webhook-token`).
2. Vincular a credential ao respectivo nó Webhook.
3. Configurar o mesmo valor de token em `N8N_VENDAS_WEBHOOK_TOKEN` (JS Bot) e no
   equivalente do dashboard.

### 2. RPC `aceitar_orcamento` (novo, desta correção — Tarefa C.1)
O nó `RPC · Aceitar Orçamento` (em `Orçamento (Sub-workflow).json`) está
configurado com `authentication: "genericCredentialType"` /
`genericAuthType: "httpHeaderAuth"`, mas **sem nenhuma credencial vinculada no
export** (não existe credencial "Header Auth" para chamadas de saída ao
Supabase REST neste projeto n8n até o momento). Duas opções ao importar:
- **Opção A (recomendada, mais simples):** no n8n, trocar o campo
  `Authentication` do nó para `None` e usar só os headers já preenchidos em
  `Header Parameters` (`apikey`, `Authorization: Bearer {{ $env.SUPABASE_ANON_KEY }}`,
  `Content-Type`, `Prefer: return=representation`) — eles já carregam a
  autenticação via `$env`, sem precisar de uma credential separada do n8n.
- **Opção B:** criar uma credential "Header Auth" no n8n (header `apikey`,
  valor = a mesma anon/service key) e vincular ao nó, mantendo
  `genericCredentialType`.

Se a tabela `orcamentos`/`pedidos` tiver RLS que bloqueie a `anon key`, use uma
**service role key** em vez da anon key nesse nó especificamente (a função
`aceitar_orcamento` já roda como `SECURITY DEFINER` ou não — conferir
`squemanovo.sql:385` — se não for `SECURITY DEFINER`, a key usada precisa ter
permissão de INSERT/UPDATE nas tabelas envolvidas).

---

## Variáveis de ambiente necessárias (n8n)
- `SUPABASE_URL` — usado pelo novo nó `RPC · Aceitar Orçamento` (URL base do
  projeto Supabase, ex.: `https://xxxx.supabase.co`).
- `SUPABASE_ANON_KEY` (ou uma service role key, ver acima) — usado no mesmo
  nó, nos headers `apikey` e `Authorization`.
- Variáveis já existentes e não afetadas por este lote: credenciais nativas
  `Supabase account` (`IlPIhLKj72bLR8RD`), `Redis account`, `openrouter_cloudfy`,
  `evolution_cloudfy`.

Confirmar no n8n (Settings → Variables, ou nas variáveis de ambiente do
processo/container) que `SUPABASE_URL` e `SUPABASE_ANON_KEY` (ou o nome que o
dono do projeto usar) estão definidas e acessíveis a expressões `$env` — em
instâncias self-hosted isso depende de `N8N_BLOCK_ENV_ACCESS_IN_NODE` não estar
setado como bloqueio total.

---

## Checklist pós-importação
- [ ] Ativar os dois workflows no n8n (se estavam ativos antes de importar)
- [ ] Confirmar/criar `SUPABASE_URL` e `SUPABASE_ANON_KEY` (ou service role)
      como variáveis de ambiente do n8n
- [ ] Resolver a credencial do nó `RPC · Aceitar Orçamento` (Opção A ou B acima)
- [ ] Fazer teste manual de uma conversa completa: abrir orçamento → adicionar
      item → fechar (confirmar que 1 único nó RPC roda em vez dos 5 antigos, e
      que o pedido/itens/histórico aparecem corretamente no banco)
- [ ] Testar o caso de erro: tentar fechar um `orcamento_id` de uma conversa
      diferente da atual e confirmar que cai no ramo `Pertence a Esta
      Conversa? · Fechar` → `false` (não cria pedido)
- [ ] Testar o caso de conversa pausada: marcar `conversas.bot_ativo = false`
      manualmente para uma conversa em `AGENTE_VENDAS_ATIVO` e disparar uma
      mensagem nela — confirmar que a execução para em `Set · Execução
      Cancelada (Conversa Inválida)` sem gravar nada
      novo em `orcamentos`/`itens_orcamento`/`pedidos`
- [ ] Testar o caso de resposta vazia do agente (difícil de forçar
      deliberadamente — validar ao menos que o ramo `false` de `Resposta
      Válida?` está conectado e que `Respond to Webhook` consegue rodar a
      partir dele sem erro de expressão)
- [ ] Verificar logs do n8n por 10 min após reimportação, olhando
      especificamente por erros nos novos nós (`Verifica Validade da
      Conversa`, `Conversa Ainda Ativa?`, `RPC · Aceitar Orçamento`, `Pertence
      a Esta Conversa? · Fechar`, `Fallback Resposta Inválida`)
