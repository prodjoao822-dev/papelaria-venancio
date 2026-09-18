-- =====================================================================
-- VENÂNCIO — Fase 1 do plano Separador/Entrega (18/09/2026)
-- =====================================================================
-- Contexto: plano faseado do dono pra estruturar separação/entrega
-- (mochila com formulário, ficha impressa a partir do estado real). Fase 0
-- (diagnóstico) achou que `pedidos` já tinha forma_entrega/forma_pagamento/
-- status_pagamento/horario_retirada_desejado, mas:
--   (a) não existia coluna para observações do cliente no pedido (só em
--       orcamentos.observacoes, nunca copiada pro pedido);
--   (b) forma_entrega/horario_retirada_desejado já eram extraídos pelo
--       Agente de Vendas mas podiam ficar em branco (RPC aceitava NULL sem
--       bloquear);
--   (c) forma_pagamento nunca era perguntado/extraído em lugar nenhum.
--
-- Regra do dono pra esta fase: "se o cliente não informar algum campo, o
-- agente pergunta antes de fechar o pedido — nunca deixa em branco."
-- status_pagamento fica de fora dessa trava de propósito — é estado de
-- fluxo confirmado depois pela loja (Fase 3: "pagamento nunca bloqueia o
-- fluxo"), não uma resposta que se extrai da conversa; já nasce 'pendente'
-- por default, sem mudança necessária aqui.
--
-- Decisão de enforcement: a trava de verdade é NA RPC (raise exception),
-- não só no prompt do agente — mesmo padrão de defesa em profundidade já
-- usado neste projeto pros guards do "Agente vendedor" (onError
-- continueRegularOutput, detecção de frase proibida etc.): o prompt pode
-- falhar em perguntar, a RPC não deixa passar de qualquer jeito.
-- =====================================================================

alter table pedidos add column if not exists observacoes text;
comment on column pedidos.observacoes is 'Observação livre do cliente sobre o pedido (ponto de referência, embalagem, pedido especial), capturada no fechamento pelo Agente de Vendas ou preenchida manualmente pela loja.';

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

  -- Idempotência primeiro (sem validar campos obrigatórios de novo se o
  -- pedido já existe — mesmo comportamento de sempre pra chamada repetida).
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

  -- Fase 1 (18/09/2026): forma_entrega, horario_retirada_desejado e
  -- forma_pagamento têm que vir preenchidos — o Agente de Vendas já é
  -- instruído a perguntar antes de fechar, mas a trava de verdade é aqui,
  -- pra nenhum pedido nascer sem essa informação mesmo se o modelo esquecer
  -- de perguntar ou tentar fechar cedo demais. Mensagens de erro citam o
  -- nome exato do parâmetro de propósito: o prompt do agente reconhece essas
  -- palavras pra saber que não é falha técnica e sim "falta perguntar algo".
  if p_forma_entrega is null or btrim(p_forma_entrega) = '' then
    raise exception 'forma_entrega é obrigatória para fechar o pedido';
  end if;

  if p_horario_retirada_desejado is null or btrim(p_horario_retirada_desejado) = '' then
    raise exception 'horario_retirada_desejado é obrigatório para fechar o pedido';
  end if;

  if p_forma_pagamento is null or btrim(p_forma_pagamento) = '' then
    raise exception 'forma_pagamento é obrigatória para fechar o pedido';
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
-- -- Deve LANÇAR EXCEÇÃO (forma_pagamento ausente) num orçamento de teste
-- -- com item e forma_entrega/horario preenchidos:
-- -- select aceitar_orcamento('<orcamento_id de teste>', 'teste', 'retirada', null, 'hoje as 16h');
--
-- select column_name from information_schema.columns
-- where table_name='pedidos' and column_name='observacoes';
-- -- deve retornar 1 linha.
-- =====================================================================
