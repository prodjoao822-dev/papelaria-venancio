-- =====================================================================
-- VENÂNCIO — Entrega Delegada (papel Entregador) + Ocorrências
-- =====================================================================
-- Fase A (banco) do addendum `DOCUMENTAÇÃO/Requisitos_Addendum_Entrega_
-- Ocorrencia.md` (19/08/2026): terceiro papel de funcionário de primeira
-- classe (Entregador, mesmo padrão do Separador) + entidade Ocorrência
-- (operacional: item faltante, endereço não encontrado, cliente ausente,
-- produto avariado; pós-venda: troca, devolução, produto errado).
--
-- Roda depois de extensao_separacao_delegada.sql (usa `funcionarios`,
-- `funcionario_atual_id()`, `set_atualizado_em()`, `eh_operador_ativo()`,
-- `eh_admin()`) e de extensao_dashboard.sql (usa `operadores`, `pedidos`).
-- Idempotente: seguro rodar mais de uma vez.
--
-- ESCOPO: só o motor (schema + RPCs + RLS + realtime), igual à extensão de
-- separação delegada. Não mexe em `pedidos.status` (`status_pedido`) — este
-- subsistema é aditivo e roda em paralelo, pelo mesmo motivo já documentado
-- em extensao_separacao_delegada.sql: uma solicitação de entrega concluída
-- NÃO força nenhuma transição em `pedidos`, fica a cargo de uma fase futura
-- (Fase B/C do addendum) decidir se/como acoplar isso.
--
-- NÃO EXECUTADO EM PRODUÇÃO NESTA SESSÃO — só o arquivo .sql foi escrito,
-- para revisão e aplicação manual, conforme instrução da tarefa.
--
-- ── SOBRE O BLOQUEADOR B1 (pré-requisito citado no addendum) ───────────
-- O addendum pede para corrigir B1 (`atribuir_responsavel_pedido` e RPCs
-- irmãs aceitando id de ator do client) ANTES de generalizar o padrão.
-- Investigação desta sessão confirmou que **isso já foi feito**: o arquivo
-- `extensao_auditoria_b1_dashboard.sql` (commit 19cab06, 15/08/2026) já
-- reescreveu as 5 funções (`atualizar_status_pedido_dashboard`,
-- `atualizar_status_orcamento_dashboard`, `aceitar_orcamento_dashboard`,
-- `atribuir_responsavel_pedido`, `aprender_de_resposta_operador`) para
-- ignorar `p_operador_id` e resolver `v_operador_id := auth.uid()`
-- internamente — e a nota de execução no rodapé daquele arquivo confirma
-- que o `CREATE OR REPLACE FUNCTION` foi aplicado em produção no mesmo dia.
-- Não há nenhuma outra função no repositório com o mesmo padrão vulnerável
-- (grep por `p_operador_id`/`p_funcionario_id` em todo `supabase/*.sql`
-- só retorna essas 5 funções, já corrigidas). Por isso este arquivo NÃO
-- redefine `atribuir_responsavel_pedido` de novo — fazer isso seria
-- exatamente o tipo de "duas definições divergentes da mesma função
-- silenciosamente se sobrescrevendo" que o projeto já teve como incidente
-- real. A base para as RPCs novas abaixo (resolver o ator sempre por
-- `auth.uid()`/`funcionario_atual_id()`, nunca por parâmetro) já nasce
-- correta, seguindo o padrão de `extensao_separacao_delegada.sql`.
-- =====================================================================


-- =====================================================================
-- A. HELPER DE RLS — eh_entregador_ativo() (mesmo espírito de
--    eh_separador_ativo() em extensao_separacao_delegada.sql)
-- =====================================================================
-- `funcionarios.papel` NÃO é um enum estrito — é `papeis text[]`
-- (confirmado em extensao_funcionarios_responsaveis.sql), e o dashboard já
-- usa os valores 'separacao' e 'entrega' em PAPEIS_FUNCIONARIO
-- (venancio-ai-ops/src/utils/constants.js). Um funcionário pode acumular
-- os dois papéis (array), então esta função e eh_separador_ativo() não são
-- mutuamente exclusivas por design.

create or replace function eh_entregador_ativo()
returns boolean as $$
  select exists (
    select 1 from funcionarios
    where auth_user_id = auth.uid() and ativo and 'entrega' = any(papeis)
  );
