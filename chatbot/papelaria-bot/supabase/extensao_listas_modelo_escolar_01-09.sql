-- =====================================================================
-- Listas Modelo — listas de material escolar prontas por escola/ano,
-- extraídas dos 230 PDFs de orçamento em
-- 'ORÇAMENTOS 2026-20260712T201159Z-2-001/ORÇAMENTOS 2026' (01/09/2026).
-- Reaproveita o catálogo real (`produtos`) e a RPC atômica já validada em
-- produção (`aceitar_orcamento`) — ver `criar_pedido_de_lista_modelo` no
-- fim deste arquivo. NÃO são orçamentos de cliente nenhum: são moldes
-- reaproveitáveis (a mesma lista "CEC 3º ano" serve pra qualquer cliente
-- que peça essa lista). "Daniel" (pasta com PDFs por telefone, já
-- individuais por cliente) foi excluída de propósito — não é modelo.
--
-- Os DADOS das 227 listas (5711 itens) estão num arquivo separado,
-- `extensao_listas_modelo_dados_01-09.sql`, exportado direto de produção
-- por um script Node (service role) em vez de transcrito à mão — mesmo
-- espírito do `baseline_producao_26-08-2026.sql`: o arquivo reproduz o
-- que já está rodando. Rode este arquivo (DDL + produto + RPC) primeiro,
-- depois o arquivo de dados.
-- =====================================================================

create table if not exists listas_modelo (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid references escolas(id) on delete set null,
  ano text not null,               -- rótulo livre (ex.: "3° ANO", "GRUPO 3", "1ª SÉRIE ENSINOMÉDIO")
  arquivo_origem text,             -- nome do PDF original, para auditoria/reconferência
  valor_total numeric(10,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_listas_modelo_escola on listas_modelo(escola_id);

create table if not exists listas_modelo_itens (
  id uuid primary key default gen_random_uuid(),
  lista_modelo_id uuid not null references listas_modelo(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  descricao_livre text,            -- nome do produto no momento da importação (rede de segurança se produto_id ficar null)
  quantidade integer not null check (quantidade > 0),
  valor_unitario numeric(10,2) not null
);
create index if not exists idx_listas_modelo_itens_lista on listas_modelo_itens(lista_modelo_id);

alter table listas_modelo enable row level security;
alter table listas_modelo_itens enable row level security;

drop policy if exists "operadores_leitura" on listas_modelo;
create policy "operadores_leitura" on listas_modelo for select to public using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on listas_modelo;
create policy "service_role_full_access" on listas_modelo for all to service_role using (true) with check (true);

drop policy if exists "operadores_leitura" on listas_modelo_itens;
create policy "operadores_leitura" on listas_modelo_itens for select to public using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on listas_modelo_itens;
create policy "service_role_full_access" on listas_modelo_itens for all to service_role using (true) with check (true);


-- Único produto que faltava no catálogo (528 dos 529 códigos já existiam,
-- vindos do seed original de julho): PINCEL CONDOR 456 12, código Shop
-- Control 3540, aparece em 2 listas (PERNALONGA GRUPO3 e GRUPO5).
insert into produtos (id, nome, preco, descricao, sku, categoria_id, estoque, ativo)
values (
  '257efbe4-6960-49f7-85d4-67e99838d8b7',
  'PINCEL CONDOR 456 12',
  6.99,
  'Código original: 3540',
  '3540',
  'e4833600-ee6d-42c0-a662-00f1cbecd277', -- Artes Manuais
  10,
  true
)
on conflict (id) do nothing;


-- =====================================================================
-- RPC: transforma uma lista modelo num pedido de verdade pra um cliente.
-- Zero lógica de negócio nova -- só orquestra o que já existe e está
-- validado em produção: cria um orçamento de rascunho, copia os itens do
-- modelo, e chama aceitar_orcamento() (mesma RPC atômica usada pelo
-- Agente de Vendas) pra virar pedido direto, pronto pra delegar
-- separação. Resolve o operador por auth.uid(), mesmo padrão de
-- segurança já usado no resto do dashboard.
-- =====================================================================
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
  update pedidos set operador_id = v_operador_id where id = v_pedido.id;

  select * into v_pedido from pedidos where id = v_pedido.id;
  return v_pedido;
end;
$$;

revoke execute on function criar_pedido_de_lista_modelo(uuid, uuid, text, text, text) from public;
revoke execute on function criar_pedido_de_lista_modelo(uuid, uuid, text, text, text) from anon;
grant execute on function criar_pedido_de_lista_modelo(uuid, uuid, text, text, text) to authenticated;
