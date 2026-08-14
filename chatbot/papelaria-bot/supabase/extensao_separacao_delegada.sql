-- =====================================================================
-- VENÂNCIO — Separação Delegada (backend real do fluxo que motivou o app
-- mobile: Operador delega, Separador executa, chat interno, prioridade
-- imediata/agendada, notificações internas)
-- =====================================================================
-- Roda depois de extensao_dashboard.sql (usa eh_operador_ativo(), eh_admin(),
-- set_atualizado_em()) e extensao_funcionarios_responsaveis.sql (usa a
-- tabela `funcionarios`, que esta extensão estende com login).
-- Idempotente: seguro rodar mais de uma vez.
--
-- ESCOPO DESTA MIGRAÇÃO: só o motor (schema + RPCs + RLS + realtime). Não
-- mexe no app mobile (não existe ainda) nem no pipeline de status de
-- `pedidos` (status_pedido, atualizar_status_pedido) — este subsistema é
-- aditivo, roda em paralelo, e não força nenhuma transição em `pedidos`.
-- `FichaSeparacaoPage.jsx`/`atribuir_responsavel_pedido` continuam existindo
-- e funcionando sem nenhuma mudança: é outro fluxo (informal, sem
-- delegação real), que pode conviver com este.
--
-- DECISÃO DE ARQUITETURA — autenticação do Separador (Ref.: PROMPT de
-- implementação, restrições a-c):
-- Optamos por Supabase Auth com e-mail sintético (`codigo@venancio.internal`)
-- em vez de uma tabela de sessão/token bespoke, por três motivos:
--   1. Reaproveita o MESMO padrão de RLS já validado em produção
--      (auth.uid() + helper function `stable security definer`), em vez de
--      inventar um esquema de token passado manualmente em toda RPC.
--   2. O PIN nunca é armazenado por nós: quem guarda o hash da senha é o
--      próprio Supabase Auth (bcrypt), então não existe coluna `pin_hash`
--      aqui — cumprindo "nunca PIN em texto plano" sem reimplementar hashing.
--   3. Login/realtime/RLS ficam idênticos para operador e separador (os
--      dois têm um auth.uid() real), o que simplifica MUITO o resto do
--      sistema (RPCs, policies, futura tela do app mobile).
-- Isso NÃO é reaproveitar `operadores` sem adaptação (violaria a restrição
-- a): `funcionarios` continua sendo uma tabela própria, com seu próprio
-- papel (`eh_separador_ativo()`), sem tocar no CHECK de `operadores.papel`.
-- O login em si (código+PIN -> e-mail sintético -> signInWithPassword) e o
-- rate limiting contra força bruta (restrição b) NÃO acontecem aqui no
-- banco — são responsabilidade de uma rota nova no JS Bot
-- (`src/dashboard/separadorAuthController.js`, mesmo espírito de
-- `src/middlewares/rateLimiter.js`), porque só lá dá pra limitar tentativas
-- por IP/código antes mesmo de chamar o Supabase Auth. O reset de PIN
-- (restrição c) também é feito por ali, via Supabase Admin API com a
-- service key — nunca self-service, nunca express pelo cliente.
--
-- DECISÃO DE ARQUITETURA — nenhuma escrita direta do client:
-- Diferente da lacuna registrada na Vistoria Técnica de 13/08/2026
-- (Problema 4: policy `for update using (eh_operador_ativo())` aberta em
-- `pedidos`/`orcamentos`, permitindo UPDATE direto via PostgREST sem passar
-- pela RPC nem gerar trilha no histórico), as tabelas novas desta extensão
-- NÃO recebem nenhuma policy de INSERT/UPDATE/DELETE para `authenticated`.
-- Toda escrita passa por uma RPC `security definer` (que já é auditável por
-- construção: cada uma resolve o autor via auth.uid(), nunca confia num id
-- mandado pelo client — mitiga BOLA, item 8 do Guia Mestre). Só
-- `service_role` (o bot) e as próprias RPCs têm caminho de escrita.
-- =====================================================================


