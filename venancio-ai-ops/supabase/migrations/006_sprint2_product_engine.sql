-- ─────────────────────────────────────────────────────────────────────────────
-- VENÂNCIO AI OPERATIONS — Sprint 2: Product Consultant Engine (Migration 006)
-- Execute no SQL Editor do Supabase após as migrations 001 → 005
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EVOLUÇÃO DE PRODUTOS
--    Campos adicionais para Product Consultant Engine
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS descricao  text,
  ADD COLUMN IF NOT EXISTS aliases    text[] DEFAULT '{}';

-- Vincula products_memory ao catálogo oficial (opcional — para deduplicação)
ALTER TABLE public.products_memory
  ADD COLUMN IF NOT EXISTS produto_ref_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_memory_produto_ref ON public.products_memory(produto_ref_id);
CREATE INDEX IF NOT EXISTS idx_produtos_nome_lower ON public.produtos(lower(nome));
CREATE INDEX IF NOT EXISTS idx_products_memory_nome_lower ON public.products_memory(lower(nome));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DEMAND QUERIES — Rastreia TODA consulta de produto
--    Inclusive quando produto não está no catálogo (oportunidades perdidas)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.demand_queries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_nome    text NOT NULL,
  produto_id      uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  memory_id       uuid REFERENCES public.products_memory(id) ON DELETE SET NULL,
  customer_id     uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'whatsapp'
    CHECK (source IN ('whatsapp','dashboard','api','n8n')),
  resultado       text NOT NULL DEFAULT 'nao_encontrado'
    CHECK (resultado IN ('respondido_ia','consultou_operador','nao_encontrado','sem_estoque')),
  converteu       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dq_produto_nome  ON public.demand_queries(lower(produto_nome));
CREATE INDEX IF NOT EXISTS idx_dq_produto_id    ON public.demand_queries(produto_id);
CREATE INDEX IF NOT EXISTS idx_dq_customer      ON public.demand_queries(customer_id);
CREATE INDEX IF NOT EXISTS idx_dq_created_at    ON public.demand_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dq_resultado     ON public.demand_queries(resultado);

ALTER TABLE public.demand_queries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='demand_queries' AND policyname='anon_dev_demand_queries') THEN
    EXECUTE 'CREATE POLICY "anon_dev_demand_queries" ON public.demand_queries FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='demand_queries' AND policyname='auth_demand_queries') THEN
    EXECUTE 'CREATE POLICY "auth_demand_queries" ON public.demand_queries FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_queries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PRODUCT RELATIONSHIPS — Similares / substitutos / alternativas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_relationships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  from_nome       text NOT NULL,
  to_nome         text NOT NULL,
  to_produto_id   uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  tipo            text NOT NULL DEFAULT 'similar'
    CHECK (tipo IN ('similar','substituto','alternativa','complemento')),
  criado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_from         ON public.product_relationships(from_produto_id);
CREATE INDEX IF NOT EXISTS idx_pr_from_nome    ON public.product_relationships(lower(from_nome));
CREATE INDEX IF NOT EXISTS idx_pr_to_produto   ON public.product_relationships(to_produto_id);

ALTER TABLE public.product_relationships ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_relationships' AND policyname='anon_dev_pr') THEN
    EXECUTE 'CREATE POLICY "anon_dev_pr" ON public.product_relationships FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_relationships' AND policyname='auth_pr') THEN
    EXECUTE 'CREATE POLICY "auth_pr" ON public.product_relationships FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DEMAND ALERT CONFIG — Configuração parametrizável de alertas
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.demand_alert_config (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL UNIQUE,
  limite_consultas integer NOT NULL DEFAULT 10,
  janela_horas     integer NOT NULL DEFAULT 24,
  canal_alerta     text NOT NULL DEFAULT 'dashboard'
    CHECK (canal_alerta IN ('dashboard','email','whatsapp','todos')),
  ativo            boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_demand_alert_config_updated_at
  BEFORE UPDATE ON public.demand_alert_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.demand_alert_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='demand_alert_config' AND policyname='anon_dev_dac') THEN
    EXECUTE 'CREATE POLICY "anon_dev_dac" ON public.demand_alert_config FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='demand_alert_config' AND policyname='auth_dac') THEN
    EXECUTE 'CREATE POLICY "auth_dac" ON public.demand_alert_config FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Config global padrão
INSERT INTO public.demand_alert_config (nome, limite_consultas, janela_horas, canal_alerta)
VALUES ('global', 10, 24, 'dashboard')
ON CONFLICT (nome) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DEMAND ALERTS — Alertas gerados quando produto atinge limiar de interesse
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.demand_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_nome    text NOT NULL,
  produto_id      uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  total_consultas integer NOT NULL DEFAULT 0,
  sem_estoque     boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo','visto','resolvido')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_da_status   ON public.demand_alerts(status);
