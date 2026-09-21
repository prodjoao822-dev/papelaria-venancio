-- =====================================================================
-- VENÂNCIO — TAREFA 21/09/2026: base de conhecimento comercial p/ RAG
-- Cadastro "leve" dos produtos novos (não-caderno) + fix de preço
-- =====================================================================
-- Contexto: análise da pasta `JOÃO VICTOR (produtos)/produtos agente de
-- IA` (10 tickets de venda balcão do ShopControl, um por categoria — na
-- prática um snapshot real de SKU+nome+preço direto do ERP) cruzada com
-- o catálogo ao vivo. Resultado: 122 itens na pasta, 22 já existiam com
-- preço batendo, 1 já existia com preço DIVERGENTE, 99 eram novos.
--
-- Decisão do dono (21/09/2026): cadernos (21 dos 99 novos) recebem
-- pesquisa externa profunda + cadastro completo — ver migração separada
-- `extensao_catalogo_cadernos_pesquisados_21-09.sql`. Os outros 78 itens
-- (canetas, borracha/apontador, canetinha, giz de cera, lápis de cor,
-- lápis/lapiseira/grafite, marca texto) entram agora com cadastro LEVE
-- (nome, SKU, preço, categoria, marca quando óbvia do próprio nome) —
-- sem pesquisa de ficha técnica nesta rodada. Marcados com a tag
-- 'pendente_pesquisa' pra próxima rodada (ver Documento 07 — Produtos
-- Pendentes de Validação).
--
-- Categoria/marca de cada item foi decidida por PRECEDENTE: os itens que
-- já existiam no catálogo, vindos do MESMO ticket (mesma categoria
-- ShopControl), já tinham categoria_id definido — reaproveitado aqui pra
-- manter consistência (ex.: "Lápis" vs "Lápiseira" pro mesmo ticket
-- "Lápis, lapiseira e grafite", separado por prefixo do nome do produto).
--
-- Preço: todos os 78 preços abaixo são os do ticket do ShopControl
-- (Sequencia 54951-54969, 19/09/2026, vendedor JOAO VICTOR MONTEIRO DE)
-- — fonte primária direta do ERP da loja, não é inferência.
-- =====================================================================

-- Marcas novas (nomes extraídos do próprio nome do produto no ticket —
-- não é pesquisa de característica, só identificação da marca).
insert into marcas (nome)
select v.nome from (values
  ('Bic'), ('Cis'), ('Pilot'), ('Mercur'), ('Sky Paper'), ('Stabilo'),
  ('Maxprint'), ('Jocar Office'), ('Bazze'), ('Leo e Leo')
) as v(nome)
where not exists (select 1 from marcas m where m.nome = v.nome);

-- Fix de preço com rastreabilidade (item 10 da tarefa: Informação → Fonte
-- → Data → Status). Catálogo tinha R$12,99; ticket ShopControl de
-- 19/09/2026 (Sequencia 54957, categoria "Marca texto") mostra R$14,99.
-- Fonte primária (ERP) prevalece sobre o valor antigo no catálogo.
update produtos
set preco = 14.99,
    descricao = coalesce(descricao, '') ||
      case when descricao is null or descricao = '' then '' else E'\n' end ||
      '[Preço atualizado 2026-09-21 → ticket ShopControl Sequencia 54957 (19/09/2026): R$14,99. Valor anterior no catálogo: R$12,99. Status: confirmado (fonte primária ERP).]'
where sku = '42233';

