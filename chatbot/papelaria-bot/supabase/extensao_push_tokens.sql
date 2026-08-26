-- =====================================================================
-- VENÂNCIO — Fechamento do problema P20 / RF-08 (tarefa T3.3 do plano de
-- execução de 26/08/2026)
-- =====================================================================
-- NÃO APLICADO EM PRODUÇÃO AINDA por este agente — ver "NOTA DE EXECUÇÃO"
-- no final do arquivo. A sessão que escreveu este arquivo só tinha
-- `mcp__supabase__list_tables` disponível (somente leitura de metadados);
-- `execute_sql` / `apply_migration` / `execute_mutation` não estavam na
-- lista de ferramentas desta sessão, apesar do briefing da tarefa dizer
-- que estariam liberados. Mesma limitação já registrada em
-- `extensao_seguranca_b0_orcamentos.sql` (15/08) e
-- `extensao_p5_orcamento_ativo_correto.sql` (26/08).
--
-- Confirmado por `mcp__supabase__list_tables` (verbose, 26/08/2026, 38
-- tabelas no schema `public`) que `push_tokens` NÃO existe em produção, e
-- por `grep` em todo `chatbot/papelaria-bot/supabase/*.sql` (incluindo
-- `baseline_producao_26-08-2026.sql`, o retrato completo de produção
-- gerado hoje) que nem a tabela nem `registrar_push_token` existem em
-- nenhum lugar versionado. `notificacoes_internas.push_enviado` já existe
-- (confirmado no mesmo `list_tables`) e continua sem nenhum escritor —
-- isso é esperado, o disparador (n8n) é uma tarefa futura, não autorizada
-- ainda, e este arquivo não mexe nela.
--
-- ── O PROBLEMA (P20) ────────────────────────────────────────────────
-- RF-08 (push) não existe do lado do banco: sem tabela para guardar o
-- token Expo de cada funcionário, sem RPC de registro. Sem isso, o app
-- não tem onde gravar o token, e o futuro disparador não tem para quem
-- mandar. Este arquivo cobre só a fundação de banco — nem o disparador
-- n8n, nem o lado do app (`expo-notifications`), são desta tarefa.
--
-- ── A LIÇÃO DE SEGURANÇA DO DIA (B0/B1, reforçada em T1.1 hoje) ───────
-- `atualizar_status_pedido`/`atualizar_status_orcamento` foram corrigidas
-- hoje (T1.1) porque aceitavam o id do ator vindo do client em vez de
-- resolver por identidade de sessão. A RPC abaixo nasce já correta:
-- `registrar_push_token` NUNCA aceita `funcionario_id` como parâmetro —
-- o dono do token é sempre resolvido por `funcionario_atual_id()` (que
-- por sua vez resolve por `auth.uid()`), e se não houver funcionário
-- logado a função lança exceção. Não existe caminho de `service_role`
-- que precise chamar esta RPC (quem lê como `service_role` é o futuro
-- disparador do n8n, e ele só precisa de SELECT, nunca de INSERT em nome
-- de outro funcionário) — por isso o portão aqui é só
-- `funcionario_atual_id() is not null`, sem exceção adicional para
-- `service_role`, diferente do padrão de `atualizar_status_pedido`.
--
-- ── DECISÃO DE DESIGN: chave única multi-dispositivo ──────────────────
-- O contrato pedia para decidir entre (a) 1 token por funcionário
-- (substitui a cada login) ou (b) múltiplos dispositivos por
-- funcionário. Escolhido (b): `unique (funcionario_id, expo_push_token)`.
-- Motivo de negócio: Separador/Entregador da loja pode logar em mais de
-- um aparelho físico (ex.: celular pessoal + tablet da loja), e o
-- disparador de push deve alcançar todos, não só o último. Se fosse (a),
-- logar num segundo aparelho apagaria silenciosamente a notificação do
-- primeiro. O upsert é feito pelo par (funcionario_id, expo_push_token):
-- logar de novo no MESMO aparelho (mesmo token Expo) atualiza a
-- plataforma/timestamp em vez de duplicar a linha; logar num aparelho
-- novo (token novo) insere uma segunda linha, sem afetar a primeira.
-- =====================================================================


