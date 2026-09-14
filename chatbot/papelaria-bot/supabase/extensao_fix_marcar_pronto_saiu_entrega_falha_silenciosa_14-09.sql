-- =====================================================================
-- VENÂNCIO — fix: marcar_pronto_retirada_pedido / marcar_saiu_entrega_pedido
-- deixam de falhar em silêncio (14/09/2026)
-- =====================================================================
-- Bug real reportado pelo dono em 14/09/2026 durante teste manual: clicar em
-- "Pronto p/ Retirada" às vezes não atualiza nada (sem nenhum erro visível),
-- enquanto "Saiu para Entrega" "sempre funciona" — mas na prática é o MESMO
-- bug nas duas funções, só que o dono não chegou a bater na condição de
-- falha usando o botão de entrega ainda.
--
-- CAUSA RAIZ: as duas funções (criadas em extensao_fix_marcar_pronto_saiu_
-- entrega.sql, 27/08) fazem:
--
--   update pedidos set pronto_para_retirada_em = now()
--   where id = p_pedido_id and status = 'pronto' and forma_entrega = 'retirada'
--   returning * into v_pedido;
--   return v_pedido;
--
-- Se a condição do WHERE não bater por qualquer razão (o pedido ainda não
-- chegou a "pronto" no exato instante desta chamada, forma_entrega
-- diferente do esperado, uma segunda chamada concorrente, etc.), o UPDATE
-- não afeta nenhuma linha — `v_pedido` fica NULL e a função retorna NULL
-- SEM lançar exceção nenhuma.
--
-- O lado JS (venancio-ai-ops/src/services/pedidos.service.js, função
-- atualizarStatus) só verifica `{ error }` da chamada RPC, nunca o `data`
-- retornado:
--
--   const { error } = await supabase.rpc(funcao, { p_pedido_id: id })
--   if (error) throw error
--
-- Como não há erro nenhum (a chamada teve sucesso, só não encontrou linha
-- pra atualizar), o dashboard segue em frente, mostra o toast de sucesso e
-- nada mudou de verdade no banco — o operador vê o clique "não fazer nada".
--
-- FIX: mesma convenção já usada em `atualizar_status_pedido` (que dá RAISE
-- EXCEPTION em transição inválida em vez de falhar em silêncio) — se o
-- UPDATE não encontrar a linha (`not found`), a função agora lança uma
-- exceção explícita. Isso vira automaticamente um `error` real do lado do
-- PostgREST/supabase-js, que a UI já sabe propagar e mostrar (toast.erro) —
-- sem precisar mudar nada no dashboard. Resto do comportamento idêntico ao
-- original (mesmo WHERE, mesmo portão eh_operador_ativo()).
--
-- Idempotente: seguro rodar mais de uma vez.

create or replace function public.marcar_pronto_retirada_pedido(p_pedido_id uuid)
returns pedidos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido pedidos;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem marcar um pedido como pronto para retirada';
  end if;

  update pedidos set pronto_para_retirada_em = now()
  where id = p_pedido_id and status = 'pronto' and forma_entrega = 'retirada'
  returning * into v_pedido;

  if not found then
    raise exception 'Não foi possível marcar como pronto para retirada: pedido % não está com status "pronto" e forma de entrega "retirada" no momento desta chamada', p_pedido_id;
  end if;

  return v_pedido;
end;
$function$;

create or replace function public.marcar_saiu_entrega_pedido(p_pedido_id uuid)
returns pedidos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido pedidos;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem marcar um pedido como saiu para entrega';
  end if;

  update pedidos set saiu_para_entrega_em = now()
  where id = p_pedido_id and status = 'pronto' and forma_entrega in ('entrega_propria', 'uber_flash')
  returning * into v_pedido;

  if not found then
    raise exception 'Não foi possível marcar como saiu para entrega: pedido % não está com status "pronto" e forma de entrega de entrega (não retirada) no momento desta chamada', p_pedido_id;
  end if;

  return v_pedido;
end;
$function$;

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- -- 1. confirmar que o corpo novo está em produção (deve conter "if not found"):
-- select pg_get_functiondef(oid) from pg_proc where proname in
--   ('marcar_pronto_retirada_pedido', 'marcar_saiu_entrega_pedido');
--
-- -- 2. reproduzir o bug antigo e confirmar que agora dá erro em vez de
-- --    silêncio (rodar como um operador ativo, contra um pedido que NÃO
-- --    está pronto+retirada — deve lançar exceção, não retornar null):
-- select marcar_pronto_retirada_pedido('<id de um pedido em em_separacao>');
-- =====================================================================
