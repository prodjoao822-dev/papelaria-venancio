-- ─────────────────────────────────────────────────────────────────────────────
-- VENÂNCIO AI OPERATIONS — Sprint 1: Operational Foundation (Migration 005)
-- Execute no SQL Editor do Supabase após 001, 002, 003 e 004
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. OWNERSHIP SYSTEM em conversas
--    Complementa operador_nome (string legado) com FK real, timestamps e lock
--    de IA para evitar conflito entre operadores e race conditions.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS assigned_to      uuid REFERENCES public.operadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at      timestamptz,
  ADD COLUMN IF NOT EXISTS ia_locked        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS stale_at         timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversas_assigned_to    ON public.conversas(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversas_last_activity  ON public.conversas(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversas_stale          ON public.conversas(stale_at) WHERE stale_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. OPERATIONAL QUERIES
--    IA cria consulta → painel mostra para operador → operador responde →
--    resposta retorna automaticamente via webhook n8n
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operational_queries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  product_name    text,
  context         text,
  query_type      text NOT NULL DEFAULT 'estoque'
    CHECK (query_type IN ('estoque','preco','disponibilidade','prazo','outro')),
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','assigned','answered','expired')),
  priority        text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critica','alta','normal','baixa')),
  assigned_to     uuid REFERENCES public.operadores(id) ON DELETE SET NULL,
  response        text,
  responded_by    text,
  timeout_at      timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oq_status     ON public.operational_queries(status);
CREATE INDEX IF NOT EXISTS idx_oq_priority   ON public.operational_queries(priority);
CREATE INDEX IF NOT EXISTS idx_oq_timeout    ON public.operational_queries(timeout_at);
CREATE INDEX IF NOT EXISTS idx_oq_conv       ON public.operational_queries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_oq_customer   ON public.operational_queries(customer_id);
CREATE INDEX IF NOT EXISTS idx_oq_created_at ON public.operational_queries(created_at DESC);

CREATE OR REPLACE TRIGGER trg_operational_queries_updated_at
  BEFORE UPDATE ON public.operational_queries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.operational_queries ENABLE ROW LEVEL SECURITY;

-- Dev: acesso anon (remover em produção, substituir por policy de operadores autenticados)
CREATE POLICY "anon_dev_oq" ON public.operational_queries
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "auth_oq" ON public.operational_queries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.operational_queries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PRODUCTS_MEMORY — Cria se não existir (migration 004 pode não ter rodado)
--    Em seguida adiciona colunas Sprint 1 com IF NOT EXISTS (idempotente).
-- ─────────────────────────────────────────────────────────────────────────────

-- Cria a tabela com todas as colunas (004 base + 005 Sprint 1).
-- Se migration 004 já rodou, este CREATE TABLE é no-op.
CREATE TABLE IF NOT EXISTS public.products_memory (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 text NOT NULL,
  categoria            text,
  ultimo_preco         numeric(10,2),
  preco_medio          numeric(10,2),
  disponibilidade      text NOT NULL DEFAULT 'desconhecido'
    CHECK (disponibilidade IN ('disponivel','indisponivel','sob_consulta','desconhecido')),
  ultima_confirmacao   timestamptz,
  confirmado_por       text,
  observacoes          text,
  aliases              text[] DEFAULT '{}',
  consultas_count      integer NOT NULL DEFAULT 0,
  confidence_score     numeric(5,2) NOT NULL DEFAULT 50.00,
  availability_recent  boolean,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Se migration 004 já rodou (tabela existe sem os novos campos), adiciona agora.
ALTER TABLE public.products_memory
  ADD COLUMN IF NOT EXISTS confidence_score    numeric(5,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS availability_recent boolean;

-- Garante trigger updated_at em products_memory (idempotente via CREATE OR REPLACE)
CREATE OR REPLACE TRIGGER trg_products_memory_updated_at
  BEFORE UPDATE ON public.products_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS e policies (idempotentes via DO block)
ALTER TABLE public.products_memory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products_memory' AND policyname='anon_dev_products_memory') THEN
    EXECUTE 'CREATE POLICY "anon_dev_products_memory" ON public.products_memory FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products_memory' AND policyname='auth_products_memory') THEN
    EXECUTE 'CREATE POLICY "auth_products_memory" ON public.products_memory FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.products_memory;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- product_confirmations: mesma abordagem idempotente
CREATE TABLE IF NOT EXISTS public.product_confirmations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id          uuid REFERENCES public.products_memory(id) ON DELETE CASCADE,
  disponibilidade     text NOT NULL,
  preco_confirmado    numeric(10,2),
  operador            text,
  observacao          text,
  confirmation_source text NOT NULL DEFAULT 'manual'
    CHECK (confirmation_source IN ('manual','whatsapp','sistema')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_confirmations
  ADD COLUMN IF NOT EXISTS confirmation_source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.product_confirmations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_confirmations' AND policyname='anon_dev_product_confirmations') THEN
    EXECUTE 'CREATE POLICY "anon_dev_product_confirmations" ON public.product_confirmations FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_confirmations' AND policyname='auth_product_confirmations') THEN
    EXECUTE 'CREATE POLICY "auth_product_confirmations" ON public.product_confirmations FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. EVENT LOGS — Audit trail estruturado por entidade e ator
--    Complementa logs_operacionais (texto livre) com eventos tipados e
--    rastreáveis por actor_type/actor_id para auditoria e métricas futuras.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text NOT NULL,
  entity_type text,
  entity_id   uuid,
  actor_type  text NOT NULL DEFAULT 'sistema'
    CHECK (actor_type IN ('operador','ia','cliente','sistema','n8n')),
  actor_id    text,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_logs_event_type ON public.event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_entity     ON public.event_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_actor      ON public.event_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_created_at ON public.event_logs(created_at DESC);

ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_dev_event_logs" ON public.event_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "auth_event_logs" ON public.event_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.event_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. FUNÇÕES OPERACIONAIS
-- ─────────────────────────────────────────────────────────────────────────────

-- Expira consultas com timeout atingido. Chamar via n8n a cada 5 minutos.
CREATE OR REPLACE FUNCTION public.expirar_consultas_timeout()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.operational_queries
  SET    status = 'expired', updated_at = now()
  WHERE  status IN ('pending','assigned')
    AND  timeout_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Retorna conversas sem atividade por N minutos (padrão 30).
-- Usada pelo dashboard para alertas de conversa estagnada.
CREATE OR REPLACE FUNCTION public.detectar_conversas_stale(p_minutos integer DEFAULT 30)
RETURNS TABLE(
  id               uuid,
  cliente_id       uuid,
  operador_nome    text,
  status           text,
  minutos_parado   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.cliente_id,
    c.operador_nome,
    c.status,
    ROUND(
      EXTRACT(EPOCH FROM (now() - COALESCE(c.last_activity_at, c.updated_at))) / 60,
      1
    ) AS minutos_parado
  FROM public.conversas c
  WHERE c.status NOT IN ('finalizado','cancelado','encerrada')
    AND COALESCE(c.last_activity_at, c.updated_at) < now() - (p_minutos || ' minutes')::interval
  ORDER BY minutos_parado DESC;
END;
$$;

-- Atualiza last_activity_at da conversa quando nova mensagem chega.
-- Chamada via trigger em mensagens.
CREATE OR REPLACE FUNCTION public.atualizar_atividade_conversa()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversas
  SET    last_activity_at = now(), updated_at = now(), stale_at = NULL
  WHERE  id = NEW.conversa_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_mensagem_atividade_conversa
  AFTER INSERT ON public.mensagens
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_atividade_conversa();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TRIGGERS DE EVENT LOG
--    Registra automaticamente eventos críticos sem depender do frontend.
-- ─────────────────────────────────────────────────────────────────────────────

-- Event log para pedidos
CREATE OR REPLACE FUNCTION public.event_log_pedido()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.event_logs (event_type, entity_type, entity_id, actor_type, actor_id, payload)
    VALUES (
      'pedido.criado',
      'pedido',
      NEW.id,
      'sistema',
      COALESCE(NEW.origem, 'dashboard'),
      jsonb_build_object(
        'status',      NEW.status,
        'valor_total', NEW.valor_total,
        'origem',      NEW.origem,
        'prioridade',  NEW.prioridade
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.event_logs (event_type, entity_type, entity_id, actor_type, actor_id, payload)
    VALUES (
      'pedido.status_alterado',
      'pedido',
      NEW.id,
      'operador',
      COALESCE(NEW.operador_id::text, 'dashboard'),
      jsonb_build_object(
        'status_anterior', OLD.status,
        'status_novo',     NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_event_log_pedido
  AFTER INSERT OR UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.event_log_pedido();

-- Event log para conversas (status + ownership)
CREATE OR REPLACE FUNCTION public.event_log_conversa()
RETURNS TRIGGER AS $$
BEGIN
  -- Mudança de status
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.event_logs (event_type, entity_type, entity_id, actor_type, actor_id, payload)
    VALUES (
      'conversa.status_alterado',
      'conversa',
      NEW.id,
      CASE WHEN NEW.operador_nome IS NOT NULL THEN 'operador' ELSE 'sistema' END,
      COALESCE(NEW.operador_nome, 'sistema'),
      jsonb_build_object(
        'status_anterior', OLD.status,
        'status_novo',     NEW.status,
        'ia_ativa',        NEW.ia_ativa
      )
    );
  END IF;

  -- Ownership assumida
  IF TG_OP = 'UPDATE'
     AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
     AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.event_logs (event_type, entity_type, entity_id, actor_type, actor_id, payload)
    VALUES (
      'conversa.assumida',
      'conversa',
      NEW.id,
      'operador',
      COALESCE(NEW.operador_nome, NEW.assigned_to::text),
      jsonb_build_object('ia_locked', NEW.ia_locked)
    );
  END IF;

  -- Ownership liberada
  IF TG_OP = 'UPDATE'
     AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
     AND NEW.assigned_to IS NULL THEN
    INSERT INTO public.event_logs (event_type, entity_type, entity_id, actor_type, actor_id, payload)
    VALUES (
      'conversa.liberada',
      'conversa',
      NEW.id,
      'operador',
      COALESCE(OLD.operador_nome, 'operador'),
      jsonb_build_object('ia_ativa', NEW.ia_ativa)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_event_log_conversa
  AFTER UPDATE ON public.conversas
  FOR EACH ROW EXECUTE FUNCTION public.event_log_conversa();

-- Event log para consultas respondidas
CREATE OR REPLACE FUNCTION public.event_log_consulta()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'answered' THEN
    INSERT INTO public.event_logs (event_type, entity_type, entity_id, actor_type, actor_id, payload)
    VALUES (
      'consulta.respondida',
      'operational_query',
      NEW.id,
      'operador',
      COALESCE(NEW.responded_by, 'operador'),
      jsonb_build_object(
        'product_name',       NEW.product_name,
        'query_type',         NEW.query_type,
        'response',           NEW.response,
        'tempo_resposta_min', ROUND(EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 60, 1)
      )
    );
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'expired' THEN
    INSERT INTO public.event_logs (event_type, entity_type, entity_id, actor_type, actor_id, payload)
    VALUES (
      'consulta.expirada',
      'operational_query',
      NEW.id,
      'sistema',
      'timeout',
      jsonb_build_object('product_name', NEW.product_name, 'query_type', NEW.query_type)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_event_log_consulta
  AFTER UPDATE ON public.operational_queries
  FOR EACH ROW EXECUTE FUNCTION public.event_log_consulta();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. FUNÇÃO: Contador de consultas pendentes (para badge do dashboard)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_consultas_pendentes_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM public.operational_queries
  WHERE status IN ('pending','assigned');
$$;
