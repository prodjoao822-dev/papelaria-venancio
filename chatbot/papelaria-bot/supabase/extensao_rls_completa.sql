-- =====================================================================
-- VENÂNCIO — Dump completo de RLS de produção (Bloqueador B6)
-- =====================================================================
-- Gerado em 15/08/2026 por consulta direta ao Postgres de produção
-- (projeto esvduqgqiypcpgxhunsd), via mcp__supabase__execute_mutation
-- (agente de banco). NÃO é uma migração nova — é o retrato exato do que
-- já está em produção: 34 tabelas do schema public com
-- `row_level_security` habilitada e 135 policies, capturadas de
-- `pg_class.relrowsecurity` e `pg_policies` (schemaname='public').
--
-- Antes deste arquivo, o repositório só cobria 9 tabelas com policy (34
-- policies), enquanto produção tinha 34 tabelas / 135 policies — as
-- ~101 policies restantes (incluindo `clientes`, `mensagens`,
-- `conversas`, `pedidos`, `orcamentos` — todo o PII e conteúdo de
-- WhatsApp) existiam só em produção, aplicadas fora de controle de
-- versão (provavelmente pelo painel do Supabase). Ver Bloqueador B6 em
-- `PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_MESTRE_IMPLEMENTACAO.md`.
--
-- ── REGRA A PARTIR DE AGORA ──────────────────────────────────────────
-- Todo DDL (tabela, coluna, índice, policy, RPC) passa por arquivo .sql
-- versionado neste diretório ANTES ou JUNTO de ser aplicado em produção.
-- O painel do Supabase (SQL Editor) é ferramenta de EXECUÇÃO, nunca a
-- única fonte do que foi feito. Se a intenção original era rodar algo
-- pelo painel, o arquivo correspondente tem que ser criado/commitado no
-- mesmo momento — nunca depois, de memória.
--
-- ── ESTE ARQUIVO NÃO FOI (E NÃO DEVE SER) APLICADO ──────────────────
-- Todo o conteúdo abaixo já existe em produção. Rodá-lo de novo é
-- inócuo (ENABLE ROW LEVEL SECURITY é idempotente; CREATE POLICY sem
-- OR REPLACE falharia com "already exists" se a policy já existir —
-- por isso NÃO rode isto num banco que já tem essas policies). Serve
-- para: (a) reconstruir um banco do zero de forma idêntica à produção,
-- e (b) ser a referência versionada para revisar/auditar policies daqui
-- pra frente.
--
-- ── Observações do dump ──────────────────────────────────────────────
-- - Nenhuma tabela está com FORCE ROW LEVEL SECURITY (relforcerowsecurity
--   = false em todas as 34) — dono/superuser sempre bypassa RLS, como
--   esperado (é assim que `service_role`/`postgres` funcionam no projeto).
-- - Todas as policies são PERMISSIVE (nenhuma RESTRICTIVE).
-- - O padrão dominante (28 das 34 tabelas) é 5 policies idênticas em
--   forma: admin_exclusao (DELETE, eh_admin()), operadores_atualizacao
--   (UPDATE, eh_operador_ativo()), operadores_escrita (INSERT, with
--   check eh_operador_ativo()), operadores_leitura (SELECT,
--   eh_operador_ativo()), service_role_full_access (ALL, auth.role() =
--   'service_role'). As funções eh_admin()/eh_operador_ativo()/
--   funcionario_atual_id() já estão definidas em arquivos anteriores
--   deste diretório (extensao_separacao_delegada.sql e correlatos) —
--   este arquivo não as redefine.
-- - Tabelas com desenho de RLS diferente do padrão, todas já com boa
--   razão de negócio: `funcionarios` (separador lê a si mesmo por
--   auth_user_id), `operadores` (cada um lê a si mesmo ou é admin),
--   `notificacoes_internas` (leitura roteada por destinatário
--   operador/separador), `orcamentos_status_historico` e
--   `pedidos_status_historico` (roles restritos a `authenticated`, não
--   `public`), `solicitacoes_separacao`/`..._itens`/`..._mensagens`
--   (leitura por operador ativo OU pelo separador dono da solicitação).
--   `empresa`, `escolas`, `followups`, `materiais_lista_escolar`,
--   `memorias` só têm `service_role_full_access` — sem acesso de
--   dashboard/app hoje (nenhuma policy de operador/leitura pública).
-- =====================================================================


