-- =====================================================================
-- VENÂNCIO — Fechamento do Bloqueador B0 (vistoria 15/08/2026)
-- =====================================================================
-- NÃO APLICADO EM PRODUÇÃO AINDA — ver nota de execução no final do
-- arquivo. Escrito por um agente sem acesso de rede ao Postgres de
-- produção nesta sessão (mcp__supabase__execute_mutation indisponível
-- na lista de ferramentas; conexão direta via DATABASE_URL bloqueada
-- pelo firewall de saída do sandbox — DNS de db.<projeto>.supabase.co e
-- do host do pooler não resolve/conecta a partir deste ambiente).
--
-- Idempotente: seguro rodar mais de uma vez (CREATE OR REPLACE FUNCTION
-- com a MESMA assinatura de correcoes_criticas.sql; REVOKE é idempotente
-- por natureza).
--
-- ── O QUE ESTE ARQUIVO MUDA EM RELAÇÃO A correcoes_criticas.sql ───────
-- `aceitar_orcamento`, `atualizar_status_orcamento` e
-- `criar_orcamento_com_itens_tx` ganham um gate de identidade no início
-- do corpo. Fora isso, a lógica de negócio de cada uma é EXATAMENTE a
-- mesma de `correcoes_criticas.sql` (idempotência, checagem de itens,
-- transições de status, cópia de itens) — não altera nenhum
-- comportamento além da autorização. Isto substitui (CREATE OR REPLACE,
-- mesma assinatura) as definições de `correcoes_criticas.sql`; não rode
-- as duas versões fora de ordem — esta é a versão vigente a partir de
-- 15/08/2026.
--
-- ── POR QUE O GATE É "service_role OU operador ativo", NÃO SÓ operador ─
-- As duas chamadoras legítimas confirmadas são: (1) o JS Bot, que usa
-- SUPABASE_SERVICE_KEY diretamente; (2) o sub-workflow n8n "Fechar
-- Orçamento" (RVwx3aBcDcQBohpg), que tem sua PRÓPRIA credencial
-- service_role configurada no workflow (não depende de anon/authenticated
-- — confirmado no handoff desta tarefa). Nenhuma delas tem auth.uid()
-- (JWT de service_role não carrega sub de usuário) — por isso o gate
-- teria de recusar as duas se checasse só eh_operador_ativo(). auth.role()
-- já é o idioma usado no resto do projeto pra reconhecer service_role
-- (ver policies "service_role_full_access" em extensao_dashboard.sql e
-- extensao_separacao_delegada.sql) — reaproveitado aqui, não inventado.
--
-- ── ACHADO QUE MUDOU O PLANO ORIGINAL (leia antes de rodar o REVOKE) ───
-- A instrução original pedia:
--   revoke execute on function aceitar_orcamento(uuid, text) from anon, authenticated;
--   revoke execute on function atualizar_status_orcamento(uuid, status_orcamento, text) from anon, authenticated;
-- Investigação encontrou um caller legítimo de `authenticated` que essas
-- duas linhas QUEBRARIAM:
--   venancio-ai-ops/src/services/orcamentos.service.js:85,106 chama, via
--   `supabase.rpc(...)` com o client anon-key+sessão (`@/supabase/client`,
--   role efetiva = authenticated depois do login), as funções
--   `atualizar_status_orcamento_dashboard` e `aceitar_orcamento_dashboard`
--   (extensao_dashboard.sql). Nenhuma das duas é SECURITY DEFINER — rodam
--   como quem chamou (SECURITY INVOKER, o padrão). Cada uma faz uma
--   chamada interna a `atualizar_status_orcamento`/`aceitar_orcamento`
--   respectivamente. Uma chamada de função dentro de outra função
--   SECURITY INVOKER continua sendo checada contra o role atual da sessão
--   (aqui, `authenticated`) — SECURITY DEFINER só entra em vigor quando a
--   função CHAMADA é a definer, trocando o contexto de execução DELA pra
--   dentro, não muda quem precisa ter EXECUTE pra chamá-la de fora.
--   Portanto: revogar EXECUTE de `authenticated` nessas duas funções
--   quebraria "Aceitar orçamento" e "Mudar status de orçamento" no
--   dashboard em produção — um fluxo real, hoje funcionando.
--
-- A solução que fecha o buraco de segurança SEM quebrar esse fluxo: o
-- gate de identidade dentro do corpo (esta migração) já bloqueia
-- `authenticated` sem ser operador ativo — não depende mais do GRANT pra
-- autorizar. Por isso o REVOKE abaixo NÃO inclui `authenticated` para
-- `aceitar_orcamento`/`atualizar_status_orcamento` (só `anon`, que nunca
-- teve caller legítimo nenhum). `criar_orcamento_com_itens_tx` É revogada
-- de `authenticated` também, porque nenhum caller (bot ou dashboard) foi
-- encontrado usando essa função como `authenticated` — só o JS Bot a
-- chama, e sempre via service_role (grep em venancio-ai-ops/src não achou
-- nenhuma chamada a `criar_orcamento_com_itens_tx`).
-- =====================================================================


