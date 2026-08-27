-- =====================================================================
-- VENÂNCIO — concluir_separacao passa a avançar o pedido pra "pronto"
-- =====================================================================
-- Decisão D2 da auditoria de 25/08/2026 (ver
-- PLANEJAMENTOS E IMPLEMENTAÇÕES/AUDITORIA_FINALIZACAO_25-08-2026.md e
-- PROMPT_EXECUCAO_26-08-2026.md, seção 6): concluir a separação deve mover
-- o pedido pra "pronto" automaticamente, em vez de depender de alguém
-- lembrar de clicar no painel depois. Decidido com o dono em 27/08/2026.
--
-- ESCOPO DELIBERADAMENTE PEQUENO: só a transição de status em `pedidos`.
-- O aviso por WhatsApp ao cliente NÃO muda aqui — continua disparando só
-- quando o operador atualiza o status manualmente pelo painel
-- (`pedidos.service.js` → notificarN8n()), porque não existe hoje nenhum
-- gatilho de banco pra esse aviso (confirmado ao vivo: `pedidos` só tem o
-- trigger `trg_pedidos_atualizado_em`, nada de notificação). Ligar o aviso
-- automático nesse caminho foi perguntado ao dono e adiado de propósito —
-- ver decisão registrada na mesma data.
--
-- `extensao_separacao_delegada.sql` (22/08/2026) documentava explicitamente
-- que este subsistema era aditivo e "não força nenhuma transição em
-- pedidos" — este arquivo substitui essa decisão pontual pela nova de hoje,
-- só para `concluir_separacao` (delegar_separacao e separacao_rapida
-- continuam sem tocar em pedidos.status, sem necessidade disso).
--
-- Guard de segurança: só avança se o pedido ainda estiver em
-- 'confirmado' ou 'em_separacao' — nunca regride um pedido que já esteja
-- 'pronto'/'concluido'/'cancelado' (idempotente, sem lançar erro se o
-- guard não bater — concluir a separação continua funcionando mesmo que,
-- por algum motivo, o pedido já tenha mudado de status por outro caminho).
--
-- Idempotente: seguro rodar mais de uma vez (CREATE OR REPLACE).

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

  select count(*) into v_pendentes
  from solicitacoes_separacao_itens
  where solicitacao_id = p_solicitacao_id and not separado;

  if v_pendentes > 0 then
    raise exception 'Ainda há % item(ns) não separado(s)', v_pendentes;
  end if;

  update solicitacoes_separacao
  set status = 'pronta', concluida_em = now()
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  -- D2 (27/08/2026): avança o pedido automaticamente. Guard evita regredir
  -- um pedido que já esteja além de 'em_separacao' por qualquer outro motivo.
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
