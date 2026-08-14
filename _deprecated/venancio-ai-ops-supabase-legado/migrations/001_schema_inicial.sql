-- ─────────────────────────────────────────────────────────────────────────────
-- VENÂNCIO AI OPERATIONS — Schema Inicial
-- Execute no SQL Editor do Supabase Dashboard
-- ─────────────────────────────────────────────────────────────────────────────

-- Habilita extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- OPERADORES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.operadores (
  id        uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  nome      text NOT NULL,
  papel     text NOT NULL DEFAULT 'operador' CHECK (papel IN ('admin', 'operador')),
  ativo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLIENTES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text,
  telefone    text UNIQUE NOT NULL,
  observacoes text,
  origem      text NOT NULL DEFAULT 'whatsapp' CHECK (origem IN ('whatsapp', 'manual')),
  status      text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'vip')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUTOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.produtos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  categoria   text NOT NULL,
  sku         text UNIQUE,
  preco       numeric(10,2) NOT NULL CHECK (preco >= 0),
  estoque     integer NOT NULL DEFAULT 0,
  imagem_url  text,
  tags        text[] DEFAULT '{}',
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LISTAS ESCOLARES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listas_escolares (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola     text NOT NULL,
  serie      text NOT NULL,
  ano        integer NOT NULL,
  itens      jsonb NOT NULL DEFAULT '[]',
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PEDIDOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pedidos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  cliente_id       uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  operador_id      uuid REFERENCES public.operadores(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'NOVO_PEDIDO' CHECK (
    status IN (
      'NOVO_PEDIDO',
      'AGUARDANDO_CONFIRMACAO',
      'EM_SEPARACAO',
      'SEPARADO',
      'PRONTO_RETIRADA',
      'SAIU_ENTREGA',
      'FINALIZADO',
      'CANCELADO'
    )
  ),
  valor_total      numeric(10,2) DEFAULT 0,
  forma_entrega    text CHECK (forma_entrega IN ('retirada', 'entrega_propria', 'uber_flash')),
  endereco_entrega text,
  observacoes      text,
  origem           text NOT NULL DEFAULT 'whatsapp' CHECK (origem IN ('whatsapp', 'dashboard', 'manual')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ITENS DO PEDIDO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.itens_pedido (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id      uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id     uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  nome_item      text NOT NULL,
  quantidade     integer NOT NULL CHECK (quantidade > 0),
  preco_unitario numeric(10,2) NOT NULL CHECK (preco_unitario >= 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ORÇAMENTOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pendente' CHECK (
    status IN ('pendente', 'enviado', 'aprovado', 'rejeitado', 'expirado')
  ),
  valor_total numeric(10,2) DEFAULT 0,
  origem      text NOT NULL DEFAULT 'whatsapp',
  conteudo    jsonb DEFAULT '[]',
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONVERSAS (WhatsApp)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id           uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'pausada', 'encerrada')),
  ultima_mensagem_at   timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- MENSAGENS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mensagens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id  uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  direcao      text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  tipo         text NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagem', 'audio', 'documento')),
  conteudo     text,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTEXTO IA (memória conversacional)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contexto_ia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid UNIQUE NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversa_id     uuid REFERENCES public.conversas(id) ON DELETE SET NULL,
  historico       jsonb NOT NULL DEFAULT '[]',
  intencao_atual  text,
  estado_fluxo    text,
  dados_contexto  jsonb NOT NULL DEFAULT '{}',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- HISTÓRICO DE STATUS DOS PEDIDOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historico_status (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  status_anterior  text,
  status_novo      text NOT NULL,
  operador_id      uuid REFERENCES public.operadores(id) ON DELETE SET NULL,
  observacao       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIFICAÇÕES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id   uuid REFERENCES public.pedidos(id) ON DELETE CASCADE,
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo        text NOT NULL,
  mensagem    text NOT NULL,
  enviado     boolean NOT NULL DEFAULT false,
  enviado_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ÍNDICES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON public.pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON public.pedidos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_numero ON public.pedidos(numero);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON public.clientes(telefone);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido_id ON public.itens_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_historico_status_pedido_id ON public.historico_status(pedido_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_id ON public.mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_conversas_cliente_id ON public.conversas(cliente_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS — updated_at automático
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_produtos_updated_at
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER — Registra histórico automático ao mudar status do pedido
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_historico_status()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.historico_status (pedido_id, status_anterior, status_novo, operador_id)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.operador_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedidos_historico_status
  AFTER UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_historico_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER — Recalcula valor_total do pedido ao inserir/alterar/remover itens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalcular_valor_pedido()
RETURNS TRIGGER AS $$
DECLARE
  v_pedido_id uuid;
BEGIN
  v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);
  UPDATE public.pedidos
  SET valor_total = (
    SELECT COALESCE(SUM(quantidade * preco_unitario), 0)
    FROM public.itens_pedido
    WHERE pedido_id = v_pedido_id
  )
  WHERE id = v_pedido_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_itens_recalcular_valor
  AFTER INSERT OR UPDATE OR DELETE ON public.itens_pedido
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_valor_pedido();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contexto_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_escolares ENABLE ROW LEVEL SECURITY;

-- Operadores autenticados têm acesso total ao painel
CREATE POLICY "operadores_acesso_total" ON public.pedidos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "operadores_acesso_total" ON public.clientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "operadores_acesso_total" ON public.itens_pedido
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "operadores_acesso_total" ON public.historico_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "operadores_acesso_total" ON public.notificacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Produtos: leitura pública (catálogo), escrita apenas autenticados
CREATE POLICY "produtos_leitura_publica" ON public.produtos
  FOR SELECT USING (ativo = true);

CREATE POLICY "produtos_escrita_autenticada" ON public.produtos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Listas escolares: leitura pública, escrita autenticada
CREATE POLICY "listas_leitura_publica" ON public.listas_escolares
  FOR SELECT USING (ativo = true);

CREATE POLICY "listas_escrita_autenticada" ON public.listas_escolares
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Orçamentos, conversas, mensagens, contexto_ia: apenas autenticados
CREATE POLICY "orcamentos_autenticados" ON public.orcamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "conversas_autenticados" ON public.conversas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "mensagens_autenticados" ON public.mensagens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "contexto_ia_autenticado" ON public.contexto_ia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "operadores_autenticados" ON public.operadores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Habilita Realtime nas tabelas do dashboard
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.historico_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
