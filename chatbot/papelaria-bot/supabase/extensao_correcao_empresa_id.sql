-- =====================================================================
-- VENÂNCIO — Correção: empresa_id sem default causava erro no dashboard
-- =====================================================================
-- squemanovo.sql:83-85 trava `clientes.empresa_id` como NOT NULL (o
-- projeto é single-tenant, só existe uma linha em `empresa`). O JS Bot
-- já busca e passa esse id em todo insert (clientesService.js), mas o
-- dashboard (venancio-ai-ops) nunca soube que essa coluna existe — criar
-- cliente por lá quebrava com:
--   null value in column "empresa_id" of relation "clientes" violates
--   not-null constraint
-- Um default a nível de banco corrige qualquer caminho de insert (atual
-- e futuro, dashboard ou bot) sem exigir mudança em nenhum client.
--
-- Postgres não aceita subquery direta em DEFAULT (ERROR 0A000) — só
-- expressões/chamadas de função. Por isso o default é uma função wrapper
-- em vez de `default (select id from empresa limit 1)`.
--
-- Se rodar sem erro mas o dashboard continuar dando o mesmo erro de
-- empresa_id, a causa pode ser a tabela `empresa` estar vazia nesse banco
-- — `empresa_id_padrao()` faria `select id from empresa limit 1` retornar
-- NULL, e NULL num DEFAULT ainda viola NOT NULL. A linha abaixo (mesmo
-- seed de squemanovo.sql:64) garante que sempre existe pelo menos uma
-- empresa antes de a função rodar.
--
-- Segunda causa encontrada em produção: a função sem `security definer`
-- roda com o privilégio de quem chamou. No SQL Editor isso é o superusuário
-- (enxerga tudo, sempre "funciona" no teste manual) — mas o insert de
-- verdade, feito pelo dashboard, roda como a role `authenticated`. Se essa
-- role não tiver visibilidade garantida sobre `empresa`, a função vê zero
-- linhas e devolve NULL mesmo com a tabela populada. `security definer` faz
-- a função rodar com o privilégio de quem a criou, não de quem chamou —
-- mesma técnica já usada em eh_operador_ativo()/eh_admin() (extensao_dashboard.sql).
-- Idempotente: seguro rodar mais de uma vez.
-- =====================================================================

insert into empresa (nome)
select 'Papelaria Venâncio'
where not exists (select 1 from empresa);

create or replace function empresa_id_padrao()
returns uuid as $$
  select id from empresa limit 1;
$$ language sql stable security definer;

alter table clientes
  alter column empresa_id set default empresa_id_padrao();
