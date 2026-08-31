-- =====================================================================
-- Corrige um gap de rastreabilidade achado em teste real (01/09/2026):
-- criar_pedido_de_lista_modelo() cria o orçamento como tipo='venda_geral'
-- genérico e nunca guarda de qual lista_modelo ele veio -- depois de
-- criado, o pedido não tem como mostrar "isso é da lista do CEC" em
-- lugar nenhum do dashboard (achado do dono: "não estou vendo o nome
-- pra eu saber que essa lista é do CEC").
--
-- Fix: coluna aditiva em pedidos + RPC passa a preenchê-la. Vai direto em
-- `pedidos` (não em `orcamentos`) pelo mesmo motivo de forma_entrega/
-- horario_retirada_desejado (extensao_horario_retirada_pedido.sql): é
-- onde o dashboard já lê pra exibir, sem precisar de join extra.
-- =====================================================================

alter table pedidos
  add column if not exists lista_modelo_id uuid references listas_modelo(id) on delete set null;

comment on column pedidos.lista_modelo_id is
  'Preenchido só quando o pedido nasceu de uma Listas Modelo (dashboard, "Criar Pedido" em 1 clique) -- null pro fluxo normal via WhatsApp/Agente de Vendas ou balcão manual. Permite ao dashboard mostrar de qual escola/ano veio.';

create index if not exists idx_pedidos_lista_modelo on pedidos(lista_modelo_id) where lista_modelo_id is not null;

-- Mesma assinatura de criar_pedido_de_lista_modelo (extensao_listas_modelo_
-- escolar_01-09.sql) -- create or replace é suficiente, sem trocar tipos.
create or replace function criar_pedido_de_lista_modelo(
  p_lista_modelo_id uuid,
  p_cliente_id uuid,
  p_forma_entrega text default 'retirada',
  p_endereco_entrega text default null,
  p_horario_retirada_desejado text default null
) returns pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador_id uuid;
  v_orcamento_id uuid;
  v_pedido pedidos;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem criar pedido a partir de uma lista modelo';
  end if;
  v_operador_id := auth.uid();

  if not exists (select 1 from listas_modelo where id = p_lista_modelo_id and ativo = true) then
    raise exception 'Lista modelo % não encontrada ou inativa', p_lista_modelo_id;
  end if;

  insert into orcamentos (cliente_id, tipo, status)
  values (p_cliente_id, 'venda_geral', 'rascunho')
  returning id into v_orcamento_id;

  insert into itens_orcamento (orcamento_id, produto_id, descricao_livre, quantidade, valor_unitario)
  select v_orcamento_id, produto_id, descricao_livre, quantidade, valor_unitario
  from listas_modelo_itens
  where lista_modelo_id = p_lista_modelo_id;

  v_pedido := aceitar_orcamento(
    v_orcamento_id,
    'dashboard:' || v_operador_id::text || ':lista_modelo',
    p_forma_entrega,
    p_endereco_entrega,
    p_horario_retirada_desejado
  );

  update pedidos_status_historico set operador_id = v_operador_id
  where id = (
    select id from pedidos_status_historico
    where pedido_id = v_pedido.id
    order by criado_em desc limit 1
  );
  -- lista_modelo_id junto com operador_id no mesmo UPDATE que já existia
  -- (era só operador_id antes desta migração).
  update pedidos set operador_id = v_operador_id, lista_modelo_id = p_lista_modelo_id where id = v_pedido.id;

  select * into v_pedido from pedidos where id = v_pedido.id;
  return v_pedido;
end;
$$;

revoke execute on function criar_pedido_de_lista_modelo(uuid, uuid, text, text, text) from public;
revoke execute on function criar_pedido_de_lista_modelo(uuid, uuid, text, text, text) from anon;
grant execute on function criar_pedido_de_lista_modelo(uuid, uuid, text, text, text) to authenticated;
