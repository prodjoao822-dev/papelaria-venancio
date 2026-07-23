-- Schema do papelaria-bot.
-- Rode este arquivo no SQL Editor do Supabase (ou via CLI) para criar as tabelas usadas pelo bot.

create extension if not exists pgcrypto; -- necessária para gen_random_uuid()

-- ============================================================
-- clientes: uma linha por número de WhatsApp que já falou com o bot.
-- ============================================================
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  telefone text not null unique,     -- número de WhatsApp do cliente (chave de identificação, sem "@s.whatsapp.net")
  nome text,                         -- nome do cliente, extraído do campo pushName do payload da Evolution API
  criado_em timestamptz not null default now(),      -- data/hora do primeiro contato
  atualizado_em timestamptz not null default now()   -- data/hora da última atualização do registro (novo nome, etc.)
);

-- ============================================================
-- conversas: estado da máquina de estados do bot para cada cliente.
-- Existe no máximo uma conversa "viva" por cliente (não criamos uma nova a cada mensagem).
-- ============================================================
create table if not exists conversas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,  -- referência ao cliente dono da conversa
  estado_atual text not null default 'MENU_PRINCIPAL',                 -- estado atual da máquina de estados (ex.: "SUBMENU_VENDAS")

  -- Contexto temporário coletado durante um fluxo de várias perguntas (ex.: escola e
  -- ano escolhidos no fluxo de lista escolar, antes de chegar na pergunta de observação).
  -- Precisa ficar no banco (não em memória) porque cada mensagem do WhatsApp chega
  -- como uma requisição HTTP separada ao webhook.
  dados jsonb not null default '{}'::jsonb,

  bot_ativo boolean not null default true,             -- false = pausado porque um humano respondeu manualmente (fromMe)
  ultima_interacao_em timestamptz not null default now(), -- data/hora da última mensagem (cliente ou humano); usada para o timeout de reativação
  criado_em timestamptz not null default now(),         -- data/hora de criação da conversa

  -- id (key) da última mensagem da Evolution API já processada por completo
  -- nesta conversa. Usado para detectar retries do mesmo webhook (a Evolution
  -- API pode reenviar o mesmo evento) e não reprocessar — evita notificar o
  -- humano duas vezes, mandar o PDF duas vezes, responder duas vezes etc.
  ultima_mensagem_id text
);

-- Garante uma única conversa por cliente.
create unique index if not exists conversas_cliente_id_key on conversas (cliente_id);

-- Projetos que já rodaram este schema.sql antes de `ultima_mensagem_id`
-- existir: rodar de novo aplica só a coluna nova, sem tocar no resto.
alter table conversas add column if not exists ultima_mensagem_id text;

-- ============================================================
-- escolas: lista de escolas oferecida no fluxo de lista escolar (Vendas > Lista escolar).
-- ============================================================
create table if not exists escolas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                        -- nome da escola, exibido no menu (ordenado por nome)
  ativa boolean not null default true        -- false = escola temporariamente fora do menu, sem precisar apagar o registro
);

-- ============================================================
-- materiais_lista_escolar: estrutura preparada para o próximo passo do fluxo de
-- lista escolar, quando os PDFs de material por escola/ano estiverem prontos
-- (ainda não estão — por enquanto o bot sempre notifica a Vanessa manualmente
-- com escola + ano + observação escolhidos pelo cliente).
-- ============================================================
create table if not exists materiais_lista_escolar (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid not null references escolas(id) on delete cascade,
  ano text not null,          -- mesmo texto usado no menu "Qual o ano?" (ex.: "1º ano - Fundamental")
  pdf_url text,               -- link do PDF da lista de material; nulo até o material estar pronto
  atualizado_em timestamptz not null default now(),
  unique (escola_id, ano)
);

-- ============================================================
-- mensagens: histórico de mensagens trocadas em cada conversa (auditoria/depuração).
-- ============================================================
create table if not exists mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas(id) on delete cascade,  -- referência à conversa à qual a mensagem pertence
  remetente text not null check (remetente in ('cliente', 'bot', 'humano')), -- origem da mensagem
  conteudo text,                                     -- texto da mensagem
  enviado_em timestamptz not null default now()      -- data/hora de envio/recebimento da mensagem
);

-- ============================================================
-- Seed opcional: as 4 escolas usadas na fase de teste (CEC, Múltipla, Linus
-- Pauling e Mundo Livre), cujos PDFs de lista de material estão em
-- `materiais/` no projeto (ver src/config/materiaisEscolares.js). Rode isso
-- depois de criar as tabelas acima se quiser que o webhook real já encontre
-- essas escolas assim que conectar num projeto Supabase de verdade.
-- Idempotente: rodar de novo não duplica linhas.
-- ============================================================
insert into escolas (nome, ativa)
select nome, true
from (values ('CEC'), ('Múltipla'), ('Linus Pauling'), ('Mundo Livre')) as escolas_teste(nome)
where not exists (
  select 1 from escolas e where e.nome = escolas_teste.nome
);
