-- Auditoria de catálogo de 29/08/2026: cruzamento de 24 recibos de venda de
-- balcão reais (Shop Control/F10, vendas de 25-29/08/2026) contra os 577
-- produtos do Supabase. Confirmado com o dono da loja que o "Codigo" desses
-- recibos é o SKU real e confiável do sistema de origem.
--
-- Duas correções, só para os produtos onde o NOME bateu exatamente (42 dos
-- 188 itens vendidos únicos) -- ou seja, alta confiança de que é o mesmo
-- produto físico, não uma adivinhação por nome parecido:
--
-- 1) Preenche `sku` (hoje vazio em 576 dos 577 produtos) com o código real do
--    Shop Control, pra parar de depender só de nome/fuzzy-match pra
--    identificar produto -- o cruzamento também revelou 29 casos de nomes
--    "parecidos" que na verdade eram produtos DIFERENTES (ex.: "PINCEL CONDOR
--    471 16" vs "PINCEL CONDOR 474 16" já cadastrado), então nome sozinho não
--    é confiável o suficiente pra várias operações futuras (relançamento de
--    produto, checagem de duplicidade, etc.).
--
-- 2) Corrige o preço de 9 produtos onde o valor do Supabase estava
--    desatualizado em relação ao preço real de venda (todos os 9 casos na
--    mesma direção: catálogo mais barato que o preço real, ou seja, o bot
--    estava cotando abaixo do preço de balcão). `reindexar_produto_editado`
--    (extensao_produtos_documentos_reindexa_ao_editar.sql) já cuida de tirar
--    esses produtos do RAG pra reindexar com o preço novo, não precisa mexer
--    em mais nada.
--
-- Não mexe em nome, estoque, categoria, aliases, tags ou marca de nenhum
-- produto. Não cria produto novo (os 117+29 itens vendidos que não bateram
-- com nada do catálogo ficam para uma rodada separada, com decisão do dono
-- da loja sobre cadastrar ou não cada um).

update produtos as p
set sku = v.sku
from (values
  ('2b3ca419-002c-49a0-89d2-bad4ba4d3b60'::uuid, '595'),
  ('9492065b-543f-41d2-ba4d-6f1b0cc20b8a'::uuid, '1174'),
  ('a9498a80-2f6d-4195-a51a-41062a87e4f9'::uuid, '70435'),
  ('d9472ebe-8ff0-435d-97d5-7dd7c4f5d9b5'::uuid, '40227'),
  ('7db3bd42-cd40-4f49-aa1b-99f1ce0add3c'::uuid, '35550'),
  ('d4471a34-51b6-4aaf-af64-c576c36307a6'::uuid, '65500'),
  ('c60bce6b-6fc2-4e5c-8c5b-eca9fd980e4b'::uuid, '4381'),
  ('11accbd9-5f4f-4b8d-9e54-5fd87b3c2a80'::uuid, '21825'),
  ('b6cd0aaf-5ab9-4ea4-8d19-fde87b5b84e7'::uuid, '2052'),
  ('c7413938-797c-4775-9d32-9c717b1fba1e'::uuid, '2346'),
  ('03d7bf7b-f8e9-4c43-b1cf-daf42078db25'::uuid, '13917'),
  ('1be9cdd3-41aa-4f45-8a17-8a877ae2e0c3'::uuid, '67700'),
  ('02c0f2ee-c02f-4227-98b6-4f6fa8e42ccb'::uuid, '1166'),
  ('f0068caa-9daf-43a4-ba61-041fe163e3d2'::uuid, '30941'),
  ('51bf6037-5e80-4939-a1e3-e502ecd17b59'::uuid, '18823'),
  ('f42593cd-baa8-4106-a228-7f0edf0c6b83'::uuid, '2630'),
  ('e535dced-e2d7-47d2-b450-c01e7455e9a2'::uuid, '598'),
  ('1b145b4b-1623-4e5e-990a-dd39d28d5f10'::uuid, '34396'),
  ('47b108ab-29b8-4a3b-ab5e-12be133601a6'::uuid, '22839'),
  ('2ce5cbfb-e562-4551-876d-6da30d3d3c0a'::uuid, '10590'),
  ('cab9a064-e513-4fb1-ac29-ef08d36740e7'::uuid, '202'),
  ('11ea5f28-52e3-42c1-ba0b-38278156a19e'::uuid, '62472'),
  ('368d37e3-8eec-45dd-8c02-b54f2902fd51'::uuid, '70244'),
  ('2eb9566d-de71-4c0e-acef-93f98d04fb14'::uuid, '14666'),
  ('8c7e13af-63a8-47d3-9cbc-43b9affac3bc'::uuid, '235'),
  ('cada85c2-df14-4222-bd9b-2aa786b27340'::uuid, '32088'),
  ('f5cba9d7-c665-4aff-998a-be0a97dd611b'::uuid, '1175'),
  ('2b14a19e-df30-4b8f-8ccd-aa8d99222cfc'::uuid, '33364'),
  ('fba28d9d-44db-4990-8961-061f4440c863'::uuid, '72050'),
  ('b4962571-7613-4b18-a3c8-3ed7f9836ecb'::uuid, '665'),
  ('f590ade4-99dc-4531-a930-d4bd6609da17'::uuid, '8108'),
  ('a3d8369d-2053-46d2-aeea-2c722bfad735'::uuid, '32086'),
  ('c358b336-f025-424c-b10c-d9199a14ebb3'::uuid, '231'),
  ('72d7e7b0-9ceb-4a79-bd0e-d10e68ad8d61'::uuid, '22837'),
  ('e4942979-62d8-4fdf-8dfc-18b6a7f95de2'::uuid, '22838'),
  ('c16a7a7f-4552-4379-bfa5-9558a76438bd'::uuid, '36071'),
  ('386350fa-aeac-4ccb-adab-f9a4d23ce8e8'::uuid, '40369'),
  ('04337255-b5a2-43af-a07d-45d48459d943'::uuid, '15727'),
  ('1854a36e-ecd1-4bb1-9b9f-0abb7e8aa0df'::uuid, '25628'),
  ('ca9f77ee-c76d-4fbe-9270-464a50db19c7'::uuid, '66933'),
  ('ced402a6-086d-4401-b455-e978d2f805c7'::uuid, '18864'),
  ('1af1c096-5d7c-43ed-9260-9a4ae2cf0e92'::uuid, '21832')
) as v(id, sku)
where p.id = v.id
  and p.sku is null; -- nunca sobrescreve um sku já preenchido manualmente