-- =====================================================================
-- A. FUNCIONÁRIOS — extensão de login (código + PIN via Supabase Auth)
-- =====================================================================
-- `funcionarios` já existe (extensao_funcionarios_responsaveis.sql) como
-- cadastro leve SEM login. Aqui adicionamos campos OPCIONAIS: um
-- funcionário só ganha login quando um admin decide "ativar" ele como
-- Separador (ver fluxo de provisionamento no reset-pin do bot). Um
-- funcionário só usado na Ficha de Separação (sem papel de app) nunca
-- precisa preencher esses campos.

alter table funcionarios
  add column if not exists codigo_funcionario text unique,
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null,
  add column if not exists pin_tentativas_falhas integer not null default 0,
  add column if not exists pin_bloqueado_ate timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'funcionarios_codigo_funcionario_check'
  ) then
    alter table funcionarios
      add constraint funcionarios_codigo_funcionario_check
      check (codigo_funcionario is null or char_length(codigo_funcionario) between 2 and 20);
  end if;
end $$;

-- Um auth_user_id só pode estar ligado a UM funcionário (índice único
-- parcial — vários funcionários sem login continuam com auth_user_id null,
-- o que um índice único comum rejeitaria).
create unique index if not exists idx_funcionarios_auth_user_id
  on funcionarios (auth_user_id) where auth_user_id is not null;

-- Nenhuma coluna de PIN em texto plano ou hash existe aqui — ver decisão de
-- arquitetura no cabeçalho. `pin_tentativas_falhas`/`pin_bloqueado_ate` são
-- escritos SÓ pelo bot via service_role (nunca por RPC exposta a client),
-- então não precisam de policy de escrita própria.


-- =====================================================================
-- B. SOLICITAÇÕES DE SEPARAÇÃO
-- =====================================================================

create table if not exists solicitacoes_separacao (
  id                       uuid primary key default gen_random_uuid(),
  pedido_id                uuid not null references pedidos (id) on delete cascade,
  operador_delegante_id    uuid not null references operadores (id) on delete restrict,
  -- null só quando tipo = 'rapida' (o próprio operador é quem separa —
  -- ver CHECK abaixo e a decisão de não criar uma segunda FK redundante).
  separador_id             uuid references funcionarios (id) on delete restrict,
  prioridade               text not null check (prioridade in ('imediata', 'agendada')),
  horario_retirada         timestamptz,
  status                   text not null default 'pendente'
                             check (status in ('pendente', 'em_andamento', 'pronta', 'cancelada')),
  tipo                     text not null default 'delegada' check (tipo in ('delegada', 'rapida')),
  observacao               text,
  iniciada_em              timestamptz,
  concluida_em             timestamptz,
  cancelada_em             timestamptz,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),

  constraint chk_solic_sep_horario_se_agendada
    check (prioridade <> 'agendada' or horario_retirada is not null),
  constraint chk_solic_sep_separador_por_tipo
    check ((tipo = 'delegada' and separador_id is not null)
        or (tipo = 'rapida' and separador_id is null))
);

create index if not exists idx_solic_sep_pedido on solicitacoes_separacao (pedido_id);
create index if not exists idx_solic_sep_delegante on solicitacoes_separacao (operador_delegante_id);
create index if not exists idx_solic_sep_ativas on solicitacoes_separacao (separador_id, status)
  where status in ('pendente', 'em_andamento');

drop trigger if exists trg_solic_sep_atualizado_em on solicitacoes_separacao;
create trigger trg_solic_sep_atualizado_em
before update on solicitacoes_separacao
for each row execute function set_atualizado_em();


-- =====================================================================
-- C. CHECKLIST DA SOLICITAÇÃO (itens a separar)
-- =====================================================================
-- Tabela própria, distinta de `itens_pedido.separado` (usado pela Ficha de
-- Separação legada): cada solicitação tem seu próprio estado de checklist,
-- criado como snapshot no momento da delegação. Isso evita que uma
-- solicitação cancelada e redelegada herde itens já marcados de uma
-- tentativa anterior, e evita acoplar as duas telas (legada e nova).

create table if not exists solicitacoes_separacao_itens (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references solicitacoes_separacao (id) on delete cascade,
  item_pedido_id  uuid not null references itens_pedido (id) on delete cascade,
  separado        boolean not null default false,
  separado_em     timestamptz
);

