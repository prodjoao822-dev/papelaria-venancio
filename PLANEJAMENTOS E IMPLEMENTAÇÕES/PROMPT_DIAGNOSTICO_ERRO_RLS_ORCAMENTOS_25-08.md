# PROMPT — Diagnóstico do erro RLS em `orcamentos` (reincidente, 25/08/2026)

## Instrução para quem for executar este prompt

Este documento é um **handoff de contexto** para outra sessão do Claude Code retomar
um incidente de produção. **NÃO aplique nenhuma correção ainda.** O objetivo desta
etapa é só **confirmar/entender o que está acontecendo**, usando múltiplos subagentes
especializados (este repo tem agentes dedicados: `dashboard-web`, `n8n-workflows`,
`supabase-db`, `bot-backend` — veja a lista de agentes disponível no seu ambiente) para
investigar cada ponta em paralelo. Só depois de reportar um diagnóstico consolidado
e receber aprovação explícita do usuário (João) é que qualquer fix deve ser aplicado
em produção (banco de dados, workflow n8n ou dashboard).

Contexto importante sobre o projeto: é um sistema em produção real (WhatsApp bot +
agentes de IA no n8n + dashboard React + Supabase), de uma papelaria, rodando durante
a época de "Volta às Aulas" (pico de vendas). Qualquer mudança em RLS/policies/RPCs do
Supabase ou em workflows n8n afeta clientes reais agora. Trate como produção sensível.

---

## 1. O que aconteceu (sintoma relatado pelo usuário)

O usuário reportou que o erro abaixo **voltou a ocorrer** hoje (25/08/2026), depois de
já ter aparecido antes nesta mesma sessão/dia:

```
new row violates row-level security policy for table "orcamentos"
```

Nos logs do JS Bot (`chatbot/papelaria-bot`) enviados pelo usuário, há evidência indireta
de uma falha do Agente de Vendas na conversa `b3562609-9226-43b1-a800-58ce636ab649`
(cliente `5527998489094`, "Papelaria Venâncio Gama" / loja), por volta de **25/08/2026
18:31:13**:

```
[2026-08-25T18:31:13.059Z] [INFO] Pausando bot da conversa b3562609-9226-43b1-a800-58ce636ab649:
Falha técnica no Agente de Vendas — mensagem escalada pro time de vendas.
```