-- =====================================================================
-- A. GATE DE IDENTIDADE — mesma lógica de negócio de correcoes_criticas.sql,
--    só adicionando a checagem de autorização no início do corpo.
-- =====================================================================

create or replace function atualizar_status_orcamento(
  p_orcamento_id uuid,
  p_novo_status  status_orcamento,
  p_origem       text
)
returns orcamentos as $$
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
$$ language plpgsql
security definer set search_path = public;


create or replace function aceitar_orcamento(
  p_orcamento_id uuid,
  p_origem       text
)
returns pedidos as $$
declare
  v_pedido      pedidos;
  v_item_count  integer;
begin
  if auth.role() <> 'service_role' and eh_operador_ativo() is not true then
    raise exception 'Apenas operadores ativos ou processos internos podem aceitar um orçamento';
  end if;

  -- Idempotência: pedido já existe → retorná-lo sem tentar recriar
  select * into v_pedido from pedidos where orcamento_id = p_orcamento_id;
  if found then
    return v_pedido;
  end if;

  -- Guardar contra orçamento sem itens
  select count(*) into v_item_count
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  if v_item_count = 0 then
    raise exception 'Orçamento % não pode ser aceito: nenhum item encontrado', p_orcamento_id;
  end if;

  -- Transição de status (usa a versão corrigida definida acima)
  perform atualizar_status_orcamento(p_orcamento_id, 'aceito', p_origem);

  -- Criar pedido
  insert into pedidos (cliente_id, orcamento_id, conversa_id)
  select cliente_id, id, conversa_id
  from orcamentos
  where id = p_orcamento_id
  returning * into v_pedido;

  -- Copiar itens
  insert into itens_pedido
    (pedido_id, produto_id, descricao_livre, quantidade, valor_unitario)
  select
    v_pedido.id, produto_id, descricao_livre, quantidade, valor_unitario
  from itens_orcamento
  where orcamento_id = p_orcamento_id;

  -- Histórico inicial
  insert into pedidos_status_historico
    (pedido_id, status_anterior, status_novo, origem)
  values
    (v_pedido.id, null, 'confirmado', p_origem);

  return v_pedido;
end;
$$ language plpgsql
security definer set search_path = public;


create or replace function criar_orcamento_com_itens_tx(
  p_cliente_id  uuid,
  p_conversa_id uuid,
  p_tipo        tipo_pedido,
  p_escola_id   uuid,
  p_observacoes text,
  p_itens       jsonb
  -- Formato p_itens: [{"produto_id": null|uuid, "descricao_livre": "...",
  --                    "quantidade": 1, "valor_unitario": 9.90}, ...]
)
returns orcamentos as $$
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
$$ language plpgsql
security definer set search_path = public;


-- =====================================================================
-- B. VIEW — trava a leitura de anon (security_invoker já aplicado em
--    produção em 15/08; falta só este revoke)
-- =====================================================================

revoke select on v_clientes_crm from anon;
-- `authenticated` mantém SELECT de propósito: clientes.service.js
-- (venancio-ai-ops) lê esta view como dashboard logado, e como a view já
-- é security_invoker=true, a RLS real de `clientes`/`pedidos`/`orcamentos`
-- (gate eh_operador_ativo()) se aplica por trás dela mesmo assim.


-- =====================================================================
-- C. GRANTS — fecha o acesso de anon nas 3 RPCs; fecha authenticated só
--    onde não há caller legítimo confirmado (ver nota no cabeçalho)
-- =====================================================================

