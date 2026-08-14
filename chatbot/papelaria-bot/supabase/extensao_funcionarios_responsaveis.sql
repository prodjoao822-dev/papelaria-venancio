-- =====================================================================
-- VENÂNCIO — Funcionários (separação/entrega), Responsáveis e Sequência
-- =====================================================================
-- Roda depois de extensao_dashboard.sql (usa set_atualizado_em(),
-- eh_operador_ativo(), eh_admin() e o padrão de RLS já definidos lá).
-- Idempotente: seguro rodar mais de uma vez.
-- =====================================================================

-- A. FUNCIONÁRIOS — cadastro leve, SEM login (distinto de `operadores`,
--    que exige conta no Supabase Auth). São as 3-4 pessoas escolhidas à
--    mão para separação/entrega física.
create table if not exists funcionarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  papeis      text[] not null default '{}',  -- ex: {'separacao'}, {'entrega'}, ou ambos
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_funcionarios_atualizado_em on funcionarios;
create trigger trg_funcionarios_atualizado_em
before update on funcionarios
for each row execute function set_atualizado_em();

create index if not exists idx_funcionarios_ativo on funcionarios (ativo);


-- B. PEDIDOS — responsáveis + sequência ShopControl
alter table pedidos
  add column if not exists responsavel_separacao_id uuid references funcionarios (id) on delete set null,
  add column if not exists responsavel_entrega_id   uuid references funcionarios (id) on delete set null,
  add column if not exists entrega_terceirizada_obs  text,  -- usado quando forma_entrega = 'uber_flash'
  add column if not exists sequencia text,                  -- número gerado no ShopControl
  add column if not exists operacao  text check (operacao in ('550','650')); -- 550=orçamento 650=venda

create index if not exists idx_pedidos_sequencia on pedidos (sequencia) where sequencia is not null;
create index if not exists idx_pedidos_resp_separacao on pedidos (responsavel_separacao_id);
create index if not exists idx_pedidos_resp_entrega on pedidos (responsavel_entrega_id);


-- C. ORÇAMENTOS — mesma sequência, pode ser preenchida antes de virar pedido
alter table orcamentos
  add column if not exists sequencia text,
  add column if not exists operacao  text check (operacao in ('550','650'));


-- D. ITENS_PEDIDO — campos da Ficha de Separação
alter table itens_pedido
  add column if not exists tipo_observacao text
    check (tipo_observacao in ('presente_menina','presente_menino','fragil','a_granel','padrao')),
  add column if not exists observacao text;


-- E. RLS — funcionarios entra no mesmo padrão de acesso das outras tabelas
--    operacionais definido em extensao_dashboard.sql (seção N): operador
--    ativo (via auth.uid()) lê/escreve/atualiza, admin exclui, service_role
--    (o bot) tem acesso total.
alter table funcionarios enable row level security;

drop policy if exists "operadores_leitura" on funcionarios;
create policy "operadores_leitura" on funcionarios
  for select using (eh_operador_ativo());

drop policy if exists "operadores_escrita" on funcionarios;
create policy "operadores_escrita" on funcionarios
  for insert with check (eh_operador_ativo());

drop policy if exists "operadores_atualizacao" on funcionarios;
create policy "operadores_atualizacao" on funcionarios
  for update using (eh_operador_ativo());

drop policy if exists "admin_exclusao" on funcionarios;
create policy "admin_exclusao" on funcionarios
  for delete using (eh_admin());

drop policy if exists "service_role_full_access" on funcionarios;
create policy "service_role_full_access" on funcionarios
  for all using (auth.role() = 'service_role');


-- F. RPC — atribuição de responsável, registrando no histórico do pedido
--    (mantém o princípio de "RPC como caminho auditável", mesmo não sendo
--    uma transição de status_pedido). Insere direto com operador_id (não
--    precisa do padrão insert-depois-update dos wrappers de status porque
--    aqui não passamos pela função central atualizar_status_pedido).
create or replace function atribuir_responsavel_pedido(
  p_pedido_id uuid,
  p_tipo text,              -- 'separacao' ou 'entrega'
  p_funcionario_id uuid,
  p_operador_id uuid
)
returns pedidos as $$
declare
  v_pedido pedidos;
begin
  if p_tipo not in ('separacao', 'entrega') then
    raise exception 'tipo inválido: % (use separacao ou entrega)', p_tipo;
  end if;

  if p_tipo = 'separacao' then
    update pedidos set responsavel_separacao_id = p_funcionario_id where id = p_pedido_id;
  else
    update pedidos set responsavel_entrega_id = p_funcionario_id where id = p_pedido_id;
  end if;

  insert into pedidos_status_historico
    (pedido_id, status_anterior, status_novo, origem, operador_id, observacao)
  select id, status, status, 'atribuicao_responsavel', p_operador_id,
         format('Responsável de %s atribuído', p_tipo)
  from pedidos where id = p_pedido_id;

  select * into v_pedido from pedidos where id = p_pedido_id;
  if not found then
    raise exception 'Pedido % não encontrado', p_pedido_id;
  end if;
  return v_pedido;
end;
$$ language plpgsql;