-- =====================================================================
-- 1. ENABLE ROW LEVEL SECURITY — 34 tabelas
-- =====================================================================

alter table public.alertas_demanda enable row level security;
alter table public.categorias enable row level security;
alter table public.clientes enable row level security;
alter table public.config_alerta_demanda enable row level security;
alter table public.configuracoes enable row level security;
alter table public.confirmacoes_produto enable row level security;
alter table public.consultas_demanda enable row level security;
alter table public.consultas_operacionais enable row level security;
alter table public.conversas enable row level security;
alter table public.empresa enable row level security;
alter table public.escolas enable row level security;
alter table public.eventos enable row level security;
alter table public.followups enable row level security;
alter table public.funcionarios enable row level security;
alter table public.itens_orcamento enable row level security;
alter table public.itens_pedido enable row level security;
alter table public.marcas enable row level security;
alter table public.materiais_lista_escolar enable row level security;
alter table public.memoria_produtos enable row level security;
alter table public.memorias enable row level security;
alter table public.mensagens enable row level security;
alter table public.notificacoes enable row level security;
alter table public.notificacoes_internas enable row level security;
alter table public.operadores enable row level security;
alter table public.orcamentos enable row level security;
alter table public.orcamentos_status_historico enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedidos_status_historico enable row level security;
alter table public.produtos enable row level security;
alter table public.produtos_relacionados enable row level security;
alter table public.solicitacoes_separacao enable row level security;
alter table public.solicitacoes_separacao_itens enable row level security;
alter table public.solicitacoes_separacao_mensagens enable row level security;
alter table public.templates_mensagem enable row level security;


-- =====================================================================
-- 2. CREATE POLICY — 135 policies, uma seção por tabela (ordem alfabética)
-- =====================================================================