create unique index if not exists uq_solic_sep_itens on solicitacoes_separacao_itens (solicitacao_id, item_pedido_id);
create index if not exists idx_solic_sep_itens_solicitacao on solicitacoes_separacao_itens (solicitacao_id);


-- =====================================================================
-- D. CHAT INTERNO DA SOLICITAÇÃO
-- =====================================================================
-- Por solicitação (não um chat geral) — distinto do chat com o CLIENTE em
-- `mensagens`/AtendimentoPage.

create table if not exists solicitacoes_separacao_mensagens (
  id                    uuid primary key default gen_random_uuid(),
  solicitacao_id        uuid not null references solicitacoes_separacao (id) on delete cascade,
  autor_tipo            text not null check (autor_tipo in ('operador', 'separador')),
  autor_operador_id     uuid references operadores (id) on delete set null,
  autor_funcionario_id  uuid references funcionarios (id) on delete set null,
  texto                 text not null check (char_length(texto) between 1 and 2000),
  criado_em             timestamptz not null default now(),

  constraint chk_solic_sep_msg_autor
    check ((autor_tipo = 'operador' and autor_operador_id is not null and autor_funcionario_id is null)
        or (autor_tipo = 'separador' and autor_funcionario_id is not null and autor_operador_id is null))
);

create index if not exists idx_solic_sep_msg_solicitacao on solicitacoes_separacao_mensagens (solicitacao_id, criado_em);


-- =====================================================================
-- E. NOTIFICAÇÕES INTERNAS (equipe) — distinta de `notificacoes` (cliente)
-- =====================================================================
-- Cobre os 4 eventos do design: solicitação delegada, separação concluída,
-- nova mensagem no chat, tarefa agendada vencendo. `push_enviado` fica
-- pronta pro app mobile consumir depois (Expo push tokens fora de escopo
-- agora); por ora o evento é sempre registrado, mesmo sem envio de push
-- real — não fica "esperando" a infraestrutura de push existir.

create table if not exists notificacoes_internas (
  id                          uuid primary key default gen_random_uuid(),
  tipo                        text not null check (tipo in (
                                'solicitacao_delegada', 'separacao_concluida',
                                'nova_mensagem', 'tarefa_agendada_vencendo'
                              )),
  solicitacao_id              uuid references solicitacoes_separacao (id) on delete cascade,
  destinatario_tipo           text not null check (destinatario_tipo in ('operador', 'separador')),
  destinatario_operador_id    uuid references operadores (id) on delete cascade,
  destinatario_funcionario_id uuid references funcionarios (id) on delete cascade,
  titulo                      text not null,
  corpo                       text,
  lida                        boolean not null default false,
  lida_em                     timestamptz,
  push_enviado                boolean not null default false,
  criado_em                   timestamptz not null default now(),

  constraint chk_notif_interna_destinatario
    check ((destinatario_tipo = 'operador' and destinatario_operador_id is not null and destinatario_funcionario_id is null)
        or (destinatario_tipo = 'separador' and destinatario_funcionario_id is not null and destinatario_operador_id is null))
);

create index if not exists idx_notif_interna_operador on notificacoes_internas (destinatario_operador_id, lida)
  where destinatario_operador_id is not null;
create index if not exists idx_notif_interna_funcionario on notificacoes_internas (destinatario_funcionario_id, lida)
  where destinatario_funcionario_id is not null;
create index if not exists idx_notif_interna_solicitacao on notificacoes_internas (solicitacao_id);


-- =====================================================================
-- F. FUNÇÕES AUXILIARES DE RLS (mesmo espírito de eh_operador_ativo/eh_admin)
-- =====================================================================

create or replace function eh_separador_ativo()
returns boolean as $$
  select exists (
    select 1 from funcionarios
    where auth_user_id = auth.uid() and ativo and 'separacao' = any(papeis)
  );
$$ language sql stable security definer set search_path = public;

-- id do funcionário ligado à sessão atual (null se quem está logado não é
-- um separador com login ativo) — usado pelas RPCs pra resolver "quem sou
-- eu" sem nunca confiar num id mandado pelo client.
create or replace function funcionario_atual_id()
returns uuid as $$
  select id from funcionarios where auth_user_id = auth.uid();
$$ language sql stable security definer set search_path = public;


