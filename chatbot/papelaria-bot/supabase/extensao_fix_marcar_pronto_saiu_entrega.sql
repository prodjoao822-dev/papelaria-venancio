-- =====================================================================
-- VENÂNCIO — fix: marcar_pronto_retirada_pedido / marcar_saiu_entrega_pedido
-- =====================================================================
-- Bug real reportado pelo dono em 27/08/2026 durante teste manual: clicar
-- em "pronto pra retirada" no painel dava "permission denied for table
-- pedidos".
--
-- Causa raiz: as duas funções eram LANGUAGE SQL sem `security definer`
-- (rodavam com o privilégio de quem chama — o operador autenticado). As
-- colunas que elas escrevem (`pronto_para_retirada_em`,
-- `saiu_para_entrega_em`) não têm grant de UPDATE pro role `authenticated`
-- (restrição de RLS/grant por coluna de 25/08/2026) — mesma classe de bug
-- já corrigida antes nesta sessão em `recalcular_valor_orcamento`/
-- `recalcular_valor_pedido` (ver extensao_fix_recalculo_valor_security_
-- definer.sql).
--
-- Fix: `security definer` + `set search_path` (padrão já usado em
-- `atualizar_status_pedido_dashboard`, que fica no mesmo arquivo de
-- pedidos.service.js). Como isso passa a rodar com privilégio elevado,
-- adicionei o MESMO portão de identidade (`eh_operador_ativo()`) que as
-- funções irmãs já usam — sem o portão, virariam um jeito de qualquer
-- `anon`/`authenticated` marcar qualquer pedido como pronto/saiu pra
-- entrega direto (as duas já tinham EXECUTE liberado pra anon+authenticated
-- via PostgREST, confirmado ao vivo: dependiam só da UI nunca chamar sem
-- estar logado — não era uma proteção de verdade).
--
-- Resto do comportamento é idêntico ao original: só atualiza se
-- status='pronto' e a forma_entrega bater; sem match, retorna null sem
-- erro (mesmo comportamento de antes, não inventei validação nova).
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

  return v_pedido;
end;
$function$;
