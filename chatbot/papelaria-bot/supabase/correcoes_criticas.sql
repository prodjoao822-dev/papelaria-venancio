-- =============================================================================
-- CORREÇÕES CRÍTICAS — 2026-07-30
-- Aplicar no Supabase NA SEGUINTE ORDEM:
--   1. squemanovo.sql (se ainda não rodado)
--   2. extensao_cadastro_fiscal.sql
--   3. extensao_dashboard.sql
--   4. correcoes_criticas.sql  ← este arquivo
-- Idempotente: pode ser reaplicado sem dano.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- C4 — versão canônica e definitiva de atualizar_status_orcamento
-- Permite rascunho→aceito (necessário para fechamento direto pelo JS Bot).
-- B3 (auditoria 07/08/2026) — adicionado 'security definer set search_path = public':
-- o n8n chama a RPC "aceitar_orcamento" via PostgREST autenticado com
-- SUPABASE_ANON_KEY (não com a service key), mas todas as tabelas envolvidas
-- (orcamentos, orcamentos_status_historico, pedidos, itens_pedido,
-- pedidos_status_historico) têm RLS restrito a service_role — a chamada do n8n
-- sempre falhava por permissão. security definer faz a função (e o que ela
-- chama, como atualizar_status_orcamento) executar com o privilégio do dono
-- da função, contornando a RLS só para esta transição de estado controlada;
-- search_path fixo evita hijacking de schema. O JS Bot, que já usa a service
-- key diretamente, não é afetado.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function atualizar_status_orcamento(
  p_orcamento_id uuid,
  p_novo_status  status_orcamento,
  p_origem       text
)
returns orcamentos as $$
declare
  v_orc    orcamentos;
  v_atual  status_orcamento;
  v_ok     boolean;
begin
  select * into v_orc from orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento % não encontrado', p_orcamento_id;
  end if;

  v_atual := v_orc.status;
  v_ok := case v_atual
    when 'rascunho' then p_novo_status in ('enviado', 'recusado', 'aceito')
    when 'enviado'  then p_novo_status in ('aceito', 'recusado', 'expirado')
    else false
  end;

  if not v_ok then
    raise exception 'Transição de orçamento inválida: % -> %', v_atual, p_novo_status;
  end if;

  update orcamentos set status = p_novo_status where id = p_orcamento_id;

  insert into orcamentos_status_historico
    (orcamento_id, status_anterior, status_novo, origem)
  values
    (p_orcamento_id, v_atual, p_novo_status, p_origem);

  select * into v_orc from orcamentos where id = p_orcamento_id;
  return v_orc;
end;
$$ language plpgsql
security definer set search_path = public;


-- ─────────────────────────────────────────────────────────────────────────────
-- C3 + A1 (idempotência DB) — aceitar_orcamento com checagem de itens
-- e guard contra duplicata (segunda chamada retorna pedido existente sem erro).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function aceitar_orcamento(
  p_orcamento_id uuid,
  p_origem       text
)
returns pedidos as $$
declare
  v_pedido      pedidos;
  v_item_count  integer;
begin
  -- Idempotência: pedido já existe → retorná-lo sem tentar recriar
  select * into v_pedido from pedidos where orcamento_id = p_orcamento_id;
  if found then
    return v_pedido;
  end if;

  -- Guardar contra orçamento sem itens (C3)
  select count(*) into v_item_count
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  if v_item_count = 0 then
    raise exception 'Orçamento % não pode ser aceito: nenhum item encontrado', p_orcamento_id;
  end if;

  -- Transição de status (usa a versão correta definida acima)
  perform atualizar_status_orcamento(p_orcamento_id, 'aceito', p_origem);

  -- Criar pedido
  insert into pedidos (cliente_id, orcamento_id, conversa_id)
  select cliente_id, id, conversa_id
  from orcamentos
  where id = p_orcamento_id
  returning * into v_pedido;

  -- Copiar itens
  insert into itens_pedido
    (pedido_id, produto_id, descricao_livre, quantidade, valor_unitario)
  select
    v_pedido.id, produto_id, descricao_livre, quantidade, valor_unitario
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  -- Histórico inicial
  insert into pedidos_status_historico
    (pedido_id, status_anterior, status_novo, origem)
  values
    (v_pedido.id, null, 'confirmado', p_origem);

  return v_pedido;
end;
$$ language plpgsql
security definer set search_path = public;


-- ─────────────────────────────────────────────────────────────────────────────
-- M2 — criar orçamento + itens em transação atômica (JS Bot usa esta função)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function criar_orcamento_com_itens_tx(
  p_cliente_id  uuid,
  p_conversa_id uuid,
  p_tipo        tipo_pedido,
  p_escola_id   uuid,
  p_observacoes text,
  p_itens       jsonb
  -- Formato p_itens: [{"produto_id": null|uuid, "descricao_livre": "...",
  --                    "quantidade": 1, "valor_unitario": 9.90}, ...]
)
returns orcamentos as $$
declare
  v_orc orcamentos;
begin
  insert into orcamentos
    (cliente_id, conversa_id, tipo, escola_id, observacoes)
  values
    (p_cliente_id, p_conversa_id, p_tipo, p_escola_id, p_observacoes)
  returning * into v_orc;

  if p_itens is not null and jsonb_array_length(p_itens) > 0 then
    insert into itens_orcamento
      (orcamento_id, produto_id, descricao_livre, quantidade, valor_unitario)
    select
      v_orc.id,
      nullif(item->>'produto_id', '')::uuid,
      item->>'descricao_livre',
      (item->>'quantidade')::numeric,
      (item->>'valor_unitario')::numeric
    from jsonb_array_elements(p_itens) as item;
  end if;

  select * into v_orc from orcamentos where id = v_orc.id;
  return v_orc;
end;
$$ language plpgsql
-- Hoje só o JS Bot chama esta função, e ele usa a service key, que já ignora a
-- RLS — então funcionaria sem 'security definer'. Está aqui pelo mesmo motivo
-- do B3 acima: no dia em que o n8n (ou o dashboard) precisar criar um orçamento
-- com a anon key, ele falharia por permissão exatamente como falhou o
-- "aceitar_orcamento", e o sintoma é difícil de ligar à causa.
security definer set search_path = public;
