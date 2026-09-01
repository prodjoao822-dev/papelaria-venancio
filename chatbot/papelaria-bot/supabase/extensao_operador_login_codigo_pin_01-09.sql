-- =====================================================================
-- VENÂNCIO — Login unificado código+PIN também para Operador
-- =====================================================================
-- Pedido do dono (01/09/2026): outros operadores (equipe) devem poder
-- entrar com código+PIN, igual ao Separador/Entregador já fazem hoje. O
-- acesso do próprio dono continua por e-mail/senha (LoginPage.jsx não
-- perde essa opção, só ganha uma segunda aba) -- ele também é quem cria o
-- cadastro dos outros operadores (tela nova em ConfigPage.jsx).
--
-- ── MESMO PADRÃO DE SEGURANÇA DO SEPARADOR (extensao_separacao_
--    delegada.sql, ver separadorAuthController.js) ──────────────────────
-- O PIN nunca é armazenado por nós -- vira a senha de um usuário real do
-- Supabase Auth com e-mail sintético. Quem guarda o hash é o próprio
-- Supabase Auth, não esta tabela.
--
-- ── DIFERENÇA ESTRUTURAL IMPORTANTE EM RELAÇÃO A FUNCIONARIOS ──────────
-- `funcionarios` tem `auth_user_id` separado de `id` porque um funcionário
-- pode existir antes de ter login (o usuário Auth é criado "de forma
-- preguiçosa" no primeiro reset de PIN). `operadores` NÃO tem essa
-- separação -- `operadores.id` JÁ É o `auth.uid()` diretamente (é assim
-- que `eh_operador_ativo()` e toda RLS do projeto funcionam:
-- `id = auth.uid()`). Por isso aqui a ordem é invertida: primeiro cria o
-- usuário no Supabase Auth, DEPOIS insere a linha em `operadores` já com
-- o id certo (ver operadorAuthController.js, criarComCodigo) -- nunca o
-- contrário, e nunca desacoplando id de auth.uid() nesta tabela (isso
-- quebraria toda RLS/RPC do projeto que assume esse invariante).
--
-- ── NAMESPACE DE E-MAIL SINTÉTICO SEPARADO DE FUNCIONARIOS ─────────────
-- Funcionários usam `<codigo>@venancio.internal`. Operadores usam
-- `operador-<codigo>@venancio.internal` -- prefixo diferente de propósito,
-- pra um operador e um funcionário nunca colidirem mesmo escolhendo os
-- mesmos 4 dígitos.
-- =====================================================================

alter table operadores
  add column if not exists codigo text unique,
  add column if not exists pin_tentativas_falhas integer not null default 0,
  add column if not exists pin_bloqueado_ate timestamptz;

comment on column operadores.codigo is 'Código curto (convenção: 4 dígitos, mesmo padrão de funcionarios.codigo_funcionario) para login alternativo por código+PIN. NULL para operadores que só usam e-mail/senha (ex.: a conta do dono). Único -- vira operador-<codigo>@venancio.internal no Supabase Auth.';
comment on column operadores.pin_tentativas_falhas is 'Contador de tentativas de PIN incorretas -- mesmo mecanismo anti-força-bruta de funcionarios.pin_tentativas_falhas. Zera a cada login bem-sucedido.';
comment on column operadores.pin_bloqueado_ate is 'Se preenchido e no futuro, bloqueia novas tentativas de login por código até este horário (5 tentativas erradas = 15 min de bloqueio, mesma regra de funcionarios).';
