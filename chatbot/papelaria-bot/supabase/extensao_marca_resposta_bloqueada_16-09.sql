-- =====================================================================
-- VENÂNCIO — RPC marcar_resposta_bloqueada (16/09/2026)
-- =====================================================================
-- Bug real encontrado ao investigar um teste ao vivo do dono (PED-2026-0313):
-- a memória de conversa do Agente de Vendas (Postgres Chat Memory,
-- LangChain) grava automaticamente o texto que o modelo GEROU, não o texto
-- que realmente chegou ao cliente. Quando um guard determinístico
-- (divergência de total, frase proibida, fechamento sem confirmar) troca a
-- resposta por um fallback antes do Respond to Webhook, a memória fica
-- "lembrando" de uma pergunta/afirmação que o cliente nunca viu.
--
-- Caso real reproduzido: a IA recapitulou um pedido com o total errado
-- (bug de corrida em "Adicionar Item ao Orçamento" chamado 2x em paralelo,
-- corrigido à parte) terminando em "Confere tudo? Posso fechar seu pedido
-- para retirada?" — o guard de divergência bloqueou essa mensagem e mandou
-- "Só um instante, já confirmo certinho..." no lugar. Só que a memória
-- salvou a pergunta original. Na mensagem seguinte do cliente ("ok", só
-- reconhecendo o "só um instante"), a IA — por acreditar que tinha feito
-- aquela pergunta e recebido "ok" como resposta — fechou o pedido sem uma
-- confirmação real.
--
-- O node de memória do n8n (Postgres Chat Memory) não expõe nenhum modo
-- "carrega automático, salva manual" — está preso ao ciclo automático do
-- Agent. Corrigir a gravação da memória diretamente exigiria mexer na
-- tabela interna do LangChain (outro Postgres, fora do Supabase deste
-- projeto) sem conseguir inspecionar o schema exato — risco real de
-- corromper a memória de conversas inteiras.
--
-- Fix escolhido: reaproveita o mecanismo de injeção de contexto que este
-- mesmo workflow já usa (nota de sistema prepended à mensagem do cliente,
-- ex.: "cliente já tem orçamento X em aberto"). Quando um guard bloqueia
-- uma resposta, marca `conversas.dados.resposta_anterior_bloqueada = true`.
-- Na próxima mensagem do cliente, o Agente recebe um aviso explícito de que
-- a resposta anterior nunca chegou ao cliente — e a marca é apagada (só
-- vale por 1 turno).
--
-- Esta função faz o merge atômico no jsonb (nunca sobrescreve o resto de
-- `dados`, que guarda outros dados de sessão) — uma atualização direta via
-- PostgREST (`dados: {...}`) substituiria a coluna inteira.
--
-- ── NOTA DE EXECUÇÃO ────────────────────────────────────────────────
-- Aplicado e validado ao vivo na sessão principal, 16/09/2026.
-- =====================================================================

create or replace function public.marcar_resposta_bloqueada(p_conversa_id uuid, p_valor boolean)
returns void
language sql
as $function$
  update conversas
  set dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('resposta_anterior_bloqueada', p_valor)
  where id = p_conversa_id;
$function$;

-- Só service_role chama isso (n8n) — mesmo padrão de least-privilege já
-- aplicado no resto do projeto: revoga de anon/authenticated por padrão.
revoke all on function public.marcar_resposta_bloqueada(uuid, boolean) from public, anon, authenticated;
grant execute on function public.marcar_resposta_bloqueada(uuid, boolean) to service_role;

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select marcar_resposta_bloqueada('00000000-0000-0000-0000-000000000000', true);
-- -- não deve dar erro (update de 0 linhas é normal pra um id que não existe).
--
-- select has_function_privilege('anon', 'marcar_resposta_bloqueada(uuid,boolean)', 'execute');
-- -- deve ser false.
-- =====================================================================