-- =====================================================================
-- A. TABELA push_tokens
-- =====================================================================
create table if not exists push_tokens (
  id                uuid primary key default gen_random_uuid(),
  funcionario_id    uuid not null references funcionarios (id) on delete cascade,
  expo_push_token   text not null,
  plataforma        text not null check (plataforma in ('ios', 'android')),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),

  constraint uq_push_tokens_funcionario_token unique (funcionario_id, expo_push_token)
);

-- Índice de FK (§6 do Guia Mestre: toda FK precisa de índice). A unique
-- constraint acima já cria um índice composto (funcionario_id,
-- expo_push_token), que cobre buscas por funcionario_id sozinho também
-- (é o primeiro campo da chave composta) — não precisa de índice extra.

drop trigger if exists trg_push_tokens_atualizado_em on push_tokens;
create trigger trg_push_tokens_atualizado_em
before update on push_tokens
for each row execute function set_atualizado_em();


-- =====================================================================
-- B. RPC registrar_push_token — única porta de escrita (mesmo padrão de
--    extensao_separacao_delegada.sql / extensao_entrega_ocorrencia.sql:
--    SECURITY DEFINER + ator sempre resolvido por funcionario_atual_id(),
--    nunca por parâmetro)
-- =====================================================================

-- returns push_tokens (não void) para o app poder confirmar o id/estado
-- gravado sem precisar de um segundo round-trip.
create or replace function registrar_push_token(
  p_expo_push_token text,
  p_plataforma text
)
returns push_tokens as $$
declare
  v_funcionario_id uuid;
  v_token push_tokens;
begin
  v_funcionario_id := funcionario_atual_id();
  if v_funcionario_id is null then
    raise exception 'Apenas um funcionário autenticado pode registrar token de push';
  end if;

  if p_plataforma not in ('ios', 'android') then
    raise exception 'plataforma inválida: % (use ios ou android)', p_plataforma;
  end if;

  if p_expo_push_token is null or length(trim(p_expo_push_token)) = 0 then
    raise exception 'expo_push_token não pode ser vazio';
  end if;

  insert into push_tokens (funcionario_id, expo_push_token, plataforma)
  values (v_funcionario_id, p_expo_push_token, p_plataforma)
  on conflict (funcionario_id, expo_push_token)
  do update set
    plataforma = excluded.plataforma,
    atualizado_em = now()
  returning * into v_token;

  return v_token;
end;
$$ language plpgsql security definer set search_path = public;

-- Sem GRANT/REVOKE explícito de propósito, mesmo padrão de
-- `delegar_separacao`/`assumir_entrega` etc.: o Postgres concede EXECUTE
-- a `public` por padrão na criação, e isso é seguro aqui porque o portão
-- de identidade é interno (`funcionario_atual_id() is null` -> exceção).
-- `anon` chamando isto recebe exceção, nunca escreve.


-- =====================================================================
-- C. RLS — dono only. Nenhuma policy para `anon`. `service_role` precisa
--    de leitura total (o futuro disparador de push no n8n roda como
--    service_role e precisa achar o token de qualquer funcionário).
-- =====================================================================

alter table push_tokens enable row level security;

drop policy if exists "dono_select_push_tokens" on push_tokens;
create policy "dono_select_push_tokens" on push_tokens
  for select using (funcionario_id = funcionario_atual_id());

drop policy if exists "dono_insert_push_tokens" on push_tokens;
create policy "dono_insert_push_tokens" on push_tokens
  for insert with check (funcionario_id = funcionario_atual_id());

drop policy if exists "dono_update_push_tokens" on push_tokens;
create policy "dono_update_push_tokens" on push_tokens
  for update using (funcionario_id = funcionario_atual_id())
  with check (funcionario_id = funcionario_atual_id());

drop policy if exists "dono_delete_push_tokens" on push_tokens;
create policy "dono_delete_push_tokens" on push_tokens
  for delete using (funcionario_id = funcionario_atual_id());

drop policy if exists "service_role_full_access" on push_tokens;
create policy "service_role_full_access" on push_tokens
  for all using (auth.role() = 'service_role');

