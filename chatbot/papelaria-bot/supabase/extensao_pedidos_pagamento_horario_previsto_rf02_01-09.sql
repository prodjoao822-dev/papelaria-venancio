-- =====================================================================
-- VENÂNCIO — RF-02/P14 (pagamento e horário previsto em pedidos),
-- decisão D5 do dono em 31/08/2026
-- =====================================================================
-- NÃO APLICADO EM PRODUÇÃO por este agente — ver "NOTA DE EXECUÇÃO" no
-- final do arquivo. Esta sessão só tinha `mcp__supabase__list_tables`
-- disponível (somente leitura de metadados); `apply_migration`/
-- `execute_mutation`/`execute_sql` não estavam na lista de ferramentas.
-- Mesma limitação já registrada em `extensao_seguranca_b0_orcamentos.sql`
-- (15/08) e `extensao_listas_modelo_escolar_01-09.sql`/`extensao_push_
-- tokens.sql` (01/09 e antes).
--
-- Confirmado por `mcp__supabase__list_tables` (verbose, 01/09/2026) que
-- `pedidos` continua sem `forma_pagamento`, `status_pagamento` e
-- `horario_previsto` -- mesmo achado do Plano Mestre (Seção 4) e da
-- Auditoria de Finalização (P14): consultado direto em produção, não só
-- nos arquivos .sql. Migração puramente ADITIVA: só adiciona colunas.
-- NÃO mexe em nenhuma RPC existente, nem em `aceitar_orcamento`, nem em
-- nada do fluxo normal de pedido.
--
-- ── QUEM ESCREVE ────────────────────────────────────────────────────────
-- Só o OPERADOR, só pelo dashboard, no fechamento/gestão do pedido de
-- balcão -- confirmado com o dono: o Agente de Vendas/WhatsApp NUNCA
-- preenche `forma_pagamento`/`status_pagamento`/`horario_previsto`.
-- Por isso este arquivo não cria nenhuma RPC nova: a tabela `pedidos` já
-- tem a policy `operadores_atualizacao` (`for update using
-- (eh_operador_ativo())`, ver `extensao_rls_completa.sql`) cobrindo
-- update genérico de operador -- as 3 colunas novas entram
-- automaticamente sob essa mesma policy, sem precisar de mudança de RLS
-- nem de RPC dedicada. O time do dashboard escreve com um UPDATE comum
-- via supabase-js, autenticado como operador.
--
-- ── forma_pagamento: por que estes 4 valores ──────────────────────────
-- Não é requisito fechado -- é um default razoável de varejo brasileiro
-- de balcão (dinheiro, pix, cartão débito, cartão crédito), documentado
-- no comentário da coluna. Se a loja precisar de mais opções (ex.: "a
-- prazo", "vale"), é outra migração aditiva no CHECK, mesmo padrão já
-- usado em `pedidos.forma_entrega`.
--
-- ── status_pagamento: não é o mesmo que status_pedido ─────────────────
-- `status_pedido` (enum: confirmado/em_separacao/pronto/concluido/
-- cancelado) descreve o FLUXO OPERACIONAL do pedido. `status_pagamento`
-- é ortogonal: um pedido pode estar "pronto" com pagamento "pendente"
-- (cliente vai pagar na retirada), ou "confirmado" com pagamento "pago"
-- (pagou adiantado por Pix). São dimensões independentes -- por isso é
-- coluna nova, não reaproveitamento do enum `status_pedido`.
--
-- ── horario_previsto ≠ horario_retirada_desejado (cuidado aqui!) ──────
-- `pedidos.horario_retirada_desejado` JÁ EXISTE (`extensao_horario_
-- retirada_pedido.sql`): é texto livre, o que o CLIENTE disse pro bot no
-- WhatsApp (ex.: "hoje às 15h", "amanhã de manhã"), captado pela IA sem
-- resolver data/hora real -- de propósito, pra IA não inferir errado.
-- `horario_previsto` é outra coisa: timestamptz real, escolhido pelo
-- OPERADOR ao criar/gerenciar um pedido de balcão manual no dashboard
-- (ex.: "vou deixar pronto até tal hora"). Nunca confundir as duas nem
-- fazer uma alimentar a outra automaticamente.
-- =====================================================================

alter table pedidos
  add column if not exists forma_pagamento text,
  add column if not exists status_pagamento text default 'pendente',
  add column if not exists horario_previsto timestamptz;

do $$ begin
  alter table pedidos add constraint pedidos_forma_pagamento_check
    check (forma_pagamento is null or forma_pagamento = any (array[
      'dinheiro'::text, 'pix'::text, 'cartao_debito'::text, 'cartao_credito'::text
    ]));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table pedidos add constraint pedidos_status_pagamento_check
    check (status_pagamento is null or status_pagamento = any (array[
      'pago'::text, 'pendente'::text
    ]));
exception when duplicate_object then null; end $$;

comment on column pedidos.forma_pagamento is 'Forma de pagamento registrada pelo OPERADOR no fechamento do pedido no dashboard (nunca preenchida pelo Agente de Vendas/WhatsApp). Valores documentados como um default razoável de varejo brasileiro (dinheiro, pix, cartão débito/crédito) -- não é requisito fechado, pode crescer conforme a operação real da loja pedir.';

comment on column pedidos.status_pagamento is 'pago/pendente, registrado pelo operador. Ortogonal ao status_pedido (fluxo operacional): um pedido "pronto" pode ter pagamento "pendente" (paga na retirada), e um "confirmado" pode já estar "pago" (Pix adiantado).';

comment on column pedidos.horario_previsto is 'Previsão de conclusão que o OPERADOR define ao criar/gerenciar um pedido manualmente no dashboard (ex.: "vou deixar pronto até 15h"). timestamptz real, escolhido pelo operador -- DIFERENTE de pedidos.horario_retirada_desejado, que é texto livre capturado pela IA a partir do que o CLIENTE disse no WhatsApp (ex.: "hoje à tarde"), sem resolução de data/hora. Nunca usar uma coluna pra alimentar a outra automaticamente.';


-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'pedidos'
--   and column_name in ('forma_pagamento','status_pagamento','horario_previsto');
-- -- deve retornar 3 linhas: forma_pagamento (text, null),
-- -- status_pagamento (text, 'pendente'::text), horario_previsto (timestamptz, null)
--
-- select conname from pg_constraint
-- where conname in ('pedidos_forma_pagamento_check','pedidos_status_pagamento_check');
-- -- deve retornar 2 linhas
-- =====================================================================


-- =====================================================================
-- NOTA DE EXECUÇÃO — FECHAMENTO (01/09/2026, mesma sessão, com
-- `apply_migration`/`execute_sql` de verdade): aplicado em produção via
-- `mcp__supabase__apply_migration` (nome
-- `extensao_pedidos_pagamento_horario_previsto_rf02_01_09`). As 2
-- queries de VALIDAÇÃO acima rodaram ao vivo: 3 colunas novas em
-- `pedidos` e as 2 constraints CHECK confirmadas.
-- =====================================================================
