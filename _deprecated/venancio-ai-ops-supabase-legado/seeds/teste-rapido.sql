-- ─────────────────────────────────────────────────────────────────────────────
-- TESTE RÁPIDO — Cole e execute no SQL Editor do Supabase
-- Cria 3 clientes e 5 pedidos com itens para ver o dashboard funcionando
-- ─────────────────────────────────────────────────────────────────────────────

-- Clientes
INSERT INTO public.clientes (nome, telefone, origem) VALUES
  ('Maria Silva',       '+5511999990001', 'whatsapp'),
  ('João Pereira',      '+5511999990002', 'whatsapp'),
  ('Empresa ABC Ltda',  '+5511999990003', 'whatsapp')
ON CONFLICT (telefone) DO NOTHING;

-- Pedido 1 — NOVO_PEDIDO
INSERT INTO public.pedidos (cliente_id, status, forma_entrega, observacoes, origem)
SELECT id, 'NOVO_PEDIDO', 'retirada', 'Cliente pediu cadernos e material escolar', 'whatsapp'
FROM public.clientes WHERE telefone = '+5511999990001';

INSERT INTO public.itens_pedido (pedido_id, nome_item, quantidade, preco_unitario)
SELECT p.id, 'Caderno 10 matérias Tilibra', 3, 24.90 FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id WHERE c.telefone = '+5511999990001' ORDER BY p.created_at DESC LIMIT 1;

INSERT INTO public.itens_pedido (pedido_id, nome_item, quantidade, preco_unitario)
SELECT p.id, 'Estojo duplo', 1, 19.90 FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id WHERE c.telefone = '+5511999990001' ORDER BY p.created_at DESC LIMIT 1;

-- Pedido 2 — EM_SEPARACAO
INSERT INTO public.pedidos (cliente_id, status, forma_entrega, observacoes, origem)
SELECT id, 'EM_SEPARACAO', 'entrega_propria', 'Entregar antes do meio-dia', 'whatsapp'
FROM public.clientes WHERE telefone = '+5511999990002';

INSERT INTO public.itens_pedido (pedido_id, nome_item, quantidade, preco_unitario)
SELECT p.id, 'Mochila escolar infantil', 1, 89.90 FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id WHERE c.telefone = '+5511999990002' ORDER BY p.created_at DESC LIMIT 1;

INSERT INTO public.itens_pedido (pedido_id, nome_item, quantidade, preco_unitario)
SELECT p.id, 'Lápis de cor 24 cores', 2, 22.50 FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id WHERE c.telefone = '+5511999990002' ORDER BY p.created_at DESC LIMIT 1;

-- Pedido 3 — SEPARADO
INSERT INTO public.pedidos (cliente_id, status, forma_entrega, origem)
SELECT id, 'SEPARADO', 'retirada', 'whatsapp'
FROM public.clientes WHERE telefone = '+5511999990002';

INSERT INTO public.itens_pedido (pedido_id, nome_item, quantidade, preco_unitario)
SELECT p.id, 'Kit canetas coloridas 12un', 2, 12.90 FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id WHERE c.telefone = '+5511999990002' ORDER BY p.created_at DESC LIMIT 1;

-- Pedido 4 — AGUARDANDO_CONFIRMACAO (empresa)
INSERT INTO public.pedidos (cliente_id, status, forma_entrega, observacoes, origem)
SELECT id, 'AGUARDANDO_CONFIRMACAO', 'uber_flash', 'Pedido corporativo — aguardando aprovação financeira', 'whatsapp'
FROM public.clientes WHERE telefone = '+5511999990003';

INSERT INTO public.itens_pedido (pedido_id, nome_item, quantidade, preco_unitario)
SELECT p.id, 'Papel sulfite A4 500fls', 10, 29.90 FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id WHERE c.telefone = '+5511999990003' ORDER BY p.created_at DESC LIMIT 1;

INSERT INTO public.itens_pedido (pedido_id, nome_item, quantidade, preco_unitario)
SELECT p.id, 'Caneta esferográfica azul', 100, 1.90 FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id WHERE c.telefone = '+5511999990003' ORDER BY p.created_at DESC LIMIT 1;

-- Pedido 5 — PRONTO_RETIRADA
INSERT INTO public.pedidos (cliente_id, status, forma_entrega, origem)
SELECT id, 'PRONTO_RETIRADA', 'retirada', 'dashboard'
FROM public.clientes WHERE telefone = '+5511999990001';

INSERT INTO public.itens_pedido (pedido_id, nome_item, quantidade, preco_unitario)
SELECT p.id, 'Régua 30cm', 2, 3.90 FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id WHERE c.telefone = '+5511999990001' ORDER BY p.created_at DESC LIMIT 1;

-- Verifica o resultado
SELECT
  p.numero,
  c.nome AS cliente,
  p.status,
  p.valor_total,
  p.forma_entrega,
  COUNT(i.id) AS qtd_itens
FROM public.pedidos p
JOIN public.clientes c ON c.id = p.cliente_id
LEFT JOIN public.itens_pedido i ON i.pedido_id = p.id
GROUP BY p.numero, c.nome, p.status, p.valor_total, p.forma_entrega
ORDER BY p.numero;