-- =====================================================================
-- G. RPCs — única porta de escrita (trilha auditável, mesmo espírito de
--    atualizar_status_pedido/atribuir_responsavel_pedido)
-- =====================================================================

-- G1. Delegar (Operador escolhe Separador, prioridade, horário se agendada)
create or replace function delegar_separacao(
  p_pedido_id uuid,
  p_separador_id uuid,
  p_prioridade text,
  p_horario_retirada timestamptz default null,
  p_observacao text default null
)
returns solicitacoes_separacao as $$
declare
  v_solicitacao solicitacoes_separacao;
  v_qtd_itens integer;
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

  if not exists (select 1 from pedidos where id = p_pedido_id) then
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

  insert into notificacoes_internas
    (tipo, solicitacao_id, destinatario_tipo, destinatario_funcionario_id, titulo, corpo)
  values (
    'solicitacao_delegada', v_solicitacao.id, 'separador', p_separador_id,
    'Nova separação delegada a você',
    format('Pedido %s — prioridade %s', (select protocolo from pedidos where id = p_pedido_id), p_prioridade)
  );

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- G2. Separação Rápida (RN-01) — operador separa ele mesmo, até 7 itens,
--     sempre imediata, já nasce em_andamento (pula o "assumir").
create or replace function separacao_rapida(
  p_pedido_id uuid,
  p_observacao text default null
)
returns solicitacoes_separacao as $$
declare
  v_solicitacao solicitacoes_separacao;
  v_qtd_itens integer;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem usar a Separação Rápida';
  end if;

  if not exists (select 1 from pedidos where id = p_pedido_id) then
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

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- G3. Separador assume a solicitação delegada (pendente -> em_andamento)
create or replace function assumir_separacao(p_solicitacao_id uuid)
returns solicitacoes_separacao as $$
declare
  v_solicitacao solicitacoes_separacao;
begin
  select * into v_solicitacao from solicitacoes_separacao where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação % não encontrada', p_solicitacao_id;
  end if;

  if v_solicitacao.tipo <> 'delegada' then
    raise exception 'Só solicitações delegadas passam por "assumir" — a Separação Rápida já inicia em andamento';
  end if;
  if v_solicitacao.separador_id is distinct from funcionario_atual_id() then
    raise exception 'Esta solicitação não está atribuída a você';
  end if;
  if v_solicitacao.status <> 'pendente' then
    raise exception 'Solicitação % não está pendente (status atual: %)', p_solicitacao_id, v_solicitacao.status;
  end if;

  update solicitacoes_separacao
  set status = 'em_andamento', iniciada_em = now()
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- G4. Marcar item do checklist como separado/não separado
create or replace function marcar_item_separado_solicitacao(
  p_solicitacao_item_id uuid,
  p_separado boolean
)
returns solicitacoes_separacao_itens as $$
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

  return v_item;
end;
$$ language plpgsql security definer set search_path = public;


-- G5. Concluir separação (exige todos os itens marcados — mesma regra do
--     botão "Separação Pronta" da tela, só que garantida no servidor)
create or replace function concluir_separacao(p_solicitacao_id uuid)
returns solicitacoes_separacao as $$
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

  insert into notificacoes_internas
    (tipo, solicitacao_id, destinatario_tipo, destinatario_operador_id, titulo, corpo)
  values (
    'separacao_concluida', v_solicitacao.id, 'operador', v_solicitacao.operador_delegante_id,
    'Separação concluída',
    format('Pedido %s está pronto', (select protocolo from pedidos where id = v_solicitacao.pedido_id))
  );

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- G6. Cancelar — operador delegante, admin, ou o próprio separador (ele
--     pode recusar/devolver uma delegação errada)
create or replace function cancelar_separacao(p_solicitacao_id uuid, p_motivo text default null)
returns solicitacoes_separacao as $$
declare
  v_solicitacao solicitacoes_separacao;
  v_pode boolean;
