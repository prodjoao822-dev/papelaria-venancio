-- =====================================================================
-- VENÂNCIO — Fix duplicação de item + RPC de remoção de item de orçamento
-- =====================================================================
-- APLICADO em produção em 02/09/2026 (via apply_migration, sessão com
-- acesso direto) e validado ao vivo com dado de teste descartável
-- (orçamento ORC-2026-0258, apagado depois do teste): confirmado que
-- chamar adicionar_item_orcamento 2x pro mesmo produto NÃO duplica linha
-- (fica 1 linha, quantidade = valor da 2ª chamada, não soma); confirmado
-- que remover_item_orcamento remove e recalcula valor_total corretamente,
-- e que a 2ª chamada é idempotente (removido:false, sem erro); confirmado
-- que a trava "só rascunho" barra as duas funções com a mensagem de erro
-- esperada quando o orçamento está em outro status. Grants conferidos via
-- has_function_privilege (só authenticated/service_role, sem anon/public).
--
-- Escrito originalmente por um agente sem `execute_sql`/`apply_migration`
-- disponíveis na sessão (mesma limitação já registrada em
-- `extensao_seguranca_b0_orcamentos.sql`, 15/08) — o SQL foi revisado e
-- aplicado/validado por esta sessão com acesso direto, sem nenhuma
-- alteração no conteúdo do que foi escrito.
--
-- ── O INCIDENTE (relatado pelo dono, 02/09/2026) ───────────────────────
-- Pedido PED-2026-0257 / orçamento ORC-2026-0256 / conversa
-- d3e059a4-b9c7-4991-9f76-6a1cc0f3dd08. O Agente de Vendas (n8n) tentou
-- adicionar "papel report" e, por um erro de resolução de produto (fora
-- do escopo desta migração — ver memória `fix_busca_produto_agente_vendas`
-- e `fix_produto_id_alucinado_25-08`), adicionou ao orçamento o item
-- errado "PAPEL REPORT A4 SENNINHA BRANCO 100FLS", nunca mencionado pelo
-- cliente. O agente percebeu o erro, mas **não existe nenhuma ferramenta
-- para remover ou corrigir um item** — só para adicionar. Na tentativa de
-- "corrigir", ele voltou a chamar "Adicionar Item ao Orçamento" para os
-- itens que já estavam certos (caderno, caneta, lápis), sem nunca
-- conseguir tirar o item errado. Resultado: pedido fechado com R$146,91
-- em vez de R$122,94, com 3 linhas duplicadas (caderno/caneta/lápis) e o
-- item errado ainda presente.
--
-- ── CAUSA RAIZ (confirmada por leitura ao vivo do workflow) ────────────
-- Não existe (e nunca existiu) uma RPC `adicionar_item_orcamento` — a
-- ação "adicionar_item" do sub-workflow "Orçamento (Sub-workflow)"
-- (`RVwx3aBcDcQBohpg`, node "Supabase · Insere Item") faz um INSERT cru
-- via node Supabase do n8n, sem nenhuma verificação de duplicidade.
-- Cada chamada da ferramenta cria uma linha NOVA em `itens_orcamento`,
-- mesmo que o mesmo `produto_id` já esteja no orçamento. Não é a IA que
-- "decidiu" duplicar — o INSERT cru é estruturalmente incapaz de fazer
-- outra coisa. Da mesma forma, não existe (nunca existiu) uma
-- `remover_item_orcamento` — por isso o agente não tinha NENHUMA
-- ferramenta para desfazer o item errado, só para adicionar mais.
--
-- Este arquivo cria as duas RPCs que faltam. A equipe do n8n troca depois
-- (tarefa separada, fora do escopo deste agente) o node
-- "Supabase · Insere Item" por uma chamada a `adicionar_item_orcamento`,
-- e expõe `remover_item_orcamento` como ferramenta nova pro Agente de
-- Vendas. Este arquivo NÃO mexe em nenhum workflow n8n.
--
-- ── DECISÃO DE DESIGN: SET, não incrementa ─────────────────────────────
-- `adicionar_item_orcamento` fica idempotente por produto: se já existe
-- uma linha em `itens_orcamento` para o mesmo `(orcamento_id, produto_id)`
-- (quando `produto_id` não é null), a chamada faz UPDATE dessa linha com
-- a quantidade/valor_unitario NOVOS informados (SET), em vez de inserir
-- uma linha nova ou somar à quantidade existente. A convenção adotada
-- para o sistema é a IA sempre informar a quantidade TOTAL desejada
-- daquele produto numa única chamada, não um incremento — mesmo padrão
-- que `criar_orcamento_com_itens_tx` já usa (a lista de itens que ele
-- recebe é o estado final desejado, não uma sequência de deltas). Isso
-- mata a causa da duplicação na raiz, no banco, independente de qualquer
-- ajuste de prompt do lado do n8n (que fica pendente, tarefa separada, e
-- pode divergir do texto atual da ferramenta "Adicionar Item ao
-- Orçamento" em `AGENTE_VENDAS.json`, que hoje não deixa essa convenção
-- explícita — outra causa contribuinte do incidente, também fora do
-- escopo deste agente).
--
-- Itens sem `produto_id` (`descricao_livre`, ex. "Escola: ...") mantêm o
-- comportamento antigo: sempre inserem uma linha nova. Não têm uma chave
-- natural de deduplicação confiável (duas linhas de `descricao_livre`
-- iguais podem legitimamente ser itens diferentes).
--
-- ── POR QUE AS DUAS RPCs TÊM UM GATE DE "rascunho apenas" ──────────────
-- Não pedido explicitamente para `adicionar_item_orcamento`, mas
-- adicionado por simetria/defesa em profundidade: o n8n já checa isso do
-- lado dele ("Ainda em Rascunho? · Adicionar Item"), e o mesmo raciocínio
-- de "não deixar mexer em orçamento fechado" que motiva o gate obrigatório
-- em `remover_item_orcamento` (pedido explícito da tarefa) se aplica
-- igualmente a adicionar. Consistente com o princípio já documentado no
-- README ("RPC nova... tem que ter checagem de identidade/estado no
-- corpo").
--
-- ── PADRÃO DE AUTORIZAÇÃO REUTILIZADO ───────────────────────────────────
-- Mesmo gate de `aceitar_orcamento`/`atualizar_status_orcamento`/
-- `criar_orcamento_com_itens_tx` (`extensao_seguranca_b0_orcamentos.sql`):
--   `auth.role() <> 'service_role' and eh_operador_ativo() is not true`
-- porque os chamadores legítimos são os mesmos dessa família de funções —
-- o JS Bot/n8n via `service_role`, e potencialmente o dashboard (futuro)
-- via operador logado (`authenticated`). NÃO usa `funcionario_atual_id()`
-- porque esse padrão é da família separação/entrega (papéis de
-- `funcionarios`), não da família orçamento (que já usa
-- `eh_operador_ativo()` — papel de `operadores`). Nenhuma das duas
-- funções recebe "ator" como parâmetro; a identidade vem só de
-- `auth.role()`/`eh_operador_ativo()`.
--
-- ── SOBRE O RETORNO ──────────────────────────────────────────────────────
-- Não existia nenhuma RPC formal `criar_orcamento`/`adicionar_item_orcamento`
-- antes deste arquivo (a "convenção de retorno" que essas ferramentas hoje
-- expõem ao Agente de Vendas é montada no lado do n8n, no node de código
-- "Code · Filtra Itens Existentes" do sub-workflow, não em uma RPC).
-- Confirmado ali: o array de itens que já é devolvido HOJE ao Agente de
-- Vendas já inclui `produto_id` por item (`produto_id: it.produto_id`,
-- linha do node) — item 4 do pedido desta tarefa já está satisfeito, sem
-- necessidade de mudança de banco. As duas RPCs novas formalizam essa
-- mesma convenção do lado do banco: devolvem `jsonb` com `orcamento_id`,
-- `protocolo`, `status`, `valor_total` (já recalculado pelo trigger
-- `trg_itens_orcamento_recalcular` — ver abaixo) e `itens` (lista
-- completa restante, cada item com `produto_id`), para servir de base à
-- ferramenta que a equipe do n8n vai expor depois.
--
-- ── SOBRE O RECÁLCULO DE valor_total ────────────────────────────────────
-- Não precisa de lógica nova: `itens_orcamento.valor_total` já é coluna
-- GERADA (`quantidade * valor_unitario`, confirmado ao vivo via
-- `list_tables`), e o trigger `trg_itens_orcamento_recalcular` (AFTER
-- INSERT OR UPDATE OR DELETE, `recalcular_valor_orcamento()`, já
-- SECURITY DEFINER desde `extensao_fix_recalculo_valor_security_definer.sql`)
-- já soma `itens_orcamento.valor_total` em `orcamentos.valor_total` nos
-- três casos — incluindo UPDATE (o `adicionar_item_orcamento` usa UPDATE
-- quando dedup) e DELETE (o `remover_item_orcamento` usa DELETE). As duas
-- RPCs só releem `orcamentos` depois da escrita para devolver o
-- `valor_total` já atualizado pelo trigger; não escrevem nele diretamente.
--
-- ── LIMITAÇÃO CONHECIDA (escopo desta migração) ─────────────────────────
-- Esta migração corrige o comportamento DAQUI PRA FRENTE. Se já existirem
-- linhas duplicadas de um mesmo produto num orçamento em rascunho (ex.:
-- causadas pelo próprio incidente relatado, antes deste fix), a primeira
-- chamada de `adicionar_item_orcamento` para aquele produto faz UPDATE em
-- só UMA das linhas duplicadas (a que o Postgres encontrar primeiro; sem
-- `ORDER BY`/`LIMIT` explícito não há garantia de qual), não consolida as
-- demais. Limpeza de duplicatas HISTÓRICAS (dado já em produção) é fora
-- do escopo pedido — este agente não tentou apagar nem mesclar linhas de
-- orçamento existentes.
--
-- Idempotente: seguro rodar de novo (CREATE OR REPLACE FUNCTION com a
-- MESMA assinatura). Estas são funções NOVAS — confirmado por grep em
-- todo o repositório (`.sql` versionado + `AGENTE_VENDAS.json` +
-- `Orçamento (Sub-workflow).json`) que nem `adicionar_item_orcamento` nem
-- `remover_item_orcamento` existiam antes, então este CREATE OR REPLACE
-- não substitui nenhum comportamento em uso — não há a divergência
-- silenciosa que motiva a regra de "sempre comentar o que muda" do
-- README para funções JÁ EM USO.
-- =====================================================================


-- =====================================================================
-- A. adicionar_item_orcamento — idempotente por (orcamento_id, produto_id)
-- =====================================================================

create or replace function public.adicionar_item_orcamento(
  p_orcamento_id    uuid,
  p_produto_id      uuid default null,
  p_descricao_livre text default null,
  p_quantidade      numeric default 1,
  p_valor_unitario  numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orc            orcamentos;
  v_item_id        uuid;
  v_atualizado     boolean := false;
  v_valor_unitario numeric;
begin
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem adicionar item a um orçamento';
  end if;

  select * into v_orc from orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento % não encontrado', p_orcamento_id;
  end if;

  if v_orc.status <> 'rascunho' then
    raise exception 'Só é possível adicionar item a um orçamento em rascunho (orçamento % está em %)',
      p_orcamento_id, v_orc.status;
  end if;

  if p_produto_id is null and (p_descricao_livre is null or length(trim(p_descricao_livre)) = 0) then
    raise exception 'Informe produto_id ou descricao_livre';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'quantidade deve ser maior que zero: %', p_quantidade;
  end if;

  if p_produto_id is not null and not exists (select 1 from produtos where id = p_produto_id) then
    raise exception 'Produto % não encontrado', p_produto_id;
  end if;

  -- Se não vier valor_unitario explícito e houver produto_id, usa o preço
  -- de catálogo como padrão (robustez extra; o chamador continua podendo
  -- informar um valor_unitario diferente, ex. desconto negociado).
  v_valor_unitario := coalesce(p_valor_unitario, (select preco from produtos where id = p_produto_id));

  if p_produto_id is not null then
    select id into v_item_id
    from itens_orcamento
    where orcamento_id = p_orcamento_id and produto_id = p_produto_id
    for update;
  end if;

  if v_item_id is not null then
    -- Já existe uma linha para este produto neste orçamento: SET, não soma.
    update itens_orcamento
      set quantidade     = p_quantidade,
          valor_unitario = v_valor_unitario
    where id = v_item_id;
    v_atualizado := true;
  else
    -- Produto novo no orçamento, ou item sem produto_id (descricao_livre,
    -- que sempre insere linha nova).
    insert into itens_orcamento (orcamento_id, produto_id, descricao_livre, quantidade, valor_unitario)
    values (p_orcamento_id, p_produto_id, p_descricao_livre, p_quantidade, v_valor_unitario)
    returning id into v_item_id;
  end if;

  select * into v_orc from orcamentos where id = p_orcamento_id;

  return jsonb_build_object(
    'orcamento_id', v_orc.id,
    'protocolo', v_orc.protocolo,
    'status', v_orc.status,
    'valor_total', v_orc.valor_total,
    'atualizado', v_atualizado,
    'item', (
      select jsonb_build_object(
        'id', i.id,
        'produto_id', i.produto_id,
        'descricao_livre', i.descricao_livre,
        'nome_item', i.nome_item,
        'quantidade', i.quantidade,
        'valor_unitario', i.valor_unitario,
        'valor_total', i.valor_total
      )
      from itens_orcamento i where i.id = v_item_id
    ),
    'itens', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'produto_id', i.produto_id,
        'descricao_livre', i.descricao_livre,
        'nome_item', i.nome_item,
        'quantidade', i.quantidade,
        'valor_unitario', i.valor_unitario,
        'valor_total', i.valor_total
      ) order by i.id), '[]'::jsonb)
      from itens_orcamento i where i.orcamento_id = p_orcamento_id
    )
  );
