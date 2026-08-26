-- =====================================================================
-- VENÂNCIO — Fechamento do problema P5 (auditoria de 25/08/2026,
-- tarefa T2.2 do plano de execução de 26/08/2026)
-- =====================================================================
-- NÃO APLICADO EM PRODUÇÃO AINDA por este agente — ver "NOTA DE EXECUÇÃO"
-- no final do arquivo. Escrito por um agente cuja sessão só tinha
-- `mcp__supabase__list_tables` disponível (somente leitura de metadados);
-- `execute_sql` / `apply_migration` / `execute_mutation` não estavam na
-- lista de ferramentas desta sessão (testado: `execute_sql` devolveu
-- "No such tool available"), apesar do briefing da tarefa dizer que
-- estariam liberados. Sem `DATABASE_URL` disponível no ambiente (não está
-- em nenhum `.env` do repo — só é passado na hora, na linha de comando,
-- para `scripts/gerarBaselineSupabase.mjs`) para tentar conexão direta.
-- Mesma limitação já registrada antes em `extensao_seguranca_b0_orcamentos.sql`
-- (15/08/2026).
--
-- ── O INCIDENTE ──────────────────────────────────────────────────────
-- `orcamento_ativo_cliente(uuid)` devolvia o rascunho MAIS RECENTE do
-- cliente, não o que tinha itens. Evidência real (conversa
-- `493b2143-7b7d-4bcb-89e3-c38aa371135b`, cliente
-- `a6853bf6-56bc-4e0b-9740-6b9af22a93bf`, confirmado 25/08 e reconfirmado
-- na análise desta tarefa em 26/08 via `pg_get_functiondef` /
-- `baseline_producao_26-08-2026.sql:2722-2730`, que ainda mostra a versão
-- com bug):
--
--   protocolo       | criado_em | itens
--   ----------------|-----------|------
--   ORC-2026-0185   | 21:41:46  | 0
--   ORC-2026-0186   | 22:38:07  | 1   <- o certo (tem item)
--   ORC-2026-0187   | 22:38:10  | 0   <- o que a função devolvia (bug)
--
-- O bot injetava no vendedor "use ORC-2026-0187" — o rascunho vazio,
-- criado 3 segundos depois do que já tinha item. Efeito prático: o
-- cliente monta o orçamento, o agente de vendas troca de rascunho no meio
-- do fluxo (n8n, workflow "Agente vendedor" / execução que originou o
-- caso acima) e o pedido "some" do rascunho certo.
--
-- ── CHAMADOR ÚNICO CONFIRMADO (grep no repo inteiro, exceto node_modules)
-- `chatbot/papelaria-bot/src/services/pedidosService.js:21`
-- (`orcamentoAtivoCliente`). Consome só leitura — não há nenhuma outra
-- função ou serviço que chame `orcamento_ativo_cliente` diretamente.
-- `pedidosService.js` espera de volta uma linha "composta" de `orcamentos`
-- (ou todos os campos `null`, inclusive `id`, quando não há rascunho — daí
-- o helper `linhaReal()` checar `data?.id`). Este arquivo mantém a mesma
-- assinatura e o mesmo tipo de retorno (`returns orcamentos`), então o
-- contrato com `pedidosService.js` não muda.
--
-- ── O QUE MUDA ───────────────────────────────────────────────────────
-- ÚNICA mudança: o `ORDER BY`. Antes ordenava só por `criado_em desc`.
-- Agora ordena primeiro por quantidade de itens (`itens_orcamento` —
-- confirmado como o nome real da tabela via
-- `mcp__supabase__list_tables`; NÃO é `orcamento_itens`) em ordem
-- decrescente, e só em empate (incluindo empate em zero itens) desempata
-- por `criado_em desc`, preservando o comportamento antigo nesse caso.
-- Filtro de `status in ('rascunho', 'enviado')` idêntico ao original.
--
-- ── ESTE ARQUIVO SUBSTITUI (CREATE OR REPLACE, MESMA ASSINATURA) ──────
-- As definições anteriores de `orcamento_ativo_cliente(uuid)` em:
--   - `squemanovo.sql` (linha ~453);
--   - `baseline_producao_26-08-2026.sql` (linha ~2722, retrato de
--     produção em 26/08 — ainda com o bug, é o que este arquivo corrige).
-- A partir de agora ESTA é a versão vigente.
--
-- Idempotente: seguro rodar de novo (CREATE OR REPLACE com a MESMA
-- assinatura). Não mexe em GRANT/REVOKE — o Postgres preserva a ACL da
-- função ao dar CREATE OR REPLACE com assinatura idêntica.
-- =====================================================================

create or replace function orcamento_ativo_cliente(p_cliente_id uuid)
returns orcamentos
language sql
stable
as $$
  select o.* from orcamentos o
  where o.cliente_id = p_cliente_id and o.status in ('rascunho', 'enviado')
  order by
    (select count(*) from itens_orcamento i where i.orcamento_id = o.id) desc,
    o.criado_em desc
  limit 1;
$$;

-- ── VALIDAÇÃO (rodar depois de aplicar) ────────────────────────────────
-- Deve devolver 'ORC-2026-0186' (o rascunho com item), não 'ORC-2026-0187':
--
--   select (orcamento_ativo_cliente('a6853bf6-56bc-4e0b-9740-6b9af22a93bf')).protocolo;
--
-- Conferir o estado bruto por trás (pode já ter mudado desde 25/08):
--
--   select o.protocolo, o.status, o.conversa_id, o.cliente_id, o.criado_em,
--          (select count(*) from itens_orcamento i where i.orcamento_id = o.id) as itens
--   from orcamentos o
--   order by o.criado_em;
-- =====================================================================


-- =====================================================================
-- NOTA DE EXECUÇÃO — PENDENTE. Ainda não aplicado em produção nem
-- validado com consulta real (ver cabeçalho: sem `execute_sql` /
-- `apply_migration` disponíveis nesta sessão). Aplicar via
-- `mcp__supabase__apply_migration` ou pelo SQL Editor do Supabase e então
-- rodar as duas consultas de validação acima antes de marcar esta tarefa
-- como concluída.
-- =====================================================================
