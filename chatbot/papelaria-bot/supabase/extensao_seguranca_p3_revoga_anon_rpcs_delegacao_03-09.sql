-- =====================================================================
-- VENÂNCIO — P3: revoga EXECUTE de anon/public nas RPCs de delegação de
-- separação/entrega/ocorrência (03/09/2026, vistoria final pré-Volta às Aulas)
-- =====================================================================
-- ACHADO (auditoria supabase-db, vistoria final de 03/09): confirmado ao
-- vivo via has_function_privilege que 17 RPCs SECURITY DEFINER de negócio
-- crítico (separação delegada/rápida, entrega, ocorrência, notificação,
-- heartbeat) tinham EXECUTE concedido a anon E public desde o baseline de
-- 26/08 — nenhuma revogação posterior as cobria (P1/P2 só fecharam as 6
-- RPCs *_dashboard + atualizar_status_pedido).
--
-- NÃO é BOLA ativo: todas as 17 já tem portão interno correto
-- (eh_operador_ativo()/funcionario_atual_id()/eh_admin(), resolvendo o
-- ator sempre via auth.uid(), nunca client-supplied) — confirmado por
-- leitura do corpo de cada função antes desta migração. Uma chamada anon
-- hoje já falhava com "não está atribuída a você"/exceção equivalente.
--
-- Isso é defesa em profundidade, não correção de furo explorado: o
-- projeto já teve um caso real (P1, atualizar_status_pedido) de uma RPC
-- crítica ficar sem NENHUM portão por um período — se um CREATE OR
-- REPLACE futuro esquecer de copiar o gate interno de uma dessas 17
-- funções (mesmo tipo de erro humano que já aconteceu antes), o EXECUTE
-- aberto pra anon transformaria isso em explorável na hora, sem precisar
-- de mais nenhuma falha. Fechar agora custa uma migração de REVOKE.
--
-- Mesmo padrão de extensao_seguranca_p1_status_pedido.sql e
-- extensao_seguranca_p2_revoga_anon_dashboard_01-09.sql.
--
-- APLICADO em produção em 03/09/2026 e validado ao vivo:
-- has_function_privilege confirma anon=false / authenticated=true nas
-- 17 funções, sem alterar nenhuma outra ACL nem o corpo das funções.
-- =====================================================================

revoke execute on function concluir_separacao(uuid) from anon, public;
revoke execute on function cancelar_separacao(uuid, text) from anon, public;
revoke execute on function delegar_separacao(uuid, uuid, text, timestamp with time zone, text) from anon, public;
revoke execute on function enviar_mensagem_separacao(uuid, text) from anon, public;
revoke execute on function separacao_rapida(uuid, text) from anon, public;
revoke execute on function assumir_separacao(uuid) from anon, public;
revoke execute on function atribuir_responsavel_pedido(uuid, text, uuid, uuid) from anon, public;
revoke execute on function delegar_entrega(uuid, uuid, timestamp with time zone) from anon, public;
revoke execute on function cancelar_entrega(uuid, text) from anon, public;
revoke execute on function concluir_entrega(uuid) from anon, public;
revoke execute on function assumir_entrega(uuid) from anon, public;
revoke execute on function iniciar_rota(uuid) from anon, public;
revoke execute on function registrar_insucesso_entrega(uuid, text) from anon, public;
revoke execute on function abrir_ocorrencia(uuid, text, text, uuid, uuid) from anon, public;
revoke execute on function resolver_ocorrencia(uuid, text) from anon, public;
revoke execute on function marcar_notificacao_lida(uuid) from anon, public;
revoke execute on function registrar_heartbeat_operador() from anon, public;

-- ── VALIDAÇÃO (rodada, resultado confirmado) ────────────────────────────
-- select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_pode,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_pode
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname in (...as 17 acima...);
-- Resultado: anon_pode = false e authenticated_pode = true nas 17 linhas.
-- =====================================================================
