-- ─────────────────────────────────────────────────────────────────────────────
-- VENÂNCIO AI OPERATIONS — CRM Comercial (Migration 003)
-- Execute no SQL Editor do Supabase após 001 e 002
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EVOLUÇÃO DA TABELA ORCAMENTOS
-- ─────────────────────────────────────────────────────────────────────────────

-- Número sequencial legível
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS numero bigint GENERATED ALWAYS AS IDENTITY;

-- Itens do orçamento (inline JSON — sem tabela separada na Fase 2)
-- Estrutura: [{ nome_item, quantidade, preco_unitario }]
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS itens jsonb NOT NULL DEFAULT '[]';

-- Observações internas
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS observacoes text;

-- Validade em horas (ex: 48h para o cliente decidir)
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS validade_horas integer NOT NULL DEFAULT 48;

-- Pedido gerado após conversão
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL;

-- Atualiza o CHECK de status para novos estados operacionais
ALTER TABLE public.orcamentos
  DROP CONSTRAINT IF EXISTS orcamentos_status_check;

ALTER TABLE public.orcamentos
  ADD CONSTRAINT orcamentos_status_check
    CHECK (status IN (
      'rascunho',       -- criando
      'enviado',        -- enviado ao cliente pelo WhatsApp
      'aguardando',     -- aguardando resposta
      'aprovado',       -- cliente aprovou, aguarda conversão
      'recusado',       -- cliente recusou
      'expirado',       -- passou do prazo
      'convertido'      -- virou pedido
    ));

-- Atualiza o DEFAULT de status
ALTER TABLE public.orcamentos
  ALTER COLUMN status SET DEFAULT 'rascunho';

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente_id ON public.orcamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status     ON public.orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_created_at ON public.orcamentos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_pedido_id  ON public.orcamentos(pedido_id);

