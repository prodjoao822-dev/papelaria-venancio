-- ─────────────────────────────────────────────────────────────────────────────
-- VENÂNCIO AI OPERATIONS — Fase 4: Sistema Operacional Completo (Migration 004)
-- Execute no SQL Editor do Supabase após 001, 002 e 003
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EVOLUÇÃO DA TABELA CONVERSAS
--    Base já existe na 001 com status simples. Expandimos para Central de
--    Atendimento com prioridade, intenção, IA toggle e controle de operador.
-- ─────────────────────────────────────────────────────────────────────────────

-- Novos campos operacionais
ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS nome_cliente       text,
  ADD COLUMN IF NOT EXISTS intencao           text
    CHECK (intencao IN ('orcamento','pedido','lista_escolar','empresa','atacado','duvida','entrega','outro')),
  ADD COLUMN IF NOT EXISTS prioridade         text NOT NULL DEFAULT 'normal'
    CHECK (prioridade IN ('critica','alta','normal','baixa')),
  ADD COLUMN IF NOT EXISTS prioridade_score   integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS ia_ativa           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS operador_nome      text,
  ADD COLUMN IF NOT EXISTS ultima_mensagem    text,
  ADD COLUMN IF NOT EXISTS ultima_msg_at      timestamptz,
  ADD COLUMN IF NOT EXISTS tags               text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

-- Expande o CHECK de status para incluir os novos estados operacionais
-- (mantém 'ativa', 'pausada', 'encerrada' por compatibilidade com dados legados)
ALTER TABLE public.conversas
  DROP CONSTRAINT IF EXISTS conversas_status_check;

ALTER TABLE public.conversas
  ADD CONSTRAINT conversas_status_check CHECK (
    status IN (
      -- Novos estados operacionais
      'novo_lead',
      'aguardando_operador',
      'aguardando_cliente',
      'aguardando_confirmacao',
      'separando',
      'aguardando_pagamento',
      'finalizado',
      'cancelado',
      -- Estados legados (backward compat)
      'ativa',
      'pausada',
      'encerrada'
    )
  );

-- Trigger updated_at em conversas
CREATE OR REPLACE TRIGGER trg_conversas_updated_at
  BEFORE UPDATE ON public.conversas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EVOLUÇÃO DA TABELA MENSAGENS
--    Adiciona remetente (cliente/ia/operador/sistema) e nome do operador
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS remetente      text DEFAULT 'cliente'
    CHECK (remetente IN ('cliente','ia','operador','sistema')),
  ADD COLUMN IF NOT EXISTS operador_nome  text,
  ADD COLUMN IF NOT EXISTS lida           boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MEMÓRIA OPERACIONAL DE PRODUTOS
--    IA aprende preços e disponibilidade confirmados por operadores
-- ─────────────────────────────────────────────────────────────────────────────

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
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_confirmations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id        uuid REFERENCES public.products_memory(id) ON DELETE CASCADE,
  disponibilidade   text NOT NULL,
  preco_confirmado  numeric(10,2),
  operador          text,
  observacao        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_products_memory_updated_at
  BEFORE UPDATE ON public.products_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CHECKLIST DE SEPARAÇÃO em itens_pedido
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.itens_pedido
  ADD COLUMN IF NOT EXISTS separado boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PRIORIDADE EM PEDIDOS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'normal'
    CHECK (prioridade IN ('critica','alta','normal','baixa'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ÍNDICES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_conversas_status        ON public.conversas(status);
CREATE INDEX IF NOT EXISTS idx_conversas_prioridade    ON public.conversas(prioridade);
CREATE INDEX IF NOT EXISTS idx_conversas_updated_at    ON public.conversas(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversas_score         ON public.conversas(prioridade_score DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_lida ON public.mensagens(conversa_id, lida);
CREATE INDEX IF NOT EXISTS idx_products_memory_nome    ON public.products_memory(nome);
CREATE INDEX IF NOT EXISTS idx_pedidos_prioridade      ON public.pedidos(prioridade);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.products_memory        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_confirmations  ENABLE ROW LEVEL SECURITY;

-- Dev: acesso anon (remover em produção)
CREATE POLICY "anon_dev_products_memory" ON public.products_memory
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_dev_product_confirmations" ON public.product_confirmations
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Autenticados
CREATE POLICY "auth_products_memory" ON public.products_memory
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_product_confirmations" ON public.product_confirmations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Garante policy anon para conversas e mensagens (dev)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversas' AND policyname = 'anon_dev_conversas'
  ) THEN
    EXECUTE 'CREATE POLICY "anon_dev_conversas" ON public.conversas
      FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mensagens' AND policyname = 'anon_dev_mensagens'
  ) THEN
    EXECUTE 'CREATE POLICY "anon_dev_mensagens" ON public.mensagens
      FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. REALTIME
-- ─────────────────────────────────────────────────────────────────────────────

-- Usa DO para ignorar erro caso tabela já esteja na publicação
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.products_memory;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
