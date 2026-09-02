-- =====================================================================
-- VENÂNCIO — Rede de segurança do problema P5 (tarefa T2.2, 26/08/2026)
-- =====================================================================
-- CONFIRMADO APLICADO em produção (verificado ao vivo em 02/09/2026 via
-- `pg_indexes` — o índice `idx_orcamentos_rascunho_unico_por_conversa`
-- já existe). Nota original ficou desatualizada — ver "NOTA DE EXECUÇÃO"
-- no final.
--
-- ── POR QUE ISTO EXISTE ────────────────────────────────────────────────
-- `orcamento_ativo_cliente` (arquivo irmão desta migração) escolhe certo
-- ENTRE os rascunhos que já existem, mas não impede que o n8n crie um
-- segundo rascunho pra mesma conversa em primeiro lugar. A causa raiz de
-- ORC-2026-0185/186/187 (3 rascunhos pra mesma conversa em menos de 1h)
-- foi o node Supabase v1 do workflow "Agente vendedor" aplicando só 1
-- condição de filtro (bug corrigido na tarefa T2.1, node
-- "Supabase · Buscar Orçamento Aberto", workflow `RVwx3aBcDcQBohpg`) — mas
-- aquilo é uma correção do LADO DO N8N. Esta migração é a rede de
-- segurança do LADO DO BANCO: mesmo que um bug futuro (n8n, bot, ou
-- qualquer outro chamador) tente criar um segundo rascunho pra mesma
-- conversa, o Postgres recusa.
--
-- ── POR QUE É PARCIAL (`where status = 'rascunho'`) ────────────────────
-- Só cobre 'rascunho', não 'enviado'. Um cliente pode ter um orçamento
-- 'enviado' antigo (aguardando resposta) e abrir um rascunho novo na
-- mesma conversa — isso não é o bug que gerou o incidente (que foi
-- rascunho duplicado) e não deve ser bloqueado aqui. `conversa_id` é
-- nullable em `orcamentos` (squemanovo.sql:241); um índice único parcial
-- trata múltiplos `NULL` como distintos entre si (comportamento padrão do
-- Postgres), então orçamentos sem conversa associada (criados fora do
-- fluxo de WhatsApp) nunca colidem entre si por este índice.
--
-- ── PRÉ-REQUISITO — LEIA ANTES DE RODAR ────────────────────────────────
-- Este arquivo FALHA DE PROPÓSITO (com uma mensagem clara, não um erro
-- genérico de constraint) se hoje existir mais de um rascunho para a
-- mesma `conversa_id`. Em 25/08/2026 esse era exatamente o caso da
-- conversa `493b2143-7b7d-4bcb-89e3-c38aa371135b` (ORC-2026-0185 e
-- ORC-2026-0187, ambos rascunho, mesma conversa). Este agente NÃO tem
-- autorização para apagar linhas de `orcamentos` e NÃO tentou — a
-- limpeza de duplicados é a tarefa T2.4, ainda não feita, e cabe ao dono
-- do projeto decidir qual protocolo manter/mesclar/arquivar.
-- Se o `DO` abaixo abortar com "existem N conversa(s) com mais de um
-- rascunho": NÃO rode `create unique index` sozinho contornando o bloco —
-- resolva T2.4 primeiro. Idempotente depois de resolvido T2.4: seguro
-- rodar de novo (`create unique index if not exists`).
-- =====================================================================

do $$
declare
  v_dup record;
  v_qtd_conversas_duplicadas int := 0;
begin
  for v_dup in
    select conversa_id, count(*) as qtd_rascunhos,
           array_agg(protocolo order by criado_em) as protocolos
    from orcamentos
    where status = 'rascunho' and conversa_id is not null
    group by conversa_id
    having count(*) > 1
  loop
    v_qtd_conversas_duplicadas := v_qtd_conversas_duplicadas + 1;
    raise notice 'conversa_id % tem % rascunhos duplicados: %',
      v_dup.conversa_id, v_dup.qtd_rascunhos, v_dup.protocolos;
  end loop;

  if v_qtd_conversas_duplicadas > 0 then
    raise exception 'P5/T2.2: existem % conversa(s) com mais de um orçamento em rascunho (ver NOTICEs acima com conversa_id e protocolos). Resolva a limpeza (tarefa T2.4) antes de criar o índice único — este agente não está autorizado a apagar as linhas duplicadas.', v_qtd_conversas_duplicadas;
  end if;
end $$;

create unique index if not exists idx_orcamentos_rascunho_unico_por_conversa
  on orcamentos (conversa_id)
  where status = 'rascunho';

-- ── VALIDAÇÃO (rodar depois de aplicar) ────────────────────────────────
-- 1) O índice existe:
--
--   select indexname, indexdef from pg_indexes
--   where tablename = 'orcamentos' and indexname = 'idx_orcamentos_rascunho_unico_por_conversa';
--
-- 2) Uma segunda tentativa de rascunho na mesma conversa é recusada —
--    testar SEM deixar nada committado, com ROLLBACK explícito:
--
--   begin;
--   insert into orcamentos (cliente_id, conversa_id, tipo, status)
--   select cliente_id, conversa_id, tipo, 'rascunho'
--   from orcamentos where status = 'rascunho' and conversa_id is not null limit 1;
--   -- deve falhar com: duplicate key value violates unique constraint
--   -- "idx_orcamentos_rascunho_unico_por_conversa"
--   rollback;
-- =====================================================================


-- =====================================================================
-- NOTA DE EXECUÇÃO — CONFIRMADO ATIVO em produção (02/09/2026), validado
-- por `pg_indexes` ao vivo. Não precisa de nenhuma ação.
-- =====================================================================
