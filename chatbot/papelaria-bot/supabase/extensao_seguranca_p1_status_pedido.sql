-- =====================================================================
-- VENÂNCIO — Fechamento do problema P1 (auditoria de 25/08/2026)
-- =====================================================================
-- Aplicado em produção em 26/08/2026 via migração
-- `seguranca_p1_fecha_atualizar_status_pedido`.
--
-- ── O INCIDENTE ──────────────────────────────────────────────────────
-- `atualizar_status_pedido(uuid, status_pedido, text)` era, em 25/08/2026,
-- a ÚNICA função de negócio do banco que reunia as três coisas ao mesmo
-- tempo:
--   1. `SECURITY DEFINER` (roda como `postgres`, ignora RLS);
--   2. `EXECUTE` concedido a `anon` E a `authenticated`;
--   3. corpo SEM nenhuma checagem de identidade — só validava a
--      transição de estado (confirmado -> em_separacao -> pronto -> ...).
-- Resultado: com a chave pública (`anon`) do painel, sem login nenhum, e
-- o UUID de um pedido, qualquer pessoa conseguia mover ou CANCELAR o
-- pedido e ainda gravar em `pedidos_status_historico` uma `origem`
-- inventada — corrompendo a trilha de auditoria.
--
-- A ironia registrada na auditoria: ela virou `SECURITY DEFINER` na
-- própria correção de segurança de 24/08 (migração
-- `b7_fecha_bypass_rls_rpcs_criticas`), sob a premissa — que não conferia
-- — de que já tinha checagem interna. Antes de 24/08 a RLS de `pedidos`
-- ainda a protegia; depois, não protegia mais. É o caso clássico de por
-- que `SECURITY DEFINER` sem portão no corpo é pior do que nenhum dos
-- dois.
--
-- ── ESTE ARQUIVO SUBSTITUI (CREATE OR REPLACE, MESMA ASSINATURA) ──────
-- As definições anteriores de `atualizar_status_pedido` em:
--   - `squemanovo.sql` (linha ~412, versão original SECURITY INVOKER);
--   - `extensao_dashboard.sql` (linha ~232);
--   - migração `b7_fecha_bypass_rls_rpcs_criticas` de 24/08 (que só
--     acrescentou `SECURITY DEFINER` + `SET search_path`).
-- A partir de 26/08/2026 ESTA é a versão vigente. O projeto já teve um
-- incidente de duas definições divergentes da mesma função se
-- sobrescrevendo em silêncio — por isso o aviso explícito aqui.
--
-- ── O QUE MUDA NO COMPORTAMENTO ──────────────────────────────────────
-- ÚNICA mudança: acrescenta o portão de identidade no início do corpo.
-- Toda a lógica de negócio (busca com FOR UPDATE, tabela de transições
-- permitidas, UPDATE do status, INSERT no histórico, retorno da linha)
-- é byte a byte a mesma que está em produção hoje.
--
-- ── POR QUE O PORTÃO É "service_role OU operador ativo" ───────────────
-- NÃO se pode usar o portão de `atualizar_status_pedido_dashboard`
-- (`eh_operador_ativo()` puro) aqui: isso quebraria qualquer caminho
-- `service_role` (JS Bot / n8n), que não tem `auth.uid()` — o JWT de
-- `service_role` não carrega `sub` de usuário. O modelo correto é a
-- função-irmã `atualizar_status_orcamento` (`extensao_seguranca_b0_orcamentos.sql`),
-- que tem exatamente a mesma forma (id, novo_status, origem), o mesmo
-- papel e já resolve os dois casos. Portão copiado dela, palavra por
-- palavra, só trocando a mensagem de exceção de "orçamento" p/ "pedido".
--
-- Nota sobre NULL (deliberado, não descuido): `auth.role() <> 'service_role'`
-- avalia para NULL quando NÃO existe JWT nenhum — ou seja, numa conexão
-- Postgres direta (psql, node-pg, painel do Supabase). Nesse caso o `if`
-- não dispara e a função executa. Isso é intencional: (a) quem tem conexão
-- direta já tem a senha do banco e poderia dar `update pedidos` na mão, o
-- portão não somaria segurança nenhuma; (b) fechar isso quebraria
-- manutenção/scripts que rodem por conexão direta. Pelo PostgREST — que é
-- o único caminho por onde `anon`/`authenticated` chegam — a claim `role`
-- do JWT NUNCA é nula, então o portão sempre é avaliado de verdade no
-- caminho que importa. Mantido idêntico a `atualizar_status_orcamento`
-- de propósito, pra as duas irmãs não divergirem.
--
-- ── POR QUE REVOGAR DE `authenticated` TAMBÉM, E NÃO SÓ DE `anon` ─────
-- Levantamento de chamadores (repo inteiro, exceto node_modules, +
-- `pg_proc.prosrc` em produção):
--   - Chamadores EXTERNOS (bot, dashboard, app mobile, n8n): NENHUM.
--     O dashboard chama sempre a wrapper `atualizar_status_pedido_dashboard`
--     (venancio-ai-ops/src/services/pedidos.service.js:162,178).
--   - Chamador INTERNO: exatamente UM —
--     `atualizar_status_pedido_dashboard(uuid, status_pedido, uuid, text)`.
-- E essa wrapper é `SECURITY DEFINER` e pertence a `postgres`. Durante a
-- execução de uma função `SECURITY DEFINER`, o `current_user` é o DONO
-- (postgres), então a checagem de `EXECUTE` da função chamada lá dentro é
-- feita contra `postgres`, não contra quem chamou de fora. Logo revogar
-- `authenticated` NÃO quebra o dashboard.
-- (Contraste com o que aconteceu no B0 em 15/08: lá as wrappers
-- `aceitar_orcamento_dashboard`/`atualizar_status_orcamento_dashboard`
-- ainda eram SECURITY INVOKER, e por isso revogar `authenticated` das
-- funções internas TERIA quebrado o dashboard. Hoje as duas são DEFINER —
-- mudou na migração b7 de 24/08.)
--
-- ── ACHADO QUE MUDOU O PLANO ORIGINAL: PRECISA REVOGAR DE `public` ────
-- O plano dizia só `revoke execute ... from anon;`. Isso NÃO teria
-- fechado nada. `proacl` real da função em 26/08/2026:
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,
--    authenticated=X/postgres,service_role=X/postgres}
-- A primeira entrada, `=X/postgres`, é EXECUTE concedido a **PUBLIC**
-- (nome de role vazio antes do `=` significa PUBLIC no formato aclitem).
-- Todo role — inclusive `anon` — herda de PUBLIC. Ou seja: revogar de
-- `anon` e `authenticated` e parar aí deixaria
-- `has_function_privilege('anon', ..., 'EXECUTE')` = true do mesmo jeito,
-- e a falha continuaria explorável exatamente como antes.
-- Comparação que confirma qual é o alvo certo: as funções já fechadas no
-- B0 (`aceitar_orcamento`, `atualizar_status_orcamento`,
-- `criar_orcamento_com_itens_tx`) NÃO têm a entrada `=X` — nelas o PUBLIC
-- foi removido. É esse o estado final que este arquivo reproduz.
-- (De onde vem esse `=X`: EXECUTE para PUBLIC é o padrão do Postgres para
-- qualquer função nova; enquanto ninguém dá um GRANT explícito, `proacl`
-- fica nulo e o padrão vale implicitamente. No primeiro GRANT explícito o
-- Postgres materializa a ACL inteira, JUNTO com o `=X` implícito — que a
-- partir daí precisa de REVOKE explícito para sumir.)
--
-- Idempotente: seguro rodar de novo (CREATE OR REPLACE com a MESMA
-- assinatura; REVOKE é idempotente por natureza).
-- =====================================================================

