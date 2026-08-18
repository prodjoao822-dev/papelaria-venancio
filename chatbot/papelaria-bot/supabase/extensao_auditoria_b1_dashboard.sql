-- =====================================================================
-- VENÂNCIO — Fechamento do Bloqueador B1 (vistoria 15/08/2026)
-- =====================================================================
-- NÃO APLICADO EM PRODUÇÃO AINDA — mesma limitação de ambiente descrita
-- em extensao_seguranca_b0_orcamentos.sql (sem mcp__supabase__execute_mutation
-- nesta sessão, sem rota de rede até o Postgres direto). Rodar manualmente
-- no SQL Editor do Supabase.
--
-- Idempotente: CREATE OR REPLACE FUNCTION com as MESMAS assinaturas de
-- extensao_dashboard.sql / extensao_funcionarios_responsaveis.sql.
--
-- ── O QUE MUDA EM RELAÇÃO ÀS VERSÕES ANTERIORES ────────────────────────
-- As 5 funções abaixo continuam recebendo `p_operador_id` no payload (não
-- quebra a assinatura que o dashboard já chama), mas o valor desse
-- parâmetro é IGNORADO — o operador de verdade é sempre resolvido por
-- `auth.uid()` dentro da função, depois de confirmar `eh_operador_ativo()`.
-- Isto substitui as definições de:
--   - extensao_dashboard.sql (atualizar_status_pedido_dashboard,
--     atualizar_status_orcamento_dashboard, aceitar_orcamento_dashboard,
--     aprender_de_resposta_operador)
--   - extensao_funcionarios_responsaveis.sql (atribuir_responsavel_pedido)
-- Nenhuma lógica de negócio muda além da resolução do ator — mesmo padrão
-- de `funcionario_atual_id()`/`eh_operador_ativo()` em
-- extensao_separacao_delegada.sql.
--
-- ── Por que NÃO viram SECURITY DEFINER ──────────────────────────────────
-- B1 é diferente de B0: aqui a RLS já protege (nenhuma dessas 5 funções é
-- SECURITY DEFINER hoje, então quem chama precisa passar pelas policies
-- "operadores_escrita"/"operadores_atualizacao" de cada tabela, gateadas
-- por eh_operador_ativo() — ver extensao_dashboard.sql seção N e
-- extensao_rls_status_historico.sql). O problema aqui nunca foi "estranho
-- sem conta consegue escrever" (isso é B0), foi "operador legítimo grava
-- em nome de outro operador". Adicionar SECURITY DEFINER não é necessário
-- pra resolver isso e mudaria o modelo de permissão sem necessidade — a
-- correção mínima e correta é só trocar de onde vem o id do ator.
--
-- ── Confirmado antes de escrever isto: nenhum caller service_role ──────
-- grep em chatbot/ (JS Bot) não encontrou nenhuma chamada a nenhuma das 5
-- funções abaixo — só aparecem em arquivos .sql (definição/comentário).
-- São 100% dashboard (venancio-ai-ops), chamadas como `authenticated` via
-- supabase.rpc(...) com o client anon-key+sessão. Por isso o gate aqui é
-- só `eh_operador_ativo()`, sem bypass de service_role (diferente de B0).
-- =====================================================================


-- =====================================================================
-- A. extensao_dashboard.sql — wrappers de status com operador falsificável
-- =====================================================================

create or replace function atualizar_status_pedido_dashboard(
  p_pedido_id uuid,
  p_novo_status status_pedido,
  p_operador_id uuid,          -- IGNORADO: mantido só por compatibilidade de assinatura (ver cabeçalho)
  p_observacao text default null
)
returns pedidos as $$
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
$$ language plpgsql;


create or replace function atualizar_status_orcamento_dashboard(
  p_orcamento_id uuid,
  p_novo_status status_orcamento,
  p_operador_id uuid,          -- IGNORADO: mantido só por compatibilidade de assinatura (ver cabeçalho)
  p_observacao text default null
)
returns orcamentos as $$
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
$$ language plpgsql;


create or replace function aceitar_orcamento_dashboard(
  p_orcamento_id uuid,
  p_operador_id uuid           -- IGNORADO: mantido só por compatibilidade de assinatura (ver cabeçalho)
)
returns pedidos as $$
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
$$ language plpgsql;


create or replace function aprender_de_resposta_operador(
  p_memoria_produto_id uuid,
  p_disponibilidade text,
  p_preco numeric,
  p_operador_id uuid,          -- IGNORADO: mantido só por compatibilidade de assinatura (ver cabeçalho)
  p_observacao text,
  p_origem text default 'manual'
)
returns memoria_produtos as $$
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
$$ language plpgsql;


-- =====================================================================
-- B. extensao_funcionarios_responsaveis.sql — atribuição de responsável
-- =====================================================================

create or replace function atribuir_responsavel_pedido(
  p_pedido_id uuid,
  p_tipo text,              -- 'separacao' ou 'entrega'
  p_funcionario_id uuid,
  p_operador_id uuid        -- IGNORADO: mantido só por compatibilidade de assinatura (ver cabeçalho)
)
returns pedidos as $$
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
$$ language plpgsql;


-- =====================================================================
-- C. VERIFICAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- Teste de falsificação (deve FALHAR ou, se permitido pela RLS, gravar
-- o auth.uid() de quem chamou — NUNCA o p_operador_id informado):
--   1. Logar como Operador A (auth.uid() = A).
--   2. Chamar atualizar_status_pedido_dashboard(pedido_x, 'em_separacao', <id do Operador B>, null).
--   3. Conferir pedidos_status_historico.operador_id da linha nova: deve
--      ser A, nunca B.
-- Repetir o mesmo padrão para as outras 4 funções.
-- =====================================================================


-- =====================================================================
-- NOTA DE EXECUÇÃO — APLICADO em produção em 15/08/2026 via
-- mcp__supabase__execute_mutation (projeto esvduqgqiypcpgxhunsd), depois de
-- extensao_seguranca_b0_orcamentos.sql. `CREATE OR REPLACE FUNCTION`
-- confirmado preservando a ACL original das 5 funções (pg_proc.proacl
-- inalterado antes/depois) — nenhuma mudança de GRANT foi feita aqui, só
-- de lógica interna, como o design pretendia (RLS já protegia).
--
-- Verificação da seção C: não foi possível fazer o teste de falsificação
-- fim-a-fim (login real como Operador A) por falta de credencial de teste
-- disponível nesta sessão. Verificação feita em substituição: leitura do
-- corpo das 5 funções em produção após o CREATE OR REPLACE via
-- pg_get_functiondef(oid) — confirmado que `p_operador_id` aparece só na
-- assinatura (compatibilidade), nunca em nenhum insert/update; todo
-- `operador_id` gravado vem de `v_operador_id := auth.uid()`. Recomenda-se
-- ainda rodar o teste funcional fim-a-fim (login como dois operadores
-- distintos, um tentando falsificar o outro) na primeira oportunidade.
-- =====================================================================
