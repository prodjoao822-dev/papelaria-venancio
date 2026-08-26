-- Leitura de pedidos/clientes/itens_pedido para o funcionário (Separador/
-- Entregador) responsável por uma solicitação atribuída a ele.
--
-- Contexto: extensao_rls_completa.sql e o loop de extensao_dashboard.sql só
-- deram SELECT nessas 3 tabelas pra eh_operador_ativo(). O app mobile
-- (Separador/Entregador) sempre precisou dos dados de pedidos/clientes/itens
-- via join aninhado a partir de solicitacoes_separacao/solicitacoes_entrega,
-- mas nunca teve RLS pra isso — o PostgREST omitia essas linhas do embed
-- silenciosamente (sem erro), então protocolo/nome do cliente/itens do
-- pedido sempre voltaram vazios pro funcionário. Confirmado em produção em
-- 20/08/2026.
--
-- Aditivo: não substitui as policies de operador já existentes (Postgres
-- combina múltiplas policies permissivas do mesmo comando com OR). Mesmo
-- padrão de solicitacoes_separacao/solicitacoes_entrega: usa
-- funcionario_atual_id(), sem exigir status específico da solicitação — o
-- funcionário precisa ver os dados mesmo antes de assumir (ver bug #1 da
-- vistoria do app mobile).

create policy "funcionarios_leem_pedidos_atribuidos" on pedidos for select using (
  exists (select 1 from solicitacoes_separacao s where s.pedido_id = pedidos.id and s.separador_id = funcionario_atual_id())
  or exists (select 1 from solicitacoes_entrega e where e.pedido_id = pedidos.id and e.entregador_id = funcionario_atual_id())
);

create policy "funcionarios_leem_clientes_atribuidos" on clientes for select using (
  exists (
    select 1 from pedidos p
    where p.cliente_id = clientes.id
      and (
        exists (select 1 from solicitacoes_separacao s where s.pedido_id = p.id and s.separador_id = funcionario_atual_id())
        or exists (select 1 from solicitacoes_entrega e where e.pedido_id = p.id and e.entregador_id = funcionario_atual_id())
      )
  )
);

create policy "funcionarios_leem_itens_pedido_atribuidos" on itens_pedido for select using (
  exists (select 1 from solicitacoes_separacao s where s.pedido_id = itens_pedido.pedido_id and s.separador_id = funcionario_atual_id())
  or exists (select 1 from solicitacoes_entrega e where e.pedido_id = itens_pedido.pedido_id and e.entregador_id = funcionario_atual_id())
);