create or replace function atualizar_status_pedido(
  p_pedido_id uuid,
  p_novo_status status_pedido,
  p_origem text
) returns pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos;
  v_atual status_pedido;
  v_permitido boolean;
begin
  -- P1 (26/08/2026): portão de identidade. Antes daqui não havia NADA —
  -- anon podia cancelar pedido. Mesmo formato de atualizar_status_orcamento.
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem alterar o status de um pedido';
  end if;

  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido % não encontrado', p_pedido_id;
  end if;

  v_atual := v_pedido.status;
  v_permitido := case v_atual
    when 'confirmado'    then p_novo_status in ('em_separacao', 'cancelado')
    when 'em_separacao'  then p_novo_status in ('pronto', 'cancelado')
    when 'pronto'        then p_novo_status in ('concluido', 'cancelado')
    else false
  end;

  if not v_permitido then
    raise exception 'Transição de pedido inválida: % -> %', v_atual, p_novo_status;
  end if;

  update pedidos set status = p_novo_status where id = p_pedido_id;
  insert into pedidos_status_historico (pedido_id, status_anterior, status_novo, origem)
  values (p_pedido_id, v_atual, p_novo_status, p_origem);

  select * into v_pedido from pedidos where id = p_pedido_id;
  return v_pedido;
end;
$$;

-- Fecha o acesso direto. Quem precisa continua entrando pela wrapper
-- `atualizar_status_pedido_dashboard` (dashboard) ou por `service_role`
-- (bot / n8n), que não passa por GRANT de anon/authenticated.
--
-- A ORDEM E O CONJUNTO DE ROLES AQUI IMPORTAM: sem o `public` na lista,
-- `anon` continua com EXECUTE herdado (ver seção "ACHADO" no cabeçalho).
-- `postgres` (dono) e `service_role` NÃO entram no revoke, de propósito.
revoke execute on function atualizar_status_pedido(uuid, status_pedido, text) from public;
revoke execute on function atualizar_status_pedido(uuid, status_pedido, text) from anon;
revoke execute on function atualizar_status_pedido(uuid, status_pedido, text) from authenticated;
