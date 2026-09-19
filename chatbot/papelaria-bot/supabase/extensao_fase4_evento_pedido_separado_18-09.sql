-- =====================================================================
-- VENÂNCIO — Fase 4 do plano Separador/Entrega (18/09/2026)
-- =====================================================================
-- Diagnóstico ao vivo (antes de codar): o projeto JÁ TEM uma tabela de
-- eventos de domínio genérica (`eventos`: tipo_evento, entidade_tipo,
-- entidade_id, ator_tipo, ator_id, payload jsonb) alimentada por gatilho
-- em `pedidos_status_historico` (`trg_eventos_pedido` ->
-- `registrar_evento_pedido()`, mesmo padrão já usado pra orçamentos) — é
-- exatamente a infraestrutura de "evento desacoplado do destino" que a
-- Fase 4 pede, só faltava (a) o achado da Fase 3 fazer barulho aqui de
-- verdade: `concluir_separacao` nunca gravava em
-- `pedidos_status_historico`, então a transição pra 'pronto' via
-- separação NUNCA disparava evento nenhum; e (b) um evento nomeado
-- especificamente 'pedido.separado' (hoje só existe o genérico
-- 'pedido_status_alterado').
--
-- Design (reaproveita a infra existente, não cria tabela nova):
-- 1. `concluir_separacao` passa a gravar em `pedidos_status_historico`
--    (fecha o gap da Fase 3) — isso sozinho já dispara o evento genérico
--    via o gatilho que já existe.
-- 2. `registrar_evento_pedido()` ganha uma 2ª inserção em `eventos`,
--    condicional a `status_novo = 'pronto'`: o evento nomeado
--    'pedido.separado' que a Fase 4 pede, no MESMO INSERT que já
--    disparava o genérico — sem gatilho novo aqui, só mais uma linha na
--    função existente. O payload já resolve, na hora, quem delegou a
--    separação (se houver uma `solicitacoes_separacao` concluída pra
--    esse pedido) — é a única informação que o "destino" (passo 3)
--    precisa, e fica registrada no evento, não espalhada em outro lugar.
-- 3. Gatilho NOVO, separado, em `eventos` (`AFTER INSERT ... WHEN
--    tipo_evento = 'pedido.separado'`), cria a notificação pro operador
--    (MVP: impressão manual). Este é o único ponto que muda se o destino
--    da notificação mudar no futuro (virar push, SMS, outro papel etc.)
--    — nunca precisa tocar em `concluir_separacao` nem em
--    `registrar_evento_pedido()` pra isso.
-- 4. Removida a inserção direta em `notificacoes_internas` que hoje mora
--    dentro de `concluir_separacao` — ela vira responsabilidade exclusiva
--    do gatilho do passo 3, fechando o desacoplamento de verdade (hoje
--    "concluir a separação" e "decidir quem é avisado e como" eram a
--    MESMA função; agora são duas coisas independentes).
-- =====================================================================

create or replace function public.registrar_evento_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operador_delegante_id uuid;
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

    -- Fase 4 (18/09/2026): evento nomeado específico, além do genérico
    -- acima — é o que a Fase 4 chama de "pedido.separado". Resolve aqui,
    -- na hora do evento, quem delegou a separação (se existir uma
    -- solicitação concluída pra este pedido) — é a única informação que
    -- o gatilho de notificação (passo 3 do comentário no topo do
    -- arquivo) precisa pra saber quem avisar, sem duplicar essa consulta
    -- em outro lugar.
    if new.status_novo = 'pronto' then
      -- Só resolve destinatário pra tipo='delegada' -- em 'rapida' quem
      -- delegou é o próprio operador que acabou de separar, notificá-lo
      -- seria só ruído (ele já sabe, acabou de fazer agora mesmo).
      select operador_delegante_id into v_operador_delegante_id
      from solicitacoes_separacao
      where pedido_id = new.pedido_id and status = 'pronta' and tipo = 'delegada'
      order by concluida_em desc
      limit 1;

      insert into eventos (tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id, descricao, payload)
      values (
        'pedido.separado', 'pedido_status_historico', new.id,
        case when new.operador_id is not null then 'operador' else 'sistema' end,
        new.operador_id,
        format('Pedido %s está separado', new.pedido_id),
        jsonb_build_object('pedido_id', new.pedido_id, 'operador_delegante_id', v_operador_delegante_id)
      );
    end if;
  elsif tg_op = 'UPDATE' and new.operador_id is distinct from old.operador_id then
    update eventos set
      ator_tipo = case when new.operador_id is not null then 'operador' else 'sistema' end,
      ator_id = new.operador_id
    where entidade_tipo = 'pedido_status_historico' and entidade_id = new.id;
  end if;
  return new;
