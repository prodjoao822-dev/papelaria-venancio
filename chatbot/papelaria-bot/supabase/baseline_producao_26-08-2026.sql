-- =====================================================================
-- VENÂNCIO — BASELINE do schema `public` (gerado do banco de produção)
-- =====================================================================
-- Gerado automaticamente em 2026-08-26T02:21:11.268Z a partir do
-- catálogo do Postgres de produção (pg_catalog / information_schema).
-- Leia o cabeçalho de supabase/README.md antes de usar.
--
-- POR QUE ESTE ARQUIVO EXISTE (Bloqueador B6, 15/08/2026, reconfirmado
-- na auditoria de 25/08): o repositório NÃO era fonte de verdade do
-- banco. O controle de migração do Supabase só começa em 20/08/2026
-- (11 migrações) e os arquivos `extensao_*.sql` cobrem só parte do que
-- existe em produção — 137 policies no banco contra ~34 versionadas.
-- Este baseline captura o estado REAL em 26/08/2026 para que dê para
-- recriar a produção do zero a partir do repositório.
--
-- ESCOPO: só o schema `public`. NÃO inclui: schemas `auth`/`storage`/
-- `realtime`/`vault` (gerenciados pelo Supabase), dados (ver seed_*.sql),
-- roles, nem objetos de extensão (criados pelo CREATE EXTENSION).
-- =====================================================================

set check_function_bodies = off;

-- =====================================================================
-- 1. EXTENSÕES
-- =====================================================================

create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "pg_trgm" with schema public;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "supabase_vault" with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "vector" with schema public;

-- =====================================================================
-- 2. TIPOS (ENUMS)
-- =====================================================================

