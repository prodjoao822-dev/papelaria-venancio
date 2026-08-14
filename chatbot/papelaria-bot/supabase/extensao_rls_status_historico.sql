-- Corrige RLS: orcamentos_status_historico e pedidos_status_historico
-- ficaram de fora do bloco de policies pra "authenticated"/operador em
-- extensao_dashboard.sql (897-931), então o dashboard (client anon/
-- authenticated) não consegue gravar nelas — só o service_role do bot
-- conseguia. Idempotente (seguro rodar de novo).

drop policy if exists "operadores_leitura" on orcamentos_status_historico;
drop policy if exists "operadores_escrita" on orcamentos_status_historico;
drop policy if exists "operadores_atualizacao" on orcamentos_status_historico;

create policy "operadores_leitura" on orcamentos_status_historico
  for select to authenticated using (eh_operador_ativo());
create policy "operadores_escrita" on orcamentos_status_historico
  for insert to authenticated with check (eh_operador_ativo());
create policy "operadores_atualizacao" on orcamentos_status_historico
  for update to authenticated using (eh_operador_ativo()) with check (eh_operador_ativo());

drop policy if exists "operadores_leitura" on pedidos_status_historico;
drop policy if exists "operadores_escrita" on pedidos_status_historico;
drop policy if exists "operadores_atualizacao" on pedidos_status_historico;

create policy "operadores_leitura" on pedidos_status_historico
  for select to authenticated using (eh_operador_ativo());
create policy "operadores_escrita" on pedidos_status_historico
  for insert to authenticated with check (eh_operador_ativo());
create policy "operadores_atualizacao" on pedidos_status_historico
  for update to authenticated using (eh_operador_ativo()) with check (eh_operador_ativo());

-- eh_operador_ativo() já existe, security definer, definida em
-- extensao_dashboard.sql:887-895. UPDATE está incluído porque
-- atualizar_status_pedido_dashboard e atualizar_status_orcamento_dashboard
-- (e aceitar_orcamento_dashboard) fazem update ...set operador_id = ...
-- depois do insert.
