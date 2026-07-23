-- =====================================================================
-- VENÂNCIO AGENTES DE IA — Extensão do Dashboard/CRM (venancio-ai-ops)
-- =====================================================================
-- Roda depois de squemanovo.sql + extensao_cadastro_fiscal.sql, no mesmo
-- projeto Supabase do bot (fonte única de verdade a partir de agora — o
-- projeto Supabase separado que o dashboard usava antes foi apagado).
--
-- Idempotente: seguro rodar mais de uma vez (IF NOT EXISTS / ADD COLUMN IF
-- NOT EXISTS / CREATE OR REPLACE em tudo). Nada aqui apaga dado nem muda o
-- comportamento das funções que o JS Bot já chama em produção — onde uma
-- função central precisa de comportamento novo (ex.: atualizar_status_pedido),
-- é feito via CREATE OR REPLACE com a MESMA assinatura, só liberando uma
-- transição nova que o bot nunca usa.
-- =====================================================================

create extension if not exists pg_trgm; -- usado por buscar_produto_fuzzy()


-- =====================================================================
-- A. OPERADORES — time interno (base de tudo: quem fez o quê)
-- =====================================================================

create table if not exists operadores (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel text not null default 'operador' check (papel in ('admin', 'operador')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_operadores_atualizado_em on operadores;
create trigger trg_operadores_atualizado_em
before update on operadores
for each row execute function set_atualizado_em();


-- =====================================================================
-- B. CLIENTES — extensão CRM (não mexe nos campos fiscais já existentes)
-- =====================================================================

alter table clientes
  add column if not exists observacoes text,
  add column if not exists origem text not null default 'whatsapp'
    check (origem in ('whatsapp', 'manual')),
  add column if not exists status text not null default 'ativo'
    check (status in ('ativo', 'inativo', 'vip'));


-- =====================================================================
-- C. CONVERSAS — extensão CRM (Central de Atendimento)
-- =====================================================================
-- Reaproveita bot_ativo (pausa/retoma automática, já existe) como o "IA
-- ativa/pausada" do dashboard — não duplicar com uma coluna ia_ativa nova.
-- Reaproveita ultima_interacao_em (usada por reativacaoBot.js) como
-- timestamp da última mensagem — só falta o CONTEÚDO da prévia.

-- status é o ciclo de vida CRM da conversa (Central de Atendimento) — não
-- confundir com estado_atual, que é o estado da máquina de estados do menu
-- do bot (ex.: 'MENU_PRINCIPAL', 'LISTA_ESCOLAR_ESCOLA'). São conceitos
-- independentes: um cliente pode estar em qualquer status CRM enquanto
-- navega qualquer estado de menu.
alter table conversas
  add column if not exists status text not null default 'novo_lead'
    check (status in ('novo_lead','aguardando_operador','aguardando_cliente','aguardando_confirmacao','separando','aguardando_pagamento','finalizado','cancelado')),
  add column if not exists intencao text
    check (intencao in ('orcamento','pedido','lista_escolar','empresa','atacado','duvida','entrega','outro')),
  add column if not exists prioridade text not null default 'normal'
    check (prioridade in ('critica','alta','normal','baixa')),
  add column if not exists prioridade_score integer not null default 50,
  add column if not exists operador_id uuid references operadores (id) on delete set null,
  add column if not exists tags text[] not null default '{}',
  add column if not exists ultima_mensagem_preview text,
  add column if not exists canal text not null default 'whatsapp';

create index if not exists idx_conversas_operador on conversas (operador_id);
create index if not exists idx_conversas_prioridade on conversas (prioridade, prioridade_score desc);
create index if not exists idx_conversas_status on conversas (status);


-- =====================================================================
-- D. MENSAGENS — extensão CRM
-- =====================================================================

alter table mensagens
  add column if not exists tipo text not null default 'texto'
    check (tipo in ('texto','imagem','audio','documento')),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists lida boolean not null default false,
  add column if not exists operador_id uuid references operadores (id) on delete set null;

-- Aditivo: mantém o vocabulário que o bot já grava ('cliente'/'bot'/'humano'),
-- só acrescenta 'sistema' pra mensagens automáticas (ex.: "conversa transferida").
alter table mensagens drop constraint if exists mensagens_remetente_check;
alter table mensagens add constraint mensagens_remetente_check
  check (remetente in ('cliente', 'bot', 'humano', 'sistema'));

create index if not exists idx_mensagens_conversa_enviado on mensagens (conversa_id, enviado_em desc);

-- Prévia da última mensagem em conversas.ultima_mensagem_preview (não usa
-- ultima_interacao_em, que continua sendo escrita só por conversasService.js).
create or replace function set_preview_ultima_mensagem()
returns trigger as $$
begin
  update conversas
  set ultima_mensagem_preview = left(coalesce(new.conteudo, ''), 200)
  where id = new.conversa_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_mensagens_preview on mensagens;
create trigger trg_mensagens_preview
after insert on mensagens
for each row execute function set_preview_ultima_mensagem();


-- =====================================================================
-- E. PRODUTOS — extensão catálogo
-- =====================================================================

alter table produtos
  add column if not exists sku text unique,
  add column if not exists estoque integer not null default 0,
  add column if not exists imagem_url text,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_produtos_nome_trgm on produtos using gin (nome gin_trgm_ops);


-- =====================================================================
-- F. ITENS DE ORÇAMENTO/PEDIDO — nome_item (snapshot) + separado
-- =====================================================================
-- nome_item congela o nome do produto no momento da venda (não é live-join),
-- pra não mudar o histórico se o produto for renomeado depois.

alter table itens_orcamento add column if not exists nome_item text;
alter table itens_pedido    add column if not exists nome_item text;
alter table itens_pedido    add column if not exists separado boolean not null default false;

create or replace function preencher_nome_item()
returns trigger as $$
begin
  if new.nome_item is null then
    new.nome_item := coalesce(new.descricao_livre, (select nome from produtos where id = new.produto_id));
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_itens_orcamento_nome_item on itens_orcamento;
create trigger trg_itens_orcamento_nome_item
before insert on itens_orcamento
for each row execute function preencher_nome_item();

drop trigger if exists trg_itens_pedido_nome_item on itens_pedido;
create trigger trg_itens_pedido_nome_item
before insert on itens_pedido
for each row execute function preencher_nome_item();


-- =====================================================================
-- G. PEDIDOS — valor_total, logística, prioridade, operador
-- =====================================================================

alter table pedidos
  add column if not exists valor_total numeric(10,2) not null default 0,
  add column if not exists forma_entrega text
    check (forma_entrega in ('retirada','entrega_propria','uber_flash')),
  add column if not exists endereco_entrega text,
  add column if not exists operador_id uuid references operadores (id) on delete set null,
  add column if not exists prioridade text not null default 'normal'
    check (prioridade in ('critica','alta','normal','baixa')),
  add column if not exists pronto_para_retirada_em timestamptz,
  add column if not exists saiu_para_entrega_em timestamptz;

alter table pedidos_status_historico
  add column if not exists operador_id uuid references operadores (id) on delete set null,
  add column if not exists observacao text;
alter table orcamentos_status_historico
  add column if not exists operador_id uuid references operadores (id) on delete set null,
  add column if not exists observacao text;

create index if not exists idx_pedidos_forma_entrega on pedidos (forma_entrega, status);

-- Recalcula pedidos.valor_total a partir de itens_pedido (mesmo padrão do
-- gerado de itens_orcamento/itens_pedido.valor_total, mas agregado no pedido).
create or replace function recalcular_valor_pedido()
returns trigger as $$
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
$$ language plpgsql;

drop trigger if exists trg_itens_pedido_recalcular on itens_pedido;
create trigger trg_itens_pedido_recalcular
after insert or update or delete on itens_pedido
for each row execute function recalcular_valor_pedido();

-- Mesmo padrão pra orcamentos.valor_total (hoje preenchido manualmente por
-- quem cria o orçamento — passa a ser sempre a soma real dos itens).
create or replace function recalcular_valor_orcamento()
returns trigger as $$
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
$$ language plpgsql;

drop trigger if exists trg_itens_orcamento_recalcular on itens_orcamento;
create trigger trg_itens_orcamento_recalcular
after insert or update or delete on itens_orcamento
for each row execute function recalcular_valor_orcamento();

-- Extensão aditiva da guarda de transição: 'pronto' passa a liberar também
-- 'cancelado' (o dashboard precisa cancelar pedido pronto; o bot nunca chama
-- esta função com 'pronto' hoje, então não muda nada do comportamento dele).
create or replace function atualizar_status_pedido(
  p_pedido_id uuid,
  p_novo_status status_pedido,
  p_origem text
)
returns pedidos as $$
declare
  v_pedido pedidos;
  v_atual status_pedido;
  v_permitido boolean;
begin
  select * into v_pedido from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido % não encontrado', p_pedido_id;
  end if;

  v_atual := v_pedido.status;
  v_permitido := case v_atual
    when 'confirmado'    then p_novo_status in ('em_separacao', 'cancelado')
    when 'em_separacao'  then p_novo_status in ('pronto', 'cancelado')
    when 'pronto'        then p_novo_status in ('concluido', 'cancelado')
    else false
  end;

  if not v_permitido then
    raise exception 'Transição de pedido inválida: % -> %', v_atual, p_novo_status;
  end if;

  update pedidos set status = p_novo_status where id = p_pedido_id;
  insert into pedidos_status_historico (pedido_id, status_anterior, status_novo, origem)
  values (p_pedido_id, v_atual, p_novo_status, p_origem);

  select * into v_pedido from pedidos where id = p_pedido_id;
  return v_pedido;
end;
$$ language plpgsql;

-- Metadados de logística (não são transição de status — só registram
-- quando um pedido 'pronto' ficou pronto pra retirada ou saiu pra entrega).
create or replace function marcar_pronto_retirada_pedido(p_pedido_id uuid)
returns pedidos as $$
  update pedidos set pronto_para_retirada_em = now()
  where id = p_pedido_id and status = 'pronto' and forma_entrega = 'retirada'
  returning *;
$$ language sql;

create or replace function marcar_saiu_entrega_pedido(p_pedido_id uuid)
returns pedidos as $$
  update pedidos set saiu_para_entrega_em = now()
  where id = p_pedido_id and status = 'pronto' and forma_entrega in ('entrega_propria', 'uber_flash')
  returning *;
$$ language sql;


-- =====================================================================
-- H. FUNÇÕES WRAPPER — registram operador sem alterar as funções centrais
-- =====================================================================
-- As funções originais (atualizar_status_orcamento, aceitar_orcamento,
-- atualizar_status_pedido) continuam exatamente como o bot já chama.
-- O dashboard chama estas aqui, que só adicionam o rastro de operador_id.

create or replace function atualizar_status_pedido_dashboard(
  p_pedido_id uuid,
  p_novo_status status_pedido,
  p_operador_id uuid,
  p_observacao text default null
)
returns pedidos as $$
declare
  v_pedido pedidos;
begin
  v_pedido := atualizar_status_pedido(p_pedido_id, p_novo_status, 'dashboard:' || p_operador_id::text);

  update pedidos_status_historico set operador_id = p_operador_id, observacao = p_observacao
  where id = (
    select id from pedidos_status_historico
    where pedido_id = p_pedido_id
    order by criado_em desc limit 1
  );

  update pedidos set operador_id = p_operador_id where id = p_pedido_id;

  select * into v_pedido from pedidos where id = p_pedido_id;
  return v_pedido;
end;
$$ language plpgsql;

create or replace function atualizar_status_orcamento_dashboard(
  p_orcamento_id uuid,
  p_novo_status status_orcamento,
  p_operador_id uuid,
  p_observacao text default null
)
returns orcamentos as $$
declare
  v_orc orcamentos;
begin
  v_orc := atualizar_status_orcamento(p_orcamento_id, p_novo_status, 'dashboard:' || p_operador_id::text);

  update orcamentos_status_historico set operador_id = p_operador_id, observacao = p_observacao
  where id = (
    select id from orcamentos_status_historico
    where orcamento_id = p_orcamento_id
    order by criado_em desc limit 1
  );

  return v_orc;
end;
$$ language plpgsql;

create or replace function aceitar_orcamento_dashboard(
  p_orcamento_id uuid,
  p_operador_id uuid
)
returns pedidos as $$
declare
  v_pedido pedidos;
begin
  v_pedido := aceitar_orcamento(p_orcamento_id, 'dashboard:' || p_operador_id::text);

  update orcamentos_status_historico set operador_id = p_operador_id
  where id = (
    select id from orcamentos_status_historico
    where orcamento_id = p_orcamento_id
    order by criado_em desc limit 1
  );

  update pedidos_status_historico set operador_id = p_operador_id
  where id = (
    select id from pedidos_status_historico
    where pedido_id = v_pedido.id
    order by criado_em desc limit 1
  );

  update pedidos set operador_id = p_operador_id where id = v_pedido.id;

  select * into v_pedido from pedidos where id = v_pedido.id;
  return v_pedido;
end;
$$ language plpgsql;


-- =====================================================================
-- I. PRODUTOS_RELACIONADOS — estende a tabela já existente (não recriar)
-- =====================================================================

alter table produtos_relacionados drop constraint if exists produtos_relacionados_pkey;
alter table produtos_relacionados add column if not exists id uuid default gen_random_uuid();
update produtos_relacionados set id = gen_random_uuid() where id is null;
alter table produtos_relacionados alter column id set not null;
do $$ begin
  alter table produtos_relacionados add primary key (id);
exception when invalid_table_definition then null; end $$;

alter table produtos_relacionados alter column relacionado_id drop not null;
alter table produtos_relacionados
  add column if not exists relacionado_nome_livre text,
  add column if not exists tipo text not null default 'similar'
    check (tipo in ('similar','substituto','alternativa','complemento')),
  add column if not exists criado_por uuid references operadores (id) on delete set null,
  add column if not exists criado_em timestamptz not null default now();

alter table produtos_relacionados drop constraint if exists chk_relacionado_ou_livre;
alter table produtos_relacionados add constraint chk_relacionado_ou_livre
  check (relacionado_id is not null or relacionado_nome_livre is not null);

create unique index if not exists idx_produtos_relacionados_par
  on produtos_relacionados (produto_id, relacionado_id) where relacionado_id is not null;


-- =====================================================================
-- J. INTELIGÊNCIA — consultas operacionais, memória de produto, demanda
-- =====================================================================

create table if not exists consultas_operacionais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes (id) on delete set null,
  conversa_id uuid references conversas (id) on delete set null,
  produto_nome text,
  contexto text,
  tipo_duvida text not null default 'estoque' check (tipo_duvida in ('estoque','preco','disponibilidade','prazo','outro')),
  status text not null default 'pendente' check (status in ('pendente','atribuida','respondida','expirada')),
  prioridade text not null default 'normal' check (prioridade in ('critica','alta','normal','baixa')),
  atribuido_a uuid references operadores (id) on delete set null,
  resposta text,
  respondido_por uuid references operadores (id) on delete set null,
  expira_em timestamptz not null default (now() + interval '30 minutes'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_consultas_operacionais_status on consultas_operacionais (status, prioridade);

drop trigger if exists trg_consultas_operacionais_atualizado_em on consultas_operacionais;
create trigger trg_consultas_operacionais_atualizado_em
before update on consultas_operacionais
for each row execute function set_atualizado_em();

create table if not exists memoria_produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  produto_id uuid references produtos (id) on delete set null,
  ultimo_preco numeric(10,2),
  preco_medio numeric(10,2),
  disponibilidade text not null default 'desconhecido'
    check (disponibilidade in ('disponivel','indisponivel','sob_consulta','desconhecido')),
  confidence_score numeric(5,2) not null default 50.00,
  ultima_confirmacao timestamptz,
  confirmado_por uuid references operadores (id) on delete set null,
  observacoes text,
  aliases text[] not null default '{}',
  consultas_count integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_memoria_produtos_nome_trgm on memoria_produtos using gin (nome gin_trgm_ops);

drop trigger if exists trg_memoria_produtos_atualizado_em on memoria_produtos;
create trigger trg_memoria_produtos_atualizado_em
before update on memoria_produtos
for each row execute function set_atualizado_em();

create table if not exists confirmacoes_produto (
  id uuid primary key default gen_random_uuid(),
  memoria_produto_id uuid references memoria_produtos (id) on delete cascade,
  disponibilidade text not null,
  preco_confirmado numeric(10,2),
  operador_id uuid references operadores (id) on delete set null,
  observacao text,
  origem text not null default 'manual' check (origem in ('manual','whatsapp','sistema')),
  criado_em timestamptz not null default now()
);
create index if not exists idx_confirmacoes_produto_memoria on confirmacoes_produto (memoria_produto_id, criado_em desc);

create table if not exists consultas_demanda (
  id uuid primary key default gen_random_uuid(),
  produto_nome text not null,
  produto_id uuid references produtos (id) on delete set null,
  memoria_produto_id uuid references memoria_produtos (id) on delete set null,
  cliente_id uuid references clientes (id) on delete set null,
  conversa_id uuid references conversas (id) on delete set null,
  origem text not null default 'whatsapp' check (origem in ('whatsapp','dashboard','api','n8n')),
  resultado text not null default 'nao_encontrado'
    check (resultado in ('respondido_ia','consultou_operador','nao_encontrado','sem_estoque')),
  converteu boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists idx_consultas_demanda_produto_data on consultas_demanda (produto_nome, criado_em desc);

create table if not exists config_alerta_demanda (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  limite_consultas integer not null default 10,
  janela_horas integer not null default 24,
  canal_alerta text not null default 'dashboard' check (canal_alerta in ('dashboard','email','whatsapp','todos')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
insert into config_alerta_demanda (nome)
select 'global' where not exists (select 1 from config_alerta_demanda where nome = 'global');

drop trigger if exists trg_config_alerta_demanda_atualizado_em on config_alerta_demanda;
create trigger trg_config_alerta_demanda_atualizado_em
before update on config_alerta_demanda
for each row execute function set_atualizado_em();

create table if not exists alertas_demanda (
  id uuid primary key default gen_random_uuid(),
  produto_nome text not null,
  produto_id uuid references produtos (id) on delete set null,
  total_consultas integer not null default 0,
  sem_estoque boolean not null default false,
  status text not null default 'novo' check (status in ('novo','visto','resolvido')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_alertas_demanda_status on alertas_demanda (status, criado_em desc);

drop trigger if exists trg_alertas_demanda_atualizado_em on alertas_demanda;
create trigger trg_alertas_demanda_atualizado_em
before update on alertas_demanda
for each row execute function set_atualizado_em();


-- =====================================================================
-- K. TEMPLATES DE MENSAGEM E NOTIFICAÇÕES
-- =====================================================================
-- wf_config NÃO é criada: configuracoes (seção H de squemanovo.sql) já é
-- chave/valor por empresa e cobre o mesmo propósito.

create table if not exists templates_mensagem (
  id uuid primary key default gen_random_uuid(),
  status text not null unique,
  titulo text not null,
  mensagem text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_templates_mensagem_atualizado_em on templates_mensagem;
create trigger trg_templates_mensagem_atualizado_em
before update on templates_mensagem
for each row execute function set_atualizado_em();

insert into templates_mensagem (status, titulo, mensagem) values
  ('NOVO_PEDIDO', 'Pedido confirmado', 'Recebemos seu pedido {numero}! Já estamos preparando tudo. 🎉'),
  ('EM_SEPARACAO', 'Em separação', 'Seu pedido {numero} está sendo separado pela nossa equipe.'),
  ('SEPARADO', 'Separado', 'Seu pedido {numero} já foi separado e está pronto pra despacho.'),
  ('PRONTO_RETIRADA', 'Pronto para retirada', 'Seu pedido {numero} está pronto para retirada na loja! {entrega_info}'),
  ('SAIU_ENTREGA', 'Saiu para entrega', 'Seu pedido {numero} saiu para entrega. {entrega_info}'),
  ('FINALIZADO', 'Pedido finalizado', 'Seu pedido {numero} foi finalizado. Obrigado pela preferência!'),
  ('CANCELADO', 'Pedido cancelado', 'Seu pedido {numero} foi cancelado. Qualquer dúvida, é só chamar.')
on conflict (status) do nothing;

create table if not exists notificacoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references pedidos (id) on delete cascade,
  cliente_id uuid not null references clientes (id) on delete cascade,
  tipo text not null,
  canal text not null default 'whatsapp',
  mensagem text not null,
  enviado boolean not null default false,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (pedido_id, tipo, canal)
);
create index if not exists idx_notificacoes_pendentes on notificacoes (enviado) where enviado = false;


-- =====================================================================
-- L. EVENTOS — feed de atividade (consolida event_logs + logs_operacionais)
-- =====================================================================

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  tipo_evento text not null,
  entidade_tipo text,
  entidade_id uuid,
  ator_tipo text not null default 'sistema' check (ator_tipo in ('operador','bot','cliente','sistema','n8n')),
  ator_id uuid references operadores (id) on delete set null,
  descricao text,
  payload jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists idx_eventos_criado_em on eventos (criado_em desc);
create index if not exists idx_eventos_entidade on eventos (entidade_tipo, entidade_id);

-- Log automático de qualquer mudança de status de pedido/orçamento, seja
-- ela feita pelo bot (aceitar_orcamento em produção) ou pelo dashboard.
-- Dispara no INSERT do histórico (cobre os dois casos sem duplicar lógica
-- de negócio), MAS o operador só chega numa 2ª etapa: as funções wrapper
-- (seção H) inserem a linha via a função original (sempre com operador_id
-- nulo) e só DEPOIS fazem um UPDATE pontual pra gravar o operador. Por isso
-- o trigger também escuta UPDATE de operador_id — sem isso, toda mudança de
-- status feita pelo dashboard apareceria como "sistema" no feed de atividade.
create or replace function registrar_evento_pedido()
returns trigger as $$
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
$$ language plpgsql;

drop trigger if exists trg_eventos_pedido on pedidos_status_historico;
create trigger trg_eventos_pedido
after insert or update on pedidos_status_historico
for each row execute function registrar_evento_pedido();

create or replace function registrar_evento_orcamento()
returns trigger as $$
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
$$ language plpgsql;

drop trigger if exists trg_eventos_orcamento on orcamentos_status_historico;
create trigger trg_eventos_orcamento
after insert or update on orcamentos_status_historico
for each row execute function registrar_evento_orcamento();

create or replace function registrar_evento_consulta_operacional()
returns trigger as $$
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
$$ language plpgsql;

drop trigger if exists trg_eventos_consulta_operacional on consultas_operacionais;
create trigger trg_eventos_consulta_operacional
after insert or update on consultas_operacionais
for each row execute function registrar_evento_consulta_operacional();


-- =====================================================================
-- M. VIEW E RPCs — equivalentes aos usados pelo dashboard, contra o schema real
-- =====================================================================

create or replace view v_clientes_crm as
select
  c.*,
  count(p.id) as qtd_pedidos,
  count(p.id) filter (where p.status = 'concluido') as qtd_finalizados,
  count(p.id) filter (where p.status = 'cancelado') as qtd_cancelados,
  coalesce(sum(p.valor_total) filter (where p.status = 'concluido'), 0) as total_gasto,
  coalesce(avg(p.valor_total) filter (where p.status = 'concluido'), 0) as ticket_medio,
  max(p.criado_em) filter (where p.status = 'concluido') as ultima_compra_em,
  max(p.criado_em) as ultimo_pedido_em,
  count(o.id) as qtd_orcamentos,
  count(o.id) filter (where o.status = 'aceito') as qtd_orcamentos_aceitos
from clientes c
left join pedidos p on p.cliente_id = c.id
left join orcamentos o on o.cliente_id = c.id
group by c.id;

-- Mesmo shape que o dashboard já calculava client-side (metricasService.
-- _calcularClientSide, em venancio-ai-ops) — um único round-trip no lugar de
-- 5 queries em paralelo.
create or replace function get_metricas_comerciais()
returns jsonb as $$
  select jsonb_build_object(
    'pedidos_hoje', (select count(*) from pedidos where criado_em >= current_date),
    'pedidos_ontem', (
      select count(*) from pedidos
      where criado_em >= current_date - interval '1 day' and criado_em < current_date
    ),
    'pedidos_mes', (select count(*) from pedidos where criado_em >= date_trunc('month', now())),
    'fat_hoje', (
      select coalesce(sum(valor_total), 0) from pedidos
      where status = 'concluido' and criado_em >= current_date
    ),
    'fat_ontem', (
      select coalesce(sum(valor_total), 0) from pedidos
      where status = 'concluido' and criado_em >= current_date - interval '1 day' and criado_em < current_date
    ),
    'fat_mes', (
      select coalesce(sum(valor_total), 0) from pedidos
      where status = 'concluido' and criado_em >= date_trunc('month', now())
    ),
    'finalizados_hoje', (select count(*) from pedidos where status = 'concluido' and criado_em >= current_date),
    'cancelados_hoje', (select count(*) from pedidos where status = 'cancelado' and criado_em >= current_date),
    'clientes_ativos', (
      select count(distinct cliente_id) from pedidos where status = 'concluido'
    ),
    'ticket_medio', (
      select coalesce(avg(valor_total), 0) from pedidos
      where status = 'concluido' and criado_em >= date_trunc('month', now())
    ),
    'orcamentos_hoje', (select count(*) from orcamentos where criado_em >= date_trunc('month', now())),
    'conversao_rate', (
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where status = 'aceito') / count(*), 1)
      end
      from orcamentos where criado_em >= date_trunc('month', now())
    )
  );
$$ language sql stable;

create or replace function get_activity_feed(p_limit integer default 20)
returns table (
  id uuid, tipo_evento text, entidade_tipo text, entidade_id uuid,
  ator_tipo text, ator_id uuid, ator_nome text, descricao text,
  payload jsonb, criado_em timestamptz
) as $$
  select e.id, e.tipo_evento, e.entidade_tipo, e.entidade_id, e.ator_tipo, e.ator_id,
    o.nome as ator_nome, e.descricao, e.payload, e.criado_em
  from eventos e
  left join operadores o on o.id = e.ator_id
  order by e.criado_em desc
  limit p_limit;
$$ language sql stable;

create or replace function get_top_demanda(p_dias integer default 7, p_limit integer default 10)
returns table (produto_nome text, total_consultas bigint, sem_estoque_count bigint, converteu_count bigint) as $$
  select produto_nome, count(*) as total_consultas,
    count(*) filter (where resultado = 'sem_estoque') as sem_estoque_count,
    count(*) filter (where converteu) as converteu_count
  from consultas_demanda
  where criado_em >= now() - (p_dias || ' days')::interval
  group by produto_nome
  order by total_consultas desc
  limit p_limit;
$$ language sql stable;

create or replace function get_oportunidades_perdidas(p_dias integer default 7, p_limit integer default 10)
returns table (produto_nome text, total bigint, ultima_consulta timestamptz) as $$
  select produto_nome, count(*) as total, max(criado_em) as ultima_consulta
  from consultas_demanda
  where criado_em >= now() - (p_dias || ' days')::interval
    and resultado in ('nao_encontrado', 'sem_estoque')
  group by produto_nome
  order by total desc
  limit p_limit;
$$ language sql stable;

create or replace function verificar_alertas_demanda()
returns void as $$
declare
  v_config config_alerta_demanda;
  v_produto record;
begin
  select * into v_config from config_alerta_demanda where nome = 'global' and ativo;
  if not found then
    return;
  end if;

  for v_produto in
    select produto_nome, produto_id, count(*) as total,
      bool_or(resultado = 'sem_estoque') as sem_estoque
    from consultas_demanda
    where criado_em >= now() - (v_config.janela_horas || ' hours')::interval
    group by produto_nome, produto_id
    having count(*) >= v_config.limite_consultas
  loop
    insert into alertas_demanda (produto_nome, produto_id, total_consultas, sem_estoque)
    values (v_produto.produto_nome, v_produto.produto_id, v_produto.total, v_produto.sem_estoque)
    on conflict do nothing;
  end loop;
end;
$$ language plpgsql;

create or replace function buscar_produto_fuzzy(p_nome text, p_limit integer default 5)
returns table (id uuid, nome text, preco numeric, estoque integer, similaridade real) as $$
  select p.id, p.nome, p.preco, p.estoque, similarity(p.nome, p_nome) as similaridade
  from produtos p
  where p.ativo and (p.nome % p_nome or exists (
    select 1 from unnest(p.aliases) a where a % p_nome
  ))
  order by similaridade desc
  limit p_limit;
$$ language sql stable;

create or replace function registrar_demanda_produto(
  p_produto_nome text,
  p_produto_id uuid,
  p_cliente_id uuid,
  p_conversa_id uuid,
  p_origem text,
  p_resultado text
)
returns consultas_demanda as $$
declare
  v_memoria memoria_produtos;
  v_consulta consultas_demanda;
begin
  select * into v_memoria from memoria_produtos where lower(nome) = lower(p_produto_nome) limit 1;
  if not found then
    insert into memoria_produtos (nome, produto_id, consultas_count)
    values (p_produto_nome, p_produto_id, 1)
    returning * into v_memoria;
  else
    update memoria_produtos set consultas_count = consultas_count + 1
    where id = v_memoria.id
    returning * into v_memoria;
  end if;

  insert into consultas_demanda (
    produto_nome, produto_id, memoria_produto_id, cliente_id, conversa_id, origem, resultado,
    converteu
  ) values (
    p_produto_nome, p_produto_id, v_memoria.id, p_cliente_id, p_conversa_id, p_origem, p_resultado,
    p_resultado = 'respondido_ia'
  ) returning * into v_consulta;

  return v_consulta;
end;
$$ language plpgsql;

create or replace function aprender_de_resposta_operador(
  p_memoria_produto_id uuid,
  p_disponibilidade text,
  p_preco numeric,
  p_operador_id uuid,
  p_observacao text,
  p_origem text default 'manual'
)
returns memoria_produtos as $$
declare
  v_memoria memoria_produtos;
begin
  insert into confirmacoes_produto (memoria_produto_id, disponibilidade, preco_confirmado, operador_id, observacao, origem)
  values (p_memoria_produto_id, p_disponibilidade, p_preco, p_operador_id, p_observacao, p_origem);

  update memoria_produtos set
    disponibilidade = p_disponibilidade,
    ultimo_preco = coalesce(p_preco, ultimo_preco),
    preco_medio = case when p_preco is not null then coalesce((preco_medio + p_preco) / 2, p_preco) else preco_medio end,
    ultima_confirmacao = now(),
    confirmado_por = p_operador_id,
    confidence_score = least(100, confidence_score + 10)
  where id = p_memoria_produto_id
  returning * into v_memoria;

  return v_memoria;
end;
$$ language plpgsql;

create or replace function expirar_consultas_operacionais()
returns void as $$
  update consultas_operacionais
  set status = 'expirada'
  where status in ('pendente', 'atribuida') and expira_em < now();
$$ language sql;


-- =====================================================================
-- N. SEGURANÇA (RLS) — troca "aberto pra anon" por papel via auth.uid()
-- =====================================================================
-- A policy "service_role_full_access" de cada tabela (criada em
-- squemanovo.sql, seção O) fica intocada — o bot continua bypassando RLS
-- via SUPABASE_SERVICE_KEY normalmente. As policies abaixo só adicionam
-- acesso pra usuários autenticados (operadores) via Supabase Auth.

create or replace function eh_operador_ativo()
returns boolean as $$
  select exists (select 1 from operadores where id = auth.uid() and ativo);
$$ language sql stable security definer;

create or replace function eh_admin()
returns boolean as $$
  select coalesce((select papel = 'admin' from operadores where id = auth.uid() and ativo), false);
$$ language sql stable security definer;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes','conversas','mensagens','orcamentos','itens_orcamento',
    'pedidos','itens_pedido','produtos','categorias','produtos_relacionados',
    'configuracoes',
    'consultas_operacionais','memoria_produtos','confirmacoes_produto',
    'consultas_demanda','config_alerta_demanda','alertas_demanda',
    'templates_mensagem','notificacoes','eventos'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "operadores_leitura" on %I', t);
    execute format('create policy "operadores_leitura" on %I for select using (eh_operador_ativo())', t);

    execute format('drop policy if exists "operadores_escrita" on %I', t);
    execute format('create policy "operadores_escrita" on %I for insert with check (eh_operador_ativo())', t);

    execute format('drop policy if exists "operadores_atualizacao" on %I', t);
    execute format('create policy "operadores_atualizacao" on %I for update using (eh_operador_ativo())', t);

    execute format('drop policy if exists "admin_exclusao" on %I', t);
    execute format('create policy "admin_exclusao" on %I for delete using (eh_admin())', t);

    -- Garante que o bot (service_role) continua com acesso total, mesmo
    -- em tabelas novas desta migração que squemanovo.sql não conhecia.
    execute format('drop policy if exists "service_role_full_access" on %I', t);
    execute format(
      'create policy "service_role_full_access" on %I for all using (auth.role() = ''service_role'')', t
    );
  end loop;
end $$;

-- operadores: cada um lê/edita a própria linha; admin lê/edita todas.
alter table operadores enable row level security;
drop policy if exists "operadores_leem_a_si_mesmos" on operadores;
create policy "operadores_leem_a_si_mesmos" on operadores for select
  using (auth.uid() = id or eh_admin());
drop policy if exists "admin_gerencia_operadores" on operadores;
create policy "admin_gerencia_operadores" on operadores for all
  using (eh_admin()) with check (eh_admin());
drop policy if exists "service_role_full_access" on operadores;
create policy "service_role_full_access" on operadores for all
  using (auth.role() = 'service_role');