do $$ begin
  create type status_orcamento as enum ('rascunho', 'enviado', 'aceito', 'recusado', 'expirado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_pedido as enum ('confirmado', 'em_separacao', 'pronto', 'concluido', 'cancelado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type tipo_pedido as enum ('lista_escolar', 'cotacao_empresa', 'venda_geral');
exception when duplicate_object then null; end $$;
do $$ begin
  create type tipo_pessoa as enum ('PF', 'PJ');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 3. TABELAS (colunas, defaults, NOT NULL, identidade)
-- =====================================================================

create table if not exists alertas_demanda (
  id uuid default gen_random_uuid() not null,
  produto_nome text not null,
  produto_id uuid,
  total_consultas integer default 0 not null,
  sem_estoque boolean default false not null,
  status text default 'novo'::text not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
alter table alertas_demanda add column if not exists id uuid default gen_random_uuid();
alter table alertas_demanda add column if not exists produto_nome text;
alter table alertas_demanda add column if not exists produto_id uuid;
alter table alertas_demanda add column if not exists total_consultas integer default 0;
alter table alertas_demanda add column if not exists sem_estoque boolean default false;
alter table alertas_demanda add column if not exists status text default 'novo'::text;
alter table alertas_demanda add column if not exists criado_em timestamp with time zone default now();
alter table alertas_demanda add column if not exists atualizado_em timestamp with time zone default now();

create table if not exists categorias (
  id uuid default gen_random_uuid() not null,
  nome text not null
);
alter table categorias add column if not exists id uuid default gen_random_uuid();
alter table categorias add column if not exists nome text;

create table if not exists clientes (
  id uuid default gen_random_uuid() not null,
  telefone text not null,
  nome text,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  empresa_id uuid default empresa_id_padrao() not null,
  tipo_pessoa tipo_pessoa default 'PF'::tipo_pessoa not null,
  razao_social text,
  cnpj text,
  endereco text,
  tem_cadastro_previo boolean default false not null,
  cpf text,
  nome_fantasia text,
  indicador_ie text,
  inscricao_estadual text,
  cep text,
  cidade text,
  estado text,
  telefone_contato text,
  observacoes text,
  origem text default 'whatsapp'::text not null,
  status text default 'ativo'::text not null
);
alter table clientes add column if not exists id uuid default gen_random_uuid();
alter table clientes add column if not exists telefone text;
alter table clientes add column if not exists nome text;
alter table clientes add column if not exists criado_em timestamp with time zone default now();
alter table clientes add column if not exists atualizado_em timestamp with time zone default now();
alter table clientes add column if not exists empresa_id uuid default empresa_id_padrao();
alter table clientes add column if not exists tipo_pessoa tipo_pessoa default 'PF'::tipo_pessoa;
alter table clientes add column if not exists razao_social text;
alter table clientes add column if not exists cnpj text;
alter table clientes add column if not exists endereco text;
alter table clientes add column if not exists tem_cadastro_previo boolean default false;
alter table clientes add column if not exists cpf text;
alter table clientes add column if not exists nome_fantasia text;
alter table clientes add column if not exists indicador_ie text;
alter table clientes add column if not exists inscricao_estadual text;
alter table clientes add column if not exists cep text;
alter table clientes add column if not exists cidade text;
alter table clientes add column if not exists estado text;
alter table clientes add column if not exists telefone_contato text;
alter table clientes add column if not exists observacoes text;
alter table clientes add column if not exists origem text default 'whatsapp'::text;
alter table clientes add column if not exists status text default 'ativo'::text;

create table if not exists config_alerta_demanda (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  limite_consultas integer default 10 not null,
  janela_horas integer default 24 not null,
  canal_alerta text default 'dashboard'::text not null,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
alter table config_alerta_demanda add column if not exists id uuid default gen_random_uuid();
alter table config_alerta_demanda add column if not exists nome text;
alter table config_alerta_demanda add column if not exists limite_consultas integer default 10;
alter table config_alerta_demanda add column if not exists janela_horas integer default 24;
alter table config_alerta_demanda add column if not exists canal_alerta text default 'dashboard'::text;
alter table config_alerta_demanda add column if not exists ativo boolean default true;
alter table config_alerta_demanda add column if not exists criado_em timestamp with time zone default now();
alter table config_alerta_demanda add column if not exists atualizado_em timestamp with time zone default now();

create table if not exists configuracoes (
  id uuid default gen_random_uuid() not null,
  empresa_id uuid not null,
  chave text not null,
  valor jsonb not null,
  atualizado_em timestamp with time zone default now() not null
);
alter table configuracoes add column if not exists id uuid default gen_random_uuid();
alter table configuracoes add column if not exists empresa_id uuid;
alter table configuracoes add column if not exists chave text;
alter table configuracoes add column if not exists valor jsonb;
alter table configuracoes add column if not exists atualizado_em timestamp with time zone default now();

create table if not exists confirmacoes_produto (
  id uuid default gen_random_uuid() not null,
  memoria_produto_id uuid,
  disponibilidade text not null,
  preco_confirmado numeric(10,2),
  operador_id uuid,
  observacao text,
  origem text default 'manual'::text not null,
  criado_em timestamp with time zone default now() not null
);
alter table confirmacoes_produto add column if not exists id uuid default gen_random_uuid();
alter table confirmacoes_produto add column if not exists memoria_produto_id uuid;
alter table confirmacoes_produto add column if not exists disponibilidade text;
alter table confirmacoes_produto add column if not exists preco_confirmado numeric(10,2);
alter table confirmacoes_produto add column if not exists operador_id uuid;
alter table confirmacoes_produto add column if not exists observacao text;
alter table confirmacoes_produto add column if not exists origem text default 'manual'::text;
alter table confirmacoes_produto add column if not exists criado_em timestamp with time zone default now();

create table if not exists consultas_demanda (
  id uuid default gen_random_uuid() not null,
  produto_nome text not null,
  produto_id uuid,
  memoria_produto_id uuid,
  cliente_id uuid,
  conversa_id uuid,
  origem text default 'whatsapp'::text not null,
  resultado text default 'nao_encontrado'::text not null,
  converteu boolean default false not null,
  criado_em timestamp with time zone default now() not null
);
alter table consultas_demanda add column if not exists id uuid default gen_random_uuid();
alter table consultas_demanda add column if not exists produto_nome text;
alter table consultas_demanda add column if not exists produto_id uuid;
alter table consultas_demanda add column if not exists memoria_produto_id uuid;
alter table consultas_demanda add column if not exists cliente_id uuid;
alter table consultas_demanda add column if not exists conversa_id uuid;
alter table consultas_demanda add column if not exists origem text default 'whatsapp'::text;
alter table consultas_demanda add column if not exists resultado text default 'nao_encontrado'::text;
alter table consultas_demanda add column if not exists converteu boolean default false;
alter table consultas_demanda add column if not exists criado_em timestamp with time zone default now();

create table if not exists consultas_operacionais (
  id uuid default gen_random_uuid() not null,
  cliente_id uuid,
  conversa_id uuid,
  produto_nome text,
  contexto text,
  tipo_duvida text default 'estoque'::text not null,
  status text default 'pendente'::text not null,
  prioridade text default 'normal'::text not null,
  atribuido_a uuid,
  resposta text,
  respondido_por uuid,
  expira_em timestamp with time zone default (now() + '00:30:00'::interval) not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
alter table consultas_operacionais add column if not exists id uuid default gen_random_uuid();
alter table consultas_operacionais add column if not exists cliente_id uuid;
alter table consultas_operacionais add column if not exists conversa_id uuid;
alter table consultas_operacionais add column if not exists produto_nome text;
alter table consultas_operacionais add column if not exists contexto text;
alter table consultas_operacionais add column if not exists tipo_duvida text default 'estoque'::text;
alter table consultas_operacionais add column if not exists status text default 'pendente'::text;
alter table consultas_operacionais add column if not exists prioridade text default 'normal'::text;
alter table consultas_operacionais add column if not exists atribuido_a uuid;
alter table consultas_operacionais add column if not exists resposta text;
alter table consultas_operacionais add column if not exists respondido_por uuid;
alter table consultas_operacionais add column if not exists expira_em timestamp with time zone default (now() + '00:30:00'::interval);
alter table consultas_operacionais add column if not exists criado_em timestamp with time zone default now();
alter table consultas_operacionais add column if not exists atualizado_em timestamp with time zone default now();

create table if not exists conversas (
  id uuid default gen_random_uuid() not null,
  cliente_id uuid not null,
  estado_atual text default 'MENU_PRINCIPAL'::text not null,
  dados jsonb default '{}'::jsonb not null,
  bot_ativo boolean default true not null,
  ultima_interacao_em timestamp with time zone default now() not null,
  criado_em timestamp with time zone default now() not null,
  ultima_mensagem_id text,
  status text default 'novo_lead'::text not null,
  intencao text,
  prioridade text default 'normal'::text not null,
  prioridade_score integer default 50 not null,
  operador_id uuid,
  tags text[] default '{}'::text[] not null,
  ultima_mensagem_preview text,
  canal text default 'whatsapp'::text not null,
  pausado_pos_pedido boolean default false not null
);
alter table conversas add column if not exists id uuid default gen_random_uuid();
alter table conversas add column if not exists cliente_id uuid;
alter table conversas add column if not exists estado_atual text default 'MENU_PRINCIPAL'::text;
alter table conversas add column if not exists dados jsonb default '{}'::jsonb;
alter table conversas add column if not exists bot_ativo boolean default true;
alter table conversas add column if not exists ultima_interacao_em timestamp with time zone default now();
alter table conversas add column if not exists criado_em timestamp with time zone default now();
alter table conversas add column if not exists ultima_mensagem_id text;
alter table conversas add column if not exists status text default 'novo_lead'::text;
alter table conversas add column if not exists intencao text;
alter table conversas add column if not exists prioridade text default 'normal'::text;
alter table conversas add column if not exists prioridade_score integer default 50;
alter table conversas add column if not exists operador_id uuid;
alter table conversas add column if not exists tags text[] default '{}'::text[];
alter table conversas add column if not exists ultima_mensagem_preview text;
alter table conversas add column if not exists canal text default 'whatsapp'::text;
alter table conversas add column if not exists pausado_pos_pedido boolean default false;

create table if not exists empresa (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  criado_em timestamp with time zone default now() not null
);
alter table empresa add column if not exists id uuid default gen_random_uuid();
alter table empresa add column if not exists nome text;
alter table empresa add column if not exists criado_em timestamp with time zone default now();

create table if not exists escolas (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  ativa boolean default true not null
);
alter table escolas add column if not exists id uuid default gen_random_uuid();
alter table escolas add column if not exists nome text;
alter table escolas add column if not exists ativa boolean default true;

create table if not exists eventos (
  id uuid default gen_random_uuid() not null,
  tipo_evento text not null,
  entidade_tipo text,
  entidade_id uuid,
  ator_tipo text default 'sistema'::text not null,
  ator_id uuid,
  descricao text,
  payload jsonb default '{}'::jsonb not null,
  criado_em timestamp with time zone default now() not null,
  ator_funcionario_id uuid
);
alter table eventos add column if not exists id uuid default gen_random_uuid();
alter table eventos add column if not exists tipo_evento text;
alter table eventos add column if not exists entidade_tipo text;
alter table eventos add column if not exists entidade_id uuid;
alter table eventos add column if not exists ator_tipo text default 'sistema'::text;
alter table eventos add column if not exists ator_id uuid;
alter table eventos add column if not exists descricao text;
alter table eventos add column if not exists payload jsonb default '{}'::jsonb;
alter table eventos add column if not exists criado_em timestamp with time zone default now();
alter table eventos add column if not exists ator_funcionario_id uuid;

create table if not exists followups (
  id uuid default gen_random_uuid() not null,
  cliente_id uuid not null,
  orcamento_id uuid,
  motivo text not null,
  agendado_para timestamp with time zone not null,
  concluido boolean default false not null,
  criado_em timestamp with time zone default now() not null
);
alter table followups add column if not exists id uuid default gen_random_uuid();
alter table followups add column if not exists cliente_id uuid;
alter table followups add column if not exists orcamento_id uuid;
alter table followups add column if not exists motivo text;
alter table followups add column if not exists agendado_para timestamp with time zone;
alter table followups add column if not exists concluido boolean default false;
alter table followups add column if not exists criado_em timestamp with time zone default now();

create table if not exists funcionarios (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  papeis text[] default '{}'::text[] not null,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  codigo_funcionario text,
  auth_user_id uuid,
  pin_tentativas_falhas integer default 0 not null,
  pin_bloqueado_ate timestamp with time zone
);
alter table funcionarios add column if not exists id uuid default gen_random_uuid();
alter table funcionarios add column if not exists nome text;
alter table funcionarios add column if not exists papeis text[] default '{}'::text[];
alter table funcionarios add column if not exists ativo boolean default true;
alter table funcionarios add column if not exists criado_em timestamp with time zone default now();
alter table funcionarios add column if not exists atualizado_em timestamp with time zone default now();
alter table funcionarios add column if not exists codigo_funcionario text;
alter table funcionarios add column if not exists auth_user_id uuid;
alter table funcionarios add column if not exists pin_tentativas_falhas integer default 0;
alter table funcionarios add column if not exists pin_bloqueado_ate timestamp with time zone;

create table if not exists itens_orcamento (
  id uuid default gen_random_uuid() not null,
  orcamento_id uuid not null,
  produto_id uuid,
  descricao_livre text,
  quantidade numeric default 1 not null,
  valor_unitario numeric(10,2),
  valor_total numeric(10,2) generated always as ((quantidade * valor_unitario)) stored,
  nome_item text
);
alter table itens_orcamento add column if not exists id uuid default gen_random_uuid();
alter table itens_orcamento add column if not exists orcamento_id uuid;
alter table itens_orcamento add column if not exists produto_id uuid;
alter table itens_orcamento add column if not exists descricao_livre text;
alter table itens_orcamento add column if not exists quantidade numeric default 1;
alter table itens_orcamento add column if not exists valor_unitario numeric(10,2);
alter table itens_orcamento add column if not exists nome_item text;

create table if not exists itens_pedido (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  produto_id uuid,
  descricao_livre text,
  quantidade numeric default 1 not null,
  valor_unitario numeric(10,2),
  valor_total numeric(10,2) generated always as ((quantidade * valor_unitario)) stored,
  nome_item text,
  separado boolean default false not null,
  tipo_observacao text,
  observacao text
);
alter table itens_pedido add column if not exists id uuid default gen_random_uuid();
alter table itens_pedido add column if not exists pedido_id uuid;
alter table itens_pedido add column if not exists produto_id uuid;
alter table itens_pedido add column if not exists descricao_livre text;
alter table itens_pedido add column if not exists quantidade numeric default 1;
alter table itens_pedido add column if not exists valor_unitario numeric(10,2);
alter table itens_pedido add column if not exists nome_item text;
alter table itens_pedido add column if not exists separado boolean default false;
alter table itens_pedido add column if not exists tipo_observacao text;
alter table itens_pedido add column if not exists observacao text;

create table if not exists marcas (
  id uuid default gen_random_uuid() not null,
  nome text not null
);
alter table marcas add column if not exists id uuid default gen_random_uuid();
alter table marcas add column if not exists nome text;

create table if not exists materiais_lista_escolar (
  id uuid default gen_random_uuid() not null,
  escola_id uuid not null,
  ano text not null,
  pdf_url text,
  atualizado_em timestamp with time zone default now() not null
);
alter table materiais_lista_escolar add column if not exists id uuid default gen_random_uuid();
alter table materiais_lista_escolar add column if not exists escola_id uuid;
alter table materiais_lista_escolar add column if not exists ano text;
alter table materiais_lista_escolar add column if not exists pdf_url text;
alter table materiais_lista_escolar add column if not exists atualizado_em timestamp with time zone default now();

create table if not exists memoria_produtos (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  categoria text,
  produto_id uuid,
  ultimo_preco numeric(10,2),
  preco_medio numeric(10,2),
  disponibilidade text default 'desconhecido'::text not null,
  confidence_score numeric(5,2) default 50.00 not null,
  ultima_confirmacao timestamp with time zone,
  confirmado_por uuid,
  observacoes text,
  aliases text[] default '{}'::text[] not null,
  consultas_count integer default 0 not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
alter table memoria_produtos add column if not exists id uuid default gen_random_uuid();
alter table memoria_produtos add column if not exists nome text;
alter table memoria_produtos add column if not exists categoria text;
alter table memoria_produtos add column if not exists produto_id uuid;
alter table memoria_produtos add column if not exists ultimo_preco numeric(10,2);
alter table memoria_produtos add column if not exists preco_medio numeric(10,2);
alter table memoria_produtos add column if not exists disponibilidade text default 'desconhecido'::text;
alter table memoria_produtos add column if not exists confidence_score numeric(5,2) default 50.00;
alter table memoria_produtos add column if not exists ultima_confirmacao timestamp with time zone;
alter table memoria_produtos add column if not exists confirmado_por uuid;
alter table memoria_produtos add column if not exists observacoes text;
alter table memoria_produtos add column if not exists aliases text[] default '{}'::text[];
alter table memoria_produtos add column if not exists consultas_count integer default 0;
alter table memoria_produtos add column if not exists criado_em timestamp with time zone default now();
alter table memoria_produtos add column if not exists atualizado_em timestamp with time zone default now();

create table if not exists memorias (
  id uuid default gen_random_uuid() not null,
  cliente_id uuid not null,
  chave text not null,
  valor text not null,
  criado_em timestamp with time zone default now() not null
);
alter table memorias add column if not exists id uuid default gen_random_uuid();
alter table memorias add column if not exists cliente_id uuid;
alter table memorias add column if not exists chave text;
alter table memorias add column if not exists valor text;
alter table memorias add column if not exists criado_em timestamp with time zone default now();

create table if not exists mensagens (
  id uuid default gen_random_uuid() not null,
  conversa_id uuid not null,
  remetente text not null,
  conteudo text,
  enviado_em timestamp with time zone default now() not null,
  tipo text default 'texto'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  lida boolean default false not null,
  operador_id uuid
);
alter table mensagens add column if not exists id uuid default gen_random_uuid();
alter table mensagens add column if not exists conversa_id uuid;
alter table mensagens add column if not exists remetente text;
alter table mensagens add column if not exists conteudo text;
alter table mensagens add column if not exists enviado_em timestamp with time zone default now();
alter table mensagens add column if not exists tipo text default 'texto'::text;
alter table mensagens add column if not exists metadata jsonb default '{}'::jsonb;
alter table mensagens add column if not exists lida boolean default false;
alter table mensagens add column if not exists operador_id uuid;

create table if not exists notificacoes (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid,
  cliente_id uuid not null,
  tipo text not null,
  canal text default 'whatsapp'::text not null,
  mensagem text not null,
  enviado boolean default false not null,
  enviado_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null
);
alter table notificacoes add column if not exists id uuid default gen_random_uuid();
alter table notificacoes add column if not exists pedido_id uuid;
alter table notificacoes add column if not exists cliente_id uuid;
alter table notificacoes add column if not exists tipo text;
alter table notificacoes add column if not exists canal text default 'whatsapp'::text;
alter table notificacoes add column if not exists mensagem text;
alter table notificacoes add column if not exists enviado boolean default false;
alter table notificacoes add column if not exists enviado_em timestamp with time zone;
alter table notificacoes add column if not exists criado_em timestamp with time zone default now();

create table if not exists notificacoes_internas (
  id uuid default gen_random_uuid() not null,
  tipo text not null,
  solicitacao_id uuid,
  destinatario_tipo text not null,
  destinatario_operador_id uuid,
  destinatario_funcionario_id uuid,
  titulo text not null,
  corpo text,
  lida boolean default false not null,
  lida_em timestamp with time zone,
  push_enviado boolean default false not null,
  criado_em timestamp with time zone default now() not null
);
alter table notificacoes_internas add column if not exists id uuid default gen_random_uuid();
alter table notificacoes_internas add column if not exists tipo text;
alter table notificacoes_internas add column if not exists solicitacao_id uuid;
alter table notificacoes_internas add column if not exists destinatario_tipo text;
alter table notificacoes_internas add column if not exists destinatario_operador_id uuid;
alter table notificacoes_internas add column if not exists destinatario_funcionario_id uuid;
alter table notificacoes_internas add column if not exists titulo text;
alter table notificacoes_internas add column if not exists corpo text;
alter table notificacoes_internas add column if not exists lida boolean default false;
alter table notificacoes_internas add column if not exists lida_em timestamp with time zone;
alter table notificacoes_internas add column if not exists push_enviado boolean default false;
alter table notificacoes_internas add column if not exists criado_em timestamp with time zone default now();

create table if not exists ocorrencias (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  solicitacao_separacao_id uuid,
  solicitacao_entrega_id uuid,
  tipo text not null,
  criado_por_tipo text not null,
  criado_por_operador_id uuid,
  criado_por_funcionario_id uuid,
  status text default 'aberta'::text not null,
  descricao text not null,
  resolucao_texto text,
  resolvido_por_tipo text,
  resolvido_por_operador_id uuid,
  resolvido_por_funcionario_id uuid,
  criado_em timestamp with time zone default now() not null,
  resolvida_em timestamp with time zone
);
alter table ocorrencias add column if not exists id uuid default gen_random_uuid();
alter table ocorrencias add column if not exists pedido_id uuid;
alter table ocorrencias add column if not exists solicitacao_separacao_id uuid;
alter table ocorrencias add column if not exists solicitacao_entrega_id uuid;
alter table ocorrencias add column if not exists tipo text;
alter table ocorrencias add column if not exists criado_por_tipo text;
alter table ocorrencias add column if not exists criado_por_operador_id uuid;
alter table ocorrencias add column if not exists criado_por_funcionario_id uuid;
alter table ocorrencias add column if not exists status text default 'aberta'::text;
alter table ocorrencias add column if not exists descricao text;
alter table ocorrencias add column if not exists resolucao_texto text;
alter table ocorrencias add column if not exists resolvido_por_tipo text;
alter table ocorrencias add column if not exists resolvido_por_operador_id uuid;
alter table ocorrencias add column if not exists resolvido_por_funcionario_id uuid;
alter table ocorrencias add column if not exists criado_em timestamp with time zone default now();
alter table ocorrencias add column if not exists resolvida_em timestamp with time zone;

create table if not exists operadores (
  id uuid not null,
  nome text not null,
  papel text default 'operador'::text not null,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  ultimo_heartbeat timestamp with time zone
);
alter table operadores add column if not exists id uuid;
alter table operadores add column if not exists nome text;
alter table operadores add column if not exists papel text default 'operador'::text;
alter table operadores add column if not exists ativo boolean default true;
alter table operadores add column if not exists criado_em timestamp with time zone default now();
alter table operadores add column if not exists atualizado_em timestamp with time zone default now();
alter table operadores add column if not exists ultimo_heartbeat timestamp with time zone;

create table if not exists orcamentos (
  id uuid default gen_random_uuid() not null,
  cliente_id uuid not null,
  conversa_id uuid,
  protocolo text default gerar_protocolo('ORC'::text) not null,
  tipo tipo_pedido not null,
  escola_id uuid,
  status status_orcamento default 'rascunho'::status_orcamento not null,
  valor_total numeric(10,2),
  observacoes text,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  sequencia text,
  operacao text
);
alter table orcamentos add column if not exists id uuid default gen_random_uuid();
alter table orcamentos add column if not exists cliente_id uuid;
alter table orcamentos add column if not exists conversa_id uuid;
alter table orcamentos add column if not exists protocolo text default gerar_protocolo('ORC'::text);
alter table orcamentos add column if not exists tipo tipo_pedido;
alter table orcamentos add column if not exists escola_id uuid;
alter table orcamentos add column if not exists status status_orcamento default 'rascunho'::status_orcamento;
alter table orcamentos add column if not exists valor_total numeric(10,2);
alter table orcamentos add column if not exists observacoes text;
alter table orcamentos add column if not exists criado_em timestamp with time zone default now();
alter table orcamentos add column if not exists atualizado_em timestamp with time zone default now();
alter table orcamentos add column if not exists sequencia text;
alter table orcamentos add column if not exists operacao text;

create table if not exists orcamentos_status_historico (
  id uuid default gen_random_uuid() not null,
  orcamento_id uuid not null,
  status_anterior status_orcamento,
  status_novo status_orcamento not null,
  origem text not null,
  criado_em timestamp with time zone default now() not null,
  operador_id uuid,
  observacao text
);
alter table orcamentos_status_historico add column if not exists id uuid default gen_random_uuid();
alter table orcamentos_status_historico add column if not exists orcamento_id uuid;
alter table orcamentos_status_historico add column if not exists status_anterior status_orcamento;
alter table orcamentos_status_historico add column if not exists status_novo status_orcamento;
alter table orcamentos_status_historico add column if not exists origem text;
alter table orcamentos_status_historico add column if not exists criado_em timestamp with time zone default now();
alter table orcamentos_status_historico add column if not exists operador_id uuid;
alter table orcamentos_status_historico add column if not exists observacao text;

create table if not exists pedidos (
  id uuid default gen_random_uuid() not null,
  cliente_id uuid not null,
  orcamento_id uuid not null,
  conversa_id uuid,
  protocolo text default gerar_protocolo('PED'::text) not null,
  status status_pedido default 'confirmado'::status_pedido not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  valor_total numeric(10,2) default 0 not null,
  forma_entrega text,
  endereco_entrega text,
  operador_id uuid,
  prioridade text default 'normal'::text not null,
  pronto_para_retirada_em timestamp with time zone,
  saiu_para_entrega_em timestamp with time zone,
  responsavel_separacao_id uuid,
  responsavel_entrega_id uuid,
  entrega_terceirizada_obs text,
  sequencia text,
  operacao text,
  horario_retirada_desejado text
);
alter table pedidos add column if not exists id uuid default gen_random_uuid();
alter table pedidos add column if not exists cliente_id uuid;
alter table pedidos add column if not exists orcamento_id uuid;
alter table pedidos add column if not exists conversa_id uuid;
alter table pedidos add column if not exists protocolo text default gerar_protocolo('PED'::text);
alter table pedidos add column if not exists status status_pedido default 'confirmado'::status_pedido;
alter table pedidos add column if not exists criado_em timestamp with time zone default now();
alter table pedidos add column if not exists atualizado_em timestamp with time zone default now();
alter table pedidos add column if not exists valor_total numeric(10,2) default 0;
alter table pedidos add column if not exists forma_entrega text;
alter table pedidos add column if not exists endereco_entrega text;
alter table pedidos add column if not exists operador_id uuid;
alter table pedidos add column if not exists prioridade text default 'normal'::text;
alter table pedidos add column if not exists pronto_para_retirada_em timestamp with time zone;
alter table pedidos add column if not exists saiu_para_entrega_em timestamp with time zone;
alter table pedidos add column if not exists responsavel_separacao_id uuid;
alter table pedidos add column if not exists responsavel_entrega_id uuid;
alter table pedidos add column if not exists entrega_terceirizada_obs text;
alter table pedidos add column if not exists sequencia text;
alter table pedidos add column if not exists operacao text;
alter table pedidos add column if not exists horario_retirada_desejado text;
comment on column pedidos.horario_retirada_desejado is 'Horário/prazo que o cliente pediu para retirar ou receber, em texto livre como o cliente disse (ex: "hoje às 15h", "amanhã de manhã") -- captado pela IA no fechamento. Não é timestamp resolvido: evita a IA inferir a data errada a partir de linguagem natural ambígua.';

create table if not exists pedidos_status_historico (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  status_anterior status_pedido,
  status_novo status_pedido not null,
  origem text not null,
  criado_em timestamp with time zone default now() not null,
  operador_id uuid,
  observacao text
);
alter table pedidos_status_historico add column if not exists id uuid default gen_random_uuid();
alter table pedidos_status_historico add column if not exists pedido_id uuid;
alter table pedidos_status_historico add column if not exists status_anterior status_pedido;
alter table pedidos_status_historico add column if not exists status_novo status_pedido;
alter table pedidos_status_historico add column if not exists origem text;
alter table pedidos_status_historico add column if not exists criado_em timestamp with time zone default now();
alter table pedidos_status_historico add column if not exists operador_id uuid;
alter table pedidos_status_historico add column if not exists observacao text;

create table if not exists produtos (
  id uuid default gen_random_uuid() not null,
  categoria_id uuid,
  nome text not null,
  descricao text,
  preco numeric(10,2),
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  sku text,
  estoque integer default 0 not null,
  imagem_url text,
  aliases text[] default '{}'::text[] not null,
  tags text[] default '{}'::text[] not null,
  marca_id uuid
);
alter table produtos add column if not exists id uuid default gen_random_uuid();
alter table produtos add column if not exists categoria_id uuid;
alter table produtos add column if not exists nome text;
alter table produtos add column if not exists descricao text;
alter table produtos add column if not exists preco numeric(10,2);
alter table produtos add column if not exists ativo boolean default true;
alter table produtos add column if not exists criado_em timestamp with time zone default now();
alter table produtos add column if not exists atualizado_em timestamp with time zone default now();
alter table produtos add column if not exists sku text;
alter table produtos add column if not exists estoque integer default 0;
alter table produtos add column if not exists imagem_url text;
alter table produtos add column if not exists aliases text[] default '{}'::text[];
alter table produtos add column if not exists tags text[] default '{}'::text[];
alter table produtos add column if not exists marca_id uuid;

create table if not exists produtos_documentos (
  id bigint generated by default as identity not null,
  content text not null,
  metadata jsonb default '{}'::jsonb not null,
  embedding vector(3072)
);
alter table produtos_documentos add column if not exists content text;
alter table produtos_documentos add column if not exists metadata jsonb default '{}'::jsonb;
alter table produtos_documentos add column if not exists embedding vector(3072);
comment on table produtos_documentos is 'Vector store do catálogo pro node nativo @n8n/n8n-nodes-langchain.vectorStoreSupabase (workflow "Agente vendedor", tool "Busca Inteligente"). content = texto embedado (nome + aliases + preço); metadata = {produto_id, nome, preco}. Embedding via Gemini (768 dims). Ingestão pela branch manual "Rodar Ingestão de Embeddings" no mesmo workflow.';

create table if not exists produtos_relacionados (
  produto_id uuid not null,
  relacionado_id uuid,
  id uuid default gen_random_uuid() not null,
  relacionado_nome_livre text,
  tipo text default 'similar'::text not null,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null
);
alter table produtos_relacionados add column if not exists produto_id uuid;
alter table produtos_relacionados add column if not exists relacionado_id uuid;
alter table produtos_relacionados add column if not exists id uuid default gen_random_uuid();
alter table produtos_relacionados add column if not exists relacionado_nome_livre text;
alter table produtos_relacionados add column if not exists tipo text default 'similar'::text;
alter table produtos_relacionados add column if not exists criado_por uuid;
alter table produtos_relacionados add column if not exists criado_em timestamp with time zone default now();

create table if not exists solicitacoes_entrega (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  entregador_id uuid not null,
  delegado_por_id uuid not null,
  status text default 'pendente'::text not null,
  endereco_entrega text,
  horario_previsto timestamp with time zone,
  assumida_em timestamp with time zone,
  iniciada_em timestamp with time zone,
  concluida_em timestamp with time zone,
  insucesso_em timestamp with time zone,
  cancelada_em timestamp with time zone,
  motivo_insucesso text,
  motivo_cancelamento text,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
alter table solicitacoes_entrega add column if not exists id uuid default gen_random_uuid();
alter table solicitacoes_entrega add column if not exists pedido_id uuid;
alter table solicitacoes_entrega add column if not exists entregador_id uuid;
alter table solicitacoes_entrega add column if not exists delegado_por_id uuid;
alter table solicitacoes_entrega add column if not exists status text default 'pendente'::text;
alter table solicitacoes_entrega add column if not exists endereco_entrega text;
alter table solicitacoes_entrega add column if not exists horario_previsto timestamp with time zone;
alter table solicitacoes_entrega add column if not exists assumida_em timestamp with time zone;
alter table solicitacoes_entrega add column if not exists iniciada_em timestamp with time zone;
alter table solicitacoes_entrega add column if not exists concluida_em timestamp with time zone;
alter table solicitacoes_entrega add column if not exists insucesso_em timestamp with time zone;
alter table solicitacoes_entrega add column if not exists cancelada_em timestamp with time zone;
alter table solicitacoes_entrega add column if not exists motivo_insucesso text;
alter table solicitacoes_entrega add column if not exists motivo_cancelamento text;
alter table solicitacoes_entrega add column if not exists criado_em timestamp with time zone default now();
alter table solicitacoes_entrega add column if not exists atualizado_em timestamp with time zone default now();

create table if not exists solicitacoes_separacao (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  operador_delegante_id uuid not null,
  separador_id uuid,
  prioridade text not null,
  horario_retirada timestamp with time zone,
  status text default 'pendente'::text not null,
  tipo text default 'delegada'::text not null,
  observacao text,
  iniciada_em timestamp with time zone,
  concluida_em timestamp with time zone,
  cancelada_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
alter table solicitacoes_separacao add column if not exists id uuid default gen_random_uuid();
alter table solicitacoes_separacao add column if not exists pedido_id uuid;
alter table solicitacoes_separacao add column if not exists operador_delegante_id uuid;
alter table solicitacoes_separacao add column if not exists separador_id uuid;
alter table solicitacoes_separacao add column if not exists prioridade text;
alter table solicitacoes_separacao add column if not exists horario_retirada timestamp with time zone;
alter table solicitacoes_separacao add column if not exists status text default 'pendente'::text;
alter table solicitacoes_separacao add column if not exists tipo text default 'delegada'::text;
alter table solicitacoes_separacao add column if not exists observacao text;
alter table solicitacoes_separacao add column if not exists iniciada_em timestamp with time zone;
alter table solicitacoes_separacao add column if not exists concluida_em timestamp with time zone;
alter table solicitacoes_separacao add column if not exists cancelada_em timestamp with time zone;
alter table solicitacoes_separacao add column if not exists criado_em timestamp with time zone default now();
alter table solicitacoes_separacao add column if not exists atualizado_em timestamp with time zone default now();

create table if not exists solicitacoes_separacao_itens (
  id uuid default gen_random_uuid() not null,
  solicitacao_id uuid not null,
  item_pedido_id uuid not null,
  separado boolean default false not null,
  separado_em timestamp with time zone
);
alter table solicitacoes_separacao_itens add column if not exists id uuid default gen_random_uuid();
alter table solicitacoes_separacao_itens add column if not exists solicitacao_id uuid;
alter table solicitacoes_separacao_itens add column if not exists item_pedido_id uuid;
alter table solicitacoes_separacao_itens add column if not exists separado boolean default false;
alter table solicitacoes_separacao_itens add column if not exists separado_em timestamp with time zone;

create table if not exists solicitacoes_separacao_mensagens (
  id uuid default gen_random_uuid() not null,
  solicitacao_id uuid not null,
  autor_tipo text not null,
  autor_operador_id uuid,
  autor_funcionario_id uuid,
  texto text not null,
  criado_em timestamp with time zone default now() not null
);
alter table solicitacoes_separacao_mensagens add column if not exists id uuid default gen_random_uuid();
alter table solicitacoes_separacao_mensagens add column if not exists solicitacao_id uuid;
alter table solicitacoes_separacao_mensagens add column if not exists autor_tipo text;
alter table solicitacoes_separacao_mensagens add column if not exists autor_operador_id uuid;
alter table solicitacoes_separacao_mensagens add column if not exists autor_funcionario_id uuid;
alter table solicitacoes_separacao_mensagens add column if not exists texto text;
alter table solicitacoes_separacao_mensagens add column if not exists criado_em timestamp with time zone default now();

create table if not exists taxas_entrega_bairro (
  id uuid default gen_random_uuid() not null,
  bairro text not null,
  taxa numeric not null,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
alter table taxas_entrega_bairro add column if not exists id uuid default gen_random_uuid();
alter table taxas_entrega_bairro add column if not exists bairro text;
alter table taxas_entrega_bairro add column if not exists taxa numeric;
alter table taxas_entrega_bairro add column if not exists ativo boolean default true;
alter table taxas_entrega_bairro add column if not exists criado_em timestamp with time zone default now();
alter table taxas_entrega_bairro add column if not exists atualizado_em timestamp with time zone default now();
comment on table taxas_entrega_bairro is 'Taxa de entrega própria por bairro. Vazia até o dono do projeto enviar os valores -- só estrutura por enquanto (20/08/2026). Não se aplica a uber_flash (sem taxa da loja).';

create table if not exists templates_mensagem (
  id uuid default gen_random_uuid() not null,
  status text not null,
  titulo text not null,
  mensagem text not null,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);
alter table templates_mensagem add column if not exists id uuid default gen_random_uuid();
alter table templates_mensagem add column if not exists status text;
alter table templates_mensagem add column if not exists titulo text;
alter table templates_mensagem add column if not exists mensagem text;
alter table templates_mensagem add column if not exists ativo boolean default true;
alter table templates_mensagem add column if not exists criado_em timestamp with time zone default now();
alter table templates_mensagem add column if not exists atualizado_em timestamp with time zone default now();


-- =====================================================================
-- 4. CONSTRAINTS (PK, UNIQUE, FK, CHECK)
-- =====================================================================

do $$ begin
  alter table alertas_demanda add constraint alertas_demanda_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table categorias add constraint categorias_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table clientes add constraint clientes_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table config_alerta_demanda add constraint config_alerta_demanda_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table configuracoes add constraint configuracoes_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table confirmacoes_produto add constraint confirmacoes_produto_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_demanda add constraint consultas_demanda_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_operacionais add constraint consultas_operacionais_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table conversas add constraint conversas_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table empresa add constraint empresa_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table escolas add constraint escolas_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table eventos add constraint eventos_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table followups add constraint followups_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table funcionarios add constraint funcionarios_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table itens_orcamento add constraint itens_orcamento_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table itens_pedido add constraint itens_pedido_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table marcas add constraint marcas_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table materiais_lista_escolar add constraint materiais_lista_escolar_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table memoria_produtos add constraint memoria_produtos_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table memorias add constraint memorias_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table mensagens add constraint mensagens_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes add constraint notificacoes_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes_internas add constraint notificacoes_internas_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table operadores add constraint operadores_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos add constraint orcamentos_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos_status_historico add constraint orcamentos_status_historico_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos_status_historico add constraint pedidos_status_historico_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos add constraint produtos_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos_documentos add constraint produtos_documentos_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos_relacionados add constraint produtos_relacionados_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_entrega add constraint solicitacoes_entrega_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao add constraint solicitacoes_separacao_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_itens add constraint solicitacoes_separacao_itens_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_mensagens add constraint solicitacoes_separacao_mensagens_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table taxas_entrega_bairro add constraint taxas_entrega_bairro_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table templates_mensagem add constraint templates_mensagem_pkey PRIMARY KEY (id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table categorias add constraint categorias_nome_key UNIQUE (nome);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table config_alerta_demanda add constraint config_alerta_demanda_nome_key UNIQUE (nome);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table configuracoes add constraint configuracoes_empresa_id_chave_key UNIQUE (empresa_id, chave);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table funcionarios add constraint funcionarios_codigo_funcionario_key UNIQUE (codigo_funcionario);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table marcas add constraint marcas_nome_key UNIQUE (nome);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table materiais_lista_escolar add constraint materiais_lista_escolar_escola_id_ano_key UNIQUE (escola_id, ano);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table memorias add constraint memorias_cliente_id_chave_key UNIQUE (cliente_id, chave);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes add constraint notificacoes_pedido_id_tipo_canal_key UNIQUE (pedido_id, tipo, canal);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos add constraint orcamentos_protocolo_key UNIQUE (protocolo);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_protocolo_key UNIQUE (protocolo);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos add constraint produtos_sku_key UNIQUE (sku);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table taxas_entrega_bairro add constraint taxas_entrega_bairro_bairro_key UNIQUE (bairro);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table templates_mensagem add constraint templates_mensagem_status_key UNIQUE (status);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table alertas_demanda add constraint alertas_demanda_status_check CHECK ((status = ANY (ARRAY['novo'::text, 'visto'::text, 'resolvido'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table clientes add constraint chk_dados_pj_apenas_pj CHECK (((tipo_pessoa = 'PJ'::tipo_pessoa) OR ((cnpj IS NULL) AND (razao_social IS NULL))));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table clientes add constraint chk_indicador_ie_valido CHECK (((indicador_ie IS NULL) OR (indicador_ie = ANY (ARRAY['contribuinte'::text, 'isento'::text, 'nao_contribuinte'::text]))));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table clientes add constraint clientes_origem_check CHECK ((origem = ANY (ARRAY['whatsapp'::text, 'manual'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table clientes add constraint clientes_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'inativo'::text, 'vip'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table config_alerta_demanda add constraint config_alerta_demanda_canal_alerta_check CHECK ((canal_alerta = ANY (ARRAY['dashboard'::text, 'email'::text, 'whatsapp'::text, 'todos'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table confirmacoes_produto add constraint confirmacoes_produto_origem_check CHECK ((origem = ANY (ARRAY['manual'::text, 'whatsapp'::text, 'sistema'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_demanda add constraint consultas_demanda_origem_check CHECK ((origem = ANY (ARRAY['whatsapp'::text, 'dashboard'::text, 'api'::text, 'n8n'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_demanda add constraint consultas_demanda_resultado_check CHECK ((resultado = ANY (ARRAY['respondido_ia'::text, 'consultou_operador'::text, 'nao_encontrado'::text, 'sem_estoque'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_operacionais add constraint consultas_operacionais_prioridade_check CHECK ((prioridade = ANY (ARRAY['critica'::text, 'alta'::text, 'normal'::text, 'baixa'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_operacionais add constraint consultas_operacionais_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'atribuida'::text, 'respondida'::text, 'expirada'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_operacionais add constraint consultas_operacionais_tipo_duvida_check CHECK ((tipo_duvida = ANY (ARRAY['estoque'::text, 'preco'::text, 'disponibilidade'::text, 'prazo'::text, 'outro'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table conversas add constraint conversas_intencao_check CHECK ((intencao = ANY (ARRAY['orcamento'::text, 'pedido'::text, 'lista_escolar'::text, 'empresa'::text, 'atacado'::text, 'duvida'::text, 'entrega'::text, 'outro'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table conversas add constraint conversas_prioridade_check CHECK ((prioridade = ANY (ARRAY['critica'::text, 'alta'::text, 'normal'::text, 'baixa'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table conversas add constraint conversas_status_check CHECK ((status = ANY (ARRAY['novo_lead'::text, 'aguardando_operador'::text, 'aguardando_cliente'::text, 'aguardando_confirmacao'::text, 'separando'::text, 'aguardando_pagamento'::text, 'finalizado'::text, 'cancelado'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table eventos add constraint eventos_ator_tipo_check CHECK ((ator_tipo = ANY (ARRAY['operador'::text, 'funcionario'::text, 'bot'::text, 'cliente'::text, 'sistema'::text, 'n8n'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table funcionarios add constraint funcionarios_codigo_funcionario_check CHECK (((codigo_funcionario IS NULL) OR ((char_length(codigo_funcionario) >= 2) AND (char_length(codigo_funcionario) <= 20))));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table itens_orcamento add constraint chk_produto_ou_descricao CHECK (((produto_id IS NOT NULL) OR (descricao_livre IS NOT NULL)));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table itens_pedido add constraint itens_pedido_tipo_observacao_check CHECK ((tipo_observacao = ANY (ARRAY['presente_menina'::text, 'presente_menino'::text, 'fragil'::text, 'a_granel'::text, 'padrao'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table memoria_produtos add constraint memoria_produtos_disponibilidade_check CHECK ((disponibilidade = ANY (ARRAY['disponivel'::text, 'indisponivel'::text, 'sob_consulta'::text, 'desconhecido'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table mensagens add constraint mensagens_remetente_check CHECK ((remetente = ANY (ARRAY['cliente'::text, 'bot'::text, 'humano'::text, 'sistema'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table mensagens add constraint mensagens_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text, 'imagem'::text, 'audio'::text, 'documento'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes_internas add constraint chk_notif_interna_destinatario CHECK ((((destinatario_tipo = 'operador'::text) AND (destinatario_operador_id IS NOT NULL) AND (destinatario_funcionario_id IS NULL)) OR ((destinatario_tipo = 'separador'::text) AND (destinatario_funcionario_id IS NOT NULL) AND (destinatario_operador_id IS NULL))));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes_internas add constraint notificacoes_internas_destinatario_tipo_check CHECK ((destinatario_tipo = ANY (ARRAY['operador'::text, 'separador'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes_internas add constraint notificacoes_internas_tipo_check CHECK ((tipo = ANY (ARRAY['solicitacao_delegada'::text, 'separacao_concluida'::text, 'nova_mensagem'::text, 'tarefa_agendada_vencendo'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint chk_ocorrencia_criado_por CHECK ((((criado_por_tipo = 'operador'::text) AND (criado_por_operador_id IS NOT NULL) AND (criado_por_funcionario_id IS NULL)) OR ((criado_por_tipo = 'funcionario'::text) AND (criado_por_funcionario_id IS NOT NULL) AND (criado_por_operador_id IS NULL))));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint chk_ocorrencia_resolucao CHECK ((((status = 'aberta'::text) AND (resolvida_em IS NULL)) OR ((status = 'resolvida'::text) AND (resolvida_em IS NOT NULL) AND (resolucao_texto IS NOT NULL))));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_criado_por_tipo_check CHECK ((criado_por_tipo = ANY (ARRAY['operador'::text, 'funcionario'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_descricao_check CHECK (((char_length(descricao) >= 1) AND (char_length(descricao) <= 2000)));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_resolvido_por_tipo_check CHECK ((resolvido_por_tipo = ANY (ARRAY['operador'::text, 'funcionario'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'resolvida'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_tipo_check CHECK ((tipo = ANY (ARRAY['item_faltante'::text, 'endereco_nao_encontrado'::text, 'cliente_ausente'::text, 'produto_avariado'::text, 'troca'::text, 'devolucao'::text, 'produto_errado'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table operadores add constraint operadores_papel_check CHECK ((papel = ANY (ARRAY['admin'::text, 'operador'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos add constraint chk_escola_apenas_lista_escolar CHECK (((tipo = 'lista_escolar'::tipo_pedido) OR (escola_id IS NULL)));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos add constraint orcamentos_operacao_check CHECK ((operacao = ANY (ARRAY['550'::text, '650'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_forma_entrega_check CHECK ((forma_entrega = ANY (ARRAY['retirada'::text, 'entrega_propria'::text, 'uber_flash'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_operacao_check CHECK ((operacao = ANY (ARRAY['550'::text, '650'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_prioridade_check CHECK ((prioridade = ANY (ARRAY['critica'::text, 'alta'::text, 'normal'::text, 'baixa'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos_relacionados add constraint chk_nao_relaciona_consigo CHECK ((produto_id <> relacionado_id));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos_relacionados add constraint chk_relacionado_ou_livre CHECK (((relacionado_id IS NOT NULL) OR (relacionado_nome_livre IS NOT NULL)));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos_relacionados add constraint produtos_relacionados_tipo_check CHECK ((tipo = ANY (ARRAY['similar'::text, 'substituto'::text, 'alternativa'::text, 'complemento'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_entrega add constraint solicitacoes_entrega_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'em_rota'::text, 'entregue'::text, 'insucesso'::text, 'cancelada'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao add constraint chk_solic_sep_horario_se_agendada CHECK (((prioridade <> 'agendada'::text) OR (horario_retirada IS NOT NULL)));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao add constraint chk_solic_sep_separador_por_tipo CHECK ((((tipo = 'delegada'::text) AND (separador_id IS NOT NULL)) OR ((tipo = 'rapida'::text) AND (separador_id IS NULL))));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao add constraint solicitacoes_separacao_prioridade_check CHECK ((prioridade = ANY (ARRAY['imediata'::text, 'agendada'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao add constraint solicitacoes_separacao_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'pronta'::text, 'cancelada'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao add constraint solicitacoes_separacao_tipo_check CHECK ((tipo = ANY (ARRAY['delegada'::text, 'rapida'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_mensagens add constraint chk_solic_sep_msg_autor CHECK ((((autor_tipo = 'operador'::text) AND (autor_operador_id IS NOT NULL) AND (autor_funcionario_id IS NULL)) OR ((autor_tipo = 'separador'::text) AND (autor_funcionario_id IS NOT NULL) AND (autor_operador_id IS NULL))));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_mensagens add constraint solicitacoes_separacao_mensagens_autor_tipo_check CHECK ((autor_tipo = ANY (ARRAY['operador'::text, 'separador'::text])));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_mensagens add constraint solicitacoes_separacao_mensagens_texto_check CHECK (((char_length(texto) >= 1) AND (char_length(texto) <= 2000)));
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table alertas_demanda add constraint alertas_demanda_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table clientes add constraint clientes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresa(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table configuracoes add constraint configuracoes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresa(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table confirmacoes_produto add constraint confirmacoes_produto_memoria_produto_id_fkey FOREIGN KEY (memoria_produto_id) REFERENCES memoria_produtos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table confirmacoes_produto add constraint confirmacoes_produto_operador_id_fkey FOREIGN KEY (operador_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_demanda add constraint consultas_demanda_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_demanda add constraint consultas_demanda_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_demanda add constraint consultas_demanda_memoria_produto_id_fkey FOREIGN KEY (memoria_produto_id) REFERENCES memoria_produtos(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_demanda add constraint consultas_demanda_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_operacionais add constraint consultas_operacionais_atribuido_a_fkey FOREIGN KEY (atribuido_a) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_operacionais add constraint consultas_operacionais_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_operacionais add constraint consultas_operacionais_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table consultas_operacionais add constraint consultas_operacionais_respondido_por_fkey FOREIGN KEY (respondido_por) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table conversas add constraint conversas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table conversas add constraint conversas_operador_id_fkey FOREIGN KEY (operador_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table eventos add constraint eventos_ator_funcionario_id_fkey FOREIGN KEY (ator_funcionario_id) REFERENCES funcionarios(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table eventos add constraint eventos_ator_id_fkey FOREIGN KEY (ator_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table followups add constraint followups_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table followups add constraint followups_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table funcionarios add constraint funcionarios_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table itens_orcamento add constraint itens_orcamento_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table itens_orcamento add constraint itens_orcamento_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table itens_pedido add constraint itens_pedido_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table itens_pedido add constraint itens_pedido_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table materiais_lista_escolar add constraint materiais_lista_escolar_escola_id_fkey FOREIGN KEY (escola_id) REFERENCES escolas(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table memoria_produtos add constraint memoria_produtos_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table memoria_produtos add constraint memoria_produtos_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table memorias add constraint memorias_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table mensagens add constraint mensagens_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table mensagens add constraint mensagens_operador_id_fkey FOREIGN KEY (operador_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes add constraint notificacoes_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes add constraint notificacoes_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes_internas add constraint notificacoes_internas_destinatario_funcionario_id_fkey FOREIGN KEY (destinatario_funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes_internas add constraint notificacoes_internas_destinatario_operador_id_fkey FOREIGN KEY (destinatario_operador_id) REFERENCES operadores(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table notificacoes_internas add constraint notificacoes_internas_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes_separacao(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_criado_por_funcionario_id_fkey FOREIGN KEY (criado_por_funcionario_id) REFERENCES funcionarios(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_criado_por_operador_id_fkey FOREIGN KEY (criado_por_operador_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_resolvido_por_funcionario_id_fkey FOREIGN KEY (resolvido_por_funcionario_id) REFERENCES funcionarios(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_resolvido_por_operador_id_fkey FOREIGN KEY (resolvido_por_operador_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_solicitacao_entrega_id_fkey FOREIGN KEY (solicitacao_entrega_id) REFERENCES solicitacoes_entrega(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table ocorrencias add constraint ocorrencias_solicitacao_separacao_id_fkey FOREIGN KEY (solicitacao_separacao_id) REFERENCES solicitacoes_separacao(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table operadores add constraint operadores_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos add constraint orcamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos add constraint orcamentos_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos add constraint orcamentos_escola_id_fkey FOREIGN KEY (escola_id) REFERENCES escolas(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos_status_historico add constraint orcamentos_status_historico_operador_id_fkey FOREIGN KEY (operador_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table orcamentos_status_historico add constraint orcamentos_status_historico_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_operador_id_fkey FOREIGN KEY (operador_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_responsavel_entrega_id_fkey FOREIGN KEY (responsavel_entrega_id) REFERENCES funcionarios(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos add constraint pedidos_responsavel_separacao_id_fkey FOREIGN KEY (responsavel_separacao_id) REFERENCES funcionarios(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos_status_historico add constraint pedidos_status_historico_operador_id_fkey FOREIGN KEY (operador_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table pedidos_status_historico add constraint pedidos_status_historico_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos add constraint produtos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos add constraint produtos_marca_id_fkey FOREIGN KEY (marca_id) REFERENCES marcas(id);
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos_relacionados add constraint produtos_relacionados_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos_relacionados add constraint produtos_relacionados_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table produtos_relacionados add constraint produtos_relacionados_relacionado_id_fkey FOREIGN KEY (relacionado_id) REFERENCES produtos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_entrega add constraint solicitacoes_entrega_delegado_por_id_fkey FOREIGN KEY (delegado_por_id) REFERENCES operadores(id) ON DELETE RESTRICT;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_entrega add constraint solicitacoes_entrega_entregador_id_fkey FOREIGN KEY (entregador_id) REFERENCES funcionarios(id) ON DELETE RESTRICT;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_entrega add constraint solicitacoes_entrega_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao add constraint solicitacoes_separacao_operador_delegante_id_fkey FOREIGN KEY (operador_delegante_id) REFERENCES operadores(id) ON DELETE RESTRICT;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao add constraint solicitacoes_separacao_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao add constraint solicitacoes_separacao_separador_id_fkey FOREIGN KEY (separador_id) REFERENCES funcionarios(id) ON DELETE RESTRICT;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_itens add constraint solicitacoes_separacao_itens_item_pedido_id_fkey FOREIGN KEY (item_pedido_id) REFERENCES itens_pedido(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_itens add constraint solicitacoes_separacao_itens_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes_separacao(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_mensagens add constraint solicitacoes_separacao_mensagens_autor_funcionario_id_fkey FOREIGN KEY (autor_funcionario_id) REFERENCES funcionarios(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_mensagens add constraint solicitacoes_separacao_mensagens_autor_operador_id_fkey FOREIGN KEY (autor_operador_id) REFERENCES operadores(id) ON DELETE SET NULL;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;
do $$ begin
  alter table solicitacoes_separacao_mensagens add constraint solicitacoes_separacao_mensagens_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes_separacao(id) ON DELETE CASCADE;
exception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;

-- =====================================================================
-- 5. ÍNDICES (os que não vêm de constraint)
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_alertas_demanda_status ON public.alertas_demanda USING btree (status, criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_empresa_telefone ON public.clientes USING btree (empresa_id, telefone);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON public.clientes USING btree (telefone);
CREATE INDEX IF NOT EXISTS idx_confirmacoes_produto_memoria ON public.confirmacoes_produto USING btree (memoria_produto_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_consultas_demanda_produto_data ON public.consultas_demanda USING btree (produto_nome, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_consultas_operacionais_status ON public.consultas_operacionais USING btree (status, prioridade);
CREATE UNIQUE INDEX IF NOT EXISTS conversas_cliente_id_key ON public.conversas USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_conversas_operador ON public.conversas USING btree (operador_id);
CREATE INDEX IF NOT EXISTS idx_conversas_prioridade ON public.conversas USING btree (prioridade, prioridade_score DESC);
CREATE INDEX IF NOT EXISTS idx_conversas_status ON public.conversas USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS escolas_nome_unico ON public.escolas USING btree (nome);
CREATE INDEX IF NOT EXISTS idx_eventos_criado_em ON public.eventos USING btree (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_entidade ON public.eventos USING btree (entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_followups_pendentes ON public.followups USING btree (agendado_para) WHERE (concluido = false);
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo ON public.funcionarios USING btree (ativo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_funcionarios_auth_user_id ON public.funcionarios USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_itens_orcamento_orcamento ON public.itens_orcamento USING btree (orcamento_id);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido ON public.itens_pedido USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_memoria_produtos_nome_trgm ON public.memoria_produtos USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_enviado ON public.mensagens USING btree (conversa_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_pendentes ON public.notificacoes USING btree (enviado) WHERE (enviado = false);
CREATE INDEX IF NOT EXISTS idx_notif_interna_funcionario ON public.notificacoes_internas USING btree (destinatario_funcionario_id, lida) WHERE (destinatario_funcionario_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notif_interna_operador ON public.notificacoes_internas USING btree (destinatario_operador_id, lida) WHERE (destinatario_operador_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notif_interna_solicitacao ON public.notificacoes_internas USING btree (solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_abertas ON public.ocorrencias USING btree (status, criado_em) WHERE (status = 'aberta'::text);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_pedido ON public.ocorrencias USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_solic_entrega ON public.ocorrencias USING btree (solicitacao_entrega_id) WHERE (solicitacao_entrega_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_solic_separacao ON public.ocorrencias USING btree (solicitacao_separacao_id) WHERE (solicitacao_separacao_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_operadores_heartbeat ON public.operadores USING btree (ultimo_heartbeat) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_orcamentos_abertos ON public.orcamentos USING btree (cliente_id) WHERE (status = ANY (ARRAY['rascunho'::status_orcamento, 'enviado'::status_orcamento]));
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente ON public.orcamentos USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_ativos ON public.pedidos USING btree (cliente_id) WHERE (status <> ALL (ARRAY['concluido'::status_pedido, 'cancelado'::status_pedido]));
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON public.pedidos USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_forma_entrega ON public.pedidos USING btree (forma_entrega, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_resp_entrega ON public.pedidos USING btree (responsavel_entrega_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_resp_separacao ON public.pedidos USING btree (responsavel_separacao_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_sequencia ON public.pedidos USING btree (sequencia) WHERE (sequencia IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON public.produtos USING btree (categoria_id);
CREATE INDEX IF NOT EXISTS idx_produtos_marca ON public.produtos USING btree (marca_id);
CREATE INDEX IF NOT EXISTS idx_produtos_nome_trgm ON public.produtos USING gin (nome gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_relacionados_par ON public.produtos_relacionados USING btree (produto_id, relacionado_id) WHERE (relacionado_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_solic_entrega_ativas ON public.solicitacoes_entrega USING btree (entregador_id, status) WHERE (status = ANY (ARRAY['pendente'::text, 'em_rota'::text]));
CREATE INDEX IF NOT EXISTS idx_solic_entrega_delegante ON public.solicitacoes_entrega USING btree (delegado_por_id);
CREATE INDEX IF NOT EXISTS idx_solic_entrega_pedido ON public.solicitacoes_entrega USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_solic_sep_ativas ON public.solicitacoes_separacao USING btree (separador_id, status) WHERE (status = ANY (ARRAY['pendente'::text, 'em_andamento'::text]));
CREATE INDEX IF NOT EXISTS idx_solic_sep_delegante ON public.solicitacoes_separacao USING btree (operador_delegante_id);
CREATE INDEX IF NOT EXISTS idx_solic_sep_pedido ON public.solicitacoes_separacao USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_solic_sep_itens_solicitacao ON public.solicitacoes_separacao_itens USING btree (solicitacao_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_solic_sep_itens ON public.solicitacoes_separacao_itens USING btree (solicitacao_id, item_pedido_id);
CREATE INDEX IF NOT EXISTS idx_solic_sep_msg_solicitacao ON public.solicitacoes_separacao_mensagens USING btree (solicitacao_id, criado_em);

-- =====================================================================
-- 6. FUNÇÕES E PROCEDURES
-- =====================================================================

CREATE OR REPLACE FUNCTION public.abrir_ocorrencia(p_pedido_id uuid, p_tipo text, p_descricao text, p_solicitacao_separacao_id uuid DEFAULT NULL::uuid, p_solicitacao_entrega_id uuid DEFAULT NULL::uuid)
 RETURNS ocorrencias
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.aceitar_orcamento(p_orcamento_id uuid, p_origem text, p_forma_entrega text DEFAULT NULL::text, p_endereco_entrega text DEFAULT NULL::text, p_horario_retirada_desejado text DEFAULT NULL::text)
 RETURNS pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido      pedidos;
  v_item_count  integer;
  v_valor_total numeric;
begin
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem aceitar um orçamento';
  end if;

  select * into v_pedido from pedidos where orcamento_id = p_orcamento_id;
  if found then
    return v_pedido;
  end if;

  select count(*), coalesce(sum(valor_total), 0)
    into v_item_count, v_valor_total
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  if v_item_count = 0 then
    raise exception 'Orçamento % não pode ser aceito: nenhum item encontrado', p_orcamento_id;
  end if;

  if p_forma_entrega = 'entrega_propria' and v_valor_total < 100 then
    raise exception 'Entrega própria só disponível a partir de R$100 (pedido atual: R$%). Ofereça retirada ou moto/uber.', v_valor_total;
  end if;

  perform atualizar_status_orcamento(p_orcamento_id, 'aceito', p_origem);

  insert into pedidos (cliente_id, orcamento_id, conversa_id, forma_entrega, endereco_entrega, horario_retirada_desejado)
  select cliente_id, id, conversa_id, p_forma_entrega, p_endereco_entrega, p_horario_retirada_desejado
  from orcamentos
  where id = p_orcamento_id
  returning * into v_pedido;

  insert into itens_pedido
    (pedido_id, produto_id, descricao_livre, quantidade, valor_unitario)
  select
    v_pedido.id, produto_id, descricao_livre, quantidade, valor_unitario
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  insert into pedidos_status_historico
    (pedido_id, status_anterior, status_novo, origem)
  values
    (v_pedido.id, null, 'confirmado', p_origem);

  return v_pedido;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aceitar_orcamento_dashboard(p_orcamento_id uuid, p_operador_id uuid)
 RETURNS pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido pedidos;
  v_operador_id uuid;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem aceitar um orçamento';
  end if;
  v_operador_id := auth.uid();

  v_pedido := aceitar_orcamento(p_orcamento_id, 'dashboard:' || v_operador_id::text);

  update orcamentos_status_historico set operador_id = v_operador_id
  where id = (
    select id from orcamentos_status_historico
    where orcamento_id = p_orcamento_id
    order by criado_em desc limit 1
  );

  update pedidos_status_historico set operador_id = v_operador_id
  where id = (
    select id from pedidos_status_historico
    where pedido_id = v_pedido.id
    order by criado_em desc limit 1
  );

  update pedidos set operador_id = v_operador_id where id = v_pedido.id;

  select * into v_pedido from pedidos where id = v_pedido.id;
  return v_pedido;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aprender_de_resposta_operador(p_memoria_produto_id uuid, p_disponibilidade text, p_preco numeric, p_operador_id uuid, p_observacao text, p_origem text DEFAULT 'manual'::text)
 RETURNS memoria_produtos
 LANGUAGE plpgsql
AS $function$
declare
  v_memoria memoria_produtos;
  v_operador_id uuid;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem confirmar dados de produto';
  end if;
  v_operador_id := auth.uid();

  insert into confirmacoes_produto (memoria_produto_id, disponibilidade, preco_confirmado, operador_id, observacao, origem)
  values (p_memoria_produto_id, p_disponibilidade, p_preco, v_operador_id, p_observacao, p_origem);

  update memoria_produtos set
    disponibilidade = p_disponibilidade,
    ultimo_preco = coalesce(p_preco, ultimo_preco),
    preco_medio = case when p_preco is not null then coalesce((preco_medio + p_preco) / 2, p_preco) else preco_medio end,
    ultima_confirmacao = now(),
    confirmado_por = v_operador_id,
    confidence_score = least(100, confidence_score + 10)
  where id = p_memoria_produto_id
  returning * into v_memoria;

  return v_memoria;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assumir_conversa_dashboard(p_conversa_id uuid)
 RETURNS conversas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conversa conversas;
begin
  if not eh_operador_ativo() then
    raise exception 'Apenas operadores ativos podem assumir conversas.';
  end if;

  update conversas
     set operador_id = auth.uid(),
         bot_ativo = false,
         status = 'aguardando_operador',
         ultima_interacao_em = now()
   where id = p_conversa_id
     and operador_id is null
  returning * into v_conversa;

  if v_conversa.id is null then
    raise exception 'Conversa já foi assumida por outro operador.';
  end if;

  return v_conversa;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assumir_entrega(p_solicitacao_id uuid)
 RETURNS solicitacoes_entrega
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.assumir_separacao(p_solicitacao_id uuid)
 RETURNS solicitacoes_separacao
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.atribuir_responsavel_pedido(p_pedido_id uuid, p_tipo text, p_funcionario_id uuid, p_operador_id uuid)
 RETURNS pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido pedidos;
  v_operador_id uuid;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem atribuir responsável a um pedido';
  end if;
  v_operador_id := auth.uid();

  if p_tipo not in ('separacao', 'entrega') then
    raise exception 'tipo inválido: % (use separacao ou entrega)', p_tipo;
  end if;

  if p_tipo = 'separacao' then
    update pedidos set responsavel_separacao_id = p_funcionario_id where id = p_pedido_id;
  else
    update pedidos set responsavel_entrega_id = p_funcionario_id where id = p_pedido_id;
  end if;

  insert into pedidos_status_historico
    (pedido_id, status_anterior, status_novo, origem, operador_id, observacao)
  select id, status, status, 'atribuicao_responsavel', v_operador_id,
         format('Responsável de %s atribuído', p_tipo)
  from pedidos where id = p_pedido_id;

  select * into v_pedido from pedidos where id = p_pedido_id;
  if not found then
    raise exception 'Pedido % não encontrado', p_pedido_id;
  end if;
  return v_pedido;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_status_orcamento(p_orcamento_id uuid, p_novo_status status_orcamento, p_origem text)
 RETURNS orcamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_orc    orcamentos;
  v_atual  status_orcamento;
  v_ok     boolean;
begin
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem alterar o status de um orçamento';
  end if;

  select * into v_orc from orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento % não encontrado', p_orcamento_id;
  end if;

  v_atual := v_orc.status;
  v_ok := case v_atual
    when 'rascunho' then p_novo_status in ('enviado', 'recusado', 'aceito')
    when 'enviado'  then p_novo_status in ('aceito', 'recusado', 'expirado')
    else false
  end;

  if not v_ok then
    raise exception 'Transição de orçamento inválida: % -> %', v_atual, p_novo_status;
  end if;

  update orcamentos set status = p_novo_status where id = p_orcamento_id;

  insert into orcamentos_status_historico
    (orcamento_id, status_anterior, status_novo, origem)
  values
    (p_orcamento_id, v_atual, p_novo_status, p_origem);

  select * into v_orc from orcamentos where id = p_orcamento_id;
  return v_orc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_status_orcamento_dashboard(p_orcamento_id uuid, p_novo_status status_orcamento, p_operador_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS orcamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_orc orcamentos;
  v_operador_id uuid;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem atualizar o status de um orçamento';
  end if;
  v_operador_id := auth.uid();

  v_orc := atualizar_status_orcamento(p_orcamento_id, p_novo_status, 'dashboard:' || v_operador_id::text);

  update orcamentos_status_historico set operador_id = v_operador_id, observacao = p_observacao
  where id = (
    select id from orcamentos_status_historico
    where orcamento_id = p_orcamento_id
    order by criado_em desc limit 1
  );

  return v_orc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_status_pedido(p_pedido_id uuid, p_novo_status status_pedido, p_origem text)
 RETURNS pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_status_pedido_dashboard(p_pedido_id uuid, p_novo_status status_pedido, p_operador_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido pedidos;
  v_operador_id uuid;
begin
  if eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos podem atualizar o status de um pedido';
  end if;
  v_operador_id := auth.uid();

  v_pedido := atualizar_status_pedido(p_pedido_id, p_novo_status, 'dashboard:' || v_operador_id::text);

  update pedidos_status_historico set operador_id = v_operador_id, observacao = p_observacao
  where id = (
    select id from pedidos_status_historico
    where pedido_id = p_pedido_id
    order by criado_em desc limit 1
  );

  update pedidos set operador_id = v_operador_id where id = p_pedido_id;

  select * into v_pedido from pedidos where id = p_pedido_id;
  return v_pedido;
end;
$function$;

CREATE OR REPLACE FUNCTION public.buscar_produto_fuzzy(p_nome text, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, nome text, preco numeric, estoque integer, similaridade real)
 LANGUAGE sql
 STABLE
AS $function$
  select p.id, p.nome, p.preco, p.estoque, similarity(p.nome, p_nome) as similaridade
  from produtos p
  where p.ativo and (p.nome % p_nome or exists (
    select 1 from unnest(p.aliases) a where a % p_nome
  ))
  order by similaridade desc
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_entrega(p_solicitacao_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS solicitacoes_entrega
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_separacao(p_solicitacao_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS solicitacoes_separacao
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.cliente_tem_cadastro_completo(p_cliente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select case
    when tem_cadastro_previo then (cpf is not null or cnpj is not null)
    when tipo_pessoa = 'PF' then cpf is not null
    when tipo_pessoa = 'PJ' then
      cnpj is not null and razao_social is not null and indicador_ie is not null
      and (indicador_ie <> 'contribuinte' or inscricao_estadual is not null)
    else false
  end
  from clientes where id = p_cliente_id;
$function$;

CREATE OR REPLACE FUNCTION public.concluir_entrega(p_solicitacao_id uuid)
 RETURNS solicitacoes_entrega
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.concluir_separacao(p_solicitacao_id uuid)
 RETURNS solicitacoes_separacao
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.consultar_status_pedido_cliente(p_cliente_id uuid)
 RETURNS TABLE(protocolo text, status_mensagem text, forma_entrega text, criado_em timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select
    p.protocolo,
    case
      when p.status = 'confirmado' then 'Recebemos o pedido e já estamos preparando tudo.'
      when p.status = 'em_separacao' then 'O pedido está sendo separado pela nossa equipe agora.'
      when p.status = 'pronto' and p.forma_entrega = 'retirada' and p.pronto_para_retirada_em is not null then 'O pedido já está separado e pronto para retirada na loja!'
      when p.status = 'pronto' and p.forma_entrega <> 'retirada' and p.saiu_para_entrega_em is not null then 'O pedido já saiu para entrega.'
      when p.status = 'pronto' then 'O pedido já foi separado e está pronto pra despacho.'
      when p.status = 'concluido' then 'Esse pedido já foi finalizado.'
      when p.status = 'cancelado' then 'Esse pedido foi cancelado.'
      else 'Não consegui identificar o status certo agora.'
    end as status_mensagem,
    p.forma_entrega,
    p.criado_em
  from pedidos p
  where p.cliente_id = p_cliente_id
  order by p.criado_em desc
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.criar_orcamento_com_itens_tx(p_cliente_id uuid, p_conversa_id uuid, p_tipo tipo_pedido, p_escola_id uuid, p_observacoes text, p_itens jsonb)
 RETURNS orcamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_orc orcamentos;
begin
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem criar orçamentos por esta via';
  end if;

  insert into orcamentos
    (cliente_id, conversa_id, tipo, escola_id, observacoes)
  values
    (p_cliente_id, p_conversa_id, p_tipo, p_escola_id, p_observacoes)
  returning * into v_orc;

  if p_itens is not null and jsonb_array_length(p_itens) > 0 then
    insert into itens_orcamento
      (orcamento_id, produto_id, descricao_livre, quantidade, valor_unitario)
    select
      v_orc.id,
      nullif(item->>'produto_id', '')::uuid,
      item->>'descricao_livre',
      (item->>'quantidade')::numeric,
      (item->>'valor_unitario')::numeric
    from jsonb_array_elements(p_itens) as item;
  end if;

  select * into v_orc from orcamentos where id = v_orc.id;
  return v_orc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delegar_entrega(p_pedido_id uuid, p_entregador_id uuid, p_horario_previsto timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS solicitacoes_entrega
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.delegar_separacao(p_pedido_id uuid, p_separador_id uuid, p_prioridade text, p_horario_retirada timestamp with time zone DEFAULT NULL::timestamp with time zone, p_observacao text DEFAULT NULL::text)
 RETURNS solicitacoes_separacao
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.distribuir_conversa_automatica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_operador_id uuid;
begin
  if new.bot_ativo = false and new.operador_id is null then
    select o.id into v_operador_id
    from operadores o
    where o.ativo = true
      and o.ultimo_heartbeat > now() - interval '90 seconds'
    order by (
      select count(*) from conversas c2
      where c2.operador_id = o.id
        and c2.status not in ('finalizado', 'cancelado')
    ) asc
    limit 1;

    if v_operador_id is not null then
      new.operador_id := v_operador_id;
      new.status := 'aguardando_operador';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.eh_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select coalesce((select papel = 'admin' from operadores where id = auth.uid() and ativo), false);
$function$;

CREATE OR REPLACE FUNCTION public.eh_entregador_ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from funcionarios
    where auth_user_id = auth.uid() and ativo and 'entrega' = any(papeis)
  );
$function$;

CREATE OR REPLACE FUNCTION public.eh_operador_ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (select 1 from operadores where id = auth.uid() and ativo);
$function$;

CREATE OR REPLACE FUNCTION public.eh_separador_ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from funcionarios
    where auth_user_id = auth.uid() and ativo and 'separacao' = any(papeis)
  );
$function$;

CREATE OR REPLACE FUNCTION public.empresa_id_padrao()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select id from empresa limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.enviar_mensagem_separacao(p_solicitacao_id uuid, p_texto text)
 RETURNS solicitacoes_separacao_mensagens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.expirar_consultas_operacionais()
 RETURNS void
 LANGUAGE sql
AS $function$
  update consultas_operacionais
  set status = 'expirada'
  where status in ('pendente', 'atribuida') and expira_em < now();
$function$;

CREATE OR REPLACE FUNCTION public.funcionario_atual_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from funcionarios where auth_user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.gerar_protocolo(prefixo text DEFAULT 'VEN'::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
begin
  return prefixo || '-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('protocolo_seq')::text, 4, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_activity_feed(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, tipo_evento text, entidade_tipo text, entidade_id uuid, ator_tipo text, ator_id uuid, ator_nome text, descricao text, payload jsonb, criado_em timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select e.id, e.tipo_evento, e.entidade_tipo, e.entidade_id, e.ator_tipo, e.ator_id,
    o.nome as ator_nome, e.descricao, e.payload, e.criado_em
  from eventos e
  left join operadores o on o.id = e.ator_id
  order by e.criado_em desc
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_metricas_comerciais()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_oportunidades_perdidas(p_dias integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(produto_nome text, total bigint, ultima_consulta timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select produto_nome, count(*) as total, max(criado_em) as ultima_consulta
  from consultas_demanda
  where criado_em >= now() - (p_dias || ' days')::interval
    and resultado in ('nao_encontrado', 'sem_estoque')
  group by produto_nome
  order by total desc
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_top_demanda(p_dias integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(produto_nome text, total_consultas bigint, sem_estoque_count bigint, converteu_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select produto_nome, count(*) as total_consultas,
    count(*) filter (where resultado = 'sem_estoque') as sem_estoque_count,
    count(*) filter (where converteu) as converteu_count
  from consultas_demanda
  where criado_em >= now() - (p_dias || ' days')::interval
  group by produto_nome
  order by total_consultas desc
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.iniciar_rota(p_solicitacao_id uuid)
 RETURNS solicitacoes_entrega
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.liberar_conversa_dashboard(p_conversa_id uuid)
 RETURNS conversas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conversa conversas;
begin
  if not eh_operador_ativo() then
    raise exception 'Apenas operadores ativos podem liberar conversas.';
  end if;

  update conversas
     set operador_id = null,
         bot_ativo = true,
         status = 'aguardando_cliente',
         ultima_interacao_em = now()
   where id = p_conversa_id
     and (operador_id = auth.uid() or eh_admin())
  returning * into v_conversa;

  if v_conversa.id is null then
    raise exception 'Conversa não encontrada ou não pertence a você.';
  end if;

  return v_conversa;
end;
$function$;

CREATE OR REPLACE FUNCTION public.marcar_item_separado_solicitacao(p_solicitacao_item_id uuid, p_separado boolean)
 RETURNS solicitacoes_separacao_itens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.marcar_notificacao_lida(p_id uuid)
 RETURNS notificacoes_internas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.marcar_pronto_retirada_pedido(p_pedido_id uuid)
 RETURNS pedidos
 LANGUAGE sql
AS $function$
  update pedidos set pronto_para_retirada_em = now()
  where id = p_pedido_id and status = 'pronto' and forma_entrega = 'retirada'
  returning *;
$function$;

CREATE OR REPLACE FUNCTION public.marcar_saiu_entrega_pedido(p_pedido_id uuid)
 RETURNS pedidos
 LANGUAGE sql
AS $function$
  update pedidos set saiu_para_entrega_em = now()
  where id = p_pedido_id and status = 'pronto' and forma_entrega in ('entrega_propria', 'uber_flash')
  returning *;
$function$;

CREATE OR REPLACE FUNCTION public.match_produtos_documentos(query_embedding vector, match_count integer DEFAULT NULL::integer, filter jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    pd.id,
    pd.content,
    pd.metadata,
    1 - (pd.embedding <=> query_embedding) as similarity
  from produtos_documentos pd
  where pd.metadata @> filter
  order by pd.embedding <=> query_embedding
  limit match_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.orcamento_ativo_cliente(p_cliente_id uuid)
 RETURNS orcamentos
 LANGUAGE sql
 STABLE
AS $function$
  select * from orcamentos
  where cliente_id = p_cliente_id and status in ('rascunho', 'enviado')
  order by criado_em desc limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.pedido_ativo_cliente(p_cliente_id uuid)
 RETURNS pedidos
 LANGUAGE sql
 STABLE
AS $function$
  select * from pedidos
  where cliente_id = p_cliente_id and status not in ('concluido', 'cancelado')
  order by criado_em desc limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.preencher_nome_item()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.nome_item is null then
    new.nome_item := coalesce(new.descricao_livre, (select nome from produtos where id = new.produto_id));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.produtos_pendentes_embedding(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, nome text, preco numeric, aliases text[])
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.nome, p.preco, p.aliases
  from produtos p
  where p.ativo = true
    and not exists (
      select 1 from produtos_documentos pd
      where pd.metadata ->> 'produto_id' = p.id::text
    )
  order by p.id
  limit p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.recalcular_valor_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.recalcular_valor_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.registrar_demanda_produto(p_produto_nome text, p_produto_id uuid, p_cliente_id uuid, p_conversa_id uuid, p_origem text, p_resultado text)
 RETURNS consultas_demanda
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.registrar_evento_consulta_operacional()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

CREATE OR REPLACE FUNCTION public.registrar_evento_entrega()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

CREATE OR REPLACE FUNCTION public.registrar_evento_ocorrencia()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

CREATE OR REPLACE FUNCTION public.registrar_evento_orcamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

CREATE OR REPLACE FUNCTION public.registrar_evento_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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

CREATE OR REPLACE FUNCTION public.registrar_heartbeat_operador()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update operadores set ultimo_heartbeat = now() where id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.registrar_insucesso_entrega(p_solicitacao_id uuid, p_motivo text)
 RETURNS solicitacoes_entrega
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.resolver_ocorrencia(p_ocorrencia_id uuid, p_resolucao_texto text)
 RETURNS ocorrencias
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.separacao_rapida(p_pedido_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS solicitacoes_separacao
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.set_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.atualizado_em = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_preview_ultima_mensagem()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update conversas
  set ultima_mensagem_preview = left(coalesce(new.conteudo, ''), 200)
  where id = new.conversa_id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.verificar_alertas_demanda()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$;


-- =====================================================================
-- 7. VIEWS
-- =====================================================================

create or replace view v_clientes_crm with (security_invoker=true) as
 SELECT c.id,
    c.telefone,
    c.nome,
    c.criado_em,
    c.atualizado_em,
    c.empresa_id,
    c.tipo_pessoa,
    c.razao_social,
    c.cnpj,
    c.endereco,
    c.tem_cadastro_previo,
    c.cpf,
    c.nome_fantasia,
    c.indicador_ie,
    c.inscricao_estadual,
    c.cep,
    c.cidade,
    c.estado,
    c.telefone_contato,
    c.observacoes,
    c.origem,
    c.status,
    count(p.id) AS qtd_pedidos,
    count(p.id) FILTER (WHERE p.status = 'concluido'::status_pedido) AS qtd_finalizados,
    count(p.id) FILTER (WHERE p.status = 'cancelado'::status_pedido) AS qtd_cancelados,
    COALESCE(sum(p.valor_total) FILTER (WHERE p.status = 'concluido'::status_pedido), 0::numeric) AS total_gasto,
    COALESCE(avg(p.valor_total) FILTER (WHERE p.status = 'concluido'::status_pedido), 0::numeric) AS ticket_medio,
    max(p.criado_em) FILTER (WHERE p.status = 'concluido'::status_pedido) AS ultima_compra_em,
    max(p.criado_em) AS ultimo_pedido_em,
    count(o.id) AS qtd_orcamentos,
    count(o.id) FILTER (WHERE o.status = 'aceito'::status_orcamento) AS qtd_orcamentos_aceitos
   FROM clientes c
     LEFT JOIN pedidos p ON p.cliente_id = c.id
     LEFT JOIN orcamentos o ON o.cliente_id = c.id
  GROUP BY c.id;


-- =====================================================================
-- 8. TRIGGERS
-- =====================================================================

drop trigger if exists trg_alertas_demanda_atualizado_em on alertas_demanda;
CREATE TRIGGER trg_alertas_demanda_atualizado_em BEFORE UPDATE ON public.alertas_demanda FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_clientes_atualizado_em on clientes;
CREATE TRIGGER trg_clientes_atualizado_em BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_config_alerta_demanda_atualizado_em on config_alerta_demanda;
CREATE TRIGGER trg_config_alerta_demanda_atualizado_em BEFORE UPDATE ON public.config_alerta_demanda FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_configuracoes_atualizado_em on configuracoes;
CREATE TRIGGER trg_configuracoes_atualizado_em BEFORE UPDATE ON public.configuracoes FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_consultas_operacionais_atualizado_em on consultas_operacionais;
CREATE TRIGGER trg_consultas_operacionais_atualizado_em BEFORE UPDATE ON public.consultas_operacionais FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_eventos_consulta_operacional on consultas_operacionais;
CREATE TRIGGER trg_eventos_consulta_operacional AFTER INSERT OR UPDATE ON public.consultas_operacionais FOR EACH ROW EXECUTE FUNCTION registrar_evento_consulta_operacional();
drop trigger if exists trg_distribuir_conversa on conversas;
CREATE TRIGGER trg_distribuir_conversa BEFORE INSERT OR UPDATE ON public.conversas FOR EACH ROW EXECUTE FUNCTION distribuir_conversa_automatica();
drop trigger if exists trg_funcionarios_atualizado_em on funcionarios;
CREATE TRIGGER trg_funcionarios_atualizado_em BEFORE UPDATE ON public.funcionarios FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_itens_orcamento_nome_item on itens_orcamento;
CREATE TRIGGER trg_itens_orcamento_nome_item BEFORE INSERT ON public.itens_orcamento FOR EACH ROW EXECUTE FUNCTION preencher_nome_item();
drop trigger if exists trg_itens_orcamento_recalcular on itens_orcamento;
CREATE TRIGGER trg_itens_orcamento_recalcular AFTER INSERT OR DELETE OR UPDATE ON public.itens_orcamento FOR EACH ROW EXECUTE FUNCTION recalcular_valor_orcamento();
drop trigger if exists trg_itens_pedido_nome_item on itens_pedido;
CREATE TRIGGER trg_itens_pedido_nome_item BEFORE INSERT ON public.itens_pedido FOR EACH ROW EXECUTE FUNCTION preencher_nome_item();
drop trigger if exists trg_itens_pedido_recalcular on itens_pedido;
CREATE TRIGGER trg_itens_pedido_recalcular AFTER INSERT OR DELETE OR UPDATE ON public.itens_pedido FOR EACH ROW EXECUTE FUNCTION recalcular_valor_pedido();
drop trigger if exists trg_memoria_produtos_atualizado_em on memoria_produtos;
CREATE TRIGGER trg_memoria_produtos_atualizado_em BEFORE UPDATE ON public.memoria_produtos FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_mensagens_preview on mensagens;
CREATE TRIGGER trg_mensagens_preview AFTER INSERT ON public.mensagens FOR EACH ROW EXECUTE FUNCTION set_preview_ultima_mensagem();
drop trigger if exists trg_eventos_ocorrencia on ocorrencias;
CREATE TRIGGER trg_eventos_ocorrencia AFTER INSERT OR UPDATE ON public.ocorrencias FOR EACH ROW EXECUTE FUNCTION registrar_evento_ocorrencia();
drop trigger if exists trg_operadores_atualizado_em on operadores;
CREATE TRIGGER trg_operadores_atualizado_em BEFORE UPDATE ON public.operadores FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_orcamentos_atualizado_em on orcamentos;
CREATE TRIGGER trg_orcamentos_atualizado_em BEFORE UPDATE ON public.orcamentos FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_eventos_orcamento on orcamentos_status_historico;
CREATE TRIGGER trg_eventos_orcamento AFTER INSERT OR UPDATE ON public.orcamentos_status_historico FOR EACH ROW EXECUTE FUNCTION registrar_evento_orcamento();
drop trigger if exists trg_pedidos_atualizado_em on pedidos;
CREATE TRIGGER trg_pedidos_atualizado_em BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_eventos_pedido on pedidos_status_historico;
CREATE TRIGGER trg_eventos_pedido AFTER INSERT OR UPDATE ON public.pedidos_status_historico FOR EACH ROW EXECUTE FUNCTION registrar_evento_pedido();
drop trigger if exists trg_produtos_atualizado_em on produtos;
CREATE TRIGGER trg_produtos_atualizado_em BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_eventos_entrega on solicitacoes_entrega;
CREATE TRIGGER trg_eventos_entrega AFTER INSERT OR UPDATE ON public.solicitacoes_entrega FOR EACH ROW EXECUTE FUNCTION registrar_evento_entrega();
drop trigger if exists trg_solic_entrega_atualizado_em on solicitacoes_entrega;
CREATE TRIGGER trg_solic_entrega_atualizado_em BEFORE UPDATE ON public.solicitacoes_entrega FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_solic_sep_atualizado_em on solicitacoes_separacao;
CREATE TRIGGER trg_solic_sep_atualizado_em BEFORE UPDATE ON public.solicitacoes_separacao FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
drop trigger if exists trg_templates_mensagem_atualizado_em on templates_mensagem;
CREATE TRIGGER trg_templates_mensagem_atualizado_em BEFORE UPDATE ON public.templates_mensagem FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- =====================================================================
-- 9. ROW LEVEL SECURITY — enable + policies (NÃO PULE ESTA SEÇÃO)
-- =====================================================================

-- Sem esta seção o banco fica com as tabelas ABERTAS. Foi exatamente o
-- risco do Bloqueador B6: schema versionado sem as policies reais.

alter table alertas_demanda enable row level security;
alter table categorias enable row level security;
alter table clientes enable row level security;
alter table config_alerta_demanda enable row level security;
alter table configuracoes enable row level security;
alter table confirmacoes_produto enable row level security;
alter table consultas_demanda enable row level security;
alter table consultas_operacionais enable row level security;
alter table conversas enable row level security;
alter table empresa enable row level security;
alter table escolas enable row level security;
alter table eventos enable row level security;
alter table followups enable row level security;
alter table funcionarios enable row level security;
alter table itens_orcamento enable row level security;
alter table itens_pedido enable row level security;
alter table marcas enable row level security;
alter table materiais_lista_escolar enable row level security;
alter table memoria_produtos enable row level security;
alter table memorias enable row level security;
alter table mensagens enable row level security;
alter table notificacoes enable row level security;
alter table notificacoes_internas enable row level security;
alter table ocorrencias enable row level security;
alter table operadores enable row level security;
alter table orcamentos enable row level security;
alter table orcamentos_status_historico enable row level security;
alter table pedidos enable row level security;
alter table pedidos_status_historico enable row level security;
alter table produtos enable row level security;
alter table produtos_documentos enable row level security;
alter table produtos_relacionados enable row level security;
alter table solicitacoes_entrega enable row level security;
alter table solicitacoes_separacao enable row level security;
alter table solicitacoes_separacao_itens enable row level security;
alter table solicitacoes_separacao_mensagens enable row level security;
alter table taxas_entrega_bairro enable row level security;
alter table templates_mensagem enable row level security;

drop policy if exists "admin_exclusao" on alertas_demanda;
create policy "admin_exclusao" on alertas_demanda as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on alertas_demanda;
create policy "operadores_atualizacao" on alertas_demanda as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on alertas_demanda;
create policy "operadores_escrita" on alertas_demanda as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on alertas_demanda;
create policy "operadores_leitura" on alertas_demanda as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on alertas_demanda;
create policy "service_role_full_access" on alertas_demanda as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on categorias;
create policy "admin_exclusao" on categorias as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on categorias;
create policy "operadores_atualizacao" on categorias as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on categorias;
create policy "operadores_escrita" on categorias as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on categorias;
create policy "operadores_leitura" on categorias as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on categorias;
create policy "service_role_full_access" on categorias as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on clientes;
create policy "admin_exclusao" on clientes as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "funcionarios_leem_clientes_atribuidos" on clientes;
create policy "funcionarios_leem_clientes_atribuidos" on clientes as permissive
  for select to public
  using ((EXISTS ( SELECT 1
   FROM pedidos p
  WHERE ((p.cliente_id = clientes.id) AND ((EXISTS ( SELECT 1
           FROM solicitacoes_separacao s
          WHERE ((s.pedido_id = p.id) AND (s.separador_id = funcionario_atual_id())))) OR (EXISTS ( SELECT 1
           FROM solicitacoes_entrega e
          WHERE ((e.pedido_id = p.id) AND (e.entregador_id = funcionario_atual_id())))))))));
drop policy if exists "operadores_atualizacao" on clientes;
create policy "operadores_atualizacao" on clientes as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on clientes;
create policy "operadores_escrita" on clientes as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on clientes;
create policy "operadores_leitura" on clientes as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on clientes;
create policy "service_role_full_access" on clientes as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on config_alerta_demanda;
create policy "admin_exclusao" on config_alerta_demanda as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on config_alerta_demanda;
create policy "operadores_atualizacao" on config_alerta_demanda as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on config_alerta_demanda;
create policy "operadores_escrita" on config_alerta_demanda as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on config_alerta_demanda;
create policy "operadores_leitura" on config_alerta_demanda as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on config_alerta_demanda;
create policy "service_role_full_access" on config_alerta_demanda as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on configuracoes;
create policy "admin_exclusao" on configuracoes as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on configuracoes;
create policy "operadores_atualizacao" on configuracoes as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on configuracoes;
create policy "operadores_escrita" on configuracoes as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on configuracoes;
create policy "operadores_leitura" on configuracoes as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on configuracoes;
create policy "service_role_full_access" on configuracoes as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on confirmacoes_produto;
create policy "admin_exclusao" on confirmacoes_produto as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on confirmacoes_produto;
create policy "operadores_atualizacao" on confirmacoes_produto as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on confirmacoes_produto;
create policy "operadores_escrita" on confirmacoes_produto as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on confirmacoes_produto;
create policy "operadores_leitura" on confirmacoes_produto as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on confirmacoes_produto;
create policy "service_role_full_access" on confirmacoes_produto as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on consultas_demanda;
create policy "admin_exclusao" on consultas_demanda as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on consultas_demanda;
create policy "operadores_atualizacao" on consultas_demanda as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on consultas_demanda;
create policy "operadores_escrita" on consultas_demanda as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on consultas_demanda;
create policy "operadores_leitura" on consultas_demanda as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on consultas_demanda;
create policy "service_role_full_access" on consultas_demanda as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on consultas_operacionais;
create policy "admin_exclusao" on consultas_operacionais as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on consultas_operacionais;
create policy "operadores_atualizacao" on consultas_operacionais as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on consultas_operacionais;
create policy "operadores_escrita" on consultas_operacionais as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on consultas_operacionais;
create policy "operadores_leitura" on consultas_operacionais as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on consultas_operacionais;
create policy "service_role_full_access" on consultas_operacionais as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on conversas;
create policy "admin_exclusao" on conversas as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on conversas;
create policy "operadores_atualizacao" on conversas as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on conversas;
create policy "operadores_escrita" on conversas as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on conversas;
create policy "operadores_leitura" on conversas as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on conversas;
create policy "service_role_full_access" on conversas as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "service_role_full_access" on empresa;
create policy "service_role_full_access" on empresa as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "service_role_full_access" on escolas;
create policy "service_role_full_access" on escolas as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on eventos;
create policy "admin_exclusao" on eventos as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_leitura" on eventos;
create policy "operadores_leitura" on eventos as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on eventos;
create policy "service_role_full_access" on eventos as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "service_role_full_access" on followups;
create policy "service_role_full_access" on followups as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on funcionarios;
create policy "admin_exclusao" on funcionarios as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on funcionarios;
create policy "operadores_atualizacao" on funcionarios as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on funcionarios;
create policy "operadores_escrita" on funcionarios as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on funcionarios;
create policy "operadores_leitura" on funcionarios as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "separador_le_a_si_mesmo" on funcionarios;
create policy "separador_le_a_si_mesmo" on funcionarios as permissive
  for select to public
  using ((auth_user_id = auth.uid()));
drop policy if exists "service_role_full_access" on funcionarios;
create policy "service_role_full_access" on funcionarios as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on itens_orcamento;
create policy "admin_exclusao" on itens_orcamento as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on itens_orcamento;
create policy "operadores_atualizacao" on itens_orcamento as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on itens_orcamento;
create policy "operadores_escrita" on itens_orcamento as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on itens_orcamento;
create policy "operadores_leitura" on itens_orcamento as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on itens_orcamento;
create policy "service_role_full_access" on itens_orcamento as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on itens_pedido;
create policy "admin_exclusao" on itens_pedido as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "funcionarios_leem_itens_pedido_atribuidos" on itens_pedido;
create policy "funcionarios_leem_itens_pedido_atribuidos" on itens_pedido as permissive
  for select to public
  using (((EXISTS ( SELECT 1
   FROM solicitacoes_separacao s
  WHERE ((s.pedido_id = itens_pedido.pedido_id) AND (s.separador_id = funcionario_atual_id())))) OR (EXISTS ( SELECT 1
   FROM solicitacoes_entrega e
  WHERE ((e.pedido_id = itens_pedido.pedido_id) AND (e.entregador_id = funcionario_atual_id()))))));
drop policy if exists "operadores_atualizacao" on itens_pedido;
create policy "operadores_atualizacao" on itens_pedido as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on itens_pedido;
create policy "operadores_escrita" on itens_pedido as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on itens_pedido;
create policy "operadores_leitura" on itens_pedido as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on itens_pedido;
create policy "service_role_full_access" on itens_pedido as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on marcas;
create policy "admin_exclusao" on marcas as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on marcas;
create policy "operadores_atualizacao" on marcas as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on marcas;
create policy "operadores_escrita" on marcas as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on marcas;
create policy "operadores_leitura" on marcas as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on marcas;
create policy "service_role_full_access" on marcas as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "service_role_full_access" on materiais_lista_escolar;
create policy "service_role_full_access" on materiais_lista_escolar as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on memoria_produtos;
create policy "admin_exclusao" on memoria_produtos as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on memoria_produtos;
create policy "operadores_atualizacao" on memoria_produtos as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on memoria_produtos;
create policy "operadores_escrita" on memoria_produtos as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on memoria_produtos;
create policy "operadores_leitura" on memoria_produtos as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on memoria_produtos;
create policy "service_role_full_access" on memoria_produtos as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "service_role_full_access" on memorias;
create policy "service_role_full_access" on memorias as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on mensagens;
create policy "admin_exclusao" on mensagens as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on mensagens;
create policy "operadores_atualizacao" on mensagens as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on mensagens;
create policy "operadores_escrita" on mensagens as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on mensagens;
create policy "operadores_leitura" on mensagens as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on mensagens;
create policy "service_role_full_access" on mensagens as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on notificacoes;
create policy "admin_exclusao" on notificacoes as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on notificacoes;
create policy "operadores_atualizacao" on notificacoes as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on notificacoes;
create policy "operadores_escrita" on notificacoes as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on notificacoes;
create policy "operadores_leitura" on notificacoes as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on notificacoes;
create policy "service_role_full_access" on notificacoes as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "leitura_notificacoes_internas" on notificacoes_internas;
create policy "leitura_notificacoes_internas" on notificacoes_internas as permissive
  for select to public
  using ((((destinatario_tipo = 'operador'::text) AND eh_operador_ativo() AND (destinatario_operador_id = auth.uid())) OR ((destinatario_tipo = 'separador'::text) AND (destinatario_funcionario_id = funcionario_atual_id()))));
drop policy if exists "service_role_full_access" on notificacoes_internas;
create policy "service_role_full_access" on notificacoes_internas as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "leitura_ocorrencias" on ocorrencias;
create policy "leitura_ocorrencias" on ocorrencias as permissive
  for select to public
  using ((eh_operador_ativo() OR (criado_por_funcionario_id = funcionario_atual_id()) OR (EXISTS ( SELECT 1
   FROM solicitacoes_separacao s
  WHERE ((s.id = ocorrencias.solicitacao_separacao_id) AND (s.separador_id = funcionario_atual_id())))) OR (EXISTS ( SELECT 1
   FROM solicitacoes_entrega e
  WHERE ((e.id = ocorrencias.solicitacao_entrega_id) AND (e.entregador_id = funcionario_atual_id()))))));
drop policy if exists "service_role_full_access" on ocorrencias;
create policy "service_role_full_access" on ocorrencias as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_gerencia_operadores" on operadores;
create policy "admin_gerencia_operadores" on operadores as permissive
  for all to public
  using (eh_admin())
  with check (eh_admin());
drop policy if exists "operadores_leem_a_si_mesmos" on operadores;
create policy "operadores_leem_a_si_mesmos" on operadores as permissive
  for select to public
  using (((auth.uid() = id) OR eh_admin()));
drop policy if exists "service_role_full_access" on operadores;
create policy "service_role_full_access" on operadores as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on orcamentos;
create policy "admin_exclusao" on orcamentos as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on orcamentos;
create policy "operadores_atualizacao" on orcamentos as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on orcamentos;
create policy "operadores_escrita" on orcamentos as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on orcamentos;
create policy "operadores_leitura" on orcamentos as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on orcamentos;
create policy "service_role_full_access" on orcamentos as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "operadores_leitura" on orcamentos_status_historico;
create policy "operadores_leitura" on orcamentos_status_historico as permissive
  for select to authenticated
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on orcamentos_status_historico;
create policy "service_role_full_access" on orcamentos_status_historico as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on pedidos;
create policy "admin_exclusao" on pedidos as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "funcionarios_leem_pedidos_atribuidos" on pedidos;
create policy "funcionarios_leem_pedidos_atribuidos" on pedidos as permissive
  for select to public
  using (((EXISTS ( SELECT 1
   FROM solicitacoes_separacao s
  WHERE ((s.pedido_id = pedidos.id) AND (s.separador_id = funcionario_atual_id())))) OR (EXISTS ( SELECT 1
   FROM solicitacoes_entrega e
  WHERE ((e.pedido_id = pedidos.id) AND (e.entregador_id = funcionario_atual_id()))))));
drop policy if exists "operadores_atualizacao" on pedidos;
create policy "operadores_atualizacao" on pedidos as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_leitura" on pedidos;
create policy "operadores_leitura" on pedidos as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on pedidos;
create policy "service_role_full_access" on pedidos as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "operadores_leitura" on pedidos_status_historico;
create policy "operadores_leitura" on pedidos_status_historico as permissive
  for select to authenticated
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on pedidos_status_historico;
create policy "service_role_full_access" on pedidos_status_historico as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "admin_exclusao" on produtos;
create policy "admin_exclusao" on produtos as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on produtos;
create policy "operadores_atualizacao" on produtos as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on produtos;
create policy "operadores_escrita" on produtos as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on produtos;
create policy "operadores_leitura" on produtos as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on produtos;
create policy "service_role_full_access" on produtos as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "operadores leem produtos_documentos" on produtos_documentos;
create policy "operadores leem produtos_documentos" on produtos_documentos as permissive
  for select to authenticated
  using (eh_operador_ativo());
drop policy if exists "admin_exclusao" on produtos_relacionados;
create policy "admin_exclusao" on produtos_relacionados as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on produtos_relacionados;
create policy "operadores_atualizacao" on produtos_relacionados as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on produtos_relacionados;
create policy "operadores_escrita" on produtos_relacionados as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on produtos_relacionados;
create policy "operadores_leitura" on produtos_relacionados as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on produtos_relacionados;
create policy "service_role_full_access" on produtos_relacionados as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "leitura_solicitacoes_entrega" on solicitacoes_entrega;
create policy "leitura_solicitacoes_entrega" on solicitacoes_entrega as permissive
  for select to public
  using ((eh_operador_ativo() OR (entregador_id = funcionario_atual_id())));
drop policy if exists "service_role_full_access" on solicitacoes_entrega;
create policy "service_role_full_access" on solicitacoes_entrega as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "leitura_solicitacoes_separacao" on solicitacoes_separacao;
create policy "leitura_solicitacoes_separacao" on solicitacoes_separacao as permissive
  for select to public
  using ((eh_operador_ativo() OR (separador_id = funcionario_atual_id())));
drop policy if exists "service_role_full_access" on solicitacoes_separacao;
create policy "service_role_full_access" on solicitacoes_separacao as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "leitura_solicitacoes_separacao_itens" on solicitacoes_separacao_itens;
create policy "leitura_solicitacoes_separacao_itens" on solicitacoes_separacao_itens as permissive
  for select to public
  using ((EXISTS ( SELECT 1
   FROM solicitacoes_separacao s
  WHERE ((s.id = solicitacoes_separacao_itens.solicitacao_id) AND (eh_operador_ativo() OR (s.separador_id = funcionario_atual_id()))))));
drop policy if exists "service_role_full_access" on solicitacoes_separacao_itens;
create policy "service_role_full_access" on solicitacoes_separacao_itens as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "leitura_solicitacoes_separacao_mensagens" on solicitacoes_separacao_mensagens;
create policy "leitura_solicitacoes_separacao_mensagens" on solicitacoes_separacao_mensagens as permissive
  for select to public
  using ((EXISTS ( SELECT 1
   FROM solicitacoes_separacao s
  WHERE ((s.id = solicitacoes_separacao_mensagens.solicitacao_id) AND (eh_operador_ativo() OR (s.separador_id = funcionario_atual_id()))))));
drop policy if exists "service_role_full_access" on solicitacoes_separacao_mensagens;
create policy "service_role_full_access" on solicitacoes_separacao_mensagens as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));
drop policy if exists "operadores leem taxas_entrega_bairro" on taxas_entrega_bairro;
create policy "operadores leem taxas_entrega_bairro" on taxas_entrega_bairro as permissive
  for select to authenticated
  using (eh_operador_ativo());
drop policy if exists "admin_exclusao" on templates_mensagem;
create policy "admin_exclusao" on templates_mensagem as permissive
  for delete to public
  using (eh_admin());
drop policy if exists "operadores_atualizacao" on templates_mensagem;
create policy "operadores_atualizacao" on templates_mensagem as permissive
  for update to public
  using (eh_operador_ativo());
drop policy if exists "operadores_escrita" on templates_mensagem;
create policy "operadores_escrita" on templates_mensagem as permissive
  for insert to public
  with check (eh_operador_ativo());
drop policy if exists "operadores_leitura" on templates_mensagem;
create policy "operadores_leitura" on templates_mensagem as permissive
  for select to public
  using (eh_operador_ativo());
drop policy if exists "service_role_full_access" on templates_mensagem;
create policy "service_role_full_access" on templates_mensagem as permissive
  for all to public
  using ((auth.role() = 'service_role'::text));

-- =====================================================================
-- 10. GRANTS / REVOKES (privilégio por role) — TÃO IMPORTANTE QUANTO A RLS
-- =====================================================================

-- A RLS filtra LINHA; o GRANT decide se o role pode sequer tocar no
-- objeto. Foi um GRANT sobrando (EXECUTE para `anon` em
-- `atualizar_status_pedido`) o problema P1 da auditoria de 25/08/2026.
-- Reconstruído aqui a partir de relacl/attacl/proacl reais de produção.

-- 10.1 Tabelas e views
revoke all on alertas_demanda from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on alertas_demanda to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on alertas_demanda to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on alertas_demanda to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on categorias from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on categorias to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on categorias to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on categorias to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on clientes from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on clientes to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on clientes to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on clientes to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on config_alerta_demanda from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on config_alerta_demanda to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on config_alerta_demanda to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on config_alerta_demanda to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on configuracoes from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on configuracoes to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on configuracoes to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on configuracoes to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on confirmacoes_produto from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on confirmacoes_produto to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on confirmacoes_produto to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on confirmacoes_produto to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on consultas_demanda from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on consultas_demanda to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on consultas_demanda to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on consultas_demanda to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on consultas_operacionais from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on consultas_operacionais to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on consultas_operacionais to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on consultas_operacionais to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on conversas from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on conversas to anon;
grant INSERT, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on conversas to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on conversas to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on empresa from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on empresa to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on empresa to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on empresa to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on escolas from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on escolas to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on escolas to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on escolas to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on eventos from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on eventos to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on eventos to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on eventos to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on followups from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on followups to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on followups to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on followups to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on funcionarios from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on funcionarios to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on funcionarios to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on funcionarios to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on itens_orcamento from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on itens_orcamento to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on itens_orcamento to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on itens_orcamento to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on itens_pedido from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on itens_pedido to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on itens_pedido to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on itens_pedido to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on marcas from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on marcas to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on marcas to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on marcas to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on materiais_lista_escolar from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on materiais_lista_escolar to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on materiais_lista_escolar to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on materiais_lista_escolar to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on memoria_produtos from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on memoria_produtos to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on memoria_produtos to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on memoria_produtos to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on memorias from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on memorias to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on memorias to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on memorias to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on mensagens from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on mensagens to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on mensagens to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on mensagens to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on notificacoes from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on notificacoes to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on notificacoes to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on notificacoes to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on notificacoes_internas from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on notificacoes_internas to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on notificacoes_internas to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on notificacoes_internas to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on ocorrencias from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on ocorrencias to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on ocorrencias to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on ocorrencias to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on operadores from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on operadores to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on operadores to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on operadores to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on orcamentos from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on orcamentos to anon;
grant INSERT, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on orcamentos to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on orcamentos to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on orcamentos_status_historico from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on orcamentos_status_historico to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on orcamentos_status_historico to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on orcamentos_status_historico to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on pedidos from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on pedidos to anon;
grant INSERT, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on pedidos to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on pedidos to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on pedidos_status_historico from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on pedidos_status_historico to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on pedidos_status_historico to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on pedidos_status_historico to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on produtos from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on produtos to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on produtos to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on produtos to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on produtos_documentos from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on produtos_documentos to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on produtos_documentos to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on produtos_relacionados from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on produtos_relacionados to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on produtos_relacionados to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on produtos_relacionados to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on solicitacoes_entrega from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_entrega to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_entrega to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_entrega to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on solicitacoes_separacao from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_separacao to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_separacao to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_separacao to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on solicitacoes_separacao_itens from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_separacao_itens to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_separacao_itens to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_separacao_itens to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on solicitacoes_separacao_mensagens from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_separacao_mensagens to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_separacao_mensagens to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on solicitacoes_separacao_mensagens to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on taxas_entrega_bairro from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on taxas_entrega_bairro to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on taxas_entrega_bairro to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on templates_mensagem from anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on templates_mensagem to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on templates_mensagem to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on templates_mensagem to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
revoke all on v_clientes_crm from anon, authenticated, service_role;
grant INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on v_clientes_crm to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on v_clientes_crm to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on v_clientes_crm to service_role;
-- (fora dos roles de app) postgres: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN

-- 10.2 GRANTs de coluna — impedem UPDATE direto em colunas de status
--      (migração fix_pedidos_rls_update_e_restringe_colunas_status, 25/08).
--      Só a RPC *_dashboard pode mexer em `status`, preservando o histórico.
grant UPDATE (bot_ativo) on conversas to authenticated;
grant UPDATE (canal) on conversas to authenticated;
grant UPDATE (dados) on conversas to authenticated;
grant UPDATE (estado_atual) on conversas to authenticated;
grant UPDATE (intencao) on conversas to authenticated;
grant UPDATE (pausado_pos_pedido) on conversas to authenticated;
grant UPDATE (prioridade) on conversas to authenticated;
grant UPDATE (prioridade_score) on conversas to authenticated;
grant UPDATE (status) on conversas to authenticated;
grant UPDATE (tags) on conversas to authenticated;
grant UPDATE (ultima_interacao_em) on conversas to authenticated;
grant UPDATE (ultima_mensagem_id) on conversas to authenticated;
grant UPDATE (ultima_mensagem_preview) on conversas to authenticated;
grant UPDATE (observacoes) on orcamentos to authenticated;
grant UPDATE (operacao) on orcamentos to authenticated;
grant UPDATE (sequencia) on orcamentos to authenticated;
grant UPDATE (endereco_entrega) on pedidos to authenticated;
grant UPDATE (forma_entrega) on pedidos to authenticated;
grant UPDATE (operacao) on pedidos to authenticated;
grant UPDATE (sequencia) on pedidos to authenticated;

-- 10.3 EXECUTE de função. Padrão do Postgres é EXECUTE para PUBLIC quando
--      proacl é nulo — por isso cada função aparece aqui com um REVOKE
--      explícito antes do GRANT, e não só com o GRANT.
revoke execute on function abrir_ocorrencia(p_pedido_id uuid, p_tipo text, p_descricao text, p_solicitacao_separacao_id uuid, p_solicitacao_entrega_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function abrir_ocorrencia(p_pedido_id uuid, p_tipo text, p_descricao text, p_solicitacao_separacao_id uuid, p_solicitacao_entrega_id uuid) to anon;
grant execute on function abrir_ocorrencia(p_pedido_id uuid, p_tipo text, p_descricao text, p_solicitacao_separacao_id uuid, p_solicitacao_entrega_id uuid) to authenticated;
grant execute on function abrir_ocorrencia(p_pedido_id uuid, p_tipo text, p_descricao text, p_solicitacao_separacao_id uuid, p_solicitacao_entrega_id uuid) to service_role;
grant execute on function abrir_ocorrencia(p_pedido_id uuid, p_tipo text, p_descricao text, p_solicitacao_separacao_id uuid, p_solicitacao_entrega_id uuid) to public;
revoke execute on function aceitar_orcamento(p_orcamento_id uuid, p_origem text, p_forma_entrega text, p_endereco_entrega text, p_horario_retirada_desejado text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function aceitar_orcamento(p_orcamento_id uuid, p_origem text, p_forma_entrega text, p_endereco_entrega text, p_horario_retirada_desejado text) to authenticated;
grant execute on function aceitar_orcamento(p_orcamento_id uuid, p_origem text, p_forma_entrega text, p_endereco_entrega text, p_horario_retirada_desejado text) to service_role;
revoke execute on function aceitar_orcamento_dashboard(p_orcamento_id uuid, p_operador_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function aceitar_orcamento_dashboard(p_orcamento_id uuid, p_operador_id uuid) to anon;
grant execute on function aceitar_orcamento_dashboard(p_orcamento_id uuid, p_operador_id uuid) to authenticated;
grant execute on function aceitar_orcamento_dashboard(p_orcamento_id uuid, p_operador_id uuid) to service_role;
grant execute on function aceitar_orcamento_dashboard(p_orcamento_id uuid, p_operador_id uuid) to public;
revoke execute on function aprender_de_resposta_operador(p_memoria_produto_id uuid, p_disponibilidade text, p_preco numeric, p_operador_id uuid, p_observacao text, p_origem text) from public, anon, authenticated, service_role;
grant execute on function aprender_de_resposta_operador(p_memoria_produto_id uuid, p_disponibilidade text, p_preco numeric, p_operador_id uuid, p_observacao text, p_origem text) to anon;
grant execute on function aprender_de_resposta_operador(p_memoria_produto_id uuid, p_disponibilidade text, p_preco numeric, p_operador_id uuid, p_observacao text, p_origem text) to authenticated;
grant execute on function aprender_de_resposta_operador(p_memoria_produto_id uuid, p_disponibilidade text, p_preco numeric, p_operador_id uuid, p_observacao text, p_origem text) to service_role;
grant execute on function aprender_de_resposta_operador(p_memoria_produto_id uuid, p_disponibilidade text, p_preco numeric, p_operador_id uuid, p_observacao text, p_origem text) to public;
revoke execute on function assumir_conversa_dashboard(p_conversa_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function assumir_conversa_dashboard(p_conversa_id uuid) to anon;
grant execute on function assumir_conversa_dashboard(p_conversa_id uuid) to authenticated;
grant execute on function assumir_conversa_dashboard(p_conversa_id uuid) to service_role;
grant execute on function assumir_conversa_dashboard(p_conversa_id uuid) to public;
revoke execute on function assumir_entrega(p_solicitacao_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function assumir_entrega(p_solicitacao_id uuid) to anon;
grant execute on function assumir_entrega(p_solicitacao_id uuid) to authenticated;
grant execute on function assumir_entrega(p_solicitacao_id uuid) to service_role;
grant execute on function assumir_entrega(p_solicitacao_id uuid) to public;
revoke execute on function assumir_separacao(p_solicitacao_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function assumir_separacao(p_solicitacao_id uuid) to anon;
grant execute on function assumir_separacao(p_solicitacao_id uuid) to authenticated;
grant execute on function assumir_separacao(p_solicitacao_id uuid) to service_role;
grant execute on function assumir_separacao(p_solicitacao_id uuid) to public;
revoke execute on function atribuir_responsavel_pedido(p_pedido_id uuid, p_tipo text, p_funcionario_id uuid, p_operador_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function atribuir_responsavel_pedido(p_pedido_id uuid, p_tipo text, p_funcionario_id uuid, p_operador_id uuid) to anon;
grant execute on function atribuir_responsavel_pedido(p_pedido_id uuid, p_tipo text, p_funcionario_id uuid, p_operador_id uuid) to authenticated;
grant execute on function atribuir_responsavel_pedido(p_pedido_id uuid, p_tipo text, p_funcionario_id uuid, p_operador_id uuid) to service_role;
grant execute on function atribuir_responsavel_pedido(p_pedido_id uuid, p_tipo text, p_funcionario_id uuid, p_operador_id uuid) to public;
revoke execute on function atualizar_status_orcamento(p_orcamento_id uuid, p_novo_status status_orcamento, p_origem text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function atualizar_status_orcamento(p_orcamento_id uuid, p_novo_status status_orcamento, p_origem text) to authenticated;
grant execute on function atualizar_status_orcamento(p_orcamento_id uuid, p_novo_status status_orcamento, p_origem text) to service_role;
revoke execute on function atualizar_status_orcamento_dashboard(p_orcamento_id uuid, p_novo_status status_orcamento, p_operador_id uuid, p_observacao text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function atualizar_status_orcamento_dashboard(p_orcamento_id uuid, p_novo_status status_orcamento, p_operador_id uuid, p_observacao text) to anon;
grant execute on function atualizar_status_orcamento_dashboard(p_orcamento_id uuid, p_novo_status status_orcamento, p_operador_id uuid, p_observacao text) to authenticated;
grant execute on function atualizar_status_orcamento_dashboard(p_orcamento_id uuid, p_novo_status status_orcamento, p_operador_id uuid, p_observacao text) to service_role;
grant execute on function atualizar_status_orcamento_dashboard(p_orcamento_id uuid, p_novo_status status_orcamento, p_operador_id uuid, p_observacao text) to public;
revoke execute on function atualizar_status_pedido(p_pedido_id uuid, p_novo_status status_pedido, p_origem text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function atualizar_status_pedido(p_pedido_id uuid, p_novo_status status_pedido, p_origem text) to anon;
grant execute on function atualizar_status_pedido(p_pedido_id uuid, p_novo_status status_pedido, p_origem text) to authenticated;
grant execute on function atualizar_status_pedido(p_pedido_id uuid, p_novo_status status_pedido, p_origem text) to service_role;
grant execute on function atualizar_status_pedido(p_pedido_id uuid, p_novo_status status_pedido, p_origem text) to public;
revoke execute on function atualizar_status_pedido_dashboard(p_pedido_id uuid, p_novo_status status_pedido, p_operador_id uuid, p_observacao text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function atualizar_status_pedido_dashboard(p_pedido_id uuid, p_novo_status status_pedido, p_operador_id uuid, p_observacao text) to anon;
grant execute on function atualizar_status_pedido_dashboard(p_pedido_id uuid, p_novo_status status_pedido, p_operador_id uuid, p_observacao text) to authenticated;
grant execute on function atualizar_status_pedido_dashboard(p_pedido_id uuid, p_novo_status status_pedido, p_operador_id uuid, p_observacao text) to service_role;
grant execute on function atualizar_status_pedido_dashboard(p_pedido_id uuid, p_novo_status status_pedido, p_operador_id uuid, p_observacao text) to public;
revoke execute on function buscar_produto_fuzzy(p_nome text, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function buscar_produto_fuzzy(p_nome text, p_limit integer) to anon;
grant execute on function buscar_produto_fuzzy(p_nome text, p_limit integer) to authenticated;
grant execute on function buscar_produto_fuzzy(p_nome text, p_limit integer) to service_role;
grant execute on function buscar_produto_fuzzy(p_nome text, p_limit integer) to public;
revoke execute on function cancelar_entrega(p_solicitacao_id uuid, p_motivo text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function cancelar_entrega(p_solicitacao_id uuid, p_motivo text) to anon;
grant execute on function cancelar_entrega(p_solicitacao_id uuid, p_motivo text) to authenticated;
grant execute on function cancelar_entrega(p_solicitacao_id uuid, p_motivo text) to service_role;
grant execute on function cancelar_entrega(p_solicitacao_id uuid, p_motivo text) to public;
revoke execute on function cancelar_separacao(p_solicitacao_id uuid, p_motivo text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function cancelar_separacao(p_solicitacao_id uuid, p_motivo text) to anon;
grant execute on function cancelar_separacao(p_solicitacao_id uuid, p_motivo text) to authenticated;
grant execute on function cancelar_separacao(p_solicitacao_id uuid, p_motivo text) to service_role;
grant execute on function cancelar_separacao(p_solicitacao_id uuid, p_motivo text) to public;
revoke execute on function cliente_tem_cadastro_completo(p_cliente_id uuid) from public, anon, authenticated, service_role;
grant execute on function cliente_tem_cadastro_completo(p_cliente_id uuid) to anon;
grant execute on function cliente_tem_cadastro_completo(p_cliente_id uuid) to authenticated;
grant execute on function cliente_tem_cadastro_completo(p_cliente_id uuid) to service_role;
grant execute on function cliente_tem_cadastro_completo(p_cliente_id uuid) to public;
revoke execute on function concluir_entrega(p_solicitacao_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function concluir_entrega(p_solicitacao_id uuid) to anon;
grant execute on function concluir_entrega(p_solicitacao_id uuid) to authenticated;
grant execute on function concluir_entrega(p_solicitacao_id uuid) to service_role;
grant execute on function concluir_entrega(p_solicitacao_id uuid) to public;
revoke execute on function concluir_separacao(p_solicitacao_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function concluir_separacao(p_solicitacao_id uuid) to anon;
grant execute on function concluir_separacao(p_solicitacao_id uuid) to authenticated;
grant execute on function concluir_separacao(p_solicitacao_id uuid) to service_role;
grant execute on function concluir_separacao(p_solicitacao_id uuid) to public;
revoke execute on function consultar_status_pedido_cliente(p_cliente_id uuid) from public, anon, authenticated, service_role;
grant execute on function consultar_status_pedido_cliente(p_cliente_id uuid) to anon;
grant execute on function consultar_status_pedido_cliente(p_cliente_id uuid) to authenticated;
grant execute on function consultar_status_pedido_cliente(p_cliente_id uuid) to service_role;
grant execute on function consultar_status_pedido_cliente(p_cliente_id uuid) to public;
revoke execute on function criar_orcamento_com_itens_tx(p_cliente_id uuid, p_conversa_id uuid, p_tipo tipo_pedido, p_escola_id uuid, p_observacoes text, p_itens jsonb) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function criar_orcamento_com_itens_tx(p_cliente_id uuid, p_conversa_id uuid, p_tipo tipo_pedido, p_escola_id uuid, p_observacoes text, p_itens jsonb) to service_role;
revoke execute on function delegar_entrega(p_pedido_id uuid, p_entregador_id uuid, p_horario_previsto timestamp with time zone) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function delegar_entrega(p_pedido_id uuid, p_entregador_id uuid, p_horario_previsto timestamp with time zone) to anon;
grant execute on function delegar_entrega(p_pedido_id uuid, p_entregador_id uuid, p_horario_previsto timestamp with time zone) to authenticated;
grant execute on function delegar_entrega(p_pedido_id uuid, p_entregador_id uuid, p_horario_previsto timestamp with time zone) to service_role;
grant execute on function delegar_entrega(p_pedido_id uuid, p_entregador_id uuid, p_horario_previsto timestamp with time zone) to public;
revoke execute on function delegar_separacao(p_pedido_id uuid, p_separador_id uuid, p_prioridade text, p_horario_retirada timestamp with time zone, p_observacao text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function delegar_separacao(p_pedido_id uuid, p_separador_id uuid, p_prioridade text, p_horario_retirada timestamp with time zone, p_observacao text) to anon;
grant execute on function delegar_separacao(p_pedido_id uuid, p_separador_id uuid, p_prioridade text, p_horario_retirada timestamp with time zone, p_observacao text) to authenticated;
grant execute on function delegar_separacao(p_pedido_id uuid, p_separador_id uuid, p_prioridade text, p_horario_retirada timestamp with time zone, p_observacao text) to service_role;
grant execute on function delegar_separacao(p_pedido_id uuid, p_separador_id uuid, p_prioridade text, p_horario_retirada timestamp with time zone, p_observacao text) to public;
revoke execute on function distribuir_conversa_automatica() from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function distribuir_conversa_automatica() to anon;
grant execute on function distribuir_conversa_automatica() to authenticated;
grant execute on function distribuir_conversa_automatica() to service_role;
grant execute on function distribuir_conversa_automatica() to public;
revoke execute on function eh_admin() from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function eh_admin() to anon;
grant execute on function eh_admin() to authenticated;
grant execute on function eh_admin() to service_role;
grant execute on function eh_admin() to public;
revoke execute on function eh_entregador_ativo() from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function eh_entregador_ativo() to anon;
grant execute on function eh_entregador_ativo() to authenticated;
grant execute on function eh_entregador_ativo() to service_role;
grant execute on function eh_entregador_ativo() to public;
revoke execute on function eh_operador_ativo() from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function eh_operador_ativo() to anon;
grant execute on function eh_operador_ativo() to authenticated;
grant execute on function eh_operador_ativo() to service_role;
grant execute on function eh_operador_ativo() to public;
revoke execute on function eh_separador_ativo() from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function eh_separador_ativo() to anon;
grant execute on function eh_separador_ativo() to authenticated;
grant execute on function eh_separador_ativo() to service_role;
grant execute on function eh_separador_ativo() to public;
revoke execute on function empresa_id_padrao() from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function empresa_id_padrao() to anon;
grant execute on function empresa_id_padrao() to authenticated;
grant execute on function empresa_id_padrao() to service_role;
grant execute on function empresa_id_padrao() to public;
revoke execute on function enviar_mensagem_separacao(p_solicitacao_id uuid, p_texto text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function enviar_mensagem_separacao(p_solicitacao_id uuid, p_texto text) to anon;
grant execute on function enviar_mensagem_separacao(p_solicitacao_id uuid, p_texto text) to authenticated;
grant execute on function enviar_mensagem_separacao(p_solicitacao_id uuid, p_texto text) to service_role;
grant execute on function enviar_mensagem_separacao(p_solicitacao_id uuid, p_texto text) to public;
revoke execute on function expirar_consultas_operacionais() from public, anon, authenticated, service_role;
grant execute on function expirar_consultas_operacionais() to anon;
grant execute on function expirar_consultas_operacionais() to authenticated;
grant execute on function expirar_consultas_operacionais() to service_role;
grant execute on function expirar_consultas_operacionais() to public;
revoke execute on function funcionario_atual_id() from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function funcionario_atual_id() to anon;
grant execute on function funcionario_atual_id() to authenticated;
grant execute on function funcionario_atual_id() to service_role;
grant execute on function funcionario_atual_id() to public;
revoke execute on function gerar_protocolo(prefixo text) from public, anon, authenticated, service_role;
grant execute on function gerar_protocolo(prefixo text) to anon;
grant execute on function gerar_protocolo(prefixo text) to authenticated;
grant execute on function gerar_protocolo(prefixo text) to service_role;
grant execute on function gerar_protocolo(prefixo text) to public;
revoke execute on function get_activity_feed(p_limit integer) from public, anon, authenticated, service_role;
grant execute on function get_activity_feed(p_limit integer) to anon;
grant execute on function get_activity_feed(p_limit integer) to authenticated;
grant execute on function get_activity_feed(p_limit integer) to service_role;
grant execute on function get_activity_feed(p_limit integer) to public;
revoke execute on function get_metricas_comerciais() from public, anon, authenticated, service_role;
grant execute on function get_metricas_comerciais() to anon;
grant execute on function get_metricas_comerciais() to authenticated;
grant execute on function get_metricas_comerciais() to service_role;
grant execute on function get_metricas_comerciais() to public;
revoke execute on function get_oportunidades_perdidas(p_dias integer, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function get_oportunidades_perdidas(p_dias integer, p_limit integer) to anon;
grant execute on function get_oportunidades_perdidas(p_dias integer, p_limit integer) to authenticated;
grant execute on function get_oportunidades_perdidas(p_dias integer, p_limit integer) to service_role;
grant execute on function get_oportunidades_perdidas(p_dias integer, p_limit integer) to public;
revoke execute on function get_top_demanda(p_dias integer, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function get_top_demanda(p_dias integer, p_limit integer) to anon;
grant execute on function get_top_demanda(p_dias integer, p_limit integer) to authenticated;
grant execute on function get_top_demanda(p_dias integer, p_limit integer) to service_role;
grant execute on function get_top_demanda(p_dias integer, p_limit integer) to public;
revoke execute on function iniciar_rota(p_solicitacao_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function iniciar_rota(p_solicitacao_id uuid) to anon;
grant execute on function iniciar_rota(p_solicitacao_id uuid) to authenticated;
grant execute on function iniciar_rota(p_solicitacao_id uuid) to service_role;
grant execute on function iniciar_rota(p_solicitacao_id uuid) to public;
revoke execute on function liberar_conversa_dashboard(p_conversa_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function liberar_conversa_dashboard(p_conversa_id uuid) to anon;
grant execute on function liberar_conversa_dashboard(p_conversa_id uuid) to authenticated;
grant execute on function liberar_conversa_dashboard(p_conversa_id uuid) to service_role;
grant execute on function liberar_conversa_dashboard(p_conversa_id uuid) to public;
revoke execute on function marcar_item_separado_solicitacao(p_solicitacao_item_id uuid, p_separado boolean) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function marcar_item_separado_solicitacao(p_solicitacao_item_id uuid, p_separado boolean) to anon;
grant execute on function marcar_item_separado_solicitacao(p_solicitacao_item_id uuid, p_separado boolean) to authenticated;
grant execute on function marcar_item_separado_solicitacao(p_solicitacao_item_id uuid, p_separado boolean) to service_role;
grant execute on function marcar_item_separado_solicitacao(p_solicitacao_item_id uuid, p_separado boolean) to public;
revoke execute on function marcar_notificacao_lida(p_id uuid) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function marcar_notificacao_lida(p_id uuid) to anon;
grant execute on function marcar_notificacao_lida(p_id uuid) to authenticated;
grant execute on function marcar_notificacao_lida(p_id uuid) to service_role;
grant execute on function marcar_notificacao_lida(p_id uuid) to public;
revoke execute on function marcar_pronto_retirada_pedido(p_pedido_id uuid) from public, anon, authenticated, service_role;
grant execute on function marcar_pronto_retirada_pedido(p_pedido_id uuid) to anon;
grant execute on function marcar_pronto_retirada_pedido(p_pedido_id uuid) to authenticated;
grant execute on function marcar_pronto_retirada_pedido(p_pedido_id uuid) to service_role;
grant execute on function marcar_pronto_retirada_pedido(p_pedido_id uuid) to public;
revoke execute on function marcar_saiu_entrega_pedido(p_pedido_id uuid) from public, anon, authenticated, service_role;
grant execute on function marcar_saiu_entrega_pedido(p_pedido_id uuid) to anon;
grant execute on function marcar_saiu_entrega_pedido(p_pedido_id uuid) to authenticated;
grant execute on function marcar_saiu_entrega_pedido(p_pedido_id uuid) to service_role;
grant execute on function marcar_saiu_entrega_pedido(p_pedido_id uuid) to public;
revoke execute on function match_produtos_documentos(query_embedding vector, match_count integer, filter jsonb) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function match_produtos_documentos(query_embedding vector, match_count integer, filter jsonb) to authenticated;
grant execute on function match_produtos_documentos(query_embedding vector, match_count integer, filter jsonb) to service_role;
revoke execute on function orcamento_ativo_cliente(p_cliente_id uuid) from public, anon, authenticated, service_role;
grant execute on function orcamento_ativo_cliente(p_cliente_id uuid) to anon;
grant execute on function orcamento_ativo_cliente(p_cliente_id uuid) to authenticated;
grant execute on function orcamento_ativo_cliente(p_cliente_id uuid) to service_role;
grant execute on function orcamento_ativo_cliente(p_cliente_id uuid) to public;
revoke execute on function pedido_ativo_cliente(p_cliente_id uuid) from public, anon, authenticated, service_role;
grant execute on function pedido_ativo_cliente(p_cliente_id uuid) to anon;
grant execute on function pedido_ativo_cliente(p_cliente_id uuid) to authenticated;
grant execute on function pedido_ativo_cliente(p_cliente_id uuid) to service_role;
grant execute on function pedido_ativo_cliente(p_cliente_id uuid) to public;
revoke execute on function preencher_nome_item() from public, anon, authenticated, service_role;
grant execute on function preencher_nome_item() to anon;
grant execute on function preencher_nome_item() to authenticated;
grant execute on function preencher_nome_item() to service_role;
grant execute on function preencher_nome_item() to public;
revoke execute on function produtos_pendentes_embedding(p_limit integer) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function produtos_pendentes_embedding(p_limit integer) to authenticated;
grant execute on function produtos_pendentes_embedding(p_limit integer) to service_role;
revoke execute on function recalcular_valor_orcamento() from public, anon, authenticated, service_role;
grant execute on function recalcular_valor_orcamento() to anon;
grant execute on function recalcular_valor_orcamento() to authenticated;
grant execute on function recalcular_valor_orcamento() to service_role;
grant execute on function recalcular_valor_orcamento() to public;
revoke execute on function recalcular_valor_pedido() from public, anon, authenticated, service_role;
grant execute on function recalcular_valor_pedido() to anon;
grant execute on function recalcular_valor_pedido() to authenticated;
grant execute on function recalcular_valor_pedido() to service_role;
grant execute on function recalcular_valor_pedido() to public;
revoke execute on function registrar_demanda_produto(p_produto_nome text, p_produto_id uuid, p_cliente_id uuid, p_conversa_id uuid, p_origem text, p_resultado text) from public, anon, authenticated, service_role;
grant execute on function registrar_demanda_produto(p_produto_nome text, p_produto_id uuid, p_cliente_id uuid, p_conversa_id uuid, p_origem text, p_resultado text) to anon;
grant execute on function registrar_demanda_produto(p_produto_nome text, p_produto_id uuid, p_cliente_id uuid, p_conversa_id uuid, p_origem text, p_resultado text) to authenticated;
grant execute on function registrar_demanda_produto(p_produto_nome text, p_produto_id uuid, p_cliente_id uuid, p_conversa_id uuid, p_origem text, p_resultado text) to service_role;
grant execute on function registrar_demanda_produto(p_produto_nome text, p_produto_id uuid, p_cliente_id uuid, p_conversa_id uuid, p_origem text, p_resultado text) to public;
revoke execute on function registrar_evento_consulta_operacional() from public, anon, authenticated, service_role;
grant execute on function registrar_evento_consulta_operacional() to anon;
grant execute on function registrar_evento_consulta_operacional() to authenticated;
grant execute on function registrar_evento_consulta_operacional() to service_role;
grant execute on function registrar_evento_consulta_operacional() to public;
revoke execute on function registrar_evento_entrega() from public, anon, authenticated, service_role;
grant execute on function registrar_evento_entrega() to anon;
grant execute on function registrar_evento_entrega() to authenticated;
grant execute on function registrar_evento_entrega() to service_role;
grant execute on function registrar_evento_entrega() to public;
revoke execute on function registrar_evento_ocorrencia() from public, anon, authenticated, service_role;
grant execute on function registrar_evento_ocorrencia() to anon;
grant execute on function registrar_evento_ocorrencia() to authenticated;
grant execute on function registrar_evento_ocorrencia() to service_role;
grant execute on function registrar_evento_ocorrencia() to public;
revoke execute on function registrar_evento_orcamento() from public, anon, authenticated, service_role;
grant execute on function registrar_evento_orcamento() to anon;
grant execute on function registrar_evento_orcamento() to authenticated;
grant execute on function registrar_evento_orcamento() to service_role;
grant execute on function registrar_evento_orcamento() to public;
revoke execute on function registrar_evento_pedido() from public, anon, authenticated, service_role;
grant execute on function registrar_evento_pedido() to anon;
grant execute on function registrar_evento_pedido() to authenticated;
grant execute on function registrar_evento_pedido() to service_role;
grant execute on function registrar_evento_pedido() to public;
revoke execute on function registrar_heartbeat_operador() from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function registrar_heartbeat_operador() to anon;
grant execute on function registrar_heartbeat_operador() to authenticated;
grant execute on function registrar_heartbeat_operador() to service_role;
grant execute on function registrar_heartbeat_operador() to public;
revoke execute on function registrar_insucesso_entrega(p_solicitacao_id uuid, p_motivo text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function registrar_insucesso_entrega(p_solicitacao_id uuid, p_motivo text) to anon;
grant execute on function registrar_insucesso_entrega(p_solicitacao_id uuid, p_motivo text) to authenticated;
grant execute on function registrar_insucesso_entrega(p_solicitacao_id uuid, p_motivo text) to service_role;
grant execute on function registrar_insucesso_entrega(p_solicitacao_id uuid, p_motivo text) to public;
revoke execute on function resolver_ocorrencia(p_ocorrencia_id uuid, p_resolucao_texto text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function resolver_ocorrencia(p_ocorrencia_id uuid, p_resolucao_texto text) to anon;
grant execute on function resolver_ocorrencia(p_ocorrencia_id uuid, p_resolucao_texto text) to authenticated;
grant execute on function resolver_ocorrencia(p_ocorrencia_id uuid, p_resolucao_texto text) to service_role;
grant execute on function resolver_ocorrencia(p_ocorrencia_id uuid, p_resolucao_texto text) to public;
revoke execute on function separacao_rapida(p_pedido_id uuid, p_observacao text) from public, anon, authenticated, service_role; -- SECURITY DEFINER
grant execute on function separacao_rapida(p_pedido_id uuid, p_observacao text) to anon;
grant execute on function separacao_rapida(p_pedido_id uuid, p_observacao text) to authenticated;
grant execute on function separacao_rapida(p_pedido_id uuid, p_observacao text) to service_role;
grant execute on function separacao_rapida(p_pedido_id uuid, p_observacao text) to public;
revoke execute on function set_atualizado_em() from public, anon, authenticated, service_role;
grant execute on function set_atualizado_em() to anon;
grant execute on function set_atualizado_em() to authenticated;
grant execute on function set_atualizado_em() to service_role;
grant execute on function set_atualizado_em() to public;
revoke execute on function set_preview_ultima_mensagem() from public, anon, authenticated, service_role;
grant execute on function set_preview_ultima_mensagem() to anon;
grant execute on function set_preview_ultima_mensagem() to authenticated;
grant execute on function set_preview_ultima_mensagem() to service_role;
grant execute on function set_preview_ultima_mensagem() to public;
revoke execute on function verificar_alertas_demanda() from public, anon, authenticated, service_role;
grant execute on function verificar_alertas_demanda() to anon;
grant execute on function verificar_alertas_demanda() to authenticated;
grant execute on function verificar_alertas_demanda() to service_role;
grant execute on function verificar_alertas_demanda() to public;

-- =====================================================================
-- 11. PUBLICAÇÕES (realtime)
-- =====================================================================

do $$ begin
  alter publication supabase_realtime add table alertas_demanda;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table consultas_operacionais;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table conversas;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table eventos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table memoria_produtos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table mensagens;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table notificacoes_internas;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table ocorrencias;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table orcamentos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table pedidos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table solicitacoes_entrega;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table solicitacoes_separacao;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table solicitacoes_separacao_itens;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table solicitacoes_separacao_mensagens;
exception when duplicate_object then null; end $$;

-- FIM DO BASELINE.