end;
$$;

revoke execute on function public.adicionar_item_orcamento(uuid, uuid, text, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.adicionar_item_orcamento(uuid, uuid, text, numeric, numeric)
  to authenticated, service_role;


-- =====================================================================
-- B. remover_item_orcamento — remove item de orçamento em rascunho,
--    idempotente (não erra se o item já não existir)
-- =====================================================================

create or replace function public.remover_item_orcamento(
  p_orcamento_id uuid,
  p_produto_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orc     orcamentos;
  v_item_id uuid;
begin
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem remover item de um orçamento';
  end if;

  if p_produto_id is null then
    raise exception 'Informe produto_id';
  end if;

  select * into v_orc from orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento % não encontrado', p_orcamento_id;
  end if;

  -- Nunca deixar remover item de orçamento já aceito/fechado.
  if v_orc.status <> 'rascunho' then
    raise exception 'Só é possível remover item de um orçamento em rascunho (orçamento % está em %)',
      p_orcamento_id, v_orc.status;
  end if;

  delete from itens_orcamento
  where orcamento_id = p_orcamento_id and produto_id = p_produto_id
  returning id into v_item_id;
  -- Se o item já não existia (removido antes, ou nunca existiu),
  -- v_item_id fica null e a função NÃO levanta erro — idempotente por
  -- design, conforme pedido: "nada a remover" é um resultado válido, não
  -- uma falha.

  select * into v_orc from orcamentos where id = p_orcamento_id;

  return jsonb_build_object(
    'orcamento_id', v_orc.id,
    'protocolo', v_orc.protocolo,
    'status', v_orc.status,
    'valor_total', v_orc.valor_total,
    'removido', v_item_id is not null,
    'item_removido_id', v_item_id,
    'itens', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'produto_id', i.produto_id,
        'descricao_livre', i.descricao_livre,
        'nome_item', i.nome_item,
        'quantidade', i.quantidade,
        'valor_unitario', i.valor_unitario,
        'valor_total', i.valor_total
      ) order by i.id), '[]'::jsonb)
      from itens_orcamento i where i.orcamento_id = p_orcamento_id
    )
  );