-- Nota: a escrita "real" do app sempre passa pela RPC `registrar_push_token`
-- (SECURITY DEFINER, bypassa RLS), então a policy de INSERT/UPDATE acima é
-- uma segunda camada de defesa (ex.: se algum dia alguém tentar escrever
-- direto na tabela via PostgREST) e não o caminho principal — mesma lógica
-- de "porta única de escrita" já documentada nas RPCs de separação/entrega.


-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar, sob identidade simulada — mesmo
-- método usado em `extensao_notificacao_entregador.sql`/T3.1 de hoje:
-- `set role authenticated` + `set request.jwt.claims`)
-- =====================================================================
-- IMPORTANTE: `funcionarios.auth_user_id` tem FK para `auth.users`
-- (`funcionarios_auth_user_id_fkey`). NÃO dá para inventar um funcionário
-- de teste com um `auth_user_id` fabricado — violaria a FK, e criar um
-- usuário real em `auth.users` por SQL puro (sem a Admin API do GoTrue)
-- não é seguro nem simples. Por isso, ao contrário de outros testes deste
-- projeto que criam uma linha de negócio efêmera, aqui use DOIS
-- FUNCIONÁRIOS REAIS já existentes (com `auth_user_id` já preenchido) e
-- limpe só as linhas de `push_tokens` ao final — nunca apague o
-- funcionário em si, é dado de produção.
--
-- 1) Achar dois funcionários reais com login vinculado:
--
--   select id, codigo_funcionario, auth_user_id from funcionarios
--   where auth_user_id is not null order by criado_em limit 2;
--   -- chame o primeiro de <FUNC_A>/<AUTH_A> e o segundo de <FUNC_B>/<AUTH_B>.
--
-- 2) Simular o funcionário A registrando um token de teste:
--
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<AUTH_A>","role":"authenticated"}';
--   select registrar_push_token('ExponentPushToken[teste-t3-3]', 'android');
--   select registrar_push_token('ExponentPushToken[teste-t3-3]', 'ios'); -- upsert: mesma linha, plataforma vira ios
--   select count(*) from push_tokens
--     where funcionario_id = '<FUNC_A>' and expo_push_token = 'ExponentPushToken[teste-t3-3]'; -- deve ser 1 (não duplicou)
--
-- 3) Simular o funcionário B tentando ler o token de A (deve falhar por RLS):
--
--   set request.jwt.claims = '{"sub":"<AUTH_B>","role":"authenticated"}';
--   select count(*) from push_tokens
--     where funcionario_id = '<FUNC_A>' and expo_push_token = 'ExponentPushToken[teste-t3-3]'; -- deve ser 0
--   reset role;
--
-- 4) `anon` não enxerga nada (sem policy pra anon):
--
--   set role anon;
--   select count(*) from push_tokens
--     where expo_push_token = 'ExponentPushToken[teste-t3-3]'; -- deve ser 0
--   reset role;
--
-- 5) `service_role` enxerga tudo (é o que o futuro disparador do n8n precisa):
--
--   set role service_role;
--   select count(*) from push_tokens
--     where expo_push_token = 'ExponentPushToken[teste-t3-3]'; -- deve ser 1
--   reset role;
--
-- 6) Limpar o dado de teste (NUNCA deixar isso em produção — não apague
--    o funcionário, só a linha de push_tokens criada no passo 2):
--
--   delete from push_tokens where expo_push_token = 'ExponentPushToken[teste-t3-3]';
-- =====================================================================


-- =====================================================================
-- NOTA DE EXECUÇÃO — PENDENTE. Ainda não aplicado em produção nem
-- validado com consulta real (ver cabeçalho: sem `execute_sql` /
-- `apply_migration` / `execute_mutation` disponíveis nesta sessão).
-- Aplicar via `mcp__supabase__apply_migration` ou pelo SQL Editor do
-- Supabase, rodar o roteiro de VALIDAÇÃO acima (passos 1-6) sob
-- identidade simulada, confirmar os resultados esperados, apagar o dado
-- de teste (passo 6), e só então marcar esta tarefa como concluída.
-- Depois de aplicar, registre a
-- migração em `supabase_migrations.schema_migrations` se o SQL Editor
-- tiver sido usado diretamente (ver `supabase/README.md`, Caminho B).
-- =====================================================================
