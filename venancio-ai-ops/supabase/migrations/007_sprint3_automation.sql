-- ─────────────────────────────────────────────────────────────────────────────
-- VENÂNCIO AI OPERATIONS — Sprint 3: Automation Layer (Migration 007)
-- Execute no SQL Editor do Supabase após as migrations 001 → 006
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. MESSAGE TEMPLATES — Templates de mensagem WhatsApp por status de pedido
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.message_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status     text NOT NULL,
  titulo     text NOT NULL,
  mensagem   text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.message_templates ADD CONSTRAINT uq_message_templates_status UNIQUE (status);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE TRIGGER trg_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='message_templates' AND policyname='anon_dev_mt') THEN
    EXECUTE 'CREATE POLICY "anon_dev_mt" ON public.message_templates FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='message_templates' AND policyname='auth_mt') THEN
    EXECUTE 'CREATE POLICY "auth_mt" ON public.message_templates FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Variáveis disponíveis: {nome}, {numero}, {entrega_info}, {valor}
INSERT INTO public.message_templates (status, titulo, mensagem) VALUES
(
  'NOVO_PEDIDO',
  'Pedido Recebido',
  '✅ Olá, *{nome}*! Seu pedido *#VEN-{numero}* foi recebido com sucesso! Em breve nossa equipe irá separar seus itens. Qualquer dúvida, é só chamar! 😊'
),
(
  'AGUARDANDO_CONFIRMACAO',
  'Aguardando Confirmação',
  '📋 Olá, *{nome}*! Seu pedido *#VEN-{numero}* está aguardando confirmação. Pode confirmar para darmos início à separação? 😊'
),
(
  'EM_SEPARACAO',
  'Em Separação',
  '📦 Boa notícia, *{nome}*! Seu pedido *#VEN-{numero}* já está sendo separado pela nossa equipe. Avisaremos quando estiver pronto!'
),
(
  'SEPARADO',
  'Pedido Separado',
  '✅ *{nome}*, seu pedido *#VEN-{numero}* foi separado! {entrega_info}'
),
(
  'PRONTO_RETIRADA',
  'Pronto para Retirada',
  '🏪 *{nome}*, seu pedido *#VEN-{numero}* está pronto para retirada! Pode vir buscar na loja a qualquer momento. 😊'
),
(
  'SAIU_ENTREGA',
  'Saiu para Entrega',
  '🛵 *{nome}*, seu pedido *#VEN-{numero}* saiu para entrega! Em breve estará com você. Aguarde!'
),
(
  'FINALIZADO',
  'Pedido Finalizado',
  '🎉 Pedido *#VEN-{numero}* entregue, *{nome}*! Obrigado pela preferência na *Venâncio Papelaria*. Volte sempre! 💙'
),
(
  'CANCELADO',
  'Pedido Cancelado',
  '😔 *{nome}*, seu pedido *#VEN-{numero}* foi cancelado. Se tiver dúvidas ou precisar de ajuda, estamos aqui! 💙'
)
ON CONFLICT (status) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. NOTIFICACOES — Evolução para suporte a anti-duplicata por canal
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'whatsapp';

-- Unique constraint para anti-duplicata: um pedido só pode ter UMA notificação
-- por tipo (status) por canal.
DO $$ BEGIN
  ALTER TABLE public.notificacoes
    ADD CONSTRAINT uq_notificacoes_pedido_tipo_canal UNIQUE (pedido_id, tipo, canal);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_notificacoes_pedido_tipo ON public.notificacoes(pedido_id, tipo);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WF_CONFIG — Configuração da camada de automação
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wf_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_instance  text NOT NULL DEFAULT 'venancio',
  ia_confianca_min    integer NOT NULL DEFAULT 75,
  ia_mensagem_aguarde text NOT NULL DEFAULT '🔍 Deixa eu verificar isso para você... um momento! 😊',
  ia_fallback_msg     text NOT NULL DEFAULT 'Olá! Como posso ajudar? 😊',
  ativo               boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.wf_config (evolution_instance, ia_confianca_min)
VALUES ('venancio', 75)
ON CONFLICT DO NOTHING;

ALTER TABLE public.wf_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wf_config' AND policyname='anon_dev_wfc') THEN
    EXECUTE 'CREATE POLICY "anon_dev_wfc" ON public.wf_config FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wf_config' AND policyname='auth_wfc') THEN
    EXECUTE 'CREATE POLICY "auth_wfc" ON public.wf_config FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FUNÇÕES HELPER PARA N8N
-- ─────────────────────────────────────────────────────────────────────────────

