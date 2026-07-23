-- =====================================================================
-- VENÂNCIO AGENTES DE IA — Schema final consolidado
-- =====================================================================
-- Este arquivo SUBSTITUI schema_venancio.sql, migracao_funil_pedidos.sql
-- e migracao_estado_atendimento.sql — pode ignorar/apagar os três.
--
-- Idempotente: seguro rodar mais de uma vez (usa IF NOT EXISTS em tudo
-- que dá, e ALTER ... ADD COLUMN IF NOT EXISTS pro resto).
--
-- Reaproveita, sem alterar, a base já testada do JS Bot:
--   conversas, escolas, materiais_lista_escolar, mensagens
-- Estende clientes (empresa_id, tipo_pessoa, cnpj, razao_social, endereco).
-- Adiciona: empresa, configuracoes, catálogo de produtos, orçamentos e
-- pedidos como entidades separadas, followups, memórias.
-- =====================================================================

create extension if not exists pgcrypto;


-- =====================================================================
-- A. TIPOS (ENUMS)
-- =====================================================================

do $$ begin
  create type tipo_pessoa as enum ('PF', 'PJ');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_pedido as enum ('lista_escolar', 'cotacao_empresa', 'venda_geral');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_orcamento as enum ('rascunho', 'enviado', 'aceito', 'recusado', 'expirado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_pedido as enum ('confirmado', 'em_separacao', 'pronto', 'concluido', 'cancelado');
exception when duplicate_object then null; end $$;


-- =====================================================================
-- B. FUNÇÃO AUXILIAR — atualizado_em automático (usada em várias tabelas)
-- =====================================================================

create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;


-- =====================================================================
-- C. EMPRESA — âncora multi-tenant (hoje só a Venâncio, pronta pra crescer)
-- =====================================================================

create table if not exists empresa (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

insert into empresa (nome)
select 'Papelaria Venâncio'
where not exists (select 1 from empresa);


-- =====================================================================
-- D. CLIENTES — reaproveitada, estendida com dados fiscais e empresa_id
-- =====================================================================

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- empresa_id: adiciona nulo, preenche com a empresa padrão, só então trava NOT NULL
-- (seguro mesmo se a tabela já tiver linhas de produção)
alter table clientes add column if not exists empresa_id uuid references empresa (id);
update clientes set empresa_id = (select id from empresa limit 1) where empresa_id is null;
alter table clientes alter column empresa_id set not null;

alter table clientes
  add column if not exists tipo_pessoa tipo_pessoa not null default 'PF',
  add column if not exists razao_social text,
  add column if not exists cnpj text,
  add column if not exists endereco text;

alter table clientes drop constraint if exists chk_dados_pj_apenas_pj;
alter table clientes add constraint chk_dados_pj_apenas_pj check (
  tipo_pessoa = 'PJ' or (cnpj is null and razao_social is null)
);

-- telefone único por empresa (não mais globalmente único — prepara multiempresa)
alter table clientes drop constraint if exists clientes_telefone_key;
create unique index if not exists idx_clientes_empresa_telefone on clientes (empresa_id, telefone);
create index if not exists idx_clientes_telefone on clientes (telefone);

drop trigger if exists trg_clientes_atualizado_em on clientes;
create trigger trg_clientes_atualizado_em
before update on clientes
for each row execute function set_atualizado_em();


-- =====================================================================
-- E. CONVERSAS — reaproveitada sem nenhuma alteração
-- =====================================================================

create table if not exists conversas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  estado_atual text not null default 'MENU_PRINCIPAL',
  dados jsonb not null default '{}'::jsonb,
  bot_ativo boolean not null default true,
  ultima_interacao_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  ultima_mensagem_id text
);

create unique index if not exists conversas_cliente_id_key on conversas (cliente_id);
alter table conversas add column if not exists ultima_mensagem_id text;


-- =====================================================================
-- F. ESCOLAS + MATERIAIS — reaproveitadas sem nenhuma alteração
-- =====================================================================

create table if not exists escolas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativa boolean not null default true
);

create table if not exists materiais_lista_escolar (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid not null references escolas (id) on delete cascade,
  ano text not null,
  pdf_url text,
  atualizado_em timestamptz not null default now(),
  unique (escola_id, ano)
);
-- "orçamento pronto" = existe linha aqui com pdf_url preenchido pro (escola, ano) escolhido


-- =====================================================================
-- G. MENSAGENS — reaproveitada, com remetente já incluindo 'humano'
-- =====================================================================

create table if not exists mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas (id) on delete cascade,
  remetente text not null check (remetente in ('cliente', 'bot', 'humano')),
  conteudo text,
  enviado_em timestamptz not null default now()
);


