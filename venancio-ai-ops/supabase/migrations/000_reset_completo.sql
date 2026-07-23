-- ─────────────────────────────────────────────────────────────────────────────
-- VENÂNCIO AI OPERATIONS — RESET COMPLETO
-- ⚠️  APAGA TUDO. Rode este script e depois execute 001 → 002 → 003 → 004 → 005
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. TABELAS — CASCADE cuida de FKs e triggers automaticamente
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.event_logs              CASCADE;
DROP TABLE IF EXISTS public.operational_queries     CASCADE;
DROP TABLE IF EXISTS public.product_confirmations   CASCADE;
DROP TABLE IF EXISTS public.products_memory         CASCADE;
DROP TABLE IF EXISTS public.logs_operacionais       CASCADE;
DROP TABLE IF EXISTS public.contexto_ia             CASCADE;
DROP TABLE IF EXISTS public.mensagens               CASCADE;
DROP TABLE IF EXISTS public.conversas               CASCADE;
DROP TABLE IF EXISTS public.notificacoes            CASCADE;
DROP TABLE IF EXISTS public.historico_status        CASCADE;
DROP TABLE IF EXISTS public.itens_pedido            CASCADE;
DROP TABLE IF EXISTS public.orcamentos              CASCADE;
DROP TABLE IF EXISTS public.pedidos                 CASCADE;
DROP TABLE IF EXISTS public.listas_escolares        CASCADE;
DROP TABLE IF EXISTS public.produtos                CASCADE;
DROP TABLE IF EXISTS public.clientes                CASCADE;
DROP TABLE IF EXISTS public.operadores              CASCADE;

-- 2. VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_clientes_crm CASCADE;

-- 3. FUNÇÕES
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.set_updated_at()                    CASCADE;
DROP FUNCTION IF EXISTS public.registrar_historico_status()        CASCADE;
DROP FUNCTION IF EXISTS public.recalcular_valor_pedido()           CASCADE;
DROP FUNCTION IF EXISTS public.log_pedido_status()                 CASCADE;
DROP FUNCTION IF EXISTS public.get_metricas_comerciais()           CASCADE;
DROP FUNCTION IF EXISTS public.atualizar_atividade_conversa()      CASCADE;
DROP FUNCTION IF EXISTS public.expirar_consultas_timeout()         CASCADE;
DROP FUNCTION IF EXISTS public.detectar_conversas_stale(integer)   CASCADE;
DROP FUNCTION IF EXISTS public.event_log_pedido()                  CASCADE;
DROP FUNCTION IF EXISTS public.event_log_conversa()                CASCADE;
DROP FUNCTION IF EXISTS public.event_log_consulta()                CASCADE;
DROP FUNCTION IF EXISTS public.get_consultas_pendentes_count()     CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- ✅ Pronto. Agora execute na ordem:
--    001_schema_inicial.sql
--    002_dev_anon_policy.sql
--    003_crm_comercial.sql
--    004_fase4_operacional.sql
--    005_sprint1_foundation.sql
-- ─────────────────────────────────────────────────────────────────────────────
