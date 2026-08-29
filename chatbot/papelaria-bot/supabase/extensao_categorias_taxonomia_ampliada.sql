-- =====================================================================
-- VENÂNCIO — Taxonomia de categorias ampliada + classificação em massa
-- =====================================================================
-- Contexto: em 29/08/2026 o catálogo tinha 577 produtos e só 7 com
-- categoria_id preenchido (~1,2%). As 7 categorias existentes (Cadernos,
-- Cola, Lápis, Lápiseira, Livros CEC, Papeis especiais, Outros) NÃO são
-- tocadas por este arquivo — nem nome nem id. Este arquivo só ADICIONA
-- 12 categorias novas e faz UPDATE condicional de produtos.categoria_id
-- onde ainda está NULL, por regra de palavra-chave em `nome` (ILIKE /
-- regex de fronteira de palavra, case-insensitive).
--
-- REGRA DE PRIORIDADE: os UPDATEs abaixo são sequenciais e cada um só
-- pega produtos com categoria_id ainda NULL (`where categoria_id is
-- null and ...`). Isso já garante que a primeira regra que bater vence,
-- sem precisar de CASE complexo — a ordem dos blocos abaixo É a ordem
-- de prioridade.
--
-- Por que regex de fronteira de palavra (~* '\y...\y') em vez de ILIKE
-- '%...%' puro em alguns casos: palavras curtas/genéricas podem casar
-- como substring de outra palavra sem relação nenhuma. Exemplo real que
-- motivou isso: ILIKE '%COLA%' também dá match em "MOCHILA ESCOLAR" e
-- "KIT ESCOLAR" (a sequência de letras "cola" aparece dentro de
-- "escolar"). Por isso COLA, EVA, TNT e MASSA usam fronteira de palavra
-- (\y...\y). Os demais termos são compostos/longos o bastante (6+
-- letras ou frase com espaço) pra ILIKE simples não ter esse risco.
--
-- Produtos que não baterem em NENHUMA regra ficam com categoria_id NULL
-- de propósito (não jogamos em "Outros" só pra não sobrar vazio) — a
-- query de verificação no fim deste arquivo lista esses produtos pra
-- revisão manual.
--
-- Idempotente: o INSERT usa ON CONFLICT (nome) DO NOTHING; os UPDATEs só
-- reclassificam quem ainda está NULL, então rodar de novo não sobrescreve
-- nada que já foi classificado (nem pelas 7 categorias antigas, nem por
-- este próprio arquivo).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Categorias novas (as 7 já existentes — Cadernos, Cola, Lápis,
--    Lápiseira, Livros CEC, Papeis especiais, Outros — NÃO são
--    recriadas nem alteradas aqui; o UNIQUE(nome) evita duplicata e o
--    ON CONFLICT DO NOTHING torna o INSERT seguro de rodar de novo).
-- ---------------------------------------------------------------------

insert into categorias (nome) values
  ('Canetas e Marcadores'),
  ('Tintas e Pincéis'),
  ('Papéis'),
  ('Fitas e Adesivos'),
  ('Borrachas e Corretivos'),
  ('Instrumentos de Desenho'),
  ('Artes Manuais'),
  ('Escritório e Organização'),
  ('Mochilas e Estojos'),
  ('Agendas e Planners'),
  ('Informática e Eletrônicos'),
  ('Brinquedos e Festas')
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- 2. Classificação por palavra-chave, em ordem de prioridade.
--    Cada bloco só afeta produtos ainda sem categoria (categoria_id is
--    null), então a ordem abaixo é a ordem de prioridade das regras.
-- ---------------------------------------------------------------------

-- 2.1 Canetas e Marcadores
update produtos
set categoria_id = (select id from categorias where nome = 'Canetas e Marcadores')
where categoria_id is null
  and (
    nome ilike '%CANETA%'
    or nome ilike '%CANETINHA%'
    or nome ilike '%MARCA TEXTO%'
    or nome ilike '%MARCADOR%'
  );

-- 2.2 Tintas e Pincéis
update produtos
set categoria_id = (select id from categorias where nome = 'Tintas e Pincéis')
where categoria_id is null
  and (
    nome ilike '%TINTA%'
    or nome ilike '%PINCEL%'
    or nome ilike '%ACRILPEN%'
    or nome ilike '%GUACHE%'
    or nome ilike '%AQUARELA%'
  );

-- 2.3 Fitas e Adesivos
update produtos
set categoria_id = (select id from categorias where nome = 'Fitas e Adesivos')
where categoria_id is null
  and (
    nome ilike '%FITA%'
    or nome ilike '%ADESIVO%'
    or nome ilike '%DUREX%'
  );

-- 2.4 Borrachas e Corretivos
update produtos
set categoria_id = (select id from categorias where nome = 'Borrachas e Corretivos')
where categoria_id is null
  and (
    nome ilike '%BORRACHA%'
    or nome ilike '%CORRETIVO%'
    or nome ilike '%APONTADOR%'
  );

-- 2.5 Instrumentos de Desenho
update produtos
set categoria_id = (select id from categorias where nome = 'Instrumentos de Desenho')
where categoria_id is null
  and (
    nome ilike '%REGUA%'
    or nome ilike '%ESQUADRO%'
    or nome ilike '%COMPASSO%'
    or nome ilike '%TRANSFERIDOR%'
    or nome ilike '%TESOURA%'
    or nome ilike '%ESTILETE%'
  );