-- =====================================================================
-- H. CONFIGURAÇÕES — chave/valor por empresa (substitui empresa_config)
-- =====================================================================
-- Cobre tanto config operacional (TTL de bloqueio, segundos de debounce)
-- quanto conteúdo institucional (horários, endereços) que o agente de
-- FAQ consulta.

create table if not exists configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa (id),
  chave text not null,
  valor jsonb not null,
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, chave)
);

drop trigger if exists trg_configuracoes_atualizado_em on configuracoes;
create trigger trg_configuracoes_atualizado_em
before update on configuracoes
for each row execute function set_atualizado_em();


-- =====================================================================
-- I. CATÁLOGO — categorias, produtos, produtos relacionados
-- =====================================================================

create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique
);

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references categorias (id),
  nome text not null,
  descricao text,
  preco numeric(10, 2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_produtos_categoria on produtos (categoria_id);

drop trigger if exists trg_produtos_atualizado_em on produtos;
create trigger trg_produtos_atualizado_em
before update on produtos
for each row execute function set_atualizado_em();

create table if not exists produtos_relacionados (
  produto_id uuid not null references produtos (id) on delete cascade,
  relacionado_id uuid not null references produtos (id) on delete cascade,
  primary key (produto_id, relacionado_id),
  constraint chk_nao_relaciona_consigo check (produto_id <> relacionado_id)
);


-- =====================================================================
-- J. PROTOCOLO — gerador compartilhado entre orçamentos e pedidos
-- =====================================================================

create sequence if not exists protocolo_seq;

create or replace function gerar_protocolo(prefixo text default 'VEN')
returns text as $$
begin
  return prefixo || '-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('protocolo_seq')::text, 4, '0');
end;
$$ language plpgsql;


-- =====================================================================
-- K. ORÇAMENTOS — ciclo de vida independente do pedido
-- =====================================================================

create table if not exists orcamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete restrict,
  conversa_id uuid references conversas (id),
  protocolo text not null unique default gerar_protocolo('ORC'),
  tipo tipo_pedido not null,
  escola_id uuid references escolas (id),
  status status_orcamento not null default 'rascunho',
  valor_total numeric(10, 2),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint chk_escola_apenas_lista_escolar check (
    tipo = 'lista_escolar' or escola_id is null
  )
);

create index if not exists idx_orcamentos_cliente on orcamentos (cliente_id);
create index if not exists idx_orcamentos_abertos on orcamentos (cliente_id)
where status in ('rascunho', 'enviado');

drop trigger if exists trg_orcamentos_atualizado_em on orcamentos;
create trigger trg_orcamentos_atualizado_em
before update on orcamentos
for each row execute function set_atualizado_em();

create table if not exists itens_orcamento (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references orcamentos (id) on delete cascade,
  produto_id uuid references produtos (id),
  descricao_livre text,
  quantidade numeric not null default 1,
  valor_unitario numeric(10, 2),
  valor_total numeric(10, 2) generated always as (quantidade * valor_unitario) stored,

  constraint chk_produto_ou_descricao check (
    produto_id is not null or descricao_livre is not null
  )
);

create index if not exists idx_itens_orcamento_orcamento on itens_orcamento (orcamento_id);


create table if not exists orcamentos_status_historico (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references orcamentos (id) on delete cascade,
  status_anterior status_orcamento,
  status_novo status_orcamento not null,
  origem text not null,
  criado_em timestamptz not null default now()
);


-- =====================================================================
-- L. PEDIDOS — nasce sempre de um orçamento aceito
-- =====================================================================

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete restrict,
  orcamento_id uuid not null references orcamentos (id),
  conversa_id uuid references conversas (id),
  protocolo text not null unique default gerar_protocolo('PED'),
  status status_pedido not null default 'confirmado',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_pedidos_cliente on pedidos (cliente_id);
create index if not exists idx_pedidos_ativos on pedidos (cliente_id)
where status not in ('concluido', 'cancelado');

drop trigger if exists trg_pedidos_atualizado_em on pedidos;
create trigger trg_pedidos_atualizado_em
before update on pedidos
for each row execute function set_atualizado_em();

create table if not exists itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos (id) on delete cascade,
  produto_id uuid references produtos (id),
  descricao_livre text,
  quantidade numeric not null default 1,
  valor_unitario numeric(10, 2),
  valor_total numeric(10, 2) generated always as (quantidade * valor_unitario) stored
);

create index if not exists idx_itens_pedido_pedido on itens_pedido (pedido_id);