-- Realtime no orçamentos
ALTER PUBLICATION supabase_realtime ADD TABLE public.orcamentos;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LOGS OPERACIONAIS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.logs_operacionais (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,
  -- Tipos: PEDIDO_CRIADO | PEDIDO_STATUS | PEDIDO_CANCELADO
  --        ORCAMENTO_CRIADO | ORCAMENTO_ENVIADO | ORCAMENTO_CONVERTIDO | ORCAMENTO_RECUSADO
  --        CLIENTE_CRIADO | CLIENTE_ATUALIZADO
  --        IA_RESPOSTA | IA_PEDIDO | IA_ORCAMENTO
  --        N8N_TRIGGER | N8N_ERRO
  entidade     text,          -- 'pedido' | 'orcamento' | 'cliente'
  entidade_id  uuid,
  descricao    text NOT NULL,
  operador     text DEFAULT 'dashboard', -- 'dashboard' | 'ia' | 'n8n' | uuid operador
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_tipo        ON public.logs_operacionais(tipo);
CREATE INDEX IF NOT EXISTS idx_logs_entidade_id ON public.logs_operacionais(entidade_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at  ON public.logs_operacionais(created_at DESC);

ALTER TABLE public.logs_operacionais ENABLE ROW LEVEL SECURITY;

-- Realtime nos logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.logs_operacionais;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VIEW DE CLIENTES COM MÉTRICAS CRM
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_clientes_crm AS
SELECT
  c.id,
  c.nome,
  c.telefone,
  c.observacoes,
  c.origem,
  c.status,
  c.created_at,
  c.updated_at,

  -- Métricas de pedidos (todos os statuses)
  COUNT(p.id)                                          AS qtd_pedidos,
  COUNT(p.id) FILTER (WHERE p.status = 'FINALIZADO')  AS qtd_finalizados,
  COUNT(p.id) FILTER (WHERE p.status = 'CANCELADO')   AS qtd_cancelados,

  -- Faturamento real (apenas finalizados)
  COALESCE(SUM(p.valor_total) FILTER (WHERE p.status = 'FINALIZADO'), 0)  AS total_gasto,

  -- Ticket médio (pedidos finalizados)
  COALESCE(
    AVG(p.valor_total) FILTER (WHERE p.status = 'FINALIZADO'),
    0
  ) AS ticket_medio,

  -- Data última compra finalizada
  MAX(p.created_at) FILTER (WHERE p.status = 'FINALIZADO')  AS ultima_compra_at,

  -- Pedido mais recente (qualquer status)
  MAX(p.created_at) AS ultimo_pedido_at,

  -- Orçamentos
  COUNT(o.id) AS qtd_orcamentos,
  COUNT(o.id) FILTER (WHERE o.status = 'convertido') AS qtd_orcamentos_convertidos

FROM public.clientes c
LEFT JOIN public.pedidos  p ON p.cliente_id = c.id
LEFT JOIN public.orcamentos o ON o.cliente_id = c.id
GROUP BY c.id, c.nome, c.telefone, c.observacoes, c.origem, c.status, c.created_at, c.updated_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FUNÇÃO DE MÉTRICAS COMERCIAIS (chamada via RPC)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_metricas_comerciais()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hoje_inicio     timestamptz := date_trunc('day', now());
  v_mes_inicio      timestamptz := date_trunc('month', now());
  v_ontem_inicio    timestamptz := date_trunc('day', now()) - interval '1 day';
  v_ontem_fim       timestamptz := date_trunc('day', now());

  -- Hoje
  v_pedidos_hoje    bigint;
  v_fat_hoje        numeric;
  v_cancelados_hoje bigint;
  v_finalizados_hoje bigint;

  -- Mês
  v_pedidos_mes     bigint;
  v_fat_mes         numeric;

  -- Ontem (para trend)
  v_pedidos_ontem   bigint;
  v_fat_ontem       numeric;

  -- CRM
  v_clientes_ativos  bigint;
  v_ticket_medio     numeric;
  v_orcamentos_hoje  bigint;
  v_conversao_rate   numeric;

BEGIN
  -- Pedidos hoje
  SELECT
    COUNT(*),
    COALESCE(SUM(valor_total) FILTER (WHERE status = 'FINALIZADO'), 0),
    COUNT(*) FILTER (WHERE status = 'CANCELADO'),
    COUNT(*) FILTER (WHERE status = 'FINALIZADO')
  INTO v_pedidos_hoje, v_fat_hoje, v_cancelados_hoje, v_finalizados_hoje
  FROM public.pedidos
  WHERE created_at >= v_hoje_inicio;

  -- Pedidos mês
  SELECT
    COUNT(*),
    COALESCE(SUM(valor_total) FILTER (WHERE status = 'FINALIZADO'), 0)
  INTO v_pedidos_mes, v_fat_mes
  FROM public.pedidos
  WHERE created_at >= v_mes_inicio;

  -- Pedidos ontem (para trend)
  SELECT
    COUNT(*),
    COALESCE(SUM(valor_total) FILTER (WHERE status = 'FINALIZADO'), 0)
  INTO v_pedidos_ontem, v_fat_ontem
  FROM public.pedidos
  WHERE created_at >= v_ontem_inicio AND created_at < v_ontem_fim;

  -- Clientes com pelo menos 1 pedido finalizado
  SELECT COUNT(DISTINCT cliente_id)
  INTO v_clientes_ativos
  FROM public.pedidos
  WHERE status = 'FINALIZADO';

  -- Ticket médio geral (pedidos finalizados)
  SELECT COALESCE(AVG(valor_total), 0)
  INTO v_ticket_medio
  FROM public.pedidos
  WHERE status = 'FINALIZADO';

  -- Orçamentos criados hoje
  SELECT COUNT(*)
  INTO v_orcamentos_hoje
  FROM public.orcamentos
  WHERE created_at >= v_hoje_inicio;

  -- Taxa de conversão: orcamentos convertidos / total (mês)
  SELECT
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(
        COUNT(*) FILTER (WHERE status = 'convertido')::numeric / COUNT(*) * 100,
        1
      )
    END
  INTO v_conversao_rate
  FROM public.orcamentos
  WHERE created_at >= v_mes_inicio;

  RETURN jsonb_build_object(
    'pedidos_hoje',      v_pedidos_hoje,
    'pedidos_ontem',     v_pedidos_ontem,
    'pedidos_mes',       v_pedidos_mes,
    'fat_hoje',          v_fat_hoje,
    'fat_ontem',         v_fat_ontem,
    'fat_mes',           v_fat_mes,
    'finalizados_hoje',  v_finalizados_hoje,
    'cancelados_hoje',   v_cancelados_hoje,
    'clientes_ativos',   v_clientes_ativos,
    'ticket_medio',      ROUND(v_ticket_medio, 2),
    'orcamentos_hoje',   v_orcamentos_hoje,
    'conversao_rate',    v_conversao_rate
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TRIGGER: log automático ao criar/alterar pedido
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_pedido_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Novo pedido
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.logs_operacionais (tipo, entidade, entidade_id, descricao, operador)
    VALUES (
      'PEDIDO_CRIADO',
      'pedido',
      NEW.id,
      'Pedido criado com status ' || NEW.status,
      COALESCE(NEW.origem, 'dashboard')
    );
  END IF;

  -- Mudança de status
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.logs_operacionais (tipo, entidade, entidade_id, descricao, operador)
    VALUES (
      'PEDIDO_STATUS',
      'pedido',
      NEW.id,
      OLD.status || ' → ' || NEW.status,
      COALESCE(NEW.origem, 'dashboard')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_pedido
  AFTER INSERT OR UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.log_pedido_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. POLÍTICAS RLS PARA NOVAS TABELAS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "logs_acesso_autenticado" ON public.logs_operacionais
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. POLÍTICA ANON (desenvolvimento) para logs e orcamentos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "anon_acesso_total_dev" ON public.logs_operacionais
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Garante que orcamentos tenha policy anon caso não exista
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orcamentos' AND policyname = 'anon_acesso_total_dev'
  ) THEN
    EXECUTE 'CREATE POLICY "anon_acesso_total_dev" ON public.orcamentos
      FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;