-- 2.6 Artes Manuais
-- (EVA, TNT e MASSA com fronteira de palavra — ver nota no cabeçalho)
update produtos
set categoria_id = (select id from categorias where nome = 'Artes Manuais')
where categoria_id is null
  and (
    nome ilike '%E.V.A%'
    or nome ~* '\yEVA\y'
    or nome ilike '%ISOPOR%'
    or nome ~* '\yMASSA\y'
    or nome ilike '%MASSINHA%'
    or nome ilike '%ARGILA%'
    or nome ilike '%GLITTER%'
    or nome ilike '%LANTEJOULAS%'
    or nome ilike '%OLHINHOS%'
    or nome ~* '\yTNT\y'
    or nome ilike '%ALGODAO%'
    or nome ilike '%TELA DE PINTURA%'
    or nome ilike '%TELA VIRADA%'
    or nome ilike '%BISCUIT%'
  );

-- 2.7 Escritório e Organização
update produtos
set categoria_id = (select id from categorias where nome = 'Escritório e Organização')
where categoria_id is null
  and (
    nome ilike '%PASTA%'
    or nome ilike '%ENVELOPE%'
    or nome ilike '%CLIPS%'
    or nome ilike '%ELASTICO%'
    or nome ilike '%GRAMPEADOR%'
    or nome ilike '%GRAMPO%'
    or nome ilike '%PORTA DOCUMENTO%'
    or nome ilike '%CAIXA ARQUIVO%'
    or nome ilike '%ALMOFADA%'
    or nome ilike '%CARIMBO%'
  );

-- 2.8 Mochilas e Estojos
update produtos
set categoria_id = (select id from categorias where nome = 'Mochilas e Estojos')
where categoria_id is null
  and (
    nome ilike '%MOCHILA%'
    or nome ilike '%ESTOJO%'
  );

-- 2.9 Agendas e Planners
update produtos
set categoria_id = (select id from categorias where nome = 'Agendas e Planners')
where categoria_id is null
  and (
    nome ilike '%AGENDA%'
    or nome ilike '%PLANNER%'
    or nome ilike '%LIVRO ATA%'
  );

-- 2.10 Informática e Eletrônicos
update produtos
set categoria_id = (select id from categorias where nome = 'Informática e Eletrônicos')
where categoria_id is null
  and (
    nome ilike '%MOUSE%'
    or nome ilike '%TECLADO%'
    or nome ilike '%CALCULADORA%'
  );

-- 2.11 Brinquedos e Festas
update produtos
set categoria_id = (select id from categorias where nome = 'Brinquedos e Festas')
where categoria_id is null
  and (
    nome ilike '%BRINQUEDO%'
    or nome ilike '%BALAO%'
    or nome ilike '%SACOLA%'
    or nome ilike 'SACO %'
    or nome ilike '%FANTASIA%'
  );

-- 2.12 Papéis
update produtos
set categoria_id = (select id from categorias where nome = 'Papéis')
where categoria_id is null
  and (
    nome ilike '%PAPEL%'
    or nome ilike '%CARTOLINA%'
    or nome ilike '%CELOFANE%'
    or nome ilike '%CREPOM%'
    or nome ilike '%ACETATO%'
    or nome ilike '%ALMACO%'
  );

-- ---------------------------------------------------------------------
-- 3. Reforço das 7 categorias já existentes, só em quem ainda ficou
--    NULL depois dos blocos acima. Usa o id JÁ existente de cada
--    categoria (resolvido por nome) — não cria duplicata. Se o nome
--    exato não existir em produção com essa grafia, o subselect retorna
--    NULL e o UPDATE correspondente vira no-op (não há risco de
--    sobrescrever com NULL algo que já tinha categoria, pois o WHERE
--    exige categoria_id IS NULL).
--    Ordem importa: Lápiseira antes de Lápis, para "LAPISEIRA" não
--    cair em "Lápis" (o produto já sai com categoria_id preenchido
--    antes do bloco de Lápis rodar).
-- ---------------------------------------------------------------------

-- 3.1 Cadernos
update produtos
set categoria_id = (select id from categorias where nome = 'Cadernos')
where categoria_id is null
  and exists (select 1 from categorias where nome = 'Cadernos')
  and nome ilike '%CADERNO%';

-- 3.2 Lápiseira (antes de Lápis, de propósito)
update produtos
set categoria_id = (select id from categorias where nome = 'Lápiseira')
where categoria_id is null
  and exists (select 1 from categorias where nome = 'Lápiseira')
  and nome ilike '%LAPISEIRA%';

-- 3.3 Lápis (LAPISEIRA já foi excluída do NULL pelo bloco anterior)
update produtos
set categoria_id = (select id from categorias where nome = 'Lápis')
where categoria_id is null
  and exists (select 1 from categorias where nome = 'Lápis')
  and nome ~* '\yLAPIS\y';

-- 3.4 Cola (fronteira de palavra — ver nota no cabeçalho sobre
--     "ESCOLAR"/"MOCHILA ESCOLAR" contendo a substring "cola")
update produtos
set categoria_id = (select id from categorias where nome = 'Cola')
where categoria_id is null
  and exists (select 1 from categorias where nome = 'Cola')
  and nome ~* '\yCOLA\y';

-- 3.5 Livros CEC
update produtos
set categoria_id = (select id from categorias where nome = 'Livros CEC')
where categoria_id is null
  and exists (select 1 from categorias where nome = 'Livros CEC')
  and nome ilike '%LIVRO CEC%';

-- ---------------------------------------------------------------------
-- 4. Query de verificação (não faz parte da migration — só referência
--    para rodar manualmente depois de aplicar o arquivo).
-- ---------------------------------------------------------------------

-- select c.nome as categoria, count(p.id) as total_produtos
-- from categorias c
-- left join produtos p on p.categoria_id = c.id
-- group by c.nome
-- order by c.nome;
--
-- select id, nome
-- from produtos
-- where categoria_id is null
-- order by nome;
