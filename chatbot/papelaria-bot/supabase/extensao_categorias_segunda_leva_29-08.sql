-- Segunda leva da organização de categorias (mesmo dia de
-- extensao_categorias_taxonomia_ampliada.sql, 29/08/2026). A primeira leva
-- classificou 443/577 produtos (77%) e deixou 134 sem categoria de
-- propósito, pra revisão manual em vez de forçar em "Outros". Olhando essa
-- lista de 134, a maioria forma grupos claros que só não tinham palavra-chave
-- ainda -- esta migration fecha esses grupos.
--
-- Mesmo padrão de segurança do arquivo anterior: idempotente, só afeta
-- produtos com categoria_id ainda NULL, não toca em nenhuma categoria
-- existente (nome ou id), ON CONFLICT DO NOTHING nas novas.
--
-- 2 categorias novas:
--   - Giz de Cera (13 produtos: giz de cera comum, big giz, ecogiz, giz Giotto)
--   - Livros e Revistas (livro infantil avulso, revista em quadrinhos,
--     minidicionário, tabuada -- diferente de "Livros CEC", que é uma coleção
--     específica já cadastrada)
--
-- Extensões de categorias já criadas na primeira leva ou pré-existentes,
-- cobrindo grupos que apareceram nos 134 sem categoria:
--   - Artes Manuais: tela (genérico, além de "tela de pintura/virada"),
--     feltro, lantejoula, juta, tecido, espuma, esfuminho, carvão, anilina,
--     corante, pintura a dedo, acripel, pena, pompom, espetos, palito,
--     marabu, lixa, bandeja, argilinha, material dourado, ábaco, dado,
--     alfabeto móvel, sisal, sianinha, fitilho, botões, linha de nylon, lã,
--     prendedor/pregador de roupa (uso em artesanato)
--   - Escritório e Organização: encadernação, plastificação, etiqueta,
--     maleta, organizador, caixa organizadora, post-it, plástico bolha,
--     pote, baú (organizadores/armazenamento)
--   - Brinquedos e Festas: canudo, prato descartável
--   - Papeis especiais: Ecocores, off kit, offpinho, folhas Canson, álbum,
--     bloco (papel/cartolina decorativa e de desenho especializada)
--   - Lápiseira: grafite (refil -- acessório de lapiseira, não de lápis)
--   - Canetas e Marcadores: Pilot Color (linha de canetinha/hidrocor)
--
-- Produtos que continuarem sem bater em nada (ex.: "KIT COLEGIAL"/"KIT
-- ESCOLAR", que são pacotes com itens de várias categorias) ficam NULL de
-- propósito -- não existe categoria "certa" única pra um kit multi-item.

insert into categorias (nome) values
  ('Giz de Cera'),
  ('Livros e Revistas')
on conflict (nome) do nothing;

-- Giz de Cera
update produtos
set categoria_id = (select id from categorias where nome = 'Giz de Cera')
where categoria_id is null
  and nome ilike '%GIZ%';

-- Livros e Revistas
update produtos
set categoria_id = (select id from categorias where nome = 'Livros e Revistas')
where categoria_id is null
  and (
    nome ilike '%LIVRO%'
    or nome ilike '%REVISTA%'
    or nome ilike '%MINIDICIONARIO%'
    or nome ilike '%TABUADA%'
  );

-- Canetas e Marcadores (extra)
update produtos
set categoria_id = (select id from categorias where nome = 'Canetas e Marcadores')
where categoria_id is null
  and nome ilike '%PILOT COLOR%';

-- Artes Manuais (extra)
update produtos
set categoria_id = (select id from categorias where nome = 'Artes Manuais')
where categoria_id is null
  and (
    nome ilike '%TELA%'
    or nome ilike '%FELTRO%'
    or nome ilike '%LANTEJOULA%'
    or nome ilike '%JUTA%'
    or nome ilike '%TECIDO%'
    or nome ilike '%ESPUMA%'
    or nome ilike '%ESFUMINHO%'
    or nome ilike '%CARVAO%'
    or nome ilike '%ANILINA%'
    or nome ilike '%CORANTE%'
    or nome ilike '%PINTURA A DEDO%'
    or nome ilike '%ACRIPEL%'
    or nome ilike '%PENA%'
    or nome ilike '%POMPOM%'
    or nome ilike '%ESPETOS%'
    or nome ilike '%PALITO%'
    or nome ilike '%MARABU%'
    or nome ilike '%LIXA%'
    or nome ilike '%BANDEJA%'
    or nome ilike '%ARGILINHA%'
    or nome ilike '%MATERIAL DOURADO%'
    or nome ilike '%ABACO%'
    or nome ilike 'DADO %'
    or nome ilike '%ALFABETO MOVEL%'
    or nome ilike '%SISAL%'
    or nome ilike '%SIANINHA%'
    or nome ilike '%FITILHO%'
    or nome ilike '%BOTOES%'
    or nome ilike '%LINHA DE NYLON%'
    or nome ilike '%LA CORRENTE%'
    or nome ilike '%PREGADOR%'
    or nome ilike '%PRENDEDOR%'
  );

-- Escritório e Organização (extra)
update produtos
set categoria_id = (select id from categorias where nome = 'Escritório e Organização')
where categoria_id is null
  and (
    nome ilike '%ENCADERNACAO%'
    or nome ilike '%PLASTIFICACAO%'
    or nome ilike '%POLASSEAL%'
    or nome ilike '%ETIQUETA%'
    or nome ilike '%MALETA%'
    or nome ilike '%ORGANIZADOR%'
    or nome ilike '%CAIXA ORGANIZADORA%'
    or nome ilike '%POST IT%'
    or nome ilike '%POST-IT%'
    or nome ilike '%PLASTICO BOLHA%'
    or nome ilike '%POTE %'
    or nome ilike '%BAU MDF%'
  );

-- Brinquedos e Festas (extra)
update produtos
set categoria_id = (select id from categorias where nome = 'Brinquedos e Festas')
where categoria_id is null
  and (
    nome ilike '%CANUDO%'
    or nome ilike '%PRATO %'
  );

-- Papeis especiais (extra -- categoria pré-existente antes de qualquer migration nova)
update produtos
set categoria_id = (select id from categorias where nome = 'Papeis especiais')
where categoria_id is null
  and exists (select 1 from categorias where nome = 'Papeis especiais')
  and (
    nome ilike '%ECOCORES%'
    or nome ilike '%OFF KIT%'
    or nome ilike '%OFFPINHO%'
    or nome ilike '%FOLHAS CANSON%'
    or nome ilike '%ALBUM%'
    or nome ilike '%BLOCO%'
  );

-- Lápiseira (extra -- reforço de categoria pré-existente: grafite é
-- acessório/refil de lapiseira, não de lápis)
update produtos
set categoria_id = (select id from categorias where nome = 'Lápiseira')
where categoria_id is null
  and exists (select 1 from categorias where nome = 'Lápiseira')
  and nome ilike '%GRAFITE%';

-- ---------------------------------------------------------------------
-- Ajuste fino (mesmo dia): 4 últimos gaps achados na conferência --
-- AVENTAL, BARBANTE e ESPONJA (diferente de ESPUMA, já coberta acima --
-- esponja=sponge, espuma=foam) entram em Artes Manuais; "ENC." abreviado
-- de encadernação entra em Escritório e Organização. Resultado final:
-- 575 de 577 produtos classificados (99,7%). Só "KIT COLEGIAL"/"KIT
-- ESCOLAR" ficam sem categoria, de propósito (bundle multi-categoria).
-- ---------------------------------------------------------------------

update produtos
set categoria_id = (select id from categorias where nome = 'Artes Manuais')
where categoria_id is null
  and (
    nome ilike '%AVENTAL%'
    or nome ilike '%BARBANTE%'
    or nome ilike '%ESPONJA%'
  );

update produtos
set categoria_id = (select id from categorias where nome = 'Escritório e Organização')
where categoria_id is null
  and nome ilike '%P/ ENC.%';
