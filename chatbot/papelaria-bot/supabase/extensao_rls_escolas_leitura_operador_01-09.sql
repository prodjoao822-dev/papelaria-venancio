-- =====================================================================
-- Gap de RLS achado em teste real (01/09/2026): `escolas` tem RLS
-- habilitado mas só a policy `service_role_full_access` -- nenhuma
-- policy libera leitura pra operador logado no dashboard. Nunca dava
-- problema porque o bot (service_role) é quem sempre leu essa tabela;
-- a tela "Listas Modelo" foi a primeira coisa no dashboard a precisar
-- fazer join com `escolas` do lado do navegador (embed `escolas (id,
-- nome)` a partir de `listas_modelo`). PostgREST não erra quando RLS
-- barra um embed -- só devolve null, e o front caía no fallback "—",
-- parecendo falta de dado quando na verdade era falta de permissão.
--
-- Mesmo padrão de leitura já usado em categorias/produtos/marcas etc.
-- (ver extensao_seguranca_*.sql): eh_operador_ativo() pro público
-- autenticado, sem trocar nada de escrita.
-- =====================================================================

drop policy if exists "operadores_leitura" on escolas;
create policy "operadores_leitura" on escolas for select to public using (eh_operador_ativo());
