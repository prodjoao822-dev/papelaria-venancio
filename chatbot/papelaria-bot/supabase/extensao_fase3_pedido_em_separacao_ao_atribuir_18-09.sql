-- =====================================================================
-- VENÂNCIO — Fase 3 do plano Separador/Entrega (18/09/2026)
-- =====================================================================
-- Diagnóstico (feito ao vivo antes de escrever qualquer código, já que o
-- pedido do dono usa nomes de estado diferentes dos reais do banco):
--
-- Enum real de pedidos.status: confirmado -> em_separacao -> pronto ->
-- concluido (+ cancelado, de qualquer estado ativo). Já existe uma RPC
-- canônica e genérica, `atualizar_status_pedido`, com a matriz de
-- transição inteira e SEM nenhuma checagem de status_pagamento — ou seja,
-- "status_pagamento é informativo, nunca bloqueia o fluxo" (regra da
-- Fase 3) já é 100% verdade em produção, não precisou de fix.
--
-- O "vitrine" de 8 estados do dashboard (venancio-ai-ops/src/utils/
-- statusDerivado.js) já deriva NOVO_PEDIDO/AGUARDANDO_CONFIRMACAO (=
-- confirmado), EM_SEPARACAO, SEPARADO/PRONTO_RETIRADA/SAIU_ENTREGA (=
-- pronto, sub-distinguido por forma_entrega + pronto_para_retirada_em/
-- saiu_para_entrega_em) e FINALIZADO (= concluido) — exatamente o
-- "recebido -> atribuído -> separado -> (aguardando_retirada|despachado)
-- -> entregue" do pedido do dono, só com nomes internos diferentes.
-- `marcar_pronto_retirada_pedido`/`marcar_saiu_entrega_pedido` (RPCs já
-- existentes, TRB item 37) cobrem o "aguardando_retirada | despachado".
--
-- ACHADO REAL (o único gap que esta migração corrige): nem
-- `delegar_separacao` nem `separacao_rapida` — as duas formas de atribuir
-- um pedido a um separador — nunca tocavam em `pedidos.status`. Resultado
-- prático: um pedido delegado/assumido por um separador via app mobile
-- ficava aparecendo como "Novo Pedido" no Kanban do dashboard o tempo
-- todo em que estava sendo fisicamente separado, e só pulava direto pra
-- "Separado" quando `concluir_separacao` rodava — o estado "atribuído"
-- nunca ficava visível. Corrigido: as duas RPCs agora chamam
-- `atualizar_status_pedido(pedido_id, 'em_separacao', origem)` no momento
-- da atribuição — SÓ quando o pedido ainda está 'confirmado' (idempotente:
-- uma 2ª delegação depois de uma solicitação cancelada, com o pedido já
-- em 'em_separacao', não tenta a transição de novo nem quebra a chamada).
--
-- Fora de escopo, deliberadamente (mesmo espírito do "D1" já documentado
-- no app-mobile): `cancelar_separacao` NÃO reverte `pedidos.status` de
-- volta pra 'confirmado' quando uma delegação é cancelada — o pedido
-- continua mostrando "Em Separação" até alguém assumir de novo ou
-- concluir. Reverter exigiria uma transição nova (em_separacao ->
-- confirmado, que `atualizar_status_pedido` não permite hoje) e checar se
-- não existe OUTRA solicitação ativa pro mesmo pedido — não foi pedido
-- pelo dono nesta fase, e mexer nisso sem necessidade é mais risco do que
-- ganho agora.
-- =====================================================================

