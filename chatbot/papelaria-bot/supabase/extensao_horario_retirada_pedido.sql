-- Persiste forma de entrega/retirada e horário desejado pelo cliente,
-- capturados pela IA (Agente vendedor) no fechamento do orçamento -- hoje só
-- existiam via edição manual do operador no dashboard (pedidos.service.js).
-- Ver PROMPT-02 (planejamento 20/06) + validação real em produção 20/08/2026.
--
-- Aplicado em produção via mcp__supabase__apply_migration (nome
-- "horario_retirada_desejado_pedido") em 20/08/2026.

alter table pedidos
  add column if not exists horario_retirada_desejado text;

comment on column pedidos.horario_retirada_desejado is
  'Horário/prazo que o cliente pediu para retirar ou receber, em texto livre como o cliente disse (ex: "hoje às 15h", "amanhã de manhã") -- captado pela IA no fechamento. Não é timestamp resolvido: evita a IA inferir a data errada a partir de linguagem natural ambígua.';

-- Assinatura antiga (uuid, text) é substituída pela nova (com 3 parâmetros
-- opcionais adicionais) -- não dá pra usar CREATE OR REPLACE direto porque
-- muda a assinatura; sem o DROP, as duas coexistiriam e qualquer chamada com
-- exatamente 2 argumentos (aceitar_orcamento_dashboard, PostgREST do n8n
-- antigo) ficaria ambígua entre as duas.
drop function if exists aceitar_orcamento(uuid, text);

create or replace function aceitar_orcamento(
  p_orcamento_id uuid,
  p_origem text,
  p_forma_entrega text default null,
  p_endereco_entrega text default null,
  p_horario_retirada_desejado text default null
)
returns pedidos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido      pedidos;
  v_item_count  integer;
begin
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem aceitar um orçamento';
  end if;

  select * into v_pedido from pedidos where orcamento_id = p_orcamento_id;
  if found then
    return v_pedido;
  end if;

  select count(*) into v_item_count
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  if v_item_count = 0 then
    raise exception 'Orçamento % não pode ser aceito: nenhum item encontrado', p_orcamento_id;
  end if;

  perform atualizar_status_orcamento(p_orcamento_id, 'aceito', p_origem);

  insert into pedidos (cliente_id, orcamento_id, conversa_id, forma_entrega, endereco_entrega, horario_retirada_desejado)
  select cliente_id, id, conversa_id, p_forma_entrega, p_endereco_entrega, p_horario_retirada_desejado
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

-- Mesma política de segurança de extensao_seguranca_b0_orcamentos.sql:
-- authenticated (dashboard) e service_role (n8n) podem chamar, anon/public não.
revoke execute on function aceitar_orcamento(uuid, text, text, text, text) from anon, public;
grant execute on function aceitar_orcamento(uuid, text, text, text, text) to authenticated, service_role;