Antes disso, na mesma conversa, houve **3 respostas bem-sucedidas do Agente de Vendas**
em sequência rápida (13-17s cada, dentro do padrão observado no dia) e depois a falha.
Isso é consistente com o agente tentando **criar um novo orçamento** (fluxo de "Fechar
Orçamento" / sub-workflow de Orçamento) e batendo na policy de RLS que foi removida
numa migração aplicada mais cedo nesta mesma sessão (ver seção 3).

Há também, na mesma janela de tempo, uma mensagem *não relacionada* que **não deve ser
confundida com este bug**:
```
[2026-08-25T18:29:16.347Z] [AVISO] Mensagem pro Agente de Vendas ignorada: já há uma
consulta em andamento pra conversa b3562609-9226-43b1-a800-58ce636ab649.
```
Isso é um bug **diferente e já conhecido** (lock de concorrência `conversasComAgenteVendasEmAndamento`
que descarta mensagens simultâneas sem histórico) — **não deve ser corrigido junto**,
está deliberadamente fora do escopo deste diagnóstico (foi decidido tratar em outra
frente, para não conflitar com trabalho paralelo já em andamento). Só cite se for
relevante pra explicar timing dos logs.

## 2. Causa-raiz já identificada (na sessão anterior, ANTES do erro voltar a acontecer)

Nesta mesma sessão de trabalho, mais cedo, foi diagnosticada e **confirmada por leitura
direta do banco** a causa-raiz do erro `new row violates row-level security policy for
table "orcamentos"`: uma migração de segurança aplicada por mim mesmo (assistente),
chamada `b7_fecha_bypass_rls_rpcs_criticas`, **removeu as policies de INSERT/UPDATE**
das tabelas `orcamentos` e `pedidos` (entre outras) para forçar que toda escrita de
status crítico passasse só por RPCs `SECURITY DEFINER`. Isso era o comportamento
desejado para escrita de **status**, mas a migração **não previu** que existem
gravações diretas legítimas (não relacionadas a status) que dependiam dessas mesmas
policies — e essas gravações passaram a falhar com RLS violation.

**Isso ainda NÃO foi corrigido** — o plano de correção foi desenhado, mas a aprovação
final do usuário nunca chegou antes da sessão ser compactada/perdida, e agora o erro
voltou a acontecer em produção real, confirmando que o problema segue ativo.

### 2.1. A migração que causou a regressão (já aplicada em produção)

Nome: `b7_fecha_bypass_rls_rpcs_criticas`. Entre outras coisas, ela fez:

```sql
drop policy if exists "operadores_atualizacao" on public.pedidos;
drop policy if exists "operadores_escrita" on public.pedidos;
drop policy if exists "operadores_atualizacao" on public.orcamentos;
drop policy if exists "operadores_escrita" on public.orcamentos;
drop policy if exists "operadores_atualizacao" on public.pedidos_status_historico;
drop policy if exists "operadores_escrita" on public.pedidos_status_historico;
drop policy if exists "operadores_atualizacao" on public.orcamentos_status_historico;
drop policy if exists "operadores_escrita" on public.orcamentos_status_historico;
drop policy if exists "operadores_atualizacao" on public.eventos;
drop policy if exists "operadores_escrita" on public.eventos;
```

(A migração também tornou várias RPCs `SECURITY DEFINER` com `search_path` fixo, e
criou `assumir_conversa_dashboard`/`liberar_conversa_dashboard` — essa parte está
correta e não deve ser revertida. **O problema é só a remoção das policies de
INSERT/UPDATE em `orcamentos`/`pedidos` sem cobrir os usos legítimos abaixo.**)

### 2.2. Pontos de código que dependiam dessas policies e agora quebram

Confirmados por leitura de código nesta sessão (arquivo já lido na íntegra:
`venancio-ai-ops/src/services/orcamentos.service.js`):

1. **`orcamentosService.criar()`** (linhas 65-97) — faz `INSERT` direto em `orcamentos`
   quando um operador cria um orçamento novo pelo dashboard. **Quebrado** (sem policy
   de INSERT). Chamado por `NovoOrcamentoModal.jsx:64`.

2. **`orcamentosService.atualizar()`** (linhas 133-159) — quando `resto` (campos fora de
   `itens`) não está vazio, faz `UPDATE` direto em `orcamentos`. Na prática, o único
   chamador (`OrcamentosPage.jsx:131`) só passa `{observacoes, itens}`, então na prática
   `resto` é sempre `{observacoes}`. **Quebrado** (sem policy de UPDATE).

3. **`orcamentosService.atualizarSequencia()`** (linhas 216-226) — `UPDATE` direto de
   `sequencia`/`operacao` (campos do "ShopControl") em `orcamentos`. **Quebrado**.

Em `venancio-ai-ops/src/services/pedidos.service.js` (lido nesta sessão, mas não incluído
no contexto atual por tamanho — releia o arquivo se precisar dos trechos exatos):

4. **`pedidosService.criar()`** — depois de criar/aceitar o orçamento, se
   `forma_entrega`/`endereco_entrega` vierem preenchidos, faz `UPDATE` direto em
   `pedidos` (linhas ~216-220 na versão lida). **Quebrado**.

5. **`pedidosService.atualizarSequencia()`** — mesmo padrão do item 3, mas na tabela
   `pedidos` (linhas ~304-311). **Quebrado**.

Além disso, no **n8n**, no workflow `RVwx3aBcDcQBohpg` ("Orçamento (Sub-workflow)"), o
node **"Supabase · Cria Orçamento Novo"** (id `e5e5e5e5-0001-4a00-8000-000000000004`,
tipo `n8n-nodes-base.supabase`) faz um **INSERT direto** na tabela `orcamentos` — esse é
o candidato mais provável para explicar a falha na conversa `b3562609-...` (fluxo do
Agente de Vendas passa por esse sub-workflow ao fechar orçamento). **Este é provavelmente
o node que causou a falha vista nos logs desta vez.**

Confirme se existem outros pontos além destes 6 (5 no dashboard + 1 no n8n) — a
verificação anterior usou grep em `venancio-ai-ops/src` e leitura do workflow n8n, mas
pode não ter sido exaustiva (ex.: outros workflows n8n, edge functions, ou services do
bot que também gravem direto nessas tabelas).

## 3. Plano de correção já desenhado (NÃO aplicado ainda — precisa ser revalidado)

Este plano foi elaborado na sessão anterior e enviado para aprovação do usuário, mas a
aprovação nunca foi confirmada antes do erro voltar a acontecer. **Revalide antes de
aplicar** (o estado do banco/n8n pode ter mudado desde então).

### 3.1. n8n — trocar INSERT direto por chamada à RPC já existente

A RPC `criar_orcamento_com_itens_tx` já existe em produção, é `SECURITY DEFINER`, e
tem essa definição (obtida via `pg_get_functiondef` nesta sessão):

```sql
CREATE OR REPLACE FUNCTION public.criar_orcamento_com_itens_tx(
  p_cliente_id uuid, p_conversa_id uuid, p_tipo tipo_pedido,
  p_escola_id uuid, p_observacoes text, p_itens jsonb
) RETURNS orcamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_orc orcamentos;
begin
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem criar orçamentos por esta via';
  end if;
  insert into orcamentos (cliente_id, conversa_id, tipo, escola_id, observacoes)
  values (p_cliente_id, p_conversa_id, p_tipo, p_escola_id, p_observacoes)
  returning * into v_orc;
  if p_itens is not null and jsonb_array_length(p_itens) > 0 then
    insert into itens_orcamento (orcamento_id, produto_id, descricao_livre, quantidade, valor_unitario)
    select v_orc.id, nullif(item->>'produto_id', '')::uuid, item->>'descricao_livre',
           (item->>'quantidade')::numeric, (item->>'valor_unitario')::numeric
    from jsonb_array_elements(p_itens) as item;
  end if;
  select * into v_orc from orcamentos where id = v_orc.id;
  return v_orc;
end;
$function$
```

Plano: substituir o node "Supabase · Cria Orçamento Novo" por um node `httpRequest`
chamando essa RPC via PostgREST (`POST /rest/v1/rpc/criar_orcamento_com_itens_tx`),
seguindo o padrão já usado no node de referência **"RPC · Aceitar Orçamento"**
(id `da5af887-9572-4e2e-b697-77161da16648`) do mesmo workflow. Depois:
- remover o node antigo "Supabase · Cria Orçamento Novo";
- ajustar o node **"Set · Resultado Criado"** (id `e5e5e5e5-0001-4a00-8000-000000000005`)
  para referenciar o novo node em vez de `$('Supabase · Cria Orçamento Novo')`.

⚠️ Atenção: uma tentativa de aplicar isso via `mcp__n8n__n8n_update_partial_workflow`
foi **bloqueada pelo classificador de permissão automático** na sessão anterior — pode
precisar de aprovação explícita do usuário para cada chamada de escrita no n8n.

⚠️ Atenção 2: há uma regra conhecida deste projeto — **se o usuário tiver o editor do
n8n aberto no navegador, editar via API pode ser sobrescrito/perdido quando ele salvar**.
Pergunte antes de editar se ele está com o workflow aberto.

### 3.2. Dashboard — trocar INSERT direto pela mesma RPC

Em `venancio-ai-ops/src/services/orcamentos.service.js`, função `criar()` (linha 65),
trocar o `.from('orcamentos').insert(...)` por uma chamada
`supabase.rpc('criar_orcamento_com_itens_tx', { p_cliente_id, p_conversa_id, p_tipo,
p_escola_id, p_observacoes, p_itens })`, mapeando os itens para o formato jsonb esperado
pela RPC. Se `campos.status` vier diferente do default (`rascunho`), precisa de um passo
extra depois chamando `atualizar_status_orcamento_dashboard` (mesmo padrão já usado em
`atualizarStatus`/`aceitar` no mesmo arquivo).

### 3.3. Banco — reabrir UPDATE de forma restrita (sem reabrir INSERT nem status)

Aplicar uma nova migração que:
- **Não** recria a policy de INSERT (a criação passa a ser 100% via RPC, tanto no
  dashboard quanto no n8n — não deveria mais precisar de INSERT direto).
- Recria uma policy de **UPDATE** em `orcamentos` e `pedidos`, restrita a
  `eh_operador_ativo()`, **combinada com GRANT em nível de coluna** limitado só aos
  campos descritivos não-status que o código legitimamente edita direto:
  - `orcamentos`: `observacoes`, `sequencia`, `operacao`
  - `pedidos`: `forma_entrega`, `endereco_entrega`, `sequencia`, `operacao`
- **Excluir explicitamente** a coluna `status` (e qualquer outra coluna de auditoria)
  desses GRANTs — toda mudança de status deve continuar possível **só** via RPC.

## 4. O que fazer nesta próxima sessão

1. Usar subagentes em paralelo para **confirmar** (não corrigir ainda):
   - `n8n-workflows`: reler o workflow `RVwx3aBcDcQBohpg`, confirmar se o node
     "Supabase · Cria Orçamento Novo" ainda existe como INSERT direto, e se ele é
     mesmo o node acionado no fluxo que gerou a falha na conversa
     `b3562609-9226-43b1-a800-58ce636ab649` (checar execuções recentes do workflow
     via `mcp__n8n__n8n_executions` perto de 2026-08-25 18:31 UTC-3 / 21:31 UTC).
   - `supabase-db`: confirmar que as policies de INSERT/UPDATE em `orcamentos`/`pedidos`
     continuam ausentes (a migração `b7_fecha_bypass_rls_rpcs_criticas` não foi
     revertida nem corrigida ainda), e levantar se há mais algum ponto no schema/RPCs
     que dependa dessas policies além do que já foi mapeado aqui.
   - `dashboard-web`: confirmar os 5 pontos de código listados na seção 2.2 ainda
     existem como estão descritos (o repo pode ter mudado desde então).
2. Consolidar um diagnóstico único, confirmando (ou corrigindo) o plano da seção 3.
3. **Só depois de reportar o diagnóstico consolidado ao usuário e receber aprovação
   explícita**, aplicar as 3 correções (n8n, dashboard, banco) na ordem: n8n → dashboard
   → banco (ou na ordem que fizer mais sentido depois da confirmação).
4. Depois de aplicar, testar criando um orçamento de ponta a ponta (WhatsApp → Agente
   de Vendas → fechar orçamento) para confirmar que o erro de RLS não ocorre mais, e
   confirmar que nenhum outro fluxo de escrita de status foi reaberto indevidamente.

## 5. Regras não-negociáveis deste projeto (não violar durante a correção)

- `cliente_id`/`conversa_id` nunca podem vir de saída de IA — sempre resolvidos no
  backend/banco.
- Toda escrita de **status** de pedido/orçamento tem que continuar passando por RPC
  atômica — nunca reabrir INSERT/UPDATE direto de `status` a partir do client.
- Identidade do ator (operador) sempre resolvida no servidor via `auth.uid()` /
  `eh_operador_ativo()` — nunca confiar em `operador_id` vindo do client.
- Preferir nodes nativos do n8n (cluster LangChain, etc.) quando existir equivalente,
  mas para chamadas de RPC HTTP direta o padrão do projeto é `httpRequestTool`/
  `httpRequest` com credencial `supabaseApi` gerenciada — não usar chave em texto
  plano em node `Set`.
