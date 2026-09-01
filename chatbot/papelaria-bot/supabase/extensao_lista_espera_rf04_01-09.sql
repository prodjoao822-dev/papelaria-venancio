-- =====================================================================
-- VENÂNCIO — RF-04 (Lista de espera de produto), decisão D3 do dono em
-- 31/08/2026
-- =====================================================================
-- NÃO APLICADO EM PRODUÇÃO por este agente — ver "NOTA DE EXECUÇÃO" no
-- final do arquivo. Esta sessão só tinha `mcp__supabase__list_tables`
-- disponível (somente leitura de metadados); `apply_migration`/
-- `execute_mutation`/`execute_sql` não estavam na lista de ferramentas.
-- Mesma limitação já registrada em `extensao_seguranca_b0_orcamentos.sql`
-- (15/08) e `extensao_listas_modelo_escolar_01-09.sql`/`extensao_push_
-- tokens.sql` (01/09 e antes).
--
-- Confirmado ausente em produção por `mcp__supabase__list_tables` (verbose,
-- 41 tabelas no schema `public` em 01/09/2026). Ver `PLANO_MESTRE_
-- IMPLEMENTACAO.md` (Seção 4, Fase 6) e `AUDITORIA_FINALIZACAO_25-08-2026.md`
-- (RF-04): "cliente pede algo que não temos e é avisado quando chegar" --
-- tabela nunca existiu; `consultas_operacionais`/`consultas_demanda` já
-- capturam a DEMANDA (o bot registra quando não encontra um produto), mas
-- não existia onde guardar "quem quer ser avisado quando X chegar" nem
-- como marcar que já avisamos. Este arquivo fecha só essa lacuna.
--
-- ── ESCOPO E NÃO-ESCOPO (confirmado com o dono) ────────────────────────
-- 3 RPCs: registrar interesse, listar interessados por produto, marcar
-- cliente como notificado. NENHUM disparo automático de notificação --
-- "notificação é sempre manual nesta fase" (mesma frase da Seção 9 do
-- documento de requisitos e do prompt desta tarefa). O operador vê a
-- lista no painel/app (telas 21-26 do bundle de design, perfil Operador,
-- Fase 6 do Plano Mestre), avisa o cliente por fora (WhatsApp/telefone) e
-- só então marca como notificado -- não é o Agente de Vendas nem nenhum
-- job que decide isso.
--
-- ── QUEM ESCREVE ────────────────────────────────────────────────────────
-- Só operador (painel web). Diferente de `push_tokens`, aqui não há um
-- "dono" funcionário resolvendo por `auth.uid()` -- é o operador que
-- registra o interesse de um CLIENTE (que não tem login no sistema), da
-- mesma forma que já faz em `criar_pedido_de_lista_modelo`
-- (`extensao_listas_modelo_escolar_01-09.sql`). Todas as 3 RPCs checam
-- `eh_operador_ativo()` e nunca aceitam o id do operador como parâmetro.
-- =====================================================================


