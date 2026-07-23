-- Seed de produtos para teste
INSERT INTO public.produtos (nome, categoria, sku, preco, estoque, tags) VALUES
  ('Caderno 10 matérias Tilibra', 'Caderno', 'CAD-001', 24.90, 50, ARRAY['escolar', 'caderno']),
  ('Caderno 5 matérias Tilibra', 'Caderno', 'CAD-002', 14.90, 60, ARRAY['escolar', 'caderno']),
  ('Mochila escolar infantil', 'Mochila', 'MOC-001', 89.90, 20, ARRAY['escolar', 'mochila']),
  ('Mochila escolar adulto', 'Mochila', 'MOC-002', 129.90, 15, ARRAY['escolar', 'mochila']),
  ('Estojo duplo', 'Estojo', 'EST-001', 19.90, 40, ARRAY['escolar', 'estojo']),
  ('Kit canetas coloridas 12un', 'Material', 'KIT-001', 12.90, 80, ARRAY['escolar', 'caneta']),
  ('Lápis de cor 24 cores', 'Material', 'LAP-001', 22.50, 45, ARRAY['escolar', 'lapis']),
  ('Régua 30cm', 'Material', 'REG-001', 3.90, 100, ARRAY['escolar']),
  ('Compasso escolar', 'Material', 'COM-001', 8.50, 30, ARRAY['escolar']),
  ('Borracha branca', 'Material', 'BOR-001', 2.50, 200, ARRAY['escolar']),
  ('Apontador duplo', 'Material', 'APO-001', 3.50, 150, ARRAY['escolar']),
  ('Caneta esferográfica azul', 'Material', 'CAN-001', 1.90, 500, ARRAY['escolar', 'caneta']),
  ('Caneta esferográfica vermelha', 'Material', 'CAN-002', 1.90, 300, ARRAY['escolar', 'caneta']),
  ('Marca texto amarelo', 'Material', 'MAR-001', 4.50, 120, ARRAY['escolar']),
  ('Papel sulfite A4 500fls', 'Papel', 'PAP-001', 29.90, 100, ARRAY['escritorio', 'papel']),
  ('Cola bastão', 'Material', 'COL-001', 5.90, 90, ARRAY['escolar']),
  ('Tesoura escolar', 'Material', 'TES-001', 7.90, 50, ARRAY['escolar']),
  ('Régua T 40cm', 'Material', 'REG-002', 12.90, 20, ARRAY['tecnico']),
  ('Kit geométrico escolar', 'Kit', 'KIT-002', 18.90, 35, ARRAY['escolar', 'kit']),
  ('Fichário A4 4 argolas', 'Fichário', 'FIC-001', 34.90, 25, ARRAY['escolar', 'fichario'])
ON CONFLICT (sku) DO NOTHING;

-- Seed de listas escolares
INSERT INTO public.listas_escolares (escola, serie, ano, itens) VALUES
  (
    'Escola Municipal João XXIII',
    '1º Ano',
    2026,
    '[
      {"nome": "Caderno 5 matérias", "quantidade": 2, "opcional": false},
      {"nome": "Lápis de cor 12 cores", "quantidade": 1, "opcional": false},
      {"nome": "Borracha branca", "quantidade": 2, "opcional": false},
      {"nome": "Apontador duplo", "quantidade": 1, "opcional": false},
      {"nome": "Estojo simples", "quantidade": 1, "opcional": false},
      {"nome": "Cola bastão", "quantidade": 1, "opcional": false},
      {"nome": "Tesoura escolar", "quantidade": 1, "opcional": false}
    ]'
  ),
  (
    'Escola Municipal João XXIII',
    '5º Ano',
    2026,
    '[
      {"nome": "Caderno 10 matérias", "quantidade": 1, "opcional": false},
      {"nome": "Caderno 5 matérias", "quantidade": 2, "opcional": false},
      {"nome": "Kit canetas coloridas", "quantidade": 1, "opcional": false},
      {"nome": "Régua 30cm", "quantidade": 1, "opcional": false},
      {"nome": "Compasso escolar", "quantidade": 1, "opcional": false},
      {"nome": "Borracha branca", "quantidade": 2, "opcional": false},
      {"nome": "Lápis de cor 24 cores", "quantidade": 1, "opcional": true}
    ]'
  )
ON CONFLICT DO NOTHING;
