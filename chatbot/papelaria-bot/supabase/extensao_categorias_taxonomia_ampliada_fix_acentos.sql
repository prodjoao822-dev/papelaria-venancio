-- Fix de extensao_categorias_taxonomia_ampliada.sql (mesmo dia, 29/08/2026):
-- as regras de "Lápis" (\yLAPIS\y) e "Instrumentos de Desenho" (REGUA) não
-- batiam com produtos cujo nome usa a grafia acentuada ("LÁPIS", "RÉGUA"),
-- porque ILIKE/regex no Postgres não ignora acento por padrão. Achado ao
-- conferir os produtos que ficaram sem categoria: 3 "LÁPIS DE COR ..." e 1
-- "RÉGUA ESCOLAR ..." deveriam ter sido classificados e não foram — bug, não
-- exceção genuína. Mesmo padrão de segurança do arquivo original: só afeta
-- quem ainda está com categoria_id NULL, idempotente.
update produtos
set categoria_id = (select id from categorias where nome = 'Lápis')
where categoria_id is null
  and exists (select 1 from categorias where nome = 'Lápis')
  and nome ~* '\yL[AÁ]PIS\y';

update produtos
set categoria_id = (select id from categorias where nome = 'Instrumentos de Desenho')
where categoria_id is null
  and nome ~* 'R[EÉ]GUA';
