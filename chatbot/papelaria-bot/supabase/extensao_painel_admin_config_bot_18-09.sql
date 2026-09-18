-- =====================================================================
-- VENÂNCIO — Painel Admin do JS Bot: tabela configuracoes_bot (18/09/2026)
-- =====================================================================
-- Contexto: o dono só enxergava o bot pelo terminal (logs) e só mudava
-- comportamento (timeouts, telefones de notificação) editando `.env` e
-- reiniciando o processo. Esta tabela é o backend de um painel novo,
-- separado e só dele (admin-panel/), que edita esses valores sem tocar em
-- código nem reiniciar o bot.
--
-- Por que uma tabela NOVA e não reaproveitar `configuracoes`: essa outra
-- tabela já é usada por `escalonamentoService.js` com RLS que dá leitura E
-- escrita pra QUALQUER operador ativo (`eh_operador_ativo()`), não só
-- admin. Colocar config sensível de comportamento do bot ali dentro
-- enfraqueceria a garantia de "só o dono mexe nisso" — mais barato (e mais
-- seguro) abrir uma tabela nova, fechada, do que retrofitar RLS por linha
-- numa tabela com contrato diferente já em produção.
--
-- Esta tabela NÃO guarda segredo/credencial nenhum — só valores de
-- comportamento (timeouts, telefones, liga/desliga de recursos). Chaves
-- como SUPABASE_SERVICE_KEY, EVOLUTION_API_KEY, WEBHOOK_SECRET_TOKEN,
-- OPENROUTER_API_KEY continuam só em `.env`, fora do alcance desta tabela
-- e do painel — a allowlist do lado do bot (`configResolver.js`) nem
-- conhece essas chaves.
--
-- RLS mais restrita que qualquer tabela do projeto até agora: nenhuma
-- policy pra `anon`/`authenticated`, só `service_role`. Toda autorização
-- de "só admin edita" fica na camada de aplicação (middleware
-- `verifyAdmin.js`, checa `operadores.papel = 'admin'`), não no banco —
-- mesmo um JWT de operador vazado, usado direto contra a API REST do
-- Supabase (contornando o bot), não lê nem escreve esta tabela.
-- =====================================================================

create table if not exists configuracoes_bot (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  valor jsonb not null,
  tipo text not null check (tipo in ('numero', 'texto', 'booleano', 'telefone')),
  descricao text not null,
  minimo numeric,
  maximo numeric,
  atualizado_por uuid references operadores(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table configuracoes_bot is 'Config de comportamento do bot editável só pelo painel admin (admin-panel/), nunca guarda segredo/credencial. Allowlist de chaves aceitas vive em chatbot/papelaria-bot/src/config/configResolver.js.';

alter table configuracoes_bot enable row level security;

revoke all on configuracoes_bot from anon, authenticated, service_role;
grant select, insert, update, delete on configuracoes_bot to service_role;

drop policy if exists "service_role_full_access" on configuracoes_bot;
create policy "service_role_full_access" on configuracoes_bot
  as permissive for all to public
  using (auth.role() = 'service_role');

drop trigger if exists trg_configuracoes_bot_atualizado_em on configuracoes_bot;
create trigger trg_configuracoes_bot_atualizado_em
  before update on configuracoes_bot
  for each row execute function set_atualizado_em();

-- Seed idempotente — valores == defaults hoje hardcoded em src/config/env.js,
-- pra migrar sem mudar nenhum comportamento no momento em que isso for
-- aplicado. `minimo` em agente_vendas_timeout_ms é o piso de segurança
-- (achado A6 do diagnóstico de 30/07/2026 — timeout baixo demais causou
-- pedido duplicado): o painel nunca consegue salvar abaixo disso.
-- `telefone_vendas` de produção é hoje um JID de GRUPO do WhatsApp
-- (termina em "@g.us"), não um número de telefone simples — PHONE_VANESSA
-- já era assim em env.js. `tipo='telefone'` portanto aceita tanto dígitos
-- puros quanto um JID de grupo/contato do WhatsApp
-- (`@g.us`/`@s.whatsapp.net`); a validação do lado do bot
-- (`adminConfigController.js`) precisa checar as duas formas, não só
-- dígitos.
insert into configuracoes_bot (chave, valor, tipo, descricao, minimo, maximo)
select * from (values
  ('reactivation_timeout_minutos', '120'::jsonb, 'numero', 'Minutos de inatividade até o bot reativar sozinho uma conversa pausada.', 5::numeric, 1440::numeric),
  ('telefone_financeiro', '"SEU_NUMERO_AQUI"'::jsonb, 'telefone', 'Telefone que recebe notificação de financeiro/liderança (comando "atendente"/"reclamação").', null::numeric, null::numeric),
  ('telefone_compras', '"SEU_NUMERO_AQUI"'::jsonb, 'telefone', 'Telefone que recebe notificação de compras.', null::numeric, null::numeric),
  ('telefone_servicos', '"SEU_NUMERO_AQUI"'::jsonb, 'telefone', 'Telefone que recebe notificação de serviços.', null::numeric, null::numeric),
  ('telefone_vendas', '"SEU_NUMERO_OU_GRUPO_AQUI"'::jsonb, 'telefone', 'Telefone (ou JID de grupo do WhatsApp, terminado em @g.us) que recebe notificação de vendas e a rede de segurança do Agente de Vendas.', null::numeric, null::numeric),
  ('agente_vendas_timeout_ms', '55000'::jsonb, 'numero', 'Prazo (ms) que o bot espera pelo Agente de Vendas antes de acionar a rede de segurança.', 20000::numeric, 120000::numeric),
  ('agente_vendas_habilitado', 'true'::jsonb, 'booleano', 'Liga/desliga o Agente de Vendas (IA). Desligado, o bot usa direto a rede de segurança (mesmo comportamento de hoje quando a URL do n8n não está configurada).', null::numeric, null::numeric)
) as seed(chave, valor, tipo, descricao, minimo, maximo)
where not exists (select 1 from configuracoes_bot cb where cb.chave = seed.chave);

-- =====================================================================
-- NOTA IMPORTANTE: os 4 telefones acima são seedados como PLACEHOLDER
-- neste arquivo de propósito — números de telefone/JID de grupo reais são
-- dado sensível e não vão pro histórico do git. Em produção (aplicado ao
-- vivo em 18/09/2026) essas 4 linhas foram atualizadas com os valores
-- reais, lidos do `.env` local (PHONE_CHEFE/PHONE_COMPRAS/PHONE_SERVICOS/
-- PHONE_VANESSA) via UPDATE direto, fora deste arquivo — exatamente o
-- mesmo motivo pelo qual `.env` é gitignored. Ao recriar um banco novo
-- (Caminho A do README), substitua os placeholders pelos valores reais do
-- seu próprio `.env` antes de aplicar, ou corrija depois pelo painel admin.
-- =====================================================================

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select chave, valor, tipo, minimo, maximo from configuracoes_bot order by chave;
-- -- deve trazer as 7 linhas de seed.
--
-- select has_table_privilege('anon', 'configuracoes_bot', 'select');
-- select has_table_privilege('authenticated', 'configuracoes_bot', 'select');
-- -- ambas devem ser false.
-- =====================================================================
