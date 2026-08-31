-- =====================================================================
-- Auditoria de segurança (item B1 do Plano Mestre), verificado ao vivo
-- em 01/09/2026: as 5 RPCs "*_dashboard" (usadas só pelo painel web)
-- estavam com EXECUTE liberado pra `anon` (chave pública, sem login).
--
-- Não era explorável na prática -- todas as 5 chamam eh_operador_ativo()
-- logo no início, que devolve false pra auth.uid() nulo (chamada anon)
-- -- mas não deveriam nem estar alcançáveis por anon em primeiro lugar
-- (defesa em profundidade: se algum dia o gate interno tiver um bug, o
-- grant já bloqueia antes). Mesmo raciocínio já aplicado a
-- criar_pedido_de_lista_modelo e aceitar_orcamento.
--
-- Nota à parte, também verificada ao vivo: o parâmetro p_operador_id
-- que 3 destas funções recebem (aceitar_orcamento_dashboard,
-- atualizar_status_orcamento_dashboard, atualizar_status_pedido_dashboard)
-- já é ignorado no corpo -- todas usam `v_operador_id := auth.uid()`
-- internamente, nunca o valor vindo do cliente. Não é vulnerabilidade
-- viva (o item do roadmap que dizia "aceitam operador_id do client" tá
-- desatualizado), só um parâmetro morto mantido por compatibilidade com
-- as chamadas atuais do dashboard -- não removido aqui de propósito,
-- pra não precisar tocar em orcamentos.service.js/pedidos.service.js/
-- useOrcamentos.js e nos testes que os cobrem no mesmo commit que é só
-- de permissão.
-- =====================================================================

revoke execute on function aceitar_orcamento_dashboard(uuid, uuid) from anon, public;
revoke execute on function assumir_conversa_dashboard(uuid) from anon, public;
revoke execute on function atualizar_status_orcamento_dashboard(uuid, status_orcamento, uuid, text) from anon, public;
revoke execute on function atualizar_status_pedido_dashboard(uuid, status_pedido, uuid, text) from anon, public;
revoke execute on function liberar_conversa_dashboard(uuid) from anon, public;

grant execute on function aceitar_orcamento_dashboard(uuid, uuid) to authenticated;
grant execute on function assumir_conversa_dashboard(uuid) to authenticated;
grant execute on function atualizar_status_orcamento_dashboard(uuid, status_orcamento, uuid, text) to authenticated;
grant execute on function atualizar_status_pedido_dashboard(uuid, status_pedido, uuid, text) to authenticated;
grant execute on function liberar_conversa_dashboard(uuid) to authenticated;

-- =====================================================================
-- FECHAMENTO (01/09/2026, mesma sessão, com execute_sql de verdade):
-- confirmado ao vivo que anon.can_execute = false e authenticated/
-- service_role.can_execute = true nas 5 funções acima (has_function_
-- privilege). Junto, fechamento do B6 (versionamento de policies):
-- diff entre `select tablename, policyname from pg_policies where
-- schemaname='public'` (148 linhas) e todo `create policy` já commitado
-- em baseline_producao_26-08-2026.sql + extensao_*.sql deu vazio -- as
-- 148 policies de produção têm, cada uma, uma linha correspondente já
-- versionada. B6 fechado de verdade, não só por contagem.
-- =====================================================================