create table if not exists pedidos_status_historico (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos (id) on delete cascade,
  status_anterior status_pedido,
  status_novo status_pedido not null,
  origem text not null,
  criado_em timestamptz not null default now()
);


-- =====================================================================
-- M. FUNÇÕES CENTRAIS — únicas portas de escrita de status
-- =====================================================================

create or replace function atualizar_status_orcamento(
  p_orcamento_id uuid,
  p_novo_status status_orcamento,
  p_origem text
)
returns orcamentos as $$
declare
  v_orc orcamentos;
  v_atual status_orcamento;
  v_permitido boolean;
begin
  select * into v_orc from orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento % não encontrado', p_orcamento_id;
  end if;

  v_atual := v_orc.status;
  v_permitido := case v_atual
    when 'rascunho' then p_novo_status in ('enviado', 'recusado')
    when 'enviado'  then p_novo_status in ('aceito', 'recusado', 'expirado')
    else false
  end;

  if not v_permitido then
    raise exception 'Transição de orçamento inválida: % -> %', v_atual, p_novo_status;
  end if;

  update orcamentos set status = p_novo_status where id = p_orcamento_id;
  insert into orcamentos_status_historico (orcamento_id, status_anterior, status_novo, origem)
  values (p_orcamento_id, v_atual, p_novo_status, p_origem);

  select * into v_orc from orcamentos where id = p_orcamento_id;
  return v_orc;
end;
$$ language plpgsql;


-- Aceitar um orçamento é uma transição especial: gera o pedido e copia os itens.
create or replace function aceitar_orcamento(
  p_orcamento_id uuid,
  p_origem text
)
returns pedidos as $$
declare
  v_pedido pedidos;
begin
  perform atualizar_status_orcamento(p_orcamento_id, 'aceito', p_origem);

  insert into pedidos (cliente_id, orcamento_id, conversa_id)
  select cliente_id, id, conversa_id from orcamentos where id = p_orcamento_id
  returning * into v_pedido;

  insert into itens_pedido (pedido_id, produto_id, descricao_livre, quantidade, valor_unitario)
  select v_pedido.id, produto_id, descricao_livre, quantidade, valor_unitario
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  insert into pedidos_status_historico (pedido_id, status_anterior, status_novo, origem)
  values (v_pedido.id, null, 'confirmado', p_origem);

  return v_pedido;
end;
$$ language plpgsql;


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
    when 'pronto'        then p_novo_status in ('concluido')
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


-- Funções auxiliares de consulta (não travam nada — a regra de "1 ativo
-- por cliente" continua vivendo na aplicação, como decidimos)

create or replace function orcamento_ativo_cliente(p_cliente_id uuid)
returns orcamentos as $$
  select * from orcamentos
  where cliente_id = p_cliente_id and status in ('rascunho', 'enviado')
  order by criado_em desc limit 1;
$$ language sql stable;

create or replace function pedido_ativo_cliente(p_cliente_id uuid)
returns pedidos as $$
  select * from pedidos
  where cliente_id = p_cliente_id and status not in ('concluido', 'cancelado')
  order by criado_em desc limit 1;
$$ language sql stable;


-- =====================================================================
-- N. ACOMPANHAMENTO — followups e memórias de longo prazo
-- =====================================================================

create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  orcamento_id uuid references orcamentos (id),
  motivo text not null,
  agendado_para timestamptz not null,
  concluido boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists idx_followups_pendentes on followups (agendado_para)
where concluido = false;

create table if not exists memorias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  chave text not null,
  valor text not null,
  criado_em timestamptz not null default now(),
  unique (cliente_id, chave)
);


-- =====================================================================
-- O. SEGURANÇA (Row Level Security) — só service_role acessa
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'empresa','clientes','conversas','escolas','materiais_lista_escolar',
    'mensagens','configuracoes','categorias','produtos','produtos_relacionados',
    'orcamentos','itens_orcamento','orcamentos_status_historico',
    'pedidos','itens_pedido','pedidos_status_historico',
    'followups','memorias'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'drop policy if exists "service_role_full_access" on %I', t
    );
    execute format(
      'create policy "service_role_full_access" on %I for all using (auth.role() = ''service_role'')', t
    );
  end loop;
end $$;


-- =====================================================================
-- P. SEED — escolas de teste (idempotente, igual ao arquivo original)
-- =====================================================================

insert into escolas (nome, ativa)
select nome, true
from (values ('CEC'), ('Múltipla'), ('Linus Pauling'), ('Mundo Livre')) as escolas_teste(nome)
where not exists (
  select 1 from escolas e where e.nome = escolas_teste.nome
);