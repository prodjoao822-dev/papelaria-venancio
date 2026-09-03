-- =====================================================================
-- VENÂNCIO — sincroniza `itens_pedido.separado` a partir da Separação
-- Delegada/Rápida do app mobile (03/09/2026)
-- =====================================================================
-- INCIDENTE: existem hoje dois fluxos que marcam item de pedido como
-- "separado" sem se comunicar:
--   1. Checklist manual do dashboard (FichaSeparacaoPage.jsx) grava direto
--      em `itens_pedido.separado` via RPC/UPDATE do próprio dashboard.
--   2. Separação Delegada/Rápida do app mobile
--      (`marcar_item_separado_solicitacao`/`concluir_separacao`,
--      `extensao_separacao_delegada.sql`, 22/08) grava em
--      `solicitacoes_separacao_itens.separado`, tabela própria (snapshot
--      por solicitação), com FK `item_pedido_id -> itens_pedido.id` já
--      existente desde a criação.
-- As duas tabelas nunca convergiam: um operador olhando o checklist antigo
-- do dashboard não via o progresso feito pelo separador no app, e
-- vice-versa.
--
-- DECISÃO DO DONO: sincronizar em UM sentido só — app mobile
-- (`solicitacoes_separacao_itens`) escreve em `itens_pedido`. NUNCA o
-- inverso. Motivo: `itens_pedido.separado` não carrega identidade de quem
-- pode mexer nele (é só uma coluna de tabela, sem RPC própria de
-- autorização); `solicitacoes_separacao_itens` SÓ é escrita através de
-- `marcar_item_separado_solicitacao`/`concluir_separacao`, que checam se
-- quem está chamando é o separador atribuído (ou o operador dono da
-- Separação Rápida) antes de gravar qualquer coisa — ver `v_pode` em
-- ambas as funções. Se o dashboard também empurrasse `itens_pedido` de
-- volta para `solicitacoes_separacao_itens`, um UPDATE direto do checklist
-- do dashboard (que não passa por essa checagem) furaria essa autorização
-- por uma porta lateral. Sentido único evita isso.
--
-- ESCOPO: só as duas RPCs abaixo ganham UMA linha nova cada, no fim do
-- corpo (depois de já ter passado por toda a autorização/validação
-- existente). Nenhum comportamento anterior muda — nem mensagem de erro,
-- nem validação, nem o que já era gravado antes.
--
-- CREATE OR REPLACE substitui definição em uso — ver nota no cabeçalho de
-- `supabase/README.md` ("Nunca use CREATE OR REPLACE... sem comentário
-- apontando a mudança"):
--   - `marcar_item_separado_solicitacao`: substitui a definição de
--     `extensao_separacao_delegada.sql` (seção G4, 22/08/2026) — única
--     definição já existente, confirmada idêntica no baseline de
--     26/08/2026 (nenhum arquivo posterior a redefiniu).
--   - `concluir_separacao`: substitui a definição de
--     `extensao_concluir_separacao_avanca_pedido.sql` (27/08/2026, decisão
--     D2 — avança `pedidos.status` pra 'pronto'), que por sua vez já tinha
--     substituído a original de `extensao_separacao_delegada.sql`. É a
--     versão vigente em produção (confirmada como aplicada no README,
--     item 11; nenhum arquivo posterior a redefiniu).
--
-- Idempotente: seguro rodar mais de uma vez (CREATE OR REPLACE).
--
-- NOTA DE EXECUÇÃO (03/09/2026): CONFIRMADO APLICADO E VALIDADO em produção.
-- Antes de aplicar, confirmei ao vivo via pg_get_functiondef que a
-- definição vigente das duas funções batia exatamente com o corpo assumido
-- aqui (nenhuma divergência). Depois de aplicar, validei com um
-- pedido/solicitação de teste descartável (protocolo PED-2026-0260,
-- apagado ao final): marquei 1 item via marcar_item_separado_solicitacao
-- (impersonando o operador de teste via request.jwt.claims local) e
-- confirmei o reflexo imediato em itens_pedido.separado; marquei o 2º item
-- e chamei concluir_separacao — confirmei os 2 itens com separado=true e
-- pedidos.status='pronto'. Todo o dado de teste foi apagado depois.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. marcar_item_separado_solicitacao — replica o novo valor de `separado`
--    para `itens_pedido` assim que o checklist do app mobile muda.
-- ---------------------------------------------------------------------
create or replace function public.marcar_item_separado_solicitacao(
  p_solicitacao_item_id uuid,
  p_separado boolean
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

  update solicitacoes_separacao_itens
  set separado = p_separado, separado_em = case when p_separado then now() else null end
  where id = p_solicitacao_item_id
  returning * into v_item;

  -- NOVO (03/09/2026): sentido único app mobile -> itens_pedido. Ver
  -- cabeçalho deste arquivo. Roda DEPOIS de toda a checagem de
  -- autorização acima, com o `v_item` já validado/atualizado.
  update itens_pedido set separado = p_separado where id = v_item.item_pedido_id;

  return v_item;
end;
$function$;


-- ---------------------------------------------------------------------
-- 2. concluir_separacao — ao concluir, garante que TODOS os itens da
--    solicitação fiquem marcados em `itens_pedido` (cobre o caso raro de
--    algum item ter sido inserido no checklist já `separado = true` desde
--    a criação, ou qualquer outra divergência pontual — a fonte de
--    verdade final passa a ser sempre o checklist da solicitação).
-- ---------------------------------------------------------------------
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

  -- NOVO (03/09/2026): sentido único app mobile -> itens_pedido. Ver
  -- cabeçalho deste arquivo. Roda antes do avanço de `pedidos.status`
  -- (decisão D2, 27/08), usando o mesmo `p_solicitacao_id` já recebido.
  update itens_pedido
  set separado = true
  where id in (
    select item_pedido_id from solicitacoes_separacao_itens where solicitacao_id = p_solicitacao_id
  );

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


-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar, com dado de teste descartável —
-- nunca dado de cliente real)
-- =====================================================================
-- 1. Criar um pedido de teste com >=2 itens e uma `solicitacoes_separacao`
--    (tipo 'rapida' é o mais simples de logar, via `separacao_rapida` como
--    o operador de teste) com status 'em_andamento'.
-- 2. Chamar `marcar_item_separado_solicitacao(<id de 1 item>, true)` e
--    conferir:
--      select si.id, si.separado as separado_solicitacao, ip.separado as separado_pedido
--      from solicitacoes_separacao_itens si
--      join itens_pedido ip on ip.id = si.item_pedido_id
--      where si.id = '<id do item testado>';
--    Esperado: as duas colunas `true`.
-- 3. Marcar o(s) item(ns) restante(s) e chamar
--    `concluir_separacao(<id da solicitação>)`. Conferir:
--      select ip.id, ip.separado
--      from itens_pedido ip
--      join solicitacoes_separacao_itens si on si.item_pedido_id = ip.id
--      where si.solicitacao_id = '<id da solicitação>';
--    Esperado: TODAS as linhas com `separado = true`.
-- 4. Apagar o pedido/solicitação de teste (cascade cobre
--    solicitacoes_separacao_itens/mensagens/notificacoes_internas via FK
--    `on delete cascade`).
-- =====================================================================
