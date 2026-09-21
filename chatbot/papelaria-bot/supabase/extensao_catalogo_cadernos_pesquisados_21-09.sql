-- =====================================================================
-- VENÂNCIO — TAREFA 21/09/2026: cadernos novos com pesquisa externa
-- =====================================================================
-- 21 cadernos novos (achados na pasta `produtos agente de IA`, ausentes
-- do catálogo) cadastrados com pesquisa externa profunda (site oficial
-- Tilibra/Jandaia, varejistas confiáveis quando o fabricante não tem
-- site institucional localizável). Preço = ticket ShopControl (fonte
-- primária, 19-21/09/2026). Características = pesquisa externa (fonte e
-- confiança documentadas por linha no Documento 02 da base de
-- conhecimento — ver DOCUMENTAÇÃO/base-conhecimento-rag/).
--
-- Duas linhas com confiança BAIXA/MÉDIA na correspondência exata da SKU
-- (documentado explicitamente na descrição de cada produto, não
-- escondido): Tilibra Strong (site oficial só confirma a versão espiral
-- multimatéria, não a brochura 80fls/1-matéria do nosso ticket) e Tilibra
-- Mais+ (nome de linha não confirmado numa página oficial própria).
--
-- imagem_url fica NULL nesta migração de propósito — as fotos already
-- existem localmente (JOÃO VICTOR (produtos)/produtos agente de IA/.../
-- fotos cadernos), mas fazer upload pro Supabase Storage é uma ação de
-- infraestrutura fora do escopo desta tarefa (o pedido original foi
-- "documentar o que precisa ser feito", não processar as imagens agora).
-- Mapeamento completo produto×imagem no Documento 04 da base de
-- conhecimento.
-- =====================================================================

insert into marcas (nome)
select v.nome from (values ('Jandaia'), ('São Domingos')) as v(nome)
where not exists (select 1 from marcas m where m.nome = v.nome);