-- ── alertas_demanda (5) ──────────────────────────────────────────────
create policy "admin_exclusao" on public.alertas_demanda as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.alertas_demanda as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.alertas_demanda as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.alertas_demanda as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.alertas_demanda as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── categorias (5) ───────────────────────────────────────────────────
create policy "admin_exclusao" on public.categorias as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.categorias as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.categorias as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.categorias as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.categorias as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── clientes (5) — PII: nome, telefone, CPF/CNPJ, endereço ──────────
create policy "admin_exclusao" on public.clientes as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.clientes as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.clientes as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.clientes as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.clientes as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── config_alerta_demanda (5) ────────────────────────────────────────
create policy "admin_exclusao" on public.config_alerta_demanda as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.config_alerta_demanda as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.config_alerta_demanda as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.config_alerta_demanda as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.config_alerta_demanda as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── configuracoes (5) ────────────────────────────────────────────────
create policy "admin_exclusao" on public.configuracoes as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.configuracoes as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.configuracoes as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.configuracoes as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.configuracoes as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── confirmacoes_produto (5) ─────────────────────────────────────────
create policy "admin_exclusao" on public.confirmacoes_produto as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.confirmacoes_produto as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.confirmacoes_produto as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.confirmacoes_produto as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.confirmacoes_produto as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── consultas_demanda (5) ────────────────────────────────────────────
create policy "admin_exclusao" on public.consultas_demanda as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.consultas_demanda as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.consultas_demanda as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.consultas_demanda as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.consultas_demanda as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── consultas_operacionais (5) ───────────────────────────────────────
create policy "admin_exclusao" on public.consultas_operacionais as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.consultas_operacionais as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.consultas_operacionais as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.consultas_operacionais as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.consultas_operacionais as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── conversas (5) — conteúdo de WhatsApp ─────────────────────────────
create policy "admin_exclusao" on public.conversas as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.conversas as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.conversas as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.conversas as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.conversas as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── empresa (1) — sem acesso de dashboard/app, só service_role ──────
create policy "service_role_full_access" on public.empresa as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── escolas (1) — sem acesso de dashboard/app, só service_role ──────
create policy "service_role_full_access" on public.escolas as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── eventos (5) ───────────────────────────────────────────────────────
create policy "admin_exclusao" on public.eventos as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.eventos as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.eventos as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.eventos as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.eventos as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── followups (1) — sem acesso de dashboard/app, só service_role ────
create policy "service_role_full_access" on public.followups as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── funcionarios (6) — separador lê a si mesmo por auth_user_id ─────
create policy "admin_exclusao" on public.funcionarios as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.funcionarios as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.funcionarios as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.funcionarios as permissive for select to public using (eh_operador_ativo());
create policy "separador_le_a_si_mesmo" on public.funcionarios as permissive for select to public using (auth_user_id = auth.uid());
create policy "service_role_full_access" on public.funcionarios as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── itens_orcamento (5) ──────────────────────────────────────────────
create policy "admin_exclusao" on public.itens_orcamento as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.itens_orcamento as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.itens_orcamento as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.itens_orcamento as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.itens_orcamento as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── itens_pedido (5) ─────────────────────────────────────────────────
create policy "admin_exclusao" on public.itens_pedido as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.itens_pedido as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.itens_pedido as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.itens_pedido as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.itens_pedido as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── marcas (5) ───────────────────────────────────────────────────────
create policy "admin_exclusao" on public.marcas as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.marcas as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.marcas as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.marcas as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.marcas as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── materiais_lista_escolar (1) — sem acesso de dashboard/app ───────
create policy "service_role_full_access" on public.materiais_lista_escolar as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── memoria_produtos (5) ─────────────────────────────────────────────
create policy "admin_exclusao" on public.memoria_produtos as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.memoria_produtos as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.memoria_produtos as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.memoria_produtos as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.memoria_produtos as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── memorias (1) — sem acesso de dashboard/app, só service_role ─────
create policy "service_role_full_access" on public.memorias as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── mensagens (5) — conteúdo de WhatsApp ─────────────────────────────
create policy "admin_exclusao" on public.mensagens as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.mensagens as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.mensagens as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.mensagens as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.mensagens as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── notificacoes (5) ─────────────────────────────────────────────────
create policy "admin_exclusao" on public.notificacoes as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.notificacoes as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.notificacoes as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.notificacoes as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.notificacoes as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── notificacoes_internas (2) — leitura roteada por destinatário ────
create policy "leitura_notificacoes_internas" on public.notificacoes_internas as permissive for select to public
  using (
    ((destinatario_tipo = 'operador'::text) and eh_operador_ativo() and (destinatario_operador_id = auth.uid()))
    or
    ((destinatario_tipo = 'separador'::text) and (destinatario_funcionario_id = funcionario_atual_id()))
  );
