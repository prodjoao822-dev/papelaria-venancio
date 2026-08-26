-- =====================================================================
-- VENÂNCIO — Índices em pedidos_status_historico / orcamentos_status_historico
-- =====================================================================
-- pedidos_status_historico e orcamentos_status_historico (squemanovo.sql
-- 282-289 e 329-336) têm hoje só a primary key `id` — sem índice nas
-- colunas de foreign key (orcamento_id / pedido_id), apesar de serem lidas
-- em toda transição de status de pedido/orçamento (aceitar_orcamento,
-- atualizar_status_pedido, atualizar_status_orcamento e as variantes
-- *_dashboard em extensao_dashboard.sql / extensao_auditoria_b1_dashboard.sql).
-- O app mobile do Separador (em preparação em paralelo) aumenta ainda mais
-- o volume de leitura, porque cada tela de detalhe de solicitação junta
-- pedido/itens com o histórico de status.
--
-- Idempotente (IF NOT EXISTS), seguro rodar de novo. Não muda comportamento
-- de nenhuma função existente — só adiciona índices.

create index if not exists idx_pedidos_status_historico_pedido_id
  on pedidos_status_historico (pedido_id);

create index if not exists idx_orcamentos_status_historico_orcamento_id
  on orcamentos_status_historico (orcamento_id);
