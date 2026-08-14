-- =====================================================================
-- VENÂNCIO — Marcas de produto
-- =====================================================================
-- Espelha exatamente o padrão já usado por `categorias` (squemanovo.sql):
-- tabela simples de nomes únicos, resolvida/criada sob demanda pelo
-- serviço (resolverMarcaId, análogo a resolverCategoriaId). RLS no mesmo
-- padrão de `funcionarios` (extensao_funcionarios_responsaveis.sql).
-- Idempotente: seguro rodar mais de uma vez.
-- =====================================================================

create table if not exists marcas (
  id   uuid primary key default gen_random_uuid(),
  nome text not null unique
);

alter table produtos
  add column if not exists marca_id uuid references marcas (id);

create index if not exists idx_produtos_marca on produtos (marca_id);

-- RLS
alter table marcas enable row level security;

drop policy if exists "operadores_leitura" on marcas;
create policy "operadores_leitura" on marcas
  for select using (eh_operador_ativo());

drop policy if exists "operadores_escrita" on marcas;
create policy "operadores_escrita" on marcas
  for insert with check (eh_operador_ativo());

drop policy if exists "operadores_atualizacao" on marcas;
create policy "operadores_atualizacao" on marcas
  for update using (eh_operador_ativo());

drop policy if exists "admin_exclusao" on marcas;
create policy "admin_exclusao" on marcas
  for delete using (eh_admin());

drop policy if exists "service_role_full_access" on marcas;
create policy "service_role_full_access" on marcas
  for all using (auth.role() = 'service_role');
