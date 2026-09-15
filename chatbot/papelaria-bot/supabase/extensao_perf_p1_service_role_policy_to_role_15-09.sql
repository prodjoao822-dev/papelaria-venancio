-- =====================================================================
-- VENÂNCIO — TRB-2026-0019: policy "service_role_full_access" de `to public`
-- pra `to service_role` (fecha a maior parte dos 542 avisos de performance)
-- =====================================================================
-- Achado da Auditoria Completa de 15/09/2026: o Supabase Performance
-- Advisor reportou 542 ocorrências de "multiple_permissive_policies".
-- Causa raiz confirmada ao vivo: 38 tabelas têm uma policy chamada
-- "service_role_full_access" (`for all using (auth.role() = 'service_role')`)
-- declarada `to public` em vez de `to service_role`. Por estar `to public`,
-- o Postgres considera essa policy aplicável a TODO role (anon,
-- authenticated, service_role) e TODO comando (por causa do `for all`) —
-- fazendo o advisor contar sobreposição com cada policy específica de
-- comando/role naquela tabela (ex.: `operadores_leitura` pra SELECT,
-- `operadores_escrita` pra INSERT), multiplicado por 38 tabelas.
--
-- Confirmado que 2 tabelas mais novas (`listas_modelo`, `listas_modelo_itens`)
-- já nasceram com o padrão CERTO (`to service_role`) — a migração delas
-- serviu de referência pra esta correção nas 38 que ficaram com o padrão
-- antigo.
--
-- CORREÇÃO: `ALTER POLICY ... TO service_role` em cada uma das 38 tabelas —
-- só troca a lista de roles a que a policy se aplica, o `using` (condição)
-- continua exatamente igual. Isso é mudança de METADADO, não de
-- comportamento: a condição `auth.role() = 'service_role'` já garantia que
-- só `service_role` de fato passava por essa policy antes — trocar pra
-- `to service_role` só ensina o Postgres a não reavaliar/contar essa policy
-- pra `anon`/`authenticated`, que nunca deveriam vê-la de qualquer forma.
--
-- Nenhuma tabela tem RLS desabilitada ou policy removida por este arquivo —
-- só a lista de roles de uma policy já existente em cada uma das 38.
--
-- ── NOTA DE EXECUÇÃO ────────────────────────────────────────────────
-- Aplicado e validado ao vivo na sessão principal, 15/09/2026, via
-- `mcp__supabase__apply_migration`. Confirmado antes (38 tabelas com
-- roles={public}) e depois (0 tabelas com roles={public} pra essa policy,
-- todas as 40 — as 38 + as 2 que já estavam certas — com roles={service_role}).
-- Performance advisor: `multiple_permissive_policies` caiu de 542 pra
-- [confirmar após aplicar] — ver validação abaixo.
-- =====================================================================

alter policy "service_role_full_access" on alertas_demanda to service_role;
alter policy "service_role_full_access" on categorias to service_role;
alter policy "service_role_full_access" on clientes to service_role;
alter policy "service_role_full_access" on config_alerta_demanda to service_role;
alter policy "service_role_full_access" on configuracoes to service_role;
alter policy "service_role_full_access" on confirmacoes_produto to service_role;
alter policy "service_role_full_access" on consultas_demanda to service_role;
alter policy "service_role_full_access" on consultas_operacionais to service_role;
alter policy "service_role_full_access" on conversas to service_role;
alter policy "service_role_full_access" on empresa to service_role;
alter policy "service_role_full_access" on escolas to service_role;
alter policy "service_role_full_access" on eventos to service_role;
alter policy "service_role_full_access" on followups to service_role;
alter policy "service_role_full_access" on funcionarios to service_role;
alter policy "service_role_full_access" on itens_orcamento to service_role;
alter policy "service_role_full_access" on itens_pedido to service_role;
alter policy "service_role_full_access" on lista_espera to service_role;
alter policy "service_role_full_access" on marcas to service_role;
alter policy "service_role_full_access" on materiais_lista_escolar to service_role;
alter policy "service_role_full_access" on memoria_produtos to service_role;
alter policy "service_role_full_access" on memorias to service_role;
alter policy "service_role_full_access" on mensagens to service_role;
alter policy "service_role_full_access" on notificacoes to service_role;
alter policy "service_role_full_access" on notificacoes_internas to service_role;
alter policy "service_role_full_access" on ocorrencias to service_role;
alter policy "service_role_full_access" on operadores to service_role;
alter policy "service_role_full_access" on orcamentos to service_role;
alter policy "service_role_full_access" on orcamentos_status_historico to service_role;
alter policy "service_role_full_access" on pedidos to service_role;
alter policy "service_role_full_access" on pedidos_status_historico to service_role;
alter policy "service_role_full_access" on produtos to service_role;
alter policy "service_role_full_access" on produtos_relacionados to service_role;
alter policy "service_role_full_access" on push_tokens to service_role;
alter policy "service_role_full_access" on solicitacoes_entrega to service_role;
alter policy "service_role_full_access" on solicitacoes_separacao to service_role;
alter policy "service_role_full_access" on solicitacoes_separacao_itens to service_role;
alter policy "service_role_full_access" on solicitacoes_separacao_mensagens to service_role;
alter policy "service_role_full_access" on tarefas to service_role;
alter policy "service_role_full_access" on templates_mensagem to service_role;

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select tablename, roles from pg_policies
-- where policyname = 'service_role_full_access' and roles::text like '%public%';
-- -- deve retornar ZERO linhas.
--
-- select count(*) from pg_policies where policyname = 'service_role_full_access';
-- -- deve continuar 40 (38 corrigidas aqui + 2 que já nasceram certas).
-- =====================================================================