end;
$$;

revoke execute on function public.remover_item_orcamento(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remover_item_orcamento(uuid, uuid)
  to authenticated, service_role;


-- =====================================================================
-- C. VERIFICAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- 1) Grants corretos (anon/public não devem aparecer):
--
--   select p.proname, r.rolname
--   from pg_proc p
--   join pg_roles r on has_function_privilege(r.oid, p.oid, 'EXECUTE')
--   where p.proname in ('adicionar_item_orcamento', 'remover_item_orcamento')
--     and r.rolname in ('anon','authenticated','service_role','public');
--   -- esperado: só linhas com authenticated e service_role.
--
-- 2) Teste funcional de idempotência de adicionar_item_orcamento — criar
--    um orçamento de teste em rascunho e chamar a função 2x com o MESMO
--    produto_id e quantidade diferente na segunda chamada:
--
--   -- (usar um cliente_id/produto_id reais de teste; NÃO usar dado real
--   -- de cliente de produção)
--   select criar_orcamento_com_itens_tx(
--     '<cliente_id_teste>'::uuid, null, 'venda_geral', null, 'teste dedup', '[]'::jsonb
--   ) as orc \gset
--   select adicionar_item_orcamento((orc).id, '<produto_id_teste>'::uuid, null, 2, null);
--   select adicionar_item_orcamento((orc).id, '<produto_id_teste>'::uuid, null, 5, null);
--   select count(*) from itens_orcamento where orcamento_id = (orc).id;
--   -- esperado: count = 1 (não 2), quantidade = 5 (não 2, nem 7).
--
-- 3) Teste funcional de remover_item_orcamento:
--
--   select remover_item_orcamento((orc).id, '<produto_id_teste>'::uuid);
--   -- esperado: removido=true, itens=[] (se era o único item), valor_total=0.
--   select remover_item_orcamento((orc).id, '<produto_id_teste>'::uuid);
--   -- 2ª chamada: removido=false, sem erro (idempotente).
--
-- 4) Teste de regra "só rascunho": marcar o orçamento de teste como
--    'aceito' (ou usar um já aceito) e confirmar que ambas as funções
--    levantam exceção clara, sem alterar nada:
--
--   select adicionar_item_orcamento('<orcamento_aceito_id>'::uuid, '<produto_id>'::uuid, null, 1, null);
--   select remover_item_orcamento('<orcamento_aceito_id>'::uuid, '<produto_id>'::uuid);
--   -- esperado nos dois: erro "Só é possível ... em rascunho".
--
-- 5) Regressão de fechamento: confirmar que `aceitar_orcamento` continua
--    funcionando igual para um orçamento criado/editado pelas novas RPCs
--    (nenhuma mudança foi feita em `aceitar_orcamento` neste arquivo).
--
--   select aceitar_orcamento((orc).id, 'teste_migracao_02-09');
--
-- 6) Limpar o dado de teste depois de validar (não deixar orçamento de
--    teste "sujando" produção):
--
--   delete from itens_orcamento where orcamento_id = (orc).id;
--   delete from orcamentos where id = (orc).id;
--   -- (se o passo 5 rodou, também vai ter criado um pedido de teste —
--   -- apagar itens_pedido/pedidos correspondentes também.)
-- =====================================================================


-- =====================================================================
-- NOTA DE EXECUÇÃO — CONFIRMADO APLICADO E VALIDADO em produção (02/09/2026).
-- Todos os testes da seção C acima foram rodados com dado descartável
-- (orçamento de teste criado e apagado na mesma sessão) e passaram.
-- =====================================================================