-- =====================================================================
-- A. TABELA lista_espera
-- =====================================================================
create table if not exists lista_espera (
  id                    uuid primary key default gen_random_uuid(),
  produto_id            uuid not null references produtos(id) on delete cascade,
  cliente_id            uuid not null references clientes(id) on delete cascade,
  quantidade_desejada   integer not null default 1 check (quantidade_desejada > 0),
  observacao            text,
  status                text not null default 'aguardando' check (status in ('aguardando', 'notificado')),
  criado_por            uuid not null references operadores(id) on delete restrict,
  notificado_por        uuid references operadores(id) on delete set null,
  notificado_em         timestamptz,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

comment on table lista_espera is 'RF-04: interesse de um cliente em um produto fora de estoque. Notificação ao cliente é sempre manual (operador avisa por fora e só então marca como notificado) -- sem disparo automático nesta fase.';
comment on column lista_espera.quantidade_desejada is 'Quantidade que o cliente quer, para o operador saber se a reposição que chegou é suficiente.';
comment on column lista_espera.criado_por is 'Operador que registrou o interesse do cliente (o cliente não tem login no sistema).';
comment on column lista_espera.notificado_por is 'Operador que marcou o registro como notificado -- não necessariamente o mesmo que criou.';

-- Evita duplicar pedido de interesse em aberto do mesmo cliente pro mesmo
-- produto (índice único PARCIAL -- só entre os registros 'aguardando'; se
-- o cliente já foi notificado antes e o produto faltou de novo, um novo
-- registro 'aguardando' é permitido, preservando o histórico do anterior).
create unique index if not exists uq_lista_espera_aguardando
  on lista_espera(produto_id, cliente_id)
  where status = 'aguardando';

-- Índices de FK (§6 do Guia Mestre) + índice pro caso de uso mais comum
-- ("listar interessados por produto").
create index if not exists idx_lista_espera_produto on lista_espera(produto_id);
create index if not exists idx_lista_espera_cliente on lista_espera(cliente_id);
create index if not exists idx_lista_espera_criado_por on lista_espera(criado_por);
create index if not exists idx_lista_espera_status on lista_espera(status);

drop trigger if exists trg_lista_espera_atualizado_em on lista_espera;
create trigger trg_lista_espera_atualizado_em
before update on lista_espera
for each row execute function set_atualizado_em();


-- =====================================================================
-- B. RPCs — única porta de escrita "de negócio" (a RLS abaixo é só a
--    segunda camada de defesa, mesmo padrão de push_tokens/separação)
-- =====================================================================

-- B1. Registrar interesse do cliente. Idempotente: se já existe um
-- registro 'aguardando' do mesmo cliente pro mesmo produto, atualiza
-- quantidade/observação em vez de duplicar (usa o índice único parcial
-- acima via ON CONFLICT).
create or replace function registrar_interesse_lista_espera(
  p_produto_id uuid,
  p_cliente_id uuid,
  p_quantidade_desejada integer default 1,
  p_observacao text default null
)
returns lista_espera
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador_id uuid;
  v_registro lista_espera;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem registrar interesse na lista de espera';
  end if;
  v_operador_id := auth.uid();

  if not exists (select 1 from produtos where id = p_produto_id) then
    raise exception 'Produto % não encontrado', p_produto_id;
  end if;

  if not exists (select 1 from clientes where id = p_cliente_id) then
    raise exception 'Cliente % não encontrado', p_cliente_id;
  end if;

  if coalesce(p_quantidade_desejada, 1) <= 0 then
    raise exception 'quantidade_desejada deve ser maior que zero';
  end if;

  insert into lista_espera (produto_id, cliente_id, quantidade_desejada, observacao, criado_por)
  values (p_produto_id, p_cliente_id, coalesce(p_quantidade_desejada, 1), p_observacao, v_operador_id)
  on conflict (produto_id, cliente_id) where (status = 'aguardando')
  do update set
    quantidade_desejada = excluded.quantidade_desejada,
    observacao = coalesce(excluded.observacao, lista_espera.observacao),
    atualizado_em = now()
  returning * into v_registro;

  return v_registro;
end;
$$;

revoke execute on function registrar_interesse_lista_espera(uuid, uuid, integer, text) from public, anon;
grant execute on function registrar_interesse_lista_espera(uuid, uuid, integer, text) to authenticated;


-- B2. Listar interessados de um produto, já com nome/telefone do cliente
-- (o dashboard precisa disso pra avisar por fora -- WhatsApp/telefone).
-- Por padrão só os em aberto ('aguardando'); p_incluir_notificados=true
-- traz o histórico completo.
create or replace function listar_interessados_produto(
  p_produto_id uuid,
  p_incluir_notificados boolean default false
)
returns table (
  id uuid,
  cliente_id uuid,
  cliente_nome text,
  cliente_telefone text,
  quantidade_desejada integer,
  observacao text,
  status text,
  criado_em timestamptz,
  notificado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem consultar a lista de espera';
  end if;

  return query
  select
    le.id, le.cliente_id, c.nome, c.telefone,
    le.quantidade_desejada, le.observacao, le.status,
    le.criado_em, le.notificado_em
  from lista_espera le
  join clientes c on c.id = le.cliente_id
  where le.produto_id = p_produto_id
    and (p_incluir_notificados or le.status = 'aguardando')
  order by le.criado_em asc;
end;
$$;

revoke execute on function listar_interessados_produto(uuid, boolean) from public, anon;
grant execute on function listar_interessados_produto(uuid, boolean) to authenticated;


-- B3. Marcar cliente como notificado (sempre uma ação manual do operador,
-- depois de avisar o cliente por fora -- WhatsApp/telefone).
create or replace function marcar_cliente_notificado(p_lista_espera_id uuid)
returns lista_espera
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador_id uuid;
  v_registro lista_espera;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem marcar cliente como notificado';
  end if;
  v_operador_id := auth.uid();

  if not exists (select 1 from lista_espera where id = p_lista_espera_id) then
    raise exception 'Registro % não encontrado na lista de espera', p_lista_espera_id;
  end if;

  update lista_espera
  set status = 'notificado', notificado_em = now(), notificado_por = v_operador_id
  where id = p_lista_espera_id
  returning * into v_registro;

  return v_registro;
end;
$$;

revoke execute on function marcar_cliente_notificado(uuid) from public, anon;
grant execute on function marcar_cliente_notificado(uuid) to authenticated;


-- =====================================================================
-- C. RLS — mesmo padrão do loop de tabelas-núcleo em extensao_dashboard.sql
--    (operadores leem/escrevem, admin exclui, service_role acesso total).
--    Sem policy pra `anon`; sem papel de funcionário aqui (é tabela
--    operador-cliente, não tem "dono" funcionário como push_tokens).
-- =====================================================================

alter table lista_espera enable row level security;

drop policy if exists "operadores_leitura" on lista_espera;
create policy "operadores_leitura" on lista_espera
  for select using (eh_operador_ativo());

drop policy if exists "operadores_escrita" on lista_espera;
create policy "operadores_escrita" on lista_espera
  for insert with check (eh_operador_ativo());

drop policy if exists "operadores_atualizacao" on lista_espera;
create policy "operadores_atualizacao" on lista_espera
  for update using (eh_operador_ativo());

drop policy if exists "admin_exclusao" on lista_espera;
create policy "admin_exclusao" on lista_espera
  for delete using (eh_admin());

drop policy if exists "service_role_full_access" on lista_espera;
create policy "service_role_full_access" on lista_espera
  for all using (auth.role() = 'service_role');


-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select count(*) from information_schema.tables where table_schema='public' and table_name='lista_espera'; -- 1
-- select count(*) from pg_policies where tablename = 'lista_espera'; -- 5
-- select proname from pg_proc where proname in ('registrar_interesse_lista_espera','listar_interessados_produto','marcar_cliente_notificado'); -- 3 linhas
-- select indexname from pg_indexes where tablename = 'lista_espera'; -- inclui uq_lista_espera_aguardando (parcial)
-- =====================================================================


-- =====================================================================
-- NOTA DE EXECUÇÃO — FECHAMENTO (01/09/2026, mesma sessão, com
-- `apply_migration`/`execute_sql` de verdade): aplicado em produção via
-- `mcp__supabase__apply_migration` (nome `extensao_lista_espera_rf04_01_09`).
-- As 4 queries de VALIDAÇÃO acima rodaram ao vivo e bateram exatamente
-- com o esperado: 1 tabela, 5 policies, 3 RPCs, índice único parcial
-- `uq_lista_espera_aguardando` presente.
-- =====================================================================