-- Retorna todos os dados necessários para notificação de pedido
CREATE OR REPLACE FUNCTION public.get_pedido_notification_data(p_pedido_id uuid)
RETURNS TABLE (
  pedido_id     uuid,
  numero        bigint,
  status        text,
  valor_total   numeric,
  forma_entrega text,
  cliente_id    uuid,
  cliente_nome  text,
  telefone      text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    p.id,
    p.numero,
    p.status,
    p.valor_total,
    p.forma_entrega,
    c.id,
    COALESCE(c.nome, 'cliente'),
    c.telefone
  FROM public.pedidos p
  JOIN public.clientes c ON c.id = p.cliente_id
  WHERE p.id = p_pedido_id;
$$;

-- Verifica se notificação já foi enviada (anti-duplicata)
CREATE OR REPLACE FUNCTION public.check_notification_sent(p_pedido_id uuid, p_tipo text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.notificacoes
    WHERE pedido_id = p_pedido_id
      AND tipo = p_tipo
      AND enviado = true
  );
$$;

-- Registra notificação como enviada (upsert anti-duplicata)
CREATE OR REPLACE FUNCTION public.mark_notification_sent(
  p_pedido_id  uuid,
  p_cliente_id uuid,
  p_tipo       text,
  p_mensagem   text,
  p_canal      text DEFAULT 'whatsapp'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notificacoes (pedido_id, cliente_id, tipo, mensagem, enviado, enviado_at, canal)
  VALUES (p_pedido_id, p_cliente_id, p_tipo, p_mensagem, true, now(), p_canal)
  ON CONFLICT (pedido_id, tipo, canal) DO UPDATE
    SET enviado = true, enviado_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Formata mensagem substituindo variáveis do template
CREATE OR REPLACE FUNCTION public.get_message_for_status(
  p_status       text,
  p_nome         text,
  p_numero       bigint,
  p_forma_entrega text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_msg         text;
  v_entrega_info text;
BEGIN
  SELECT mensagem INTO v_msg
  FROM public.message_templates
  WHERE status = p_status AND ativo = true;

  IF v_msg IS NULL THEN RETURN NULL; END IF;

  v_entrega_info := CASE p_forma_entrega
    WHEN 'retirada'         THEN 'Pode passar na loja para retirar a qualquer momento! 🏪'
    WHEN 'entrega_propria'  THEN 'Em breve faremos a entrega até você! 🛵'
    WHEN 'uber_flash'       THEN 'O motoboy está a caminho! 🛵'
    ELSE 'Em breve entraremos em contato sobre a entrega!'
  END;

  v_msg := REPLACE(v_msg, '{nome}',         COALESCE(p_nome, 'cliente'));
  v_msg := REPLACE(v_msg, '{numero}',       LPAD(p_numero::text, 4, '0'));
  v_msg := REPLACE(v_msg, '{entrega_info}', v_entrega_info);

  RETURN v_msg;
END;
$$;

-- Retorna configuração do workflow (instance, confiança mínima etc.)
CREATE OR REPLACE FUNCTION public.get_wf_config()
RETURNS TABLE (
  evolution_instance  text,
  ia_confianca_min    integer,
  ia_mensagem_aguarde text,
  ia_fallback_msg     text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT evolution_instance, ia_confianca_min, ia_mensagem_aguarde, ia_fallback_msg
  FROM public.wf_config
  WHERE ativo = true
  LIMIT 1;
$$;

-- Retorna dados completos da consulta operacional para o Query Engine
CREATE OR REPLACE FUNCTION public.get_query_response_data(p_query_id uuid)
RETURNS TABLE (
  query_id        uuid,
  product_name    text,
  query_type      text,
  context         text,
  response        text,
  responded_by    text,
  conversation_id uuid,
  customer_id     uuid,
  cliente_nome    text,
  telefone        text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    oq.id,
    oq.product_name,
    oq.query_type,
    oq.context,
    oq.response,
    oq.responded_by,
    oq.conversation_id,
    oq.customer_id,
    COALESCE(c.nome, 'cliente'),
    c.telefone
  FROM public.operational_queries oq
  LEFT JOIN public.clientes c ON c.id = oq.customer_id
  WHERE oq.id = p_query_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. HABILITAR REALTIME NAS TABELAS CORE
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_templates;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. EVENT LOG — Novos tipos de evento para Sprint 3
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger: registra no event_log quando notificação WhatsApp é enviada
CREATE OR REPLACE FUNCTION public.event_log_notificacao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enviado = true AND (OLD.enviado IS DISTINCT FROM true) THEN
    INSERT INTO public.event_logs (event_type, entity_type, entity_id, actor_type, actor_id, payload)
    VALUES (
      'notificacao.enviada',
      'pedido',
      NEW.pedido_id,
      'n8n',
      'order_tracking',
      jsonb_build_object(
        'tipo',    NEW.tipo,
        'canal',   COALESCE(NEW.canal, 'whatsapp'),
        'preview', LEFT(NEW.mensagem, 80)
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_event_log_notificacao
  AFTER INSERT OR UPDATE ON public.notificacoes
  FOR EACH ROW EXECUTE FUNCTION public.event_log_notificacao();

-- ─────────────────────────────────────────────────────────────────────────────
-- FIM — Sprint 3 Automation Layer pronta.
-- Próximo passo: configurar Supabase Database Webhooks no dashboard:
--
--   1. pedidos UPDATE  → POST https://<n8n>/webhook/venancio-order-tracking
--   2. operational_queries UPDATE → POST https://<n8n>/webhook/venancio-query-engine
--
-- E importar os 5 workflows do diretório automation/ no n8n.
-- ─────────────────────────────────────────────────────────────────────────────
