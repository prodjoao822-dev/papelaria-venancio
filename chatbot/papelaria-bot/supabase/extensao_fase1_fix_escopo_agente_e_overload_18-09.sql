-- =====================================================================
-- VENÂNCIO — Fix da Fase 1 (mesmo dia, 18/09/2026): overload órfão +
-- trava quebrando o fluxo manual do dashboard
-- =====================================================================
-- Dois problemas achados ao revisar a migração anterior
-- (extensao_fase1_campos_obrigatorios_fechamento_18-09.sql) antes de dar
-- a Fase 1 por concluída:
--
-- 1. `create or replace function aceitar_orcamento(...)` com uma
--    assinatura DIFERENTE (7 parâmetros em vez de 5) não substitui a
--    função antiga — Postgres identifica função por nome+assinatura, então
--    ficaram DUAS versões (5 e 7 parâmetros) coexistindo no banco. Uma
--    chamada com poucos argumentos posicionais podia resolver pra
--    qualquer uma das duas dependendo de como o PostgREST/Postgres
--    escolhe o overload — estado ambíguo e frágil. Corrigido com
--    `drop function` explícito da assinatura antiga antes do
--    `create or replace`.
--
-- 2. A trava de campos obrigatórios (forma_entrega/horario_retirada_
--    desejado/forma_pagamento) quebrava `aceitar_orcamento_dashboard`
--    (usado pelo painel venancio-ai-ops pra venda de balcão/telefone, ver
--    `venancio-ai-ops/src/services/orcamentos.service.js` função
--    `aceitar`) — esse caminho chama `aceitar_orcamento` só com
--    orcamento_id + origem, nunca passou esses 3 campos. A regra do dono
--    ("nunca deixa em branco") foi dada no contexto específico do Agente
--    de Vendas fechando pedido pela conversa (Fase 0/1 inteiras são sobre
--    esse fluxo) — o fluxo manual do operador no dashboard não tem UI pra
--    esses 3 campos e está fora do escopo desta fase. Corrigido escopando
--    a trava com `if p_origem = 'agente_vendas_n8n' then ...`.
--
-- Validado ao vivo com transação de teste + rollback (sem sujar
-- produção): 1 overload confirmado (era 2 antes do fix); chamada estilo
-- dashboard (`origem = 'dashboard:...'`) cria pedido normalmente com os 3
-- campos null, exatamente como antes desta fase; chamada estilo agente
-- (`origem = 'agente_vendas_n8n'`) continua exigindo os 3 campos.
-- =====================================================================

-- Conteúdo real já aplicado ao vivo nesta sessão — replicado aqui por
-- completude do arquivo versionado. Ver a migração anterior
-- (extensao_fase1_campos_obrigatorios_fechamento_18-09.sql) para o
-- histórico completo da função antes deste fix.

drop function if exists public.aceitar_orcamento(uuid, text, text, text, text);

create or replace function public.aceitar_orcamento(
  p_orcamento_id uuid,
  p_origem text,
  p_forma_entrega text default null,
  p_endereco_entrega text default null,
  p_horario_retirada_desejado text default null,
  p_forma_pagamento text default null,
  p_observacoes text default null
)
returns pedidos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido      pedidos;
  v_item_count  integer;
  v_valor_total numeric;
begin
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem aceitar um orçamento';
  end if;

  select * into v_pedido from pedidos where orcamento_id = p_orcamento_id;
  if found then
    return v_pedido;
  end if;

  select count(*), coalesce(sum(valor_total), 0)
    into v_item_count, v_valor_total
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  if v_item_count = 0 then
    raise exception 'Orçamento % não pode ser aceito: nenhum item encontrado', p_orcamento_id;
  end if;

  if p_origem = 'agente_vendas_n8n' then
    if p_forma_entrega is null or btrim(p_forma_entrega) = '' then
      raise exception 'forma_entrega é obrigatória para fechar o pedido';
    end if;

    if p_horario_retirada_desejado is null or btrim(p_horario_retirada_desejado) = '' then
      raise exception 'horario_retirada_desejado é obrigatório para fechar o pedido';
    end if;

    if p_forma_pagamento is null or btrim(p_forma_pagamento) = '' then
      raise exception 'forma_pagamento é obrigatória para fechar o pedido';
    end if;
  end if;

  if p_forma_entrega = 'entrega_propria' and v_valor_total < 100 then
    raise exception 'Entrega própria só disponível a partir de R$100 (pedido atual: R$%). Ofereça retirada ou moto/uber.', v_valor_total;
  end if;

  perform atualizar_status_orcamento(p_orcamento_id, 'aceito', p_origem);

  insert into pedidos (
    cliente_id, orcamento_id, conversa_id, forma_entrega, endereco_entrega,
    horario_retirada_desejado, forma_pagamento, observacoes
  )
  select
    cliente_id, id, conversa_id, p_forma_entrega, p_endereco_entrega,
    p_horario_retirada_desejado, p_forma_pagamento,
    nullif(btrim(coalesce(p_observacoes, '')), '')
  from orcamentos
  where id = p_orcamento_id
  returning * into v_pedido;

  insert into itens_pedido
    (pedido_id, produto_id, descricao_livre, quantidade, valor_unitario)
  select
    v_pedido.id, produto_id, descricao_livre, quantidade, valor_unitario
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  insert into pedidos_status_historico
    (pedido_id, status_anterior, status_novo, origem)
  values
    (v_pedido.id, null, 'confirmado', p_origem);

  return v_pedido;
end;
$function$;

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select count(*) from pg_proc where proname = 'aceitar_orcamento';
-- -- deve ser 1.
-- =====================================================================
