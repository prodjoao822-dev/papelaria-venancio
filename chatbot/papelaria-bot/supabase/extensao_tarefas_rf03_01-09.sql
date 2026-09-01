-- =====================================================================
-- VENÂNCIO — RF-03 (Tarefas agendadas), decisão D3 do dono em 31/08/2026
-- =====================================================================
-- NÃO APLICADO EM PRODUÇÃO por este agente — ver "NOTA DE EXECUÇÃO" no
-- final do arquivo. Esta sessão só tinha `mcp__supabase__list_tables`
-- disponível (somente leitura de metadados); `apply_migration`/
-- `execute_mutation`/`execute_sql` não estavam na lista de ferramentas.
-- Mesma limitação já registrada em `extensao_seguranca_b0_orcamentos.sql`
-- (15/08), `extensao_p5_orcamento_ativo_correto.sql` (26/08) e
-- `extensao_listas_modelo_escolar_01-09.sql`/`extensao_push_tokens.sql`
-- (01/09 e antes).
--
-- Confirmado ausente em produção por `mcp__supabase__list_tables` (verbose,
-- 41 tabelas no schema `public` em 01/09/2026) — nem `tarefas` nem nenhuma
-- RPC com esse nome existiam antes deste arquivo. Ver `PLANO_MESTRE_
-- IMPLEMENTACAO.md` (Seção 4, Fase 6) e `AUDITORIA_FINALIZACAO_25-08-2026.md`
-- (P/RF-03, decisão D3): "Tarefas internas com prazo e responsável" nunca
-- saiu do papel.
--
-- ── ESCOPO DESTA MIGRAÇÃO ─────────────────────────────────────────────
-- Só a fundação de banco: tabela + 3 RPCs (criar/concluir/reatribuir).
-- NÃO inclui o job de `notificacoes_internas` tipo `tarefa_agendada_
-- vencendo` — o enum já prevê esse tipo (ver `extensao_separacao_
-- delegada.sql`, tabela `notificacoes_internas`, coluna `tipo`) mas
-- continua placeholder morto de propósito; é passo futuro, fora de
-- escopo aqui (decisão explícita do dono ao aprovar esta tarefa).
--
-- ── MODELO DE ATORES (mesma separação já existente no projeto) ────────
-- `responsavel_id` aponta pra `funcionarios` (Separador/Entregador, login
-- código+PIN) — é quem EXECUTA a tarefa. `criado_por` aponta pra
-- `operadores` (login e-mail/senha, painel web) — é quem ATRIBUI a
-- tarefa. As telas 21-26 do bundle de design são do perfil Operador
-- (Fase 6 do Plano Mestre), então criar/reatribuir é ação de operador;
-- concluir pode ser feito pelo operador OU pelo próprio responsável
-- (mesmo padrão dual de `notificacoes_internas`/`enviar_mensagem_
-- separacao` em `extensao_separacao_delegada.sql`).
--
-- ── LIÇÃO DE SEGURANÇA APLICADA (B0/B1 do Plano Mestre) ────────────────
-- Nenhuma das 3 RPCs abaixo aceita o id do ator como parâmetro. O
-- operador é sempre `auth.uid()` (checado via `eh_operador_ativo()`); o
-- funcionário responsável é sempre `funcionario_atual_id()`. Comparações
-- usam `is distinct from`/`is not true`, nunca `<>`/`=` direto, pra não
-- abrir bypass silencioso quando o ator não é encontrado (mesma regra
-- documentada em `extensao_separacao_delegada.sql`).
-- =====================================================================


