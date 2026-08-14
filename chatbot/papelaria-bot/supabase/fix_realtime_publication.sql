-- =====================================================================
-- FIX — Publicação supabase_realtime vazia (Vistoria Técnica 13/08/2026,
-- Problema 6)
-- =====================================================================
-- Verificação em produção em 14/08/2026 confirmou: a publicação
-- `supabase_realtime` existia (criada pelo próprio Supabase), mas com ZERO
-- tabelas nela. Isso significa que as 4 subscriptions `postgres_changes`
-- que o dashboard já roda desde antes desta sessão (usePedidos.js,
-- useAtendimento.js, useAtendimentoAtivo.js, useOrcamentos.js, e os
-- serviços demand-intelligence/event-log/operational-queries/product-engine)
-- estavam INERTES em produção — o painel só atualizava por refetch manual
-- ou pelo polling de 60s dos KPIs, nunca por realtime de verdade, apesar do
-- código do lado do cliente estar correto.
--
-- Nota separada: a outra metade do Problema 6 (Problema 5, policies `anon`
-- abertas) foi verificada no mesmo dia e o resultado foi zero linhas —
-- as policies perigosas da linhagem de schema morta nunca existiram neste
-- projeto Supabase. Falso alarme, sem ação necessária.
--
-- Esta migração só ADICIONA as 8 tabelas já efetivamente usadas por
-- postgres_changes no dashboard (confirmado por grep em venancio-ai-ops/src)
-- à publicação existente. Idempotente: seguro rodar mais de uma vez.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'conversas', 'orcamentos', 'pedidos', 'mensagens',
    'alertas_demanda', 'eventos', 'consultas_operacionais', 'memoria_produtos'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