CREATE INDEX IF NOT EXISTS idx_da_produto  ON public.demand_alerts(produto_id);
CREATE INDEX IF NOT EXISTS idx_da_created  ON public.demand_alerts(created_at DESC);

CREATE OR REPLACE TRIGGER trg_demand_alerts_updated_at
  BEFORE UPDATE ON public.demand_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.demand_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='demand_alerts' AND policyname='anon_dev_da') THEN
    EXECUTE 'CREATE POLICY "anon_dev_da" ON public.demand_alerts FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='demand_alerts' AND policyname='auth_da') THEN
    EXECUTE 'CREATE POLICY "auth_da" ON public.demand_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_alerts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. FUNÇÕES DO PRODUCT CONSULTANT ENGINE
-- ─────────────────────────────────────────────────────────────────────────────

-- Busca fuzzy de produto no catálogo + memória IA
-- Retorna resultados ranqueados por confiança
CREATE OR REPLACE FUNCTION public.buscar_produto_fuzzy(
  p_nome  text,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  source             text,
  id                 uuid,
  nome               text,
  preco              numeric,
  disponibilidade    text,
  confidence_score   numeric,
  ultima_confirmacao timestamptz,
  produto_ref_id     uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_termo text := '%' || lower(p_nome) || '%';
BEGIN
  -- Catálogo oficial (fonte primária)
  RETURN QUERY
  SELECT
    'catalogo'::text AS source,
    p.id,
    p.nome,
    p.preco,
    CASE WHEN p.estoque > 0 THEN 'disponivel'::text ELSE 'indisponivel'::text END,
    CASE WHEN p.estoque > 0 THEN 85.00::numeric ELSE 40.00::numeric END AS confidence_score,
    p.updated_at AS ultima_confirmacao,
    p.id AS produto_ref_id
  FROM public.produtos p
  WHERE p.ativo = true
    AND (
      lower(p.nome) LIKE v_termo
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.aliases, '{}')) AS a WHERE lower(a) LIKE v_termo)
    )
  ORDER BY
    CASE WHEN lower(p.nome) LIKE v_termo THEN 0 ELSE 1 END,
    p.estoque DESC
  LIMIT p_limit;

  -- Memória IA — apenas entradas sem vínculo com catálogo
  RETURN QUERY
  SELECT
    'memoria'::text AS source,
    pm.id,
    pm.nome,
    pm.ultimo_preco AS preco,
    pm.disponibilidade,
    pm.confidence_score,
    pm.ultima_confirmacao,
    pm.produto_ref_id
  FROM public.products_memory pm
  WHERE pm.produto_ref_id IS NULL
    AND (
      lower(pm.nome) LIKE v_termo
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(pm.aliases, '{}')) AS a WHERE lower(a) LIKE v_termo)
    )
  ORDER BY pm.confidence_score DESC, pm.ultima_confirmacao DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Registra consulta de produto (demand tracking)
