-- Estrutura pronta pra receber a tabela de taxa de entrega por bairro (dados
-- virão depois do dono do projeto) + trava de valor mínimo pra entrega
-- própria (R$100) na RPC de fechamento -- decisão de negócio de 20/08/2026:
-- entrega própria só a partir de R$100 (taxa varia por bairro, tabela futura);
-- moto/uber (uber_flash) não tem taxa da loja e fica disponível em qualquer
-- valor, já que quem paga a corrida é o cliente direto no app.
--
-- Aplicado em produção via mcp__supabase__apply_migration (nome
-- "taxa_entrega_bairro_e_minimo_entrega_propria") em 20/08/2026.

create table if not exists taxas_entrega_bairro (
  id uuid primary key default gen_random_uuid(),
  bairro text not null unique,
  taxa numeric not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table taxas_entrega_bairro is
  'Taxa de entrega própria por bairro. Vazia até o dono do projeto enviar os valores -- só estrutura por enquanto (20/08/2026). Não se aplica a uber_flash (sem taxa da loja).';

alter table taxas_entrega_bairro enable row level security;

create policy "operadores leem taxas_entrega_bairro"
  on taxas_entrega_bairro for select
  to authenticated
  using (eh_operador_ativo());

revoke all on taxas_entrega_bairro from anon, public;
grant select on taxas_entrega_bairro to authenticated, service_role;

-- aceitar_orcamento: mesma assinatura de extensao_horario_retirada_pedido.sql,
-- só adiciona a trava de R$100 pra entrega_propria antes de criar o pedido.
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

  if p_forma_entrega = 'entrega_propria' and v_valor_total < 100 then
    raise exception 'Entrega própria só disponível a partir de R$100 (pedido atual: R$%). Ofereça retirada ou moto/uber.', v_valor_total;
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