begin
  select * into v_solicitacao from solicitacoes_separacao where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação % não encontrada', p_solicitacao_id;
  end if;

  if v_solicitacao.status not in ('pendente', 'em_andamento') then
    raise exception 'Solicitação % não pode ser cancelada (status atual: %)', p_solicitacao_id, v_solicitacao.status;
  end if;

  v_pode := eh_admin()
    or (eh_operador_ativo() and auth.uid() = v_solicitacao.operador_delegante_id)
    or (v_solicitacao.tipo = 'delegada'
        and v_solicitacao.separador_id is not distinct from funcionario_atual_id()
        and funcionario_atual_id() is not null);

  if v_pode is not true then
    raise exception 'Você não tem permissão para cancelar esta solicitação';
  end if;

  update solicitacoes_separacao
  set status = 'cancelada',
      cancelada_em = now(),
      observacao = case when p_motivo is not null
        then coalesce(observacao || E'\n', '') || 'Cancelada: ' || p_motivo
        else observacao end
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- G7. Enviar mensagem no chat interno da solicitação (autor sempre
--     resolvido por auth.uid(), nunca informado pelo client)
create or replace function enviar_mensagem_separacao(p_solicitacao_id uuid, p_texto text)
returns solicitacoes_separacao_mensagens as $$
declare
  v_solicitacao solicitacoes_separacao;
  v_mensagem solicitacoes_separacao_mensagens;
  v_autor_tipo text;
  v_op_id uuid;
  v_func_id uuid;
begin
  if p_texto is null or length(trim(p_texto)) = 0 then
    raise exception 'Mensagem vazia';
  end if;
  if length(p_texto) > 2000 then
    raise exception 'Mensagem excede 2000 caracteres';
  end if;

  select * into v_solicitacao from solicitacoes_separacao where id = p_solicitacao_id;
  if not found then
    raise exception 'Solicitação % não encontrada', p_solicitacao_id;
  end if;
  if v_solicitacao.tipo = 'rapida' then
    raise exception 'Chat não é aplicável à Separação Rápida (autoatribuída)';
  end if;

  if eh_admin() or (eh_operador_ativo() and auth.uid() = v_solicitacao.operador_delegante_id) then
    v_autor_tipo := 'operador';
    v_op_id := auth.uid();
    v_func_id := null;
  elsif funcionario_atual_id() is not null and funcionario_atual_id() = v_solicitacao.separador_id then
    v_autor_tipo := 'separador';
    v_func_id := funcionario_atual_id();
    v_op_id := null;
  else
    raise exception 'Você não participa desta solicitação';
  end if;

  insert into solicitacoes_separacao_mensagens
    (solicitacao_id, autor_tipo, autor_operador_id, autor_funcionario_id, texto)
  values (p_solicitacao_id, v_autor_tipo, v_op_id, v_func_id, p_texto)
  returning * into v_mensagem;

  insert into notificacoes_internas
    (tipo, solicitacao_id, destinatario_tipo, destinatario_operador_id, destinatario_funcionario_id, titulo, corpo)
  values (
    'nova_mensagem', p_solicitacao_id,
    case when v_autor_tipo = 'operador' then 'separador' else 'operador' end,
    case when v_autor_tipo = 'separador' then v_solicitacao.operador_delegante_id else null end,
    case when v_autor_tipo = 'operador' then v_solicitacao.separador_id else null end,
    'Nova mensagem',
    left(p_texto, 140)
  );

  return v_mensagem;
end;
$$ language plpgsql security definer set search_path = public;


-- G8. Marcar notificação interna como lida (só o próprio destinatário)
create or replace function marcar_notificacao_lida(p_id uuid)
returns notificacoes_internas as $$
declare
  v_notif notificacoes_internas;
  v_pode boolean;
begin
  select * into v_notif from notificacoes_internas where id = p_id;
  if not found then
    raise exception 'Notificação % não encontrada', p_id;
  end if;

  v_pode := (eh_operador_ativo() and auth.uid() = v_notif.destinatario_operador_id)
    or (funcionario_atual_id() is not null and funcionario_atual_id() = v_notif.destinatario_funcionario_id);

  if v_pode is not true then
    raise exception 'Você não pode marcar esta notificação como lida';
  end if;

  update notificacoes_internas set lida = true, lida_em = now() where id = p_id
  returning * into v_notif;

  return v_notif;
end;
$$ language plpgsql security definer set search_path = public;


