-- =====================================================================
-- EXTENSÃO · Retomada inteligente pós-pedido
-- =====================================================================
-- Idempotente (mesmo padrão de extensao_dashboard.sql): pode rodar mais de
-- uma vez sem erro. Aplicar no SQL Editor do Supabase.
--
-- Contexto: quando um orçamento vira pedido pelo bot (finalizarCadastroEPedido
-- em src/botEngine/actions.js), o bot pausa a conversa. Diferente da pausa
-- manual de um humano (fromMe / comando "atendente" / timeout do Agente de
-- Vendas), essa pausa NÃO deve esperar REACTIVATION_TIMEOUT_MINUTES pra
-- reativar: na próxima mensagem do cliente o bot já retoma na hora e aciona o
-- Agente de Vendas com o contexto do pedido (ver src/middlewares/reativacaoBot.js).
--
-- `pausado_pos_pedido` distingue esses dois tipos de pausa. Só a pausa
-- automática pós-pedido liga essa flag; qualquer reativação (definirBotAtivo)
-- e a pausa manual a zeram de volta, pra não vazar o "fast-track" pra pausas
-- futuras de operador (ver conversasService.definirBotAtivo/pausarPosPedido).
-- A tabela `notificacoes` e os `templates_mensagem` usados pela notificação de
-- status já existem na seção K de extensao_dashboard.sql — não são recriados aqui.

alter table conversas
  add column if not exists pausado_pos_pedido boolean not null default false;
