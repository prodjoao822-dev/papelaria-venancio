-- ─────────────────────────────────────────────────────────────────────────────
-- VENÂNCIO AI OPERATIONS — Integração Agentes n8n (Migration 008)
-- Execute no SQL Editor do Supabase após 001..007
--
-- v2: a tabela public.empresa_config JÁ EXISTIA no projeto (criada manualmente
-- antes desta migration) como o "perfil da empresa" — nome, endereço,
-- horários, entrega etc, uma linha por empresa. Não é a tabela chave/valor
-- que a v1 desta migration assumia por engano; por isso removemos aquela
-- criação/seed e a tabela auxiliar "empresas" que tínhamos inventado, e
-- passamos a referenciar empresa_config(id) diretamente como o identificador
-- da empresa em todo o resto do schema.
--
-- id real da linha já existente (Papelaria Venâncio):
--   056faf4b-2ab1-43db-a5c4-a67ba0f7a9d8
--
-- Cria o que ainda faltava:
--   - conversation_state (roteamento entre Agente 1 / Agente 2 por telefone)
-- E adiciona colunas que os workflows já gravavam mas não existiam:
--   - clientes.empresa_id / clientes.ultima_interacao_em
--   - conversas.canal
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CLIENTES — coluna empresa_id (o node "Supabase · Cria Cliente" já gravava
--    esse campo; a coluna nunca existiu). Referencia a linha já existente de
--    empresa_config em vez de uma tabela "empresas" separada.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS empresa_id uuid NOT NULL
    DEFAULT '056faf4b-2ab1-43db-a5c4-a67ba0f7a9d8'
    REFERENCES public.empresa_config(id),
  ADD COLUMN IF NOT EXISTS ultima_interacao_em timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONVERSAS — coluna canal (o node "Supabase · Cria Conversa" já gravava
--    esse campo; a coluna nunca existiu). Nada muda no CHECK de status: os
--    workflows passam a usar os valores já existentes ('novo_lead') em vez de
--    inventar 'bot_ativo'/'humano_ativo'.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'whatsapp';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONVERSATION_STATE — roteamento entre Agente 1 (FAQ/Gateway) e
--    Agente 2 (Comercial), indexado por telefone.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           text NOT NULL UNIQUE,
  empresa_id      uuid NOT NULL
    DEFAULT '056faf4b-2ab1-43db-a5c4-a67ba0f7a9d8'
    REFERENCES public.empresa_config(id),
  conversation_id uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  customer_name   text,
  last_message    text,
  intent          text,
  workflow_ativo  text NOT NULL DEFAULT '' CHECK (workflow_ativo IN ('', 'comercial', 'crm')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_state_phone ON public.conversation_state(phone);

CREATE OR REPLACE TRIGGER trg_conversation_state_updated_at
  BEFORE UPDATE ON public.conversation_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_state_autenticados" ON public.conversation_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "conversation_state_anon_dev" ON public.conversation_state
  FOR ALL TO anon USING (true) WITH CHECK (true);
