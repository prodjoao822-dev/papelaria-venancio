-- Corrige bug sistêmico achado ao investigar por que a tela "Memória IA" do
-- painel nunca teve dado: `consultas_operacionais` está zerada desde que a
-- política existe (10/08) porque qualquer INSERT nela dispara o trigger
-- trg_eventos_consulta_operacional, que grava um registro em `eventos` --
-- mas `eventos` só tem policy de INSERT pra `service_role`
-- (extensao_auditoria_b1_dashboard.sql). Como a função do trigger não era
-- SECURITY DEFINER, ela roda com o papel de quem fez o INSERT original.
-- Resultado: todo INSERT em `consultas_operacionais` feito por quem não seja
-- service_role (o dashboard via `authenticated`, por exemplo) sempre falhava
-- por completo -- não só o log de auditoria, a operação inteira, porque o
-- trigger roda dentro da mesma transação.
--
-- As outras 4 tabelas com o mesmo padrão de trigger (`solicitacoes_entrega`,
-- `ocorrencias`, `orcamentos_status_historico`, `pedidos_status_historico`)
-- têm o MESMO defeito de fundo, só não mostraram o sintoma até hoje porque
-- na prática sempre foram escritas por dentro de RPCs SECURITY DEFINER (dono
-- com bypass de RLS) -- mas quebram no primeiro INSERT feito fora de uma
-- RPC dessas. Corrigido nas 5 de uma vez, mesmo padrão já usado em
-- extensao_fix_marcar_pronto_saiu_entrega.sql e eh_operador_ativo().
--
-- Descoberto e corrigido em 28/08/2026. Testado ao vivo simulando um INSERT
-- em consultas_operacionais como operador (authenticated), que falhava antes
-- e passou a funcionar depois -- ver sessão de trabalho do dia.

create or replace function registrar_evento_consulta_operacional()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into eventos (tipo_evento, entidade_tipo, entidade_id, ator_tipo, descricao, payload)
    values ('consulta_operacional_criada', 'consulta_operacional', new.id, 'sistema',
      format('Nova consulta operacional: %s (%s)', coalesce(new.produto_nome, '?'), new.tipo_duvida),
      jsonb_build_object('tipo_duvida', new.tipo_duvida, 'prioridade', new.prioridade));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into eventos (tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id, descricao, payload)
    values ('consulta_operacional_status_alterado', 'consulta_operacional', new.id,
      case when new.respondido_por is not null then 'operador' else 'sistema' end, new.respondido_por,
      format('Consulta operacional mudou de %s para %s', old.status, new.status),
      jsonb_build_object('status_anterior', old.status, 'status_novo', new.status));
  end if;
  return new;
end;
$function$;

create or replace function registrar_evento_entrega()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_ator_tipo text;
  v_ator_op uuid;
  v_ator_func uuid;
begin
  if tg_op = 'INSERT' then
    insert into eventos (tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id, descricao, payload)
    values (
      'entrega_delegada', 'solicitacao_entrega', new.id, 'operador', new.delegado_por_id,
      format('Entrega delegada (pedido %s)', new.pedido_id),
      jsonb_build_object('pedido_id', new.pedido_id, 'entregador_id', new.entregador_id, 'horario_previsto', new.horario_previsto)
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'cancelada' then
      if eh_operador_ativo() then
        v_ator_tipo := 'operador'; v_ator_op := auth.uid(); v_ator_func := null;
      else
        v_ator_tipo := 'funcionario'; v_ator_op := null; v_ator_func := funcionario_atual_id();
      end if;
    else
      v_ator_tipo := 'funcionario'; v_ator_op := null; v_ator_func := new.entregador_id;
    end if;

    insert into eventos (tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id, ator_funcionario_id, descricao, payload)
    values (
      'entrega_status_alterado', 'solicitacao_entrega', new.id, v_ator_tipo, v_ator_op, v_ator_func,
      format('Entrega mudou de %s para %s (pedido %s)', old.status, new.status, new.pedido_id),
      jsonb_build_object('pedido_id', new.pedido_id, 'status_anterior', old.status, 'status_novo', new.status,
        'motivo_insucesso', new.motivo_insucesso, 'motivo_cancelamento', new.motivo_cancelamento)
    );
  end if;
  return new;
end;
$function$;

create or replace function registrar_evento_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into eventos (tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id, ator_funcionario_id, descricao, payload)
    values (
      'ocorrencia_aberta', 'ocorrencia', new.id, new.criado_por_tipo, new.criado_por_operador_id, new.criado_por_funcionario_id,
      format('Ocorrência aberta: %s (pedido %s)', new.tipo, new.pedido_id),
      jsonb_build_object('pedido_id', new.pedido_id, 'tipo', new.tipo, 'descricao', new.descricao)
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = 'resolvida' then
    insert into eventos (tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id, ator_funcionario_id, descricao, payload)
    values (
      'ocorrencia_resolvida', 'ocorrencia', new.id, new.resolvido_por_tipo, new.resolvido_por_operador_id, new.resolvido_por_funcionario_id,
      format('Ocorrência resolvida: %s (pedido %s)', new.tipo, new.pedido_id),
      jsonb_build_object('pedido_id', new.pedido_id, 'tipo', new.tipo, 'resolucao_texto', new.resolucao_texto)
    );
  end if;
  return new;
end;
$function$;

create or replace function registrar_evento_orcamento()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into eventos (tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id, descricao, payload)
    values (
      'orcamento_status_alterado', 'orcamento_status_historico', new.id,
      case when new.operador_id is not null then 'operador' else 'sistema' end,
      new.operador_id,
      format('Orçamento mudou de %s para %s', coalesce(new.status_anterior::text, '(novo)'), new.status_novo::text),
      jsonb_build_object('orcamento_id', new.orcamento_id, 'status_anterior', new.status_anterior, 'status_novo', new.status_novo, 'origem', new.origem)
    );
  elsif tg_op = 'UPDATE' and new.operador_id is distinct from old.operador_id then
    update eventos set
      ator_tipo = case when new.operador_id is not null then 'operador' else 'sistema' end,
      ator_id = new.operador_id
    where entidade_tipo = 'orcamento_status_historico' and entidade_id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function registrar_evento_pedido()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into eventos (tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id, descricao, payload)
    values (
      'pedido_status_alterado', 'pedido_status_historico', new.id,
      case when new.operador_id is not null then 'operador' else 'sistema' end,
      new.operador_id,
      format('Pedido mudou de %s para %s', coalesce(new.status_anterior::text, '(novo)'), new.status_novo::text),
      jsonb_build_object('pedido_id', new.pedido_id, 'status_anterior', new.status_anterior, 'status_novo', new.status_novo, 'origem', new.origem)
    );
  elsif tg_op = 'UPDATE' and new.operador_id is distinct from old.operador_id then
    update eventos set
      ator_tipo = case when new.operador_id is not null then 'operador' else 'sistema' end,
      ator_id = new.operador_id
    where entidade_tipo = 'pedido_status_historico' and entidade_id = new.id;
  end if;
  return new;
end;
$function$;