-- =====================================================================
-- A. TABELA tarefas
-- =====================================================================
create table if not exists tarefas (
  id                uuid primary key default gen_random_uuid(),
  pedido_id         uuid references pedidos(id) on delete set null,
  responsavel_id    uuid not null references funcionarios(id) on delete restrict,
  descricao         text not null check (length(trim(descricao)) > 0),
  data_execucao     timestamptz not null,
  status            text not null default 'pendente' check (status in ('pendente', 'concluida')),
  criado_por        uuid not null references operadores(id) on delete restrict,
  concluido_em      timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

comment on table tarefas is 'RF-03: tarefas internas com prazo e responsável, atribuídas por um operador (painel web) a um funcionário (separador/entregador). Fundação de banco apenas -- sem job de notificação automática ainda (ver cabeçalho do arquivo que criou esta tabela).';
comment on column tarefas.pedido_id is 'Pedido ao qual a tarefa se refere, se houver. NULL para tarefas internas gerais (ex.: "organizar prateleira de canetas") não amarradas a um pedido específico.';
comment on column tarefas.responsavel_id is 'Funcionário (separador/entregador, tabela funcionarios) que deve executar a tarefa -- não é o operador que a criou.';
comment on column tarefas.data_execucao is 'Data/hora prevista para execução (prazo). timestamptz, não date: é o campo que um job futuro (ainda não implementado) vai comparar contra now() para gerar notificacoes_internas do tipo tarefa_agendada_vencendo.';
comment on column tarefas.criado_por is 'Operador (painel web, tabela operadores) que criou/atribuiu a tarefa.';
comment on column tarefas.concluido_em is 'Preenchido só quando status vira concluida. NULL enquanto pendente.';

-- Índices de FK (§6 do Guia Mestre) + índice composto pro caso de uso
-- mais comum da tela do Operador: "tarefas pendentes ordenadas por prazo".
create index if not exists idx_tarefas_pedido on tarefas(pedido_id);
create index if not exists idx_tarefas_responsavel on tarefas(responsavel_id);
create index if not exists idx_tarefas_criado_por on tarefas(criado_por);
create index if not exists idx_tarefas_status_data_execucao on tarefas(status, data_execucao);

drop trigger if exists trg_tarefas_atualizado_em on tarefas;
create trigger trg_tarefas_atualizado_em
before update on tarefas
for each row execute function set_atualizado_em();


-- =====================================================================
-- B. RPCs — única porta de escrita "de negócio" (a RLS abaixo é só a
--    segunda camada de defesa, mesmo padrão de push_tokens/separação)
-- =====================================================================

-- B1. Criar tarefa (só operador)
create or replace function criar_tarefa(
  p_responsavel_id uuid,
  p_descricao text,
  p_data_execucao timestamptz,
  p_pedido_id uuid default null
)
returns tarefas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operador_id uuid;
  v_tarefa tarefas;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem criar tarefas';
  end if;
  v_operador_id := auth.uid();

  if p_descricao is null or length(trim(p_descricao)) = 0 then
    raise exception 'descricao não pode ser vazia';
  end if;

  if p_data_execucao is null then
    raise exception 'data_execucao é obrigatória';
  end if;

  if not exists (select 1 from funcionarios where id = p_responsavel_id and ativo) then
    raise exception 'Funcionário % não encontrado ou inativo', p_responsavel_id;
  end if;

  if p_pedido_id is not null and not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'Pedido % não encontrado', p_pedido_id;
  end if;

  insert into tarefas (pedido_id, responsavel_id, descricao, data_execucao, criado_por)
  values (p_pedido_id, p_responsavel_id, trim(p_descricao), p_data_execucao, v_operador_id)
  returning * into v_tarefa;

  return v_tarefa;
end;
$$;

revoke execute on function criar_tarefa(uuid, text, timestamptz, uuid) from public, anon;
grant execute on function criar_tarefa(uuid, text, timestamptz, uuid) to authenticated;


-- B2. Concluir tarefa (operador OU o próprio funcionário responsável)
create or replace function concluir_tarefa(p_tarefa_id uuid)
returns tarefas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tarefa tarefas;
  v_func_id uuid;
begin
  select * into v_tarefa from tarefas where id = p_tarefa_id;
  if not found then
    raise exception 'Tarefa % não encontrada', p_tarefa_id;
  end if;

  v_func_id := funcionario_atual_id();

  if eh_operador_ativo() is not true
     and (v_func_id is null or v_func_id is distinct from v_tarefa.responsavel_id) then
    raise exception 'Apenas um operador ativo ou o funcionário responsável pode concluir esta tarefa';
  end if;

  if v_tarefa.status = 'concluida' then
    return v_tarefa; -- idempotente: concluir de novo não é erro
  end if;

  update tarefas
  set status = 'concluida', concluido_em = now()
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$$;

revoke execute on function concluir_tarefa(uuid) from public, anon;
grant execute on function concluir_tarefa(uuid) to authenticated;


-- B3. Reatribuir tarefa (só operador)
create or replace function reatribuir_tarefa(
  p_tarefa_id uuid,
  p_novo_responsavel_id uuid
)
returns tarefas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tarefa tarefas;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem reatribuir tarefas';
  end if;

  if not exists (select 1 from tarefas where id = p_tarefa_id) then
    raise exception 'Tarefa % não encontrada', p_tarefa_id;
  end if;

  if not exists (select 1 from funcionarios where id = p_novo_responsavel_id and ativo) then
    raise exception 'Funcionário % não encontrado ou inativo', p_novo_responsavel_id;
  end if;

  update tarefas
  set responsavel_id = p_novo_responsavel_id
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$$;

revoke execute on function reatribuir_tarefa(uuid, uuid) from public, anon;
grant execute on function reatribuir_tarefa(uuid, uuid) to authenticated;


-- =====================================================================
-- C. RLS — mesmo padrão do loop de tabelas-núcleo em extensao_dashboard.sql
--    (operadores leem/escrevem, admin exclui, service_role acesso total),
--    acrescido de leitura/conclusão pelo próprio funcionário responsável.
-- =====================================================================

alter table tarefas enable row level security;

drop policy if exists "leitura_operador_ou_responsavel" on tarefas;
create policy "leitura_operador_ou_responsavel" on tarefas
  for select using (eh_operador_ativo() or responsavel_id = funcionario_atual_id());

drop policy if exists "operadores_escrita" on tarefas;
create policy "operadores_escrita" on tarefas
  for insert with check (eh_operador_ativo());

drop policy if exists "atualizacao_operador_ou_responsavel" on tarefas;
create policy "atualizacao_operador_ou_responsavel" on tarefas
  for update using (eh_operador_ativo() or responsavel_id = funcionario_atual_id());

drop policy if exists "admin_exclusao" on tarefas;
create policy "admin_exclusao" on tarefas
  for delete using (eh_admin());

drop policy if exists "service_role_full_access" on tarefas;
create policy "service_role_full_access" on tarefas
  for all using (auth.role() = 'service_role');


-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select count(*) from information_schema.tables where table_schema='public' and table_name='tarefas'; -- 1
-- select count(*) from pg_policies where tablename = 'tarefas'; -- 5
-- select proname from pg_proc where proname in ('criar_tarefa','concluir_tarefa','reatribuir_tarefa'); -- 3 linhas
-- =====================================================================


-- =====================================================================
-- NOTA DE EXECUÇÃO — FECHAMENTO (01/09/2026, mesma sessão, com
-- `apply_migration`/`execute_sql` de verdade): aplicado em produção via
-- `mcp__supabase__apply_migration` (nome `extensao_tarefas_rf03_01_09`).
-- As 3 queries de VALIDAÇÃO acima rodaram ao vivo e bateram exatamente
-- com o esperado: 1 tabela, 5 policies, 3 RPCs.
-- =====================================================================