-- Incrementa consultas_count em products_memory se existir
CREATE OR REPLACE FUNCTION public.registrar_demanda_produto(
  p_nome            text,
  p_produto_id      uuid    DEFAULT NULL,
  p_memory_id       uuid    DEFAULT NULL,
  p_customer_id     uuid    DEFAULT NULL,
  p_conversation_id uuid    DEFAULT NULL,
  p_source          text    DEFAULT 'whatsapp',
  p_resultado       text    DEFAULT 'nao_encontrado'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.demand_queries (
    produto_nome, produto_id, memory_id, customer_id, conversation_id, source, resultado
  ) VALUES (
    p_nome, p_produto_id, p_memory_id, p_customer_id, p_conversation_id, p_source, p_resultado
  ) RETURNING id INTO v_id;

  IF p_memory_id IS NOT NULL THEN
    UPDATE public.products_memory
    SET consultas_count = consultas_count + 1, updated_at = now()
    WHERE id = p_memory_id;
  END IF;

  RETURN v_id;
END;
$$;

-- Aprende de resposta do operador
-- Cria/atualiza products_memory com preço e disponibilidade confirmados
CREATE OR REPLACE FUNCTION public.aprender_de_resposta_operador(
  p_produto_nome    text,
  p_preco           numeric DEFAULT NULL,
  p_disponibilidade text    DEFAULT 'disponivel',
  p_operador        text    DEFAULT 'operador',
  p_query_id        uuid    DEFAULT NULL,
  p_observacao      text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_memory_id uuid;
  v_score     numeric;
BEGIN
  v_score := CASE WHEN p_preco IS NOT NULL THEN 75.00 ELSE 60.00 END;

  SELECT id INTO v_memory_id
  FROM public.products_memory
  WHERE lower(nome) = lower(p_produto_nome)
  LIMIT 1;

  IF v_memory_id IS NULL THEN
    INSERT INTO public.products_memory (
      nome, disponibilidade, ultimo_preco, ultima_confirmacao,
      confirmado_por, confidence_score, availability_recent, observacoes
    ) VALUES (
      p_produto_nome, p_disponibilidade, p_preco, now(),
      p_operador, v_score, (p_disponibilidade = 'disponivel'), p_observacao
    ) RETURNING id INTO v_memory_id;
  ELSE
    UPDATE public.products_memory SET
      disponibilidade      = p_disponibilidade,
      ultimo_preco         = COALESCE(p_preco, ultimo_preco),
      ultima_confirmacao   = now(),
      confirmado_por       = p_operador,
      confidence_score     = v_score,
      availability_recent  = (p_disponibilidade = 'disponivel'),
      observacoes          = COALESCE(p_observacao, observacoes),
      updated_at           = now()
    WHERE id = v_memory_id;
  END IF;

  INSERT INTO public.product_confirmations (
    produto_id, disponibilidade, preco_confirmado,
    operador, observacao, confirmation_source
  ) VALUES (
    v_memory_id, p_disponibilidade, p_preco,
    p_operador, p_observacao, 'whatsapp'
  );

  RETURN v_memory_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. FUNÇÕES DE INTELIGÊNCIA DE DEMANDA
-- ─────────────────────────────────────────────────────────────────────────────

-- Top produtos mais consultados em N dias
CREATE OR REPLACE FUNCTION public.get_top_demanda(
  p_dias  integer DEFAULT 7,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  produto_nome    text,
  produto_id      uuid,
  total_consultas bigint,
  sem_estoque_pct numeric,
  converteu_pct   numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    produto_nome,
    produto_id,
    COUNT(*) AS total_consultas,
    ROUND(100.0 * SUM(CASE WHEN resultado IN ('nao_encontrado','sem_estoque') THEN 1 ELSE 0 END) / COUNT(*), 1) AS sem_estoque_pct,
    ROUND(100.0 * SUM(CASE WHEN converteu THEN 1 ELSE 0 END) / COUNT(*), 1) AS converteu_pct
  FROM public.demand_queries
  WHERE created_at >= now() - (p_dias || ' days')::interval
  GROUP BY produto_nome, produto_id
  ORDER BY total_consultas DESC
  LIMIT p_limit;
$$;

-- Oportunidades perdidas: muito procurado mas sem estoque/disponibilidade
CREATE OR REPLACE FUNCTION public.get_oportunidades_perdidas(
  p_dias  integer DEFAULT 30,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  produto_nome    text,
  total_consultas bigint,
  receita_estimada numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    dq.produto_nome,
    COUNT(*) AS total_consultas,
    COUNT(*) * COALESCE(
      (SELECT AVG(ultimo_preco)
       FROM public.products_memory
       WHERE lower(nome) LIKE '%' || lower(dq.produto_nome) || '%'
       LIMIT 1),
      0
    ) AS receita_estimada
  FROM public.demand_queries dq
  WHERE created_at >= now() - (p_dias || ' days')::interval
    AND resultado IN ('nao_encontrado','sem_estoque')
  GROUP BY dq.produto_nome
  ORDER BY total_consultas DESC
  LIMIT p_limit;
$$;

-- Verifica alertas de demanda — chamar via n8n a cada hora
CREATE OR REPLACE FUNCTION public.verificar_alertas_demanda()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config  record;
  v_alerta  record;
  v_count   integer := 0;
  v_corte   timestamptz;
BEGIN
  SELECT * INTO v_config
  FROM public.demand_alert_config
  WHERE nome = 'global' AND ativo = true;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_corte := now() - (v_config.janela_horas || ' hours')::interval;

  FOR v_alerta IN
    SELECT
      produto_nome,
      produto_id,
      COUNT(*) AS total,
      BOOL_AND(resultado IN ('nao_encontrado','sem_estoque')) AS sempre_sem_estoque
    FROM public.demand_queries
    WHERE created_at >= v_corte
    GROUP BY produto_nome, produto_id
    HAVING COUNT(*) >= v_config.limite_consultas
  LOOP
    INSERT INTO public.demand_alerts (produto_nome, produto_id, total_consultas, sem_estoque)
    SELECT v_alerta.produto_nome, v_alerta.produto_id, v_alerta.total, v_alerta.sempre_sem_estoque
    WHERE NOT EXISTS (
      SELECT 1 FROM public.demand_alerts
      WHERE lower(produto_nome) = lower(v_alerta.produto_nome)
        AND created_at >= v_corte
        AND status IN ('novo','visto')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Resumo de event_logs para novos tipos de Sprint 2
-- Atualiza a função listarAtividadeFeed para incluir eventos de produtos
CREATE OR REPLACE FUNCTION public.get_activity_feed(p_limit integer DEFAULT 20)
RETURNS TABLE (
  id          uuid,
  event_type  text,
  entity_type text,
  entity_id   uuid,
  actor_type  text,
  actor_id    text,
  payload     jsonb,
  created_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, event_type, entity_type, entity_id, actor_type, actor_id, payload, created_at
  FROM public.event_logs
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;
