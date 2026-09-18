-- =====================================================================
-- VENÂNCIO — Fase 2 do plano Separador/Entrega (18/09/2026)
-- =====================================================================
-- Contexto: painel do separador (tela única, app-mobile) precisa mostrar
-- pagamento/entrega/horário/observações do pedido (somente leitura — ver
-- regra do dono: "Separador nunca edita pagamento, entrega, horário ou
-- observações — só o checklist de itens") e o checklist de item precisa
-- de um 3º estado além de "separado" (boolean): "faltou/substituído".
--
-- Achado real ao revisar `concluir_separacao` antes de mexer (comentário
-- já existente em app-mobile/.../DetalheSolicitacaoScreen.js linha ~115-121
-- confirma): essa RPC hoje REJEITA concluir se qualquer item não estiver
-- com `separado = true` — não existe conclusão parcial, e o próprio
-- código já registrava isso como decisão pendente do dono ("D1, tela 10
-- do bundle de design"). Esta migração resolve essa pendência: conclusão
-- passa a aceitar itens no estado 'faltou_substituido' como estado final
-- também, não só 'separado'.
--
-- Segundo achado: o final de `concluir_separacao` fazia
-- `update itens_pedido set separado = true` pra TODOS os itens da
-- solicitação, sem condição — ou seja, mesmo um item nunca marcado
-- (ou, com esta fase, marcado como "faltou") seria forçado pra
-- separado=true na conclusão. Corrigido pra só marcar true os itens que
-- realmente têm status_item='separado'.
--
-- Design: `status_item` é o novo campo canônico (pendente/separado/
-- faltou_substituido); `separado` (boolean, já existente) continua sendo
-- mantido em sincronia (true só quando status_item='separado') — nenhum
-- consumidor existente que só lê o boolean (dashboard, relatórios) quebra.
-- A RPC `marcar_item_separado_solicitacao` aceita as duas formas de
-- chamada (só p_separado, como hoje o dashboard/`venancio-ai-ops` chama;
-- ou p_status_item, como o app-mobile vai chamar depois desta fase) —
-- 100% retrocompatível, verificado ao vivo com transação de teste.
-- =====================================================================

alter table solicitacoes_separacao_itens
  add column if not exists status_item text not null default 'pendente'
  check (status_item in ('pendente', 'separado', 'faltou_substituido'));

update solicitacoes_separacao_itens
set status_item = case when separado then 'separado' else 'pendente' end
where status_item = 'pendente'; -- idempotente: só corrige o default recém-criado

comment on column solicitacoes_separacao_itens.status_item is 'Estado do item no checklist de separação. "separado" = boolean derivado (true só quando status_item=''separado''), mantido por compatibilidade com quem só lê o boolean.';

-- Mesmo cuidado do item 43 (Fase 1): create or replace com assinatura
-- diferente (2 params -> 4 params) cria um SEGUNDO overload em vez de
-- substituir — achado ao vivo ao testar a retrocompatibilidade logo
-- depois de aplicar. drop explícito do antigo antes do create or replace.
drop function if exists public.marcar_item_separado_solicitacao(uuid, boolean);

create or replace function public.marcar_item_separado_solicitacao(
  p_solicitacao_item_id uuid,
  p_separado boolean default null,
  p_status_item text default null,
  p_observacao text default null
)
returns solicitacoes_separacao_itens
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item solicitacoes_separacao_itens;
  v_solicitacao solicitacoes_separacao;
  v_pode boolean;
  v_status_final text;
begin
  select * into v_item from solicitacoes_separacao_itens where id = p_solicitacao_item_id for update;
  if not found then
    raise exception 'Item de solicitação % não encontrado', p_solicitacao_item_id;
  end if;

  select * into v_solicitacao from solicitacoes_separacao where id = v_item.solicitacao_id;

  if v_solicitacao.status <> 'em_andamento' then
    raise exception 'Solicitação % não está em andamento (status atual: %)', v_solicitacao.id, v_solicitacao.status;
  end if;

  if v_solicitacao.tipo = 'rapida' then
    v_pode := eh_operador_ativo() and auth.uid() = v_solicitacao.operador_delegante_id;
  else
    v_pode := v_solicitacao.separador_id is not distinct from funcionario_atual_id()
              and funcionario_atual_id() is not null;
  end if;

  if v_pode is not true then
    raise exception 'Esta solicitação não está atribuída a você';
  end if;

  -- Retrocompatível: chamador antigo só manda p_separado (true/false) —
  -- vira 'separado'/'pendente'. Chamador novo manda p_status_item direto
  -- e tem prioridade se os dois vierem preenchidos.
  v_status_final := coalesce(p_status_item, case when p_separado then 'separado' else 'pendente' end);
  if v_status_final not in ('pendente', 'separado', 'faltou_substituido') then
    raise exception 'status_item inválido: %', v_status_final;
  end if;

  update solicitacoes_separacao_itens
  set status_item = v_status_final,
      separado = (v_status_final = 'separado'),
      separado_em = case when v_status_final = 'separado' then now() else null end
  where id = p_solicitacao_item_id
  returning * into v_item;

  -- itens_pedido.separado espelha só o estado "separado" de verdade — um
  -- item "faltou/substituído" nunca deve aparecer como encontrado/embalado
  -- pra quem só olha esse boolean (dashboard, relatórios). A observação
  -- (quando for faltou/substituído) é gravada no mesmo campo que a Ficha
  -- de Separação do dashboard já exibe (itens_pedido.observacao) — mesma
  -- informação, visível nos dois lugares, sem coluna nova duplicada.
  update itens_pedido
  set separado = (v_status_final = 'separado'),
      observacao = case
        when v_status_final = 'faltou_substituido' and p_observacao is not null and btrim(p_observacao) <> ''
          then p_observacao
        else observacao
      end
  where id = v_item.item_pedido_id;

  return v_item;
end;
$function$;

create or replace function public.concluir_separacao(p_solicitacao_id uuid)
returns solicitacoes_separacao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_solicitacao solicitacoes_separacao;
  v_pendentes integer;
  v_pode boolean;
begin
  select * into v_solicitacao from solicitacoes_separacao where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação % não encontrada', p_solicitacao_id;
  end if;

  if v_solicitacao.status <> 'em_andamento' then
    raise exception 'Solicitação % não está em andamento (status atual: %)', p_solicitacao_id, v_solicitacao.status;
  end if;

  if v_solicitacao.tipo = 'rapida' then
    v_pode := eh_operador_ativo() and auth.uid() = v_solicitacao.operador_delegante_id;
  else
    v_pode := v_solicitacao.separador_id is not distinct from funcionario_atual_id()
              and funcionario_atual_id() is not null;
  end if;

  if v_pode is not true then
    raise exception 'Esta solicitação não está atribuída a você';
  end if;

  -- Fase 2 (18/09/2026): "pendente" bloqueia conclusão; "separado" e
  -- "faltou_substituido" são os dois estados finais aceitos (antes só
  -- `separado=true` era aceito, sem conclusão parcial).
  select count(*) into v_pendentes
  from solicitacoes_separacao_itens
  where solicitacao_id = p_solicitacao_id and status_item = 'pendente';

  if v_pendentes > 0 then
    raise exception 'Ainda há % item(ns) não separado(s)', v_pendentes;
  end if;

  update solicitacoes_separacao
  set status = 'pronta', concluida_em = now()
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  -- Fix: antes forçava separado=true pra TODOS os itens ao concluir, o
  -- que apagaria a informação de "faltou/substituído" no exato momento em
  -- que ela mais importa (na conclusão). Agora só confirma true pra quem
  -- já está genuinamente com status_item='separado'.
  update itens_pedido
  set separado = true
  where id in (
    select item_pedido_id from solicitacoes_separacao_itens
    where solicitacao_id = p_solicitacao_id and status_item = 'separado'
  );

  update pedidos
  set status = 'pronto'
  where id = v_solicitacao.pedido_id
    and status in ('confirmado', 'em_separacao');

  insert into notificacoes_internas
    (tipo, solicitacao_id, destinatario_tipo, destinatario_operador_id, titulo, corpo)
  values (
    'separacao_concluida', v_solicitacao.id, 'operador', v_solicitacao.operador_delegante_id,
    'Separação concluída',
    format('Pedido %s está pronto', (select protocolo from pedidos where id = v_solicitacao.pedido_id))
  );

  return v_solicitacao;
end;
$function$;

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select column_name from information_schema.columns
-- where table_name='solicitacoes_separacao_itens' and column_name='status_item';
-- -- deve retornar 1 linha.
--
-- select distinct status_item from solicitacoes_separacao_itens;
-- -- só 'pendente'/'separado' esperados logo após aplicar (backfill).
-- =====================================================================