update produtos as p
set preco = v.preco_correto
from (values
  ('a9498a80-2f6d-4195-a51a-41062a87e4f9'::uuid, 5.99::numeric), -- PALITO PONTA GUADRADA 15X100 NATURAL, era 5.67
  ('b6cd0aaf-5ab9-4ea4-8d19-fde87b5b84e7'::uuid, 5.99::numeric), -- TINTA PVA ACRILEX BRANCO 519 37ML, era 4.99
  ('1be9cdd3-41aa-4f45-8a17-8a877ae2e0c3'::uuid, 14.99::numeric), -- PAPEL REPORT A4 SENNINHA BRANCO 50FLS 180G, era 11.35
  ('51bf6037-5e80-4939-a1e3-e502ecd17b59'::uuid, 5.99::numeric), -- TINTA PVA ACRILEX PRETO 520 37ML, era 4.99
  ('11ea5f28-52e3-42c1-ba0b-38278156a19e'::uuid, 19.99::numeric), -- KIT COLEGIAL NEW LINE WALEU 4 PECAS CRISTAL, era 14.99
  ('368d37e3-8eec-45dd-8c02-b54f2902fd51'::uuid, 3.99::numeric), -- PASTA ABA C/ELASTICO ACP PLASTICA CRISTAL REF.1021, era 3.19
  ('fba28d9d-44db-4990-8961-061f4440c863'::uuid, 19.99::numeric), -- PASTA CATALOGO ACP 30 ENV. FINOS REF 123/30, era 15.99
  ('386350fa-aeac-4ccb-adab-f9a4d23ce8e8'::uuid, 8.99::numeric), -- TINTA GUACHE ACRILEX AMARELO OCRE 564 250ML, era 6.89
  ('ced402a6-086d-4401-b455-e978d2f805c7'::uuid, 5.99::numeric) -- TINTA TECIDO FOSCA ACRILEX VERMELHO VIVO 541 37ML, era 5.49
) as v(id, preco_correto)
where p.id = v.id;