with cadernos(sku, nome, preco, marca_nome, descricao, tags) as (values
  -- Tilibra D+ Universitário cores lisas — 48fls (4 novos; azul-48 já existe)
  ('4071','CADERNO BROCHURAO TILIBRA UNIV D+ VRM 48FLS',9.99,'TILIBRA',
   'Caderno universitário brochura capa dura, cor lisa vermelha, 48 folhas, 1 matéria. Papel 56g/m², formato 200x275mm, certificado FSC. Linha D+ é a entrada de preço da Tilibra em brochura — sem estampa, só cor lisa. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  ('3911','CADERNO BROCHURAO TILIBRA UNIV D+ VERDE 48FLS',9.99,'TILIBRA',
   'Caderno universitário brochura capa dura, cor lisa verde, 48 folhas, 1 matéria. Papel 56g/m², formato 200x275mm, certificado FSC. Linha D+ é a entrada de preço da Tilibra em brochura — sem estampa, só cor lisa. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  ('3908','CADERNO BROCHURAO TILIBRA UNIV D+ AMA 48FLS',9.99,'TILIBRA',
   'Caderno universitário brochura capa dura, cor lisa amarela, 48 folhas, 1 matéria. Papel 56g/m², formato 200x275mm, certificado FSC. Linha D+ é a entrada de preço da Tilibra em brochura — sem estampa, só cor lisa. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  ('28692','CADERNO BROCHURAO TILIBRA UNIV D+ ROSA 48FLS',9.99,'TILIBRA',
   'Caderno universitário brochura capa dura, cor lisa rosa, 48 folhas, 1 matéria. Papel 56g/m², formato 200x275mm, certificado FSC. Linha D+ é a entrada de preço da Tilibra em brochura — sem estampa, só cor lisa. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  -- Tilibra D+ Universitário cores lisas — 96fls (5 novos)
  ('9746','CADERNO BROCHURAO TILIBRA UNIV D+ VRM 96FLS',11.99,'TILIBRA',
   'Caderno universitário brochura capa dura, cor lisa vermelha, 96 folhas, 1 matéria. Papel 56g/m², formato 200x275mm, certificado FSC. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  ('9745','CADERNO BROCHURAO TILIBRA UNIV D+ AZUL 96FLS',11.99,'TILIBRA',
   'Caderno universitário brochura capa dura, cor lisa azul, 96 folhas, 1 matéria. Papel 56g/m², formato 200x275mm, certificado FSC. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  ('9743','CADERNO BROCHURAO TILIBRA UNIV D+ AMA 96FLS',11.99,'TILIBRA',
   'Caderno universitário brochura capa dura, cor lisa amarela, 96 folhas, 1 matéria. Papel 56g/m², formato 200x275mm, certificado FSC. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  ('9744','CADERNO BROCHURAO TILIBRA UNIV D+ VDE 96FLS',11.99,'TILIBRA',
   'Caderno universitário brochura capa dura, cor lisa verde, 96 folhas, 1 matéria. Papel 56g/m², formato 200x275mm, certificado FSC. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  ('28694','CADERNO BROCHURAO TILIBRA UNIV D+ ROSA 96FLS',11.99,'TILIBRA',
   'Caderno universitário brochura capa dura, cor lisa rosa, 96 folhas, 1 matéria. Papel 56g/m², formato 200x275mm, certificado FSC. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  -- D+FEM
  ('70313','CADERNO BROCHURAO TILIBRA D+FEM 48FLS',8.49,'TILIBRA',
   'Caderno universitário brochura capa dura, 48 folhas, 1 matéria, da sublinha D+FEM (estampas femininas sortidas, não é cor lisa como o D+ padrão). Papel 56g/m² (mesma família construtiva do D+), formato 200x275mm, FSC. Confiança média: specs físicas por família D+, página oficial específica do D+FEM não localizada.',
   array['confianca_media']),
  -- Sapeca Fem
  ('41976','CADERNO BROCHURAO TILIBRA SAPECA FEM 48FLS',9.99,'TILIBRA',
   'Caderno universitário brochura capa dura, 48 folhas, 1 matéria, coleção "Sapeca Kids" — capa estampada com personagens/animais fofos em cenas de brincadeira, cores vibrantes. Infantil, público feminino. Papel 56g/m², formato 200x275mm, FSC. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  -- Mais+
  ('9029','CADERNO 1 MAT TILIBRA MAIS+ 96FLS',12.99,'TILIBRA',
   'Caderno espiral capa dura, 96 folhas, 1 matéria, com separador de matérias e folhas picotadas/pautadas. Papel 56g/m², formato 200x275mm, FSC. Confiança média: não foi localizada uma página oficial batizada exatamente "Mais+" — pode ser nome de gôndola/ponto de venda para essa faixa de produto Tilibra (specs físicas confirmadas em linha equivalente).',
   array['confianca_media']),
  -- Pepper
  ('38199','CADERNO 1 MAT TILIBRA PEPPER 80 FLS',9.99,'TILIBRA',
   'Caderno espiral capa dura universitário, 80 folhas, 1 matéria, linha Pepper. Capa com laminação brilho, bolso de identificação interno, grade de planejamento anual, espiral branco com pauta preta. Existe em versões Masculino e Feminino (estampas diferentes). Papel 56g/m². Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  -- Vibe Masc
  ('72125','CADERNO UNIV. ESPIRAL TILIBRA 1 MAT VIBE MASC 80FL',10.99,'TILIBRA',
   'Caderno espiral capa dura universitário, 80 folhas, 1 matéria, linha Vibe — versão masculina (edição limitada, estampa distinta da versão feminina). Espiral metálico de "abertura total". Papel 56g/m², formato 200x275mm, FSC. Confiança média: specs consistentes entre vários varejistas, página oficial própria da linha não confirmada nesta pesquisa.',
   array['confianca_media']),
  -- Jandaia Stilo
  ('60187','CADERNO JANDAIA STILO 80FLS',19.99,'Jandaia',
   'Caderno espiral capa dura, 80 folhas, marca Jandaia (fabricante diferente da Tilibra). Capa com laminação brilho, pauta "I.A", espiral preto, bolso em papel e cartela de adesivos inclusos. Papel 56g/m². Fonte: site oficial Jandaia.',
   array['confirmado_site_oficial']),
  -- Strong
  ('70317','CADERNO BROCHURAO TILIBRA STRONG 80FLS',15.99,'TILIBRA',
   'Caderno brochura capa dura, 80 folhas, 1 matéria (inferido), linha Strong com estética camuflada, estilo jovem/masculino. ATENÇÃO — confiança BAIXA nesta ficha: o site oficial Tilibra só confirma a linha Strong na versão espiral multimatéria (160/192 folhas); a versão brochura de 80fls/1-matéria deste ticket não foi localizada numa página própria — specs físicas extrapoladas do padrão brochura Tilibra (56g/m², FSC). Precisa validação antes de repassar detalhe técnico ao cliente.',
   array['precisa_validacao','confianca_baixa']),
  -- X-Racing
  ('22440','CADERNO BROCHURAO TILIBRA X-RACING 80FLS',19.99,'TILIBRA',
   'Caderno brochura capa dura universitário, 80 folhas, 1 matéria, linha X-Racing — carros estilizados e cenários de automobilismo na capa, parte interna decorada, folha dupla de adesivos. Juvenil/masculino. Papel 56g/m², FSC. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  -- Raptor
  ('22631','CADERNO BROCHURAO TILIBRA RAPTOR 80FLS',19.99,'TILIBRA',
   'Caderno brochura capa dura universitário, 80 folhas, 1 matéria, linha Raptor — temática dinossauros, capa com estampas coloridas, parte interna estampada, folha dupla de adesivos. Infantil/juvenil. Papel 56g/m², FSC. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  -- São Domingos Pixel Kraft
  ('62927','CAD. BROCHURA SAO DOMINGOS PIXEL KRAFT 80FLS',19.99,'São Domingos',
   'Caderno brochura capa dura universitário, 80 folhas, marca São Domingos (fabricante diferente de Tilibra/Jandaia). Capa com laminação brilho, estampa "pixelada" estilo 8-bit com tema de heróis/aventura, estética kraft (tom pardo). Infantil/juvenil. Papel 56g/m², formato 20x27,5cm. Confiança média: fabricante não tem site institucional localizável nesta pesquisa — specs confirmadas por múltiplos varejistas, não por fonte primária.',
   array['confianca_media']),
  -- Score
  ('66405','CADERNO BROCHURAO TILIBRA SCORE 80FLS',24.99,'TILIBRA',
   'Caderno brochura capa dura universitário, 80 folhas, 1 matéria, linha Score — temática futebol/esportes, cores sortidas, parte interna decorada, folha dupla de adesivos. Juvenil. Papel 56g/m², FSC. Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  -- Gabriel Medina
  ('66612','CADERNO BROCHURA TILIBRA GABRIEL MEDINA 80FLS',29.99,'TILIBRA',
   'Caderno brochura capa dura universitário, 80 folhas, 1 matéria, linha licenciada com o surfista Gabriel Medina — capa com a foto do atleta feita pelo fotógrafo francês Jerome Brouillet, que viralizou na apresentação dele nas Olimpíadas de Paris (a Tilibra lançou o produto atendendo a pedidos de internautas pela estampa). Parte interna decorada, folha dupla de adesivos. Juvenil, fãs de surfe/esportes. Papel 56g/m², FSC. Fonte: site oficial Tilibra + matéria jornalística sobre a origem da estampa.',
   array['confirmado_site_oficial'])
)
insert into produtos (sku, nome, preco, categoria_id, marca_id, ativo, descricao, tags)
select
  c.sku, c.nome, c.preco,
  (select id from categorias where nome = 'Cadernos'),
  m.id, true, c.descricao, c.tags
from cadernos c
left join marcas m on m.nome = c.marca_nome
where not exists (select 1 from produtos p where p.sku = c.sku);

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select count(*) from produtos where categoria_id = (select id from categorias where nome='Cadernos')
--   and tags && array['confirmado_site_oficial','confianca_media','confianca_baixa','precisa_validacao'];
-- -- deve ser 21.
-- select sku, nome, marca_id from produtos where sku in ('60187','62927');
-- -- devem ter marca_id de Jandaia/São Domingos, não Tilibra.
-- =====================================================================