create or replace function public.delegar_separacao(
  p_pedido_id uuid,
  p_separador_id uuid,
  p_prioridade text,
  p_horario_retirada timestamp with time zone default null,
  p_observacao text default null
)
returns solicitacoes_separacao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_solicitacao solicitacoes_separacao;
  v_qtd_itens integer;
  v_status_pedido status_pedido;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem delegar separação';
  end if;

  if p_prioridade not in ('imediata', 'agendada') then
    raise exception 'prioridade inválida: % (use imediata ou agendada)', p_prioridade;
  end if;
  if p_prioridade = 'agendada' and p_horario_retirada is null then
    raise exception 'horario_retirada é obrigatório quando a prioridade é agendada';
  end if;

  select status into v_status_pedido from pedidos where id = p_pedido_id;
  if v_status_pedido is null then
    raise exception 'Pedido % não encontrado', p_pedido_id;
  end if;

  if not exists (
    select 1 from funcionarios
    where id = p_separador_id and ativo and 'separacao' = any(papeis)
  ) then
    raise exception 'Funcionário % não é um separador ativo', p_separador_id;
  end if;

  select count(*) into v_qtd_itens from itens_pedido where pedido_id = p_pedido_id;
  if v_qtd_itens = 0 then
    raise exception 'Pedido % não tem itens para separar', p_pedido_id;
  end if;

  insert into solicitacoes_separacao
    (pedido_id, operador_delegante_id, separador_id, prioridade, horario_retirada, status, tipo, observacao)
  values
    (p_pedido_id, auth.uid(), p_separador_id, p_prioridade, p_horario_retirada, 'pendente', 'delegada', p_observacao)
  returning * into v_solicitacao;

  insert into solicitacoes_separacao_itens (solicitacao_id, item_pedido_id)
  select v_solicitacao.id, id from itens_pedido where pedido_id = p_pedido_id;

  -- Fase 3 (18/09/2026): torna visível no Kanban o momento em que o pedido
  -- foi atribuído a um separador. Só avança se ainda estiver 'confirmado'
  -- (idempotente pra re-delegação depois de cancelamento).
  if v_status_pedido = 'confirmado' then
    perform atualizar_status_pedido(p_pedido_id, 'em_separacao', 'delegar_separacao');
  end if;

  insert into notificacoes_internas
    (tipo, solicitacao_id, destinatario_tipo, destinatario_funcionario_id, titulo, corpo)
  values (
    'solicitacao_delegada', v_solicitacao.id, 'separador', p_separador_id,
    'Nova separação delegada a você',
    format('Pedido %s — prioridade %s', (select protocolo from pedidos where id = p_pedido_id), p_prioridade)
  );

  return v_solicitacao;
end;
$function$;

create or replace function public.separacao_rapida(p_pedido_id uuid, p_observacao text default null)
returns solicitacoes_separacao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_solicitacao solicitacoes_separacao;
  v_qtd_itens integer;
  v_status_pedido status_pedido;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem usar a Separação Rápida';
  end if;

  select status into v_status_pedido from pedidos where id = p_pedido_id;
  if v_status_pedido is null then
    raise exception 'Pedido % não encontrado', p_pedido_id;
  end if;

  select count(*) into v_qtd_itens from itens_pedido where pedido_id = p_pedido_id;
  if v_qtd_itens = 0 then
    raise exception 'Pedido % não tem itens para separar', p_pedido_id;
  end if;
  if v_qtd_itens > 7 then
    raise exception 'Separação Rápida só é permitida para pedidos com até 7 itens (este tem %)', v_qtd_itens;
  end if;

  insert into solicitacoes_separacao
    (pedido_id, operador_delegante_id, separador_id, prioridade, status, tipo, observacao, iniciada_em)
  values
    (p_pedido_id, auth.uid(), null, 'imediata', 'em_andamento', 'rapida', p_observacao, now())
  returning * into v_solicitacao;

  insert into solicitacoes_separacao_itens (solicitacao_id, item_pedido_id)
  select v_solicitacao.id, id from itens_pedido where pedido_id = p_pedido_id;

  -- Fase 3: mesma lógica de delegar_separacao — Separação Rápida também é
  -- uma forma de "atribuir" (o próprio operador assume na hora).
  if v_status_pedido = 'confirmado' then
    perform atualizar_status_pedido(p_pedido_id, 'em_separacao', 'separacao_rapida');
  end if;

  return v_solicitacao;
end;
$function$;

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- Ver sessão de testes ao vivo (transação + rollback) no histórico desta
-- conversa/commit: delegar_separacao e separacao_rapida confirmados
-- levando pedidos de 'confirmado' pra 'em_separacao' na hora, com
-- pedidos_status_historico registrando a origem certa; re-delegação com
-- pedido já 'em_separacao' não quebra (idempotente).
-- =====================================================================