revoke execute on function aceitar_orcamento(uuid, text) from anon;
revoke execute on function atualizar_status_orcamento(uuid, status_orcamento, text) from anon;
revoke execute on function criar_orcamento_com_itens_tx(uuid, uuid, tipo_pedido, uuid, text, jsonb) from anon, authenticated;

-- NÃO revogamos EXECUTE de `authenticated` em aceitar_orcamento/
-- atualizar_status_orcamento — ver "ACHADO QUE MUDOU O PLANO ORIGINAL" no
-- cabeçalho. O gate de identidade da seção A já impede um `authenticated`
-- que não seja operador ativo de fazer qualquer coisa com essas funções.

-- ── CORREÇÃO ENCONTRADA NA APLICAÇÃO REAL (15/08/2026) ──────────────────
-- As 3 funções já tinham EXECUTE concedido a `PUBLIC` (grant automático
-- que o Postgres dá na criação de função, nunca revogado antes desta
-- migração). `anon`/`authenticated` herdam PUBLIC — então o `revoke ...
-- from anon` acima, sozinho, NÃO bastava: `has_function_privilege` para
-- anon continuava true via PUBLIC. Confirmado consultando `pg_proc.proacl`
-- antes/depois. Corrigido revogando de PUBLIC e reconcedendo explicitamente
-- só para os roles que devem manter acesso:

revoke execute on function aceitar_orcamento(uuid, text) from public;
revoke execute on function atualizar_status_orcamento(uuid, status_orcamento, text) from public;
revoke execute on function criar_orcamento_com_itens_tx(uuid, uuid, tipo_pedido, uuid, text, jsonb) from public;

grant execute on function aceitar_orcamento(uuid, text) to authenticated, service_role;
grant execute on function atualizar_status_orcamento(uuid, status_orcamento, text) to authenticated, service_role;
grant execute on function criar_orcamento_com_itens_tx(uuid, uuid, tipo_pedido, uuid, text, jsonb) to service_role;


-- =====================================================================
-- D. VERIFICAÇÃO (rodar depois de aplicar, antes de marcar B0 como fechado)
-- =====================================================================
-- 1) anon não deve mais aparecer nesta lista para nenhuma das 3 funções
--    nem para v_clientes_crm:
--
--   select table_name as objeto, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_name = 'v_clientes_crm' and grantee = 'anon'
--   union all
--   select p.proname, r.rolname, 'EXECUTE'
--   from pg_proc p
--   join pg_roles r on r.rolname in ('anon','authenticated')
--   where p.proname in ('aceitar_orcamento','atualizar_status_orcamento','criar_orcamento_com_itens_tx')
--     and has_function_privilege(r.oid, p.oid, 'EXECUTE')
--     and (r.rolname = 'anon' or p.proname = 'criar_orcamento_com_itens_tx');
--
-- 2) Teste funcional com só a anon key (deve dar erro de permissão em
--    todos os 4 casos):
--
--   curl -s "$SUPABASE_URL/rest/v1/v_clientes_crm?limit=1" -H "apikey: $ANON_KEY"
--   curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/aceitar_orcamento" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"p_orcamento_id":"00000000-0000-0000-0000-000000000000","p_origem":"teste"}'
--
-- 3) Teste de regressão do fluxo real do dashboard (login como operador,
--    aceitar um orçamento de teste e mudar status de outro) — confirma
--    que a decisão da seção C (não revogar authenticated) não quebrou
--    orcamentos.service.js:85,106.
--
-- 4) Teste de regressão do bot/n8n: fechar um orçamento de teste pelo
--    fluxo real do WhatsApp (usa service_role, deve continuar OK porque
--    o gate da seção A libera auth.role() = 'service_role').
-- =====================================================================


-- =====================================================================
-- NOTA DE EXECUÇÃO — APLICADO em produção em 15/08/2026 via
-- mcp__supabase__execute_mutation (projeto esvduqgqiypcpgxhunsd), incluindo
-- a correção de PUBLIC descrita acima. Verificação da seção D executada:
-- anon sem SELECT em v_clientes_crm e sem EXECUTE nas 3 funções (teste de
-- pg_proc.proacl + teste funcional real com curl usando só a anon key —
-- os 4 casos retornaram 42501 permission denied). authenticated/service_role
-- mantiveram EXECUTE conforme decisão documentada no cabeçalho.
-- =====================================================================