end;
$function$;

-- Gatilho novo — o único lugar que decide COMO e QUEM é avisado quando um
-- pedido fica separado. Trocar o destino no futuro (push, SMS, outro
-- papel, mais de um destinatário) é editar só esta função.
create or replace function public.notificar_pedido_separado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operador_delegante_id uuid;
  v_pedido_id uuid;
  v_protocolo text;
begin
  if new.tipo_evento <> 'pedido.separado' then
    return new;
  end if;

  v_pedido_id := (new.payload->>'pedido_id')::uuid;
  v_operador_delegante_id := nullif(new.payload->>'operador_delegante_id', '')::uuid;

  -- MVP: só notifica quando dá pra saber quem delegou a separação (fluxo
  -- via app mobile). Conclusão manual pelo dashboard, sem delegação, não
  -- gera notificação — o próprio operador que clicou já sabe.
  if v_operador_delegante_id is null then
    return new;
  end if;

  select protocolo into v_protocolo from pedidos where id = v_pedido_id;

  insert into notificacoes_internas
    (tipo, destinatario_tipo, destinatario_operador_id, titulo, corpo)
  values (
    'separacao_concluida', 'operador', v_operador_delegante_id,
    'Separação concluída',
    format('Pedido %s está pronto', coalesce(v_protocolo, v_pedido_id::text))
  );

  return new;
end;
$function$;

drop trigger if exists trg_notifica_pedido_separado on eventos;
create trigger trg_notifica_pedido_separado
  after insert on eventos
  for each row execute function notificar_pedido_separado();

-- concluir_separacao: passa a gravar em pedidos_status_historico (fecha o
-- gap da Fase 3, e é o que agora dispara o evento) e não insere mais
-- direto em notificacoes_internas (isso virou responsabilidade do
-- gatilho acima, disparado pelo evento 'pedido.separado').
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
  v_status_anterior status_pedido;
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

  select count(*) into v_pendentes
  from solicitacoes_separacao_itens
  where solicitacao_id = p_solicitacao_id and status_item = 'pendente';

  if v_pendentes > 0 then
    raise exception 'Ainda há % item(ns) não separado(s)', v_pendentes;
  end if;

  select status into v_status_anterior from pedidos where id = v_solicitacao.pedido_id;

  update solicitacoes_separacao
  set status = 'pronta', concluida_em = now()
  where id = p_solicitacao_id
  returning * into v_solicitacao;

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

  -- Fase 4 (18/09/2026): fecha o gap da Fase 3 (esta função nunca gravava
  -- aqui) e é o que dispara o evento 'pedido.separado' via
  -- registrar_evento_pedido() -- a notificação pro operador não é mais
  -- inserida aqui direto, ver notificar_pedido_separado().
  if v_status_anterior in ('confirmado', 'em_separacao') then
    insert into pedidos_status_historico (pedido_id, status_anterior, status_novo, origem)
    values (v_solicitacao.pedido_id, v_status_anterior, 'pronto', 'concluir_separacao');
  end if;

  return v_solicitacao;
end;
$function$;

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- Ver sessão de testes ao vivo (transação + rollback): concluir uma
-- separação delegada gera 2 linhas em `eventos`
-- ('pedido_status_alterado' + 'pedido.separado') e 1 linha em
-- `notificacoes_internas` pro operador delegante; concluir uma Separação
-- Rápida (sem operador_delegante relevante pra terceiros, já que quem
-- delegou é quem mesmo separou) ainda gera os eventos mas a checagem de
-- "faz sentido notificar" fica documentada acima.
-- =====================================================================