-- =====================================================================
-- 78 produtos novos — cadastro leve (nome/sku/preço/categoria/marca).
-- tags inclui 'pendente_pesquisa' em todos — sinaliza que características
-- técnicas (uso, diferenciais) ainda não foram pesquisadas nesta rodada.
-- =====================================================================
with novos(sku, nome, preco, categoria_nome, marca_nome) as (values
  -- Canetas (16 novos)
  ('236','CANETA BIC CRISTAL VERMELHA',1.99,'Canetas e Marcadores','Bic'),
  ('30939','CANETA FABER CASTELL TRILUX VERMELHA/AZUL',1.50,'Canetas e Marcadores','Faber Castell'),
  ('15036','CANETA FABER CASTELL TRILUX AZUL',1.99,'Canetas e Marcadores','Faber Castell'),
  ('67999','CANETA CIS SPIRO 0.7 GEL AZUL',4.99,'Canetas e Marcadores','Cis'),
  ('67996','CANETA CIS SPIRO 0.7 GEL ROSA',4.99,'Canetas e Marcadores','Cis'),
  ('69975','CANETA COMPACTOR ECONOMIC FINA AZUL',1.99,'Canetas e Marcadores','Compactor'),
  ('69977','CANETA COMPACTOR ECONOMIC FINA VERMELHA',1.99,'Canetas e Marcadores','Compactor'),
  ('70160','CANETA COMPACTOR 0.7 BASIC AZUL',2.99,'Canetas e Marcadores','Compactor'),
  ('70161','CANETA COMPACTOR 0.7 BASIC PRETA',2.99,'Canetas e Marcadores','Compactor'),
  ('70158','CANETA COMPACTOR 0.7 BASIC VERMELHA',2.99,'Canetas e Marcadores','Compactor'),
  ('38672','CANETA APAGAVEL FRIXION PILOT 0.7 AZUL BL-FR7L',19.99,'Canetas e Marcadores','Pilot'),
  ('38671','CANETA APAGAVEL FRIXION PILOT 0.7 PRETO BL-FR7L',19.99,'Canetas e Marcadores','Pilot'),
  ('38775','CANETA APAGAVEL FRIXION PILOT 0.7 ROSA BL-FR7L',19.99,'Canetas e Marcadores','Pilot'),
  ('28813','CANETA APAGAVEL FRIXION PILOT 0.7 VIOLETA BL-FR7L',19.99,'Canetas e Marcadores','Pilot'),
  ('38776','CANETA APAGAVEL FRIXION PILOT 0.7 VERMELHA BL-FR7L',19.99,'Canetas e Marcadores','Pilot'),
  ('31167','CANETA APAGAVEL FRIXION PILOT 0.7 AZUL CLA BL-FR7L',19.99,'Canetas e Marcadores','Pilot'),
  -- Borracha/Apontador (10 novos)
  ('10077','BORRACHA FABER CASTELL FC MAX PEQ. BRANCA',4.99,'Borrachas e Corretivos','Faber Castell'),
  ('2102','BORRACHA FABER CASTELL FC MAX GLITTER',4.99,'Borrachas e Corretivos','Faber Castell'),
  ('4088','BORRACHA MERCUR RECORD 20',2.99,'Borrachas e Corretivos','Mercur'),
  ('250','BORRACHA MERCUR RECORD 40',1.99,'Borrachas e Corretivos','Mercur'),
  ('4387','APONTADOR FABER CASTELL SINCE 1761 C/ DEPOSITO',5.99,'Borrachas e Corretivos','Faber Castell'),
  ('44745','APONTADOR C/ DEPOSITO FABER CASTELL TRIANGULAR',4.99,'Borrachas e Corretivos','Faber Castell'),
  ('68799','BORRACHA 40 SKY PAPER',0.99,'Borrachas e Corretivos','Sky Paper'),
  ('62827','APONTADOR TILIBRA 1 FURO CORES AP10',7.99,'Borrachas e Corretivos','TILIBRA'),
  ('2007','BORRACHA MERCUR CLEAN CHANFRADO CORES',2.99,'Borrachas e Corretivos','Mercur'),
  ('71782','APONTADOR TILIBRA 2 FURO C/DEPOSITO BICHO SORT',9.99,'Borrachas e Corretivos','TILIBRA'),
  -- Canetinha (8 novos)
  ('17855','CANETINHA HIDROCOR LEONORA 12 CORES',4.95,'Canetas e Marcadores','Leonora'),
  ('43835','CANETINHA HIDROCOR BWR 12 CORES CA8001',4.99,'Canetas e Marcadores','Brw'),
  ('41670','CANETINHA HIDROCOR BRW +PLUS 12 CORES CA8003',8.99,'Canetas e Marcadores','Brw'),
  ('4376','CANETINHA HIDROCOR FABER CASTELL 12 CORES',16.99,'Canetas e Marcadores','Faber Castell'),
  ('1810','CANETINHA HIDROCOR FABER CASTELL 24 CORES',34.99,'Canetas e Marcadores','Faber Castell'),
  ('43730','CANETINHA FABER CASTELL VAI E VEM 36 CORES',99.99,'Canetas e Marcadores','Faber Castell'),
  ('70601','CANETINHA HIDROCOR SKY PAPER JUMBO 24 CORES',29.99,'Canetas e Marcadores','Sky Paper'),
  ('72251','CANETINHA HIDROCOR PILOT COLOR 750-L 12CORES',34.99,'Canetas e Marcadores','Pilot'),
  -- Giz de cera (8 novos — categoria inteira era nova)
  ('764','GIZ DE CERA ACRILEX 6 CORES',3.99,'Giz de Cera','Acrilex'),
  ('1287','GIZ DE CERA 12 CORES ACRILEX',5.99,'Giz de Cera','Acrilex'),
  ('4369','GIZ DE CERA ACRILEX CURTO 15 CORES 9215',8.49,'Giz de Cera','Acrilex'),
  ('69127','BIG GIZ DE CERA 15 CORES REF09151',14.99,'Giz de Cera','Acrilex'),
  ('2566','GIZ DE CERA ACRILEX TRIANGULAR 12 CORES 9312',9.49,'Giz de Cera','Acrilex'),
  ('27856','GIZ DE CERA ACRILEX TWIST RETRATIL 12 CORES',29.99,'Giz de Cera','Acrilex'),
  ('39530','GIZ DE CERA ACRILEX CURTO TRIANGULAR 12 CORES 9412',7.49,'Giz de Cera','Acrilex'),
  ('38647','BIG GIZ DE CERA ACRILEX NEON 6 CORES 09806',19.99,'Giz de Cera','Acrilex'),
  -- Lápis de cor (14 novos)
  ('39048','LAPIS DE COR BRW RECICLADO 12 CORES',4.99,'Lápis','Brw'),
  ('62936','LAPIS DE COR BAZZE WAVE 12 CORES REF.902122',3.99,'Lápis','Bazze'),
  ('23145','LAPIS DE COR NEO PEN COMPACTOR 12 CORES',14.99,'Lápis','Compactor'),
  ('71184','KIT LAPIS DE COR NEO-PEN COMPACTOR C/12CORES',14.99,'Lápis','Compactor'),
  ('4341','LAPIS DE COR FABER CASTELL KIT ESCOLAR 12 CORES',26.99,'Lápis','Faber Castell'),
  ('41855','LAPIS DE COR FABER CASTELL CARAS E CORES 12CORES+3',26.99,'Lápis','Faber Castell'),
  ('47037','LAPIS DE COR FABER CASTELL 24 CORES + 4 PASTEL',49.99,'Lápis','Faber Castell'),
  ('41856','LAPIS DE COR FABER CASTELL CARAS E CORES 24CORES+3',49.99,'Lápis','Faber Castell'),
  ('23146','LAPIS DE COR NEO PEN COMPACTOR 24 CORES',25.99,'Lápis','Compactor'),
  ('28967','LAPIS DE COR NEO PEN COMPACTOR 36 CORES',39.99,'Lápis','Compactor'),
  ('28968','LAPIS DE COR NEO PEN COMPACTOR 48 CORES',54.99,'Lápis','Compactor'),
  ('61103','LAPIS DE COR LEO E LEO AQUARELAVEL 12CORES C/PIN',19.99,'Lápis','Leo e Leo'),
  ('22332','LAPIS DE COR ACRILEX 12 CORES AQUARELAVEL',19.99,'Lápis','Acrilex'),
  ('19201','LAPIS DE COR ACRILEX AQUARELAVEL 24 CORES',39.99,'Lápis','Acrilex'),
  -- Lápis/Lapiseira/Grafite (8 novos)
  ('39121','LAPIS FABER CASTELL ECOLAPIS Nº2 NEON',1.99,'Lápis','Faber Castell'),
  ('68801','LAPISEIRA SKY PAPER 0.7 SK1303',9.99,'Lápiseira','Sky Paper'),
  ('44810','LAPISEIRA BRW 2.0 TOM PASTEL CORES',7.99,'Lápiseira','Brw'),
  ('4380','GRAFITE FABER CASTELL 0.5 2B/HB',7.99,'Lápiseira','Faber Castell'),
  ('69349','GRAFITE BRW HB 3.0MM GF3050',4.99,'Lápiseira','Brw'),
  ('63808','GRAFITE 2B CIS BIG TREE 2.0MM COM 6UN 5.9900',4.99,'Lápiseira','Cis'),
  ('25878','LAPISEIRA COMPACTOR ALUNO 0.7 CORES',12.99,'Lápiseira','Compactor'),
  ('71694','LAPISEIRA COMPACTOR SOFT LINE AUTOMATIC PRETA 0,7',14.99,'Lápiseira','Compactor'),
  -- Marca texto (14 novos)
  ('25886','MARCA TEXTO COMPACTOR DESTAQ AZUL',4.99,'Canetas e Marcadores','Compactor'),
  ('34956','MARCA TEXTO COMPACTOR DESTAQ VERDE',4.99,'Canetas e Marcadores','Compactor'),
  ('25887','MARCA TEXTO COMPACTOR DESTAQ ROSA',4.99,'Canetas e Marcadores','Compactor'),
  ('25888','MARCA TEXTO COMPACTOR DESTAQ LARANJA',4.99,'Canetas e Marcadores','Compactor'),
  ('40974','MARCA TEXTO PILOT 200-SL AZUL',4.99,'Canetas e Marcadores','Pilot'),
  ('40975','MARCA TEXTO PILOT 200-SL ROSA',4.99,'Canetas e Marcadores','Pilot'),
  ('15560','MARCA TEXTO PILOT 200-SL LARANJA',4.99,'Canetas e Marcadores','Pilot'),
  ('15561','MARCA TEXTO PILOT 200-SL VIOLETA',4.99,'Canetas e Marcadores','Pilot'),
  ('65281','MARCA TEXTO MAXPRINT NEEDS AMARELO',2.99,'Canetas e Marcadores','Maxprint'),
  ('66177','MARCA TEXTO JOCAR OFFICE SLIM ROSA',2.99,'Canetas e Marcadores','Jocar Office'),
  ('17728','MARCA TEXTO STABILO BOSS ORIGINAL CORES',14.99,'Canetas e Marcadores','Stabilo'),
  ('65478','MARCA TEXTO STABILO BOSS NATURE CORES',14.99,'Canetas e Marcadores','Stabilo'),
  ('46699','MARCA TEXTO STABILO BOSS ESTOJO C/4 CORES',49.99,'Canetas e Marcadores','Stabilo'),
  ('67481','MARCA TEXTO COMPACTOR FRUIT-TELLA 4UND',19.99,'Canetas e Marcadores','Compactor')
)
insert into produtos (sku, nome, preco, categoria_id, marca_id, ativo, tags)
select
  n.sku, n.nome, n.preco, c.id, m.id, true, array['pendente_pesquisa']
from novos n
join categorias c on c.nome = n.categoria_nome
left join marcas m on m.nome = n.marca_nome
where not exists (select 1 from produtos p where p.sku = n.sku);

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select count(*) from produtos where 'pendente_pesquisa' = any(tags);
-- -- deve ser 78.
-- select preco, descricao from produtos where sku = '42233';
-- -- deve ser 14.99, com a nota de rastreabilidade no fim da descrição.
-- =====================================================================
