-- =====================================================================
-- VENÂNCIO — Fix "permission denied for table orcamentos" no dashboard
-- Achado ao vivo em 26/08/2026 durante teste manual do BLOCO HOJE.
-- =====================================================================
-- Aplicado em produção via migração `fix_recalculo_valor_security_definer`.
--
-- ── O INCIDENTE ──────────────────────────────────────────────────────
-- Ao clicar "Novo Pedido" no dashboard com pelo menos 1 item, o operador
-- recebia "Erro ao criar pedido: permission denied for table orcamentos".
-- Confirmado ao vivo no log do Postgres (Postgres Logs, 16:16-16:31 UTC
-- de 26/08): o erro real não era no INSERT em `itens_orcamento` em si,
-- mas no trigger AFTER disparado por ele:
--
--   PL/pgSQL function recalcular_valor_orcamento() line 6 at SQL statement
--   "update orcamentos set valor_total = (...) where id = v_orcamento_id"
--   hint: Grant the required privileges to the current role with:
--         GRANT UPDATE ON public.orcamentos TO authenticated;
--
-- ── CAUSA RAIZ ───────────────────────────────────────────────────────
-- `recalcular_valor_orcamento()` e sua irmã `recalcular_valor_pedido()`
-- são triggers que fazem `update orcamentos/pedidos set valor_total = ...`
-- toda vez que um item é inserido/alterado/removido de
-- `itens_orcamento`/`itens_pedido`. Sendo SECURITY INVOKER (o padrão —
-- nenhuma das duas tinha SECURITY DEFINER até este fix), rodam com o
-- privilégio de quem inseriu o ITEM, não com privilégio elevado.
--
-- O fix de RLS de 25/08 (ver `PROMPT_DIAGNOSTICO_ERRO_RLS_ORCAMENTOS_25-08.md`)
-- deu a `authenticated` (operador logado no dashboard) UPDATE só em colunas
-- específicas de `orcamentos` (`observacoes`, `operacao`, `sequencia`) e de
-- `pedidos` (`endereco_entrega`, `forma_entrega`, `operacao`, `sequencia`) —
-- de propósito, porque `valor_total` é campo derivado e não deveria ser
-- editável direto por ninguém. Só que essa restrição, ao ser tão granular,
-- quebrou o mecanismo que TAMBÉM precisa escrever nesse campo: o próprio
-- trigger de recálculo.
--
-- O caminho do n8n/JS Bot nunca expôs isso porque usa a credencial
-- `service_role`, que tem UPDATE irrestrito nas duas tabelas — por isso
-- só o dashboard (papel `authenticated`) disparava o erro. `pedidos` tem
-- exatamente a mesma exposição (confirmado: `authenticated` também não
-- tem `valor_total` na lista de colunas liberadas) — só não tinha
-- disparado ainda porque não havia pedido com item editado pelo dashboard
-- até hoje. Bomba-relógio real, não hipotética.
--
-- ── O QUE MUDA ───────────────────────────────────────────────────────
-- ÚNICA mudança nas duas funções: acrescenta `security definer` e
-- `set search_path = public`. A lógica de negócio (somar itens, gravar em
-- valor_total) é idêntica. Isso é seguro porque as duas funções são
-- puramente mecânicas — não expõem nenhuma capacidade nova a quem já
-- tinha permissão de inserir/editar o item; só deixam de depender do
-- GRANT de quem disparou o trigger. Mesmo padrão já usado no projeto pra
-- "trigger precisa de privilégio elevado pra tocar coluna de sistema"
-- (ex.: `atualizar_status_pedido`, corrigida na tarefa T1 do mesmo dia,
-- por um motivo oposto — lá faltava PORTÃO; aqui falta PRIVILÉGIO. Duas
-- pontas do mesmo princípio: SECURITY DEFINER sem portão é perigoso,
-- SECURITY INVOKER sem privilégio suficiente é quebrado).
--
-- Testado ao vivo (`set role authenticated` + JWT simulado do operador
-- real, dentro de uma transação com ROLLBACK): o INSERT em
-- `itens_orcamento` que antes falhava passou a funcionar sem erro.
--
-- Idempotente: seguro rodar de novo (CREATE OR REPLACE, mesma assinatura).
-- =====================================================================

create or replace function public.recalcular_valor_orcamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orcamento_id uuid;
begin
  v_orcamento_id := coalesce(new.orcamento_id, old.orcamento_id);
  update orcamentos set valor_total = (
    select coalesce(sum(valor_total), 0) from itens_orcamento where orcamento_id = v_orcamento_id
  )
  where id = v_orcamento_id;
  return coalesce(new, old);
end;
$$;

create or replace function public.recalcular_valor_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
begin
  v_pedido_id := coalesce(new.pedido_id, old.pedido_id);
  update pedidos set valor_total = (
    select coalesce(sum(valor_total), 0) from itens_pedido where pedido_id = v_pedido_id
  )
  where id = v_pedido_id;
  return coalesce(new, old);
end;
$$;