create policy "service_role_full_access" on public.notificacoes_internas as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── operadores (3) — cada um lê a si mesmo ou é admin ────────────────
create policy "admin_gerencia_operadores" on public.operadores as permissive for all to public using (eh_admin()) with check (eh_admin());
create policy "operadores_leem_a_si_mesmos" on public.operadores as permissive for select to public using ((auth.uid() = id) or eh_admin());
create policy "service_role_full_access" on public.operadores as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── orcamentos (5) ───────────────────────────────────────────────────
create policy "admin_exclusao" on public.orcamentos as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.orcamentos as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.orcamentos as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.orcamentos as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.orcamentos as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── orcamentos_status_historico (4) — roles restritos a authenticated ─
create policy "operadores_atualizacao" on public.orcamentos_status_historico as permissive for update to authenticated using (eh_operador_ativo()) with check (eh_operador_ativo());
create policy "operadores_escrita" on public.orcamentos_status_historico as permissive for insert to authenticated with check (eh_operador_ativo());
create policy "operadores_leitura" on public.orcamentos_status_historico as permissive for select to authenticated using (eh_operador_ativo());
create policy "service_role_full_access" on public.orcamentos_status_historico as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── pedidos (5) ──────────────────────────────────────────────────────
create policy "admin_exclusao" on public.pedidos as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.pedidos as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.pedidos as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.pedidos as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.pedidos as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── pedidos_status_historico (4) — roles restritos a authenticated ──
create policy "operadores_atualizacao" on public.pedidos_status_historico as permissive for update to authenticated using (eh_operador_ativo()) with check (eh_operador_ativo());
create policy "operadores_escrita" on public.pedidos_status_historico as permissive for insert to authenticated with check (eh_operador_ativo());
create policy "operadores_leitura" on public.pedidos_status_historico as permissive for select to authenticated using (eh_operador_ativo());
create policy "service_role_full_access" on public.pedidos_status_historico as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── produtos (5) ─────────────────────────────────────────────────────
create policy "admin_exclusao" on public.produtos as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.produtos as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.produtos as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.produtos as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.produtos as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── produtos_relacionados (5) ────────────────────────────────────────
create policy "admin_exclusao" on public.produtos_relacionados as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.produtos_relacionados as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.produtos_relacionados as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.produtos_relacionados as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.produtos_relacionados as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── solicitacoes_separacao (2) — leitura por operador OU separador dono ─
create policy "leitura_solicitacoes_separacao" on public.solicitacoes_separacao as permissive for select to public
  using (eh_operador_ativo() or (separador_id = funcionario_atual_id()));
create policy "service_role_full_access" on public.solicitacoes_separacao as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── solicitacoes_separacao_itens (2) ─────────────────────────────────
create policy "leitura_solicitacoes_separacao_itens" on public.solicitacoes_separacao_itens as permissive for select to public
  using (
    exists (
      select 1 from solicitacoes_separacao s
      where s.id = solicitacoes_separacao_itens.solicitacao_id
        and (eh_operador_ativo() or (s.separador_id = funcionario_atual_id()))
    )
  );
create policy "service_role_full_access" on public.solicitacoes_separacao_itens as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── solicitacoes_separacao_mensagens (2) ─────────────────────────────
create policy "leitura_solicitacoes_separacao_mensagens" on public.solicitacoes_separacao_mensagens as permissive for select to public
  using (
    exists (
      select 1 from solicitacoes_separacao s
      where s.id = solicitacoes_separacao_mensagens.solicitacao_id
        and (eh_operador_ativo() or (s.separador_id = funcionario_atual_id()))
    )
  );
create policy "service_role_full_access" on public.solicitacoes_separacao_mensagens as permissive for all to public using (auth.role() = 'service_role'::text);

-- ── templates_mensagem (5) ───────────────────────────────────────────
create policy "admin_exclusao" on public.templates_mensagem as permissive for delete to public using (eh_admin());
create policy "operadores_atualizacao" on public.templates_mensagem as permissive for update to public using (eh_operador_ativo());
create policy "operadores_escrita" on public.templates_mensagem as permissive for insert to public with check (eh_operador_ativo());
create policy "operadores_leitura" on public.templates_mensagem as permissive for select to public using (eh_operador_ativo());
create policy "service_role_full_access" on public.templates_mensagem as permissive for all to public using (auth.role() = 'service_role'::text);


-- =====================================================================
-- 3. VERIFICAÇÃO (rodar contra este arquivo antes de considerar B6 fechado)
-- =====================================================================
-- Contar quantos "create policy" existem neste arquivo e comparar com
-- produção (deve bater 135 nos dois lados):
--
--   -- no arquivo (fora do banco): grep -c "^create policy" extensao_rls_completa.sql
--   -- em produção:
--   select count(*) from pg_policies where schemaname = 'public';
--
-- Contar tabelas com RLS habilitada (deve bater 34 nos dois lados):
--
--   -- no arquivo: grep -c "^alter table.*enable row level security" extensao_rls_completa.sql
--   -- em produção:
--   select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true;
-- =====================================================================