$$ language sql stable security definer set search_path = public;


-- =====================================================================
-- B. SOLICITAÇÕES DE ENTREGA
-- =====================================================================
-- Diferente de solicitacoes_separacao, entrega não tem variante "rápida"
-- (o Operador nunca entrega ele mesmo pelo fluxo formal) — só existe o
-- caminho delegado, então `entregador_id` é sempre NOT NULL desde a
-- criação (definido em delegar_entrega, nunca fica "a definir").
--
-- DECISÃO DE DESIGN (não estava explícito no addendum, coluna extra
-- precisou ser inventada): o addendum descreve o fluxo como "delegar →
-- assumir → em rota → concluir/insucesso" (4 passos), mas o enum de status
-- pedido pelo addendum tem só 5 valores fixos, sem um estado dedicado para
-- "assumida" entre pendente e em_rota. Resolvido assim: `assumir_entrega`
-- NÃO muda `status` (continua 'pendente'), só carimba `assumida_em` —
-- é o entregador confirmando que viu e aceitou a delegação. Só depois
-- disso `iniciar_rota` transiciona pendente -> em_rota (o entregador saiu
-- fisicamente da loja). Isso mantém o enum de 5 valores exigido pelo
-- addendum e ainda assim expõe as 4 etapas do fluxo (a 4ª granularidade
-- vem do timestamp `assumida_em`, não de mais um valor de `status`).
create table if not exists solicitacoes_entrega (
  id                    uuid primary key default gen_random_uuid(),
  pedido_id             uuid not null references pedidos (id) on delete cascade,
  entregador_id         uuid not null references funcionarios (id) on delete restrict,
  delegado_por_id       uuid not null references operadores (id) on delete restrict,
  status                text not null default 'pendente'
                          check (status in ('pendente', 'em_rota', 'entregue', 'insucesso', 'cancelada')),
  endereco_entrega      text,  -- snapshot de pedidos.endereco_entrega no momento da delegação
  horario_previsto      timestamptz,
  assumida_em           timestamptz,  -- ver decisão de design acima
  iniciada_em           timestamptz,  -- quando entrou em 'em_rota'
  concluida_em          timestamptz,  -- quando virou 'entregue'
  insucesso_em          timestamptz,  -- quando virou 'insucesso'
  cancelada_em          timestamptz,
  motivo_insucesso      text,
  motivo_cancelamento   text,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists idx_solic_entrega_pedido on solicitacoes_entrega (pedido_id);
create index if not exists idx_solic_entrega_delegante on solicitacoes_entrega (delegado_por_id);
create index if not exists idx_solic_entrega_ativas on solicitacoes_entrega (entregador_id, status)
  where status in ('pendente', 'em_rota');

drop trigger if exists trg_solic_entrega_atualizado_em on solicitacoes_entrega;
create trigger trg_solic_entrega_atualizado_em
before update on solicitacoes_entrega
for each row execute function set_atualizado_em();


-- =====================================================================
-- C. OCORRÊNCIAS
-- =====================================================================
-- DECISÃO DE DESIGN (deviation do texto literal do prompt, com motivo de
-- negócio explícito): o prompt descreve `criado_por_id` como FK única para
-- `funcionarios`. Isso não cobre o caso mais crítico apontado pelo próprio
-- addendum (seção "Contexto de negócio"): ocorrências de pós-venda (troca,
-- devolução, produto errado) nascem do Operador atendendo o cliente que
-- retorna à loja, pela busca do dashboard — Operador está na tabela
-- `operadores`, não em `funcionarios`. Uma FK única para `funcionarios`
-- quebraria exatamente o caso de uso mais importante descrito no
-- documento. Por isso o ator de criação (e o de resolução) usam o mesmo
-- padrão dual já em produção em `solicitacoes_separacao_mensagens`
-- (`autor_tipo` + duas FKs nullable, uma delas sempre null via CHECK):
-- aqui vira `criado_por_tipo`/`resolvido_por_tipo` + par de FKs.
create table if not exists ocorrencias (
  id                          uuid primary key default gen_random_uuid(),
  pedido_id                   uuid not null references pedidos (id) on delete cascade,
  solicitacao_separacao_id    uuid references solicitacoes_separacao (id) on delete set null,
  solicitacao_entrega_id      uuid references solicitacoes_entrega (id) on delete set null,
  tipo                        text not null check (tipo in (
                                 -- operacionais (separação/entrega)
                                 'item_faltante', 'endereco_nao_encontrado',
                                 'cliente_ausente', 'produto_avariado',
                                 -- pós-venda (balcão, cliente retorna à loja)
                                 'troca', 'devolucao', 'produto_errado'
                               )),
  criado_por_tipo             text not null check (criado_por_tipo in ('operador', 'funcionario')),
  criado_por_operador_id      uuid references operadores (id) on delete set null,
  criado_por_funcionario_id   uuid references funcionarios (id) on delete set null,
  status                      text not null default 'aberta' check (status in ('aberta', 'resolvida')),
  descricao                   text not null check (char_length(descricao) between 1 and 2000),
  resolucao_texto             text,
  resolvido_por_tipo          text check (resolvido_por_tipo in ('operador', 'funcionario')),
  resolvido_por_operador_id   uuid references operadores (id) on delete set null,
  resolvido_por_funcionario_id uuid references funcionarios (id) on delete set null,
  criado_em                   timestamptz not null default now(),
  resolvida_em                timestamptz,

  constraint chk_ocorrencia_criado_por
    check ((criado_por_tipo = 'operador' and criado_por_operador_id is not null and criado_por_funcionario_id is null)
        or (criado_por_tipo = 'funcionario' and criado_por_funcionario_id is not null and criado_por_operador_id is null)),
  -- Ao menos uma das duas origens (separação OU entrega) deve bater com o
  -- tipo operacional escolhido não é forçado aqui por CHECK (uma ocorrência
  -- pós-venda legitimamente não tem nenhuma das duas — nasce só do pedido,
  -- semanas depois da separação/entrega já terem sumido do fluxo ativo).
  constraint chk_ocorrencia_resolucao
    check ((status = 'aberta' and resolvida_em is null)
        or (status = 'resolvida' and resolvida_em is not null and resolucao_texto is not null))
);

create index if not exists idx_ocorrencias_pedido on ocorrencias (pedido_id);
create index if not exists idx_ocorrencias_solic_separacao on ocorrencias (solicitacao_separacao_id)
  where solicitacao_separacao_id is not null;
create index if not exists idx_ocorrencias_solic_entrega on ocorrencias (solicitacao_entrega_id)
  where solicitacao_entrega_id is not null;
create index if not exists idx_ocorrencias_abertas on ocorrencias (status, criado_em)
  where status = 'aberta';


-- =====================================================================
-- D. RPCs — SOLICITAÇÕES DE ENTREGA (única porta de escrita, mesmo padrão
--    de extensao_separacao_delegada.sql: SECURITY DEFINER + ator sempre
--    resolvido por auth.uid()/funcionario_atual_id(), nunca por parâmetro)
-- =====================================================================

-- D1. Delegar (Operador escolhe o Entregador; endereço vira snapshot)
create or replace function delegar_entrega(
  p_pedido_id uuid,
  p_entregador_id uuid,
  p_horario_previsto timestamptz default null
)
returns solicitacoes_entrega as $$
declare
  v_solicitacao solicitacoes_entrega;
  v_pedido pedidos;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem delegar entrega';
  end if;

  select * into v_pedido from pedidos where id = p_pedido_id;
  if not found then
    raise exception 'Pedido % não encontrado', p_pedido_id;
  end if;

  -- Entrega delegada a um Entregador interno só faz sentido para
  -- forma_entrega = 'entrega_propria' — 'uber_flash' é terceirizado (não
  -- passa pela nossa equipe) e 'retirada' não tem rota nenhuma.
  if v_pedido.forma_entrega is distinct from 'entrega_propria' then
    raise exception 'Só é possível delegar entrega para pedidos com forma_entrega = entrega_propria (pedido está em %)',
      coalesce(v_pedido.forma_entrega, 'null');
  end if;

  if not exists (
    select 1 from funcionarios
    where id = p_entregador_id and ativo and 'entrega' = any(papeis)
  ) then
    raise exception 'Funcionário % não é um entregador ativo', p_entregador_id;
  end if;

  if exists (
    select 1 from solicitacoes_entrega
    where pedido_id = p_pedido_id and status in ('pendente', 'em_rota')
  ) then
    raise exception 'Pedido % já tem uma solicitação de entrega ativa', p_pedido_id;
  end if;

  insert into solicitacoes_entrega
    (pedido_id, entregador_id, delegado_por_id, status, endereco_entrega, horario_previsto)
  values
    (p_pedido_id, p_entregador_id, auth.uid(), 'pendente', v_pedido.endereco_entrega, p_horario_previsto)
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- D2. Entregador confirma que viu/aceitou a delegação (não muda status —
--     ver decisão de design na seção B). Idempotência: falha se já assumida.
create or replace function assumir_entrega(p_solicitacao_id uuid)
returns solicitacoes_entrega as $$
declare
  v_solicitacao solicitacoes_entrega;
begin
  select * into v_solicitacao from solicitacoes_entrega where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação de entrega % não encontrada', p_solicitacao_id;
  end if;

  if v_solicitacao.entregador_id is distinct from funcionario_atual_id() then
    raise exception 'Esta entrega não está atribuída a você';
  end if;
  if v_solicitacao.status <> 'pendente' then
    raise exception 'Solicitação % não está pendente (status atual: %)', p_solicitacao_id, v_solicitacao.status;
  end if;
  if v_solicitacao.assumida_em is not null then
    raise exception 'Solicitação % já foi assumida', p_solicitacao_id;
  end if;

  update solicitacoes_entrega
  set assumida_em = now()
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- D3. Entregador sai da loja com o pedido (pendente -> em_rota). Exige
--     assumir_entrega ter rodado antes — impede pular a etapa de aceite.
create or replace function iniciar_rota(p_solicitacao_id uuid)
returns solicitacoes_entrega as $$
declare
  v_solicitacao solicitacoes_entrega;
begin
  select * into v_solicitacao from solicitacoes_entrega where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação de entrega % não encontrada', p_solicitacao_id;
  end if;

  if v_solicitacao.entregador_id is distinct from funcionario_atual_id() then
    raise exception 'Esta entrega não está atribuída a você';
  end if;
  if v_solicitacao.status <> 'pendente' then
    raise exception 'Solicitação % não está pendente (status atual: %)', p_solicitacao_id, v_solicitacao.status;
  end if;
  if v_solicitacao.assumida_em is null then
    raise exception 'Você precisa assumir a entrega (assumir_entrega) antes de iniciar a rota';
  end if;

  update solicitacoes_entrega
  set status = 'em_rota', iniciada_em = now()
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- D4. Entrega concluída com sucesso (em_rota -> entregue)
create or replace function concluir_entrega(p_solicitacao_id uuid)
returns solicitacoes_entrega as $$
declare
  v_solicitacao solicitacoes_entrega;
begin
  select * into v_solicitacao from solicitacoes_entrega where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação de entrega % não encontrada', p_solicitacao_id;
  end if;

  if v_solicitacao.entregador_id is distinct from funcionario_atual_id() then
    raise exception 'Esta entrega não está atribuída a você';
  end if;
  if v_solicitacao.status <> 'em_rota' then
    raise exception 'Solicitação % não está em rota (status atual: %)', p_solicitacao_id, v_solicitacao.status;
  end if;

  update solicitacoes_entrega
  set status = 'entregue', concluida_em = now()
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- D5. Insucesso na tentativa (em_rota -> insucesso) — endereço não
--     encontrado, cliente ausente, etc. `p_motivo` obrigatório: é o dado
--     mínimo pra alguém do balcão decidir o que fazer em seguida (tentar
--     de novo, ligar pro cliente, abrir ocorrência formal).
create or replace function registrar_insucesso_entrega(p_solicitacao_id uuid, p_motivo text)
returns solicitacoes_entrega as $$
declare
  v_solicitacao solicitacoes_entrega;
begin
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Motivo do insucesso é obrigatório';
  end if;

  select * into v_solicitacao from solicitacoes_entrega where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação de entrega % não encontrada', p_solicitacao_id;
  end if;

  if v_solicitacao.entregador_id is distinct from funcionario_atual_id() then
    raise exception 'Esta entrega não está atribuída a você';
  end if;
  if v_solicitacao.status <> 'em_rota' then
    raise exception 'Solicitação % não está em rota (status atual: %)', p_solicitacao_id, v_solicitacao.status;
  end if;

  update solicitacoes_entrega
  set status = 'insucesso', insucesso_em = now(), motivo_insucesso = p_motivo
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- D6. Cancelar — operador delegante, admin, ou o próprio entregador (pode
--     recusar/devolver uma delegação errada), mesmo espírito de
--     cancelar_separacao. Só antes do estado terminal (pendente/em_rota).
create or replace function cancelar_entrega(p_solicitacao_id uuid, p_motivo text default null)
returns solicitacoes_entrega as $$
declare
  v_solicitacao solicitacoes_entrega;
  v_pode boolean;
begin
  select * into v_solicitacao from solicitacoes_entrega where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação de entrega % não encontrada', p_solicitacao_id;
  end if;

  if v_solicitacao.status not in ('pendente', 'em_rota') then
    raise exception 'Solicitação % não pode ser cancelada (status atual: %)', p_solicitacao_id, v_solicitacao.status;
  end if;

  v_pode := eh_admin()
    or (eh_operador_ativo() and auth.uid() = v_solicitacao.delegado_por_id)
    or (v_solicitacao.entregador_id is not distinct from funcionario_atual_id()
        and funcionario_atual_id() is not null);

  if v_pode is not true then
    raise exception 'Você não tem permissão para cancelar esta solicitação';
  end if;

  update solicitacoes_entrega
  set status = 'cancelada', cancelada_em = now(), motivo_cancelamento = p_motivo
  where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$$ language plpgsql security definer set search_path = public;


-- =====================================================================
-- E. RPCs — OCORRÊNCIAS
-- =====================================================================

-- E1. Abrir ocorrência. Ator resolvido internamente: operador ativo tem
--     prioridade (cobre o caso de pós-venda no balcão); senão, qualquer
--     funcionário ativo (separador OU entregador — não checamos qual
--     papel especificamente, pois um item_faltante pode ser aberto tanto
--     por quem separa quanto por quem confere a entrega).
create or replace function abrir_ocorrencia(
  p_pedido_id uuid,
  p_tipo text,
  p_descricao text,
  p_solicitacao_separacao_id uuid default null,
  p_solicitacao_entrega_id uuid default null
)
returns ocorrencias as $$
declare
  v_ocorrencia ocorrencias;
  v_tipo_ator text;
  v_op_id uuid;
  v_func_id uuid;
begin
  if p_tipo not in (
    'item_faltante', 'endereco_nao_encontrado', 'cliente_ausente', 'produto_avariado',
    'troca', 'devolucao', 'produto_errado'
  ) then
    raise exception 'tipo de ocorrência inválido: %', p_tipo;
  end if;

  if p_descricao is null or length(trim(p_descricao)) = 0 then
    raise exception 'Descrição da ocorrência é obrigatória';
  end if;
  if length(p_descricao) > 2000 then
    raise exception 'Descrição excede 2000 caracteres';
  end if;

  if not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'Pedido % não encontrado', p_pedido_id;
  end if;

  if p_solicitacao_separacao_id is not null and not exists (
    select 1 from solicitacoes_separacao
    where id = p_solicitacao_separacao_id and pedido_id = p_pedido_id
  ) then
    raise exception 'Solicitação de separação % não pertence ao pedido %', p_solicitacao_separacao_id, p_pedido_id;
  end if;

  if p_solicitacao_entrega_id is not null and not exists (
    select 1 from solicitacoes_entrega
    where id = p_solicitacao_entrega_id and pedido_id = p_pedido_id
  ) then
    raise exception 'Solicitação de entrega % não pertence ao pedido %', p_solicitacao_entrega_id, p_pedido_id;
  end if;

  if eh_operador_ativo() then
    v_tipo_ator := 'operador';
    v_op_id := auth.uid();
    v_func_id := null;
  elsif funcionario_atual_id() is not null then
    v_tipo_ator := 'funcionario';
    v_func_id := funcionario_atual_id();
    v_op_id := null;
  else
    raise exception 'Você precisa estar autenticado como operador ou funcionário ativo para abrir uma ocorrência';
  end if;

  insert into ocorrencias
    (pedido_id, solicitacao_separacao_id, solicitacao_entrega_id, tipo,
     criado_por_tipo, criado_por_operador_id, criado_por_funcionario_id,
     status, descricao)
  values
    (p_pedido_id, p_solicitacao_separacao_id, p_solicitacao_entrega_id, p_tipo,
     v_tipo_ator, v_op_id, v_func_id,
     'aberta', p_descricao)
  returning * into v_ocorrencia;

  return v_ocorrencia;
end;
$$ language plpgsql security definer set search_path = public;


-- E2. Resolver ocorrência. Mesmo critério amplo de ator de E1 (operador ou
--     qualquer funcionário ativo) — não restringimos a "só quem abriu",
--     porque uma ocorrência pode precisar ser resolvida por outra pessoa
--     do time (ex.: Operador decide o encaminhamento de uma troca aberta
--     por um Separador).
create or replace function resolver_ocorrencia(p_ocorrencia_id uuid, p_resolucao_texto text)
returns ocorrencias as $$
declare
  v_ocorrencia ocorrencias;
  v_tipo_ator text;
  v_op_id uuid;
  v_func_id uuid;
begin
  if p_resolucao_texto is null or length(trim(p_resolucao_texto)) = 0 then
    raise exception 'Texto de resolução é obrigatório';
  end if;

  select * into v_ocorrencia from ocorrencias where id = p_ocorrencia_id for update;
  if not found then
    raise exception 'Ocorrência % não encontrada', p_ocorrencia_id;
  end if;

  if v_ocorrencia.status <> 'aberta' then
    raise exception 'Ocorrência % não está aberta (status atual: %)', p_ocorrencia_id, v_ocorrencia.status;
  end if;

  if eh_operador_ativo() then
    v_tipo_ator := 'operador';
    v_op_id := auth.uid();
    v_func_id := null;
  elsif funcionario_atual_id() is not null then
    v_tipo_ator := 'funcionario';
    v_func_id := funcionario_atual_id();
    v_op_id := null;
  else
    raise exception 'Você precisa estar autenticado como operador ou funcionário ativo para resolver uma ocorrência';
  end if;

  update ocorrencias
  set status = 'resolvida',
      resolucao_texto = p_resolucao_texto,
      resolvida_em = now(),
      resolvido_por_tipo = v_tipo_ator,
      resolvido_por_operador_id = v_op_id,
      resolvido_por_funcionario_id = v_func_id
  where id = p_ocorrencia_id
  returning * into v_ocorrencia;

  return v_ocorrencia;
end;
$$ language plpgsql security definer set search_path = public;


-- =====================================================================
-- F. RLS — leitura por policy, escrita só por RPC/service_role (mesmo
--    padrão de extensao_separacao_delegada.sql, seção H: nenhuma policy
--    de insert/update/delete para `authenticated` — toda escrita passa
--    pelas RPCs SECURITY DEFINER acima, que resolvem o ator internamente)
-- =====================================================================

alter table solicitacoes_entrega enable row level security;
drop policy if exists "leitura_solicitacoes_entrega" on solicitacoes_entrega;
create policy "leitura_solicitacoes_entrega" on solicitacoes_entrega
  for select using (eh_operador_ativo() or entregador_id = funcionario_atual_id());
drop policy if exists "service_role_full_access" on solicitacoes_entrega;
create policy "service_role_full_access" on solicitacoes_entrega
  for all using (auth.role() = 'service_role');

alter table ocorrencias enable row level security;
drop policy if exists "leitura_ocorrencias" on ocorrencias;
create policy "leitura_ocorrencias" on ocorrencias
  for select using (
    eh_operador_ativo()
    or criado_por_funcionario_id = funcionario_atual_id()
    or exists (
      select 1 from solicitacoes_separacao s
      where s.id = ocorrencias.solicitacao_separacao_id and s.separador_id = funcionario_atual_id()
    )
    or exists (
      select 1 from solicitacoes_entrega e
      where e.id = ocorrencias.solicitacao_entrega_id and e.entregador_id = funcionario_atual_id()
    )
  );
drop policy if exists "service_role_full_access" on ocorrencias;
create policy "service_role_full_access" on ocorrencias
  for all using (auth.role() = 'service_role');


-- =====================================================================
-- G. REALTIME — publica as 2 tabelas novas (mesmo padrão de
--    extensao_separacao_delegada.sql, seção I: idempotente por checar
--    pg_publication_tables antes do ALTER PUBLICATION)
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['solicitacoes_entrega', 'ocorrencias']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;


-- =====================================================================
-- H. TIMELINE UNIFICADA — extensão aditiva de `eventos` + triggers novos
-- =====================================================================
-- Achado ao investigar o schema ao vivo (não estava nos arquivos .sql já
-- lidos por sessões anteriores): já existe uma tabela `eventos` genérica
-- em produção (tipo_evento, entidade_tipo, entidade_id, ator_tipo, ator_id,
-- descricao, payload jsonb), alimentada por triggers em
-- `pedidos_status_historico`/`orcamentos_status_historico`/
-- `consultas_operacionais` (extensao_dashboard.sql, seção L). É exatamente
-- o mecanismo que a Fase D do addendum previa construir do zero — só que
-- já existe. Ligar `solicitacoes_entrega`/`ocorrencias` nela agora, no
-- mesmo arquivo, adianta boa parte da Fase D sem custo extra.
--
-- Limitação encontrada: `eventos.ator_id` é FK só para `operadores`, e o
-- CHECK de `ator_tipo` só aceita 'operador'|'bot'|'cliente'|'sistema'|'n8n'
-- — nenhuma ação de Separador/Entregador (que vivem em `funcionarios`, não
-- em `operadores`) pode ser registrada hoje. A extensão abaixo é aditiva
-- (nova coluna nullable + CHECK ampliado, nenhuma linha existente muda de
-- significado): adiciona `ator_funcionario_id` e o valor 'funcionario' ao
-- CHECK, mesmo espírito do par duplo já usado em `ocorrencias` acima.

alter table eventos add column if not exists ator_funcionario_id uuid references funcionarios (id) on delete set null;

alter table eventos drop constraint if exists eventos_ator_tipo_check;
alter table eventos add constraint eventos_ator_tipo_check
  check (ator_tipo = any (array['operador', 'funcionario', 'bot', 'cliente', 'sistema', 'n8n']));

-- H1. Trigger de solicitacoes_entrega. Ao contrário de pedidos/orçamentos
-- (que têm uma tabela de histórico à parte), aqui a própria linha muda de
-- status, então o padrão seguido é o de `consultas_operacionais` (INSERT =
-- criação, UPDATE de status = evento novo). Para 'cancelada' o ator pode
-- ser operador (delegante/admin) ou o próprio entregador — não dá para
-- inferir só pelas colunas, então resolve como as RPCs fazem
-- (eh_operador_ativo() primeiro). Para as outras transições, o ator é
-- sempre o entregador da linha (as RPCs já garantem isso via
-- funcionario_atual_id() = entregador_id).
create or replace function registrar_evento_entrega()
returns trigger as $$
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
$$ language plpgsql;

drop trigger if exists trg_eventos_entrega on solicitacoes_entrega;
create trigger trg_eventos_entrega
after insert or update on solicitacoes_entrega
for each row execute function registrar_evento_entrega();

-- H2. Trigger de ocorrencias — o ator já vem pronto nas próprias colunas
-- (criado_por_*/resolvido_por_*), sem precisar resolver de novo aqui.
create or replace function registrar_evento_ocorrencia()
returns trigger as $$
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
$$ language plpgsql;

drop trigger if exists trg_eventos_ocorrencia on ocorrencias;
create trigger trg_eventos_ocorrencia
after insert or update on ocorrencias
for each row execute function registrar_evento_ocorrencia();


-- =====================================================================
-- I. VERIFICAÇÃO (rodar depois de aplicar, antes de considerar Fase A OK)
-- =====================================================================
-- 1. `select proname, prosecdef from pg_proc where proname in
--     ('delegar_entrega','assumir_entrega','iniciar_rota','concluir_entrega',
--      'registrar_insucesso_entrega','cancelar_entrega','abrir_ocorrencia',
--      'resolver_ocorrencia');` — todas devem ter prosecdef = true.
-- 2. `select count(*) from pg_class c join pg_namespace n on
--     n.oid = c.relnamespace where n.nspname='public' and
--     c.relname in ('solicitacoes_entrega','ocorrencias') and
--     c.relrowsecurity = true;` — deve retornar 2.
-- 3. Teste de falsificação (mesmo espírito do B0/B1): logado como
--    Entregador A, chamar `concluir_entrega(<id de solicitação do
--    Entregador B>)` — deve falhar com "Esta entrega não está atribuída
--    a você", nunca silenciosamente suceder.
-- 4. Depois desta migração, atualizar `extensao_rls_completa.sql` (dump
--    de RLS de produção, Bloqueador B6) para incluir as policies novas —
--    senão o repositório volta a divergir do banco no mesmo dia em que
--    B6 foi fechado.
-- =====================================================================