-- =====================================================================
-- H. RLS — leitura por policy, escrita só por RPC/service_role
-- =====================================================================
-- Deliberadamente SEM policy de insert/update/delete para `authenticated`
-- em nenhuma das 4 tabelas novas — ver decisão de arquitetura no
-- cabeçalho. As RPCs da seção G rodam como `security definer` (dono da
-- função) e por isso escrevem mesmo sem essas policies.

alter table solicitacoes_separacao enable row level security;
drop policy if exists "leitura_solicitacoes_separacao" on solicitacoes_separacao;
create policy "leitura_solicitacoes_separacao" on solicitacoes_separacao
  for select using (eh_operador_ativo() or separador_id = funcionario_atual_id());
drop policy if exists "service_role_full_access" on solicitacoes_separacao;
create policy "service_role_full_access" on solicitacoes_separacao
  for all using (auth.role() = 'service_role');

alter table solicitacoes_separacao_itens enable row level security;
drop policy if exists "leitura_solicitacoes_separacao_itens" on solicitacoes_separacao_itens;
create policy "leitura_solicitacoes_separacao_itens" on solicitacoes_separacao_itens
  for select using (
    exists (
      select 1 from solicitacoes_separacao s
      where s.id = solicitacoes_separacao_itens.solicitacao_id
        and (eh_operador_ativo() or s.separador_id = funcionario_atual_id())
    )
  );
drop policy if exists "service_role_full_access" on solicitacoes_separacao_itens;
create policy "service_role_full_access" on solicitacoes_separacao_itens
  for all using (auth.role() = 'service_role');

alter table solicitacoes_separacao_mensagens enable row level security;
drop policy if exists "leitura_solicitacoes_separacao_mensagens" on solicitacoes_separacao_mensagens;
create policy "leitura_solicitacoes_separacao_mensagens" on solicitacoes_separacao_mensagens
  for select using (
    exists (
      select 1 from solicitacoes_separacao s
      where s.id = solicitacoes_separacao_mensagens.solicitacao_id
        and (eh_operador_ativo() or s.separador_id = funcionario_atual_id())
    )
  );
drop policy if exists "service_role_full_access" on solicitacoes_separacao_mensagens;
create policy "service_role_full_access" on solicitacoes_separacao_mensagens
  for all using (auth.role() = 'service_role');

alter table notificacoes_internas enable row level security;
drop policy if exists "leitura_notificacoes_internas" on notificacoes_internas;
create policy "leitura_notificacoes_internas" on notificacoes_internas
  for select using (
    (destinatario_tipo = 'operador' and eh_operador_ativo() and destinatario_operador_id = auth.uid())
    or (destinatario_tipo = 'separador' and destinatario_funcionario_id = funcionario_atual_id())
  );
drop policy if exists "service_role_full_access" on notificacoes_internas;
create policy "service_role_full_access" on notificacoes_internas
  for all using (auth.role() = 'service_role');

-- funcionarios: as policies de leitura/escrita/exclusão pra operador/admin já
-- existem (extensao_funcionarios_responsaveis.sql). Falta só o separador
-- conseguir ler a PRÓPRIA linha (pra mostrar o nome dele na tela) — ele não
-- está em `operadores`, então `eh_operador_ativo()` é false pra ele.
drop policy if exists "separador_le_a_si_mesmo" on funcionarios;
create policy "separador_le_a_si_mesmo" on funcionarios
  for select using (auth_user_id = auth.uid());


-- =====================================================================
-- I. REALTIME — publica as 4 tabelas novas (status/chat sem polling)
-- =====================================================================
-- Idempotente por construção: ALTER PUBLICATION ... ADD TABLE falha se a
-- tabela já estiver na publicação, então checamos antes (mesmo o pg_catalog
-- sendo consultado, não a tabela em si — seguro rodar de novo).
-- Nota: isto NÃO resolve o Problema 6 da Vistoria Técnica de 13/08/2026
-- (se as tabelas ANTIGAS, ex. pedidos, estão ou não na publicação —
-- precisa da verificação em produção via pg_publication_tables). Resolve
-- só para as 4 tabelas desta extensão.

do $$
declare
  t text;
begin
  foreach t in array array[
    'solicitacoes_separacao',
    'solicitacoes_separacao_itens',
    'solicitacoes_separacao_mensagens',
    'notificacoes_internas'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
