-- =====================================================================
-- VENÂNCIO — Fechamento do bloqueador B6 (auditoria de 15/08/2026):
-- última policy de produção que ainda não estava em nenhum arquivo
-- versionado do repositório.
-- =====================================================================
-- Contexto: o bloqueador B6 já tinha sido corrigido na prática pelo
-- `baseline_producao_26-08-2026.sql` (dump de introspecção de produção,
-- 137 policies) + `extensao_push_tokens.sql` (5 policies da tabela criada
-- depois do baseline) = 142 policies versionadas.
--
-- Verificação ao vivo em 31/08/2026 (sessão com `execute_sql` funcionando
-- de verdade, não presumido): produção tem 143 policies em 39 tabelas com
-- RLS, não 142. Diff exato (live vs. os dois arquivos acima) achou UMA
-- policy órfã: `funcionarios_leem_operador_delegante` em `operadores`.
--
-- Não é uma falha de segurança nova — é `PERMISSIVE`/`public` mas
-- gateada internamente por `funcionario_atual_id()`, mesmo padrão seguro
-- já usado no resto do projeto (só deixa ler o operador que delegou uma
-- solicitação de separação/entrega pro funcionário logado, nada além
-- disso). O problema era só de versionamento: ela existe em produção mas
-- não em nenhum `.sql` do repo, então recriar o banco do zero pelo
-- repositório perderia essa regra. Este arquivo fecha essa última
-- lacuna — reproduz exatamente o que já está rodando, não cria nada novo.
--
-- Definição obtida via `pg_policies` em produção (31/08/2026), copiada
-- literalmente (mesmo texto de `qual`, mesmas roles, mesmo comando).
-- =====================================================================

drop policy if exists "funcionarios_leem_operador_delegante" on operadores;

create policy "funcionarios_leem_operador_delegante" on operadores
as permissive
for select
to public
using (
  funcionario_atual_id() is not null
  and (
    exists (
      select 1 from solicitacoes_separacao s
      where s.operador_delegante_id = operadores.id
        and s.separador_id = funcionario_atual_id()
    )
    or exists (
      select 1 from solicitacoes_entrega e
      where e.delegado_por_id = operadores.id
        and e.entregador_id = funcionario_atual_id()
    )
  )
);

-- =====================================================================
-- VERIFICAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select count(*) from pg_policies where schemaname = 'public';
-- -- deve dar 143, batendo com produção antes desta migration existir
-- -- (esta migration só documenta o que já rodava, não soma policy nova
-- -- em produção — só no repositório).
-- =====================================================================
