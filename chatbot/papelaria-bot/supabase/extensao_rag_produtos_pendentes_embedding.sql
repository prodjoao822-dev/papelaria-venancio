-- Permite rodar a ingestão de embeddings do RAG (produtos_documentos) em
-- lotes pequenos e retomáveis -- resolve o rate limit do Gemini (free tier
-- da credential googlePalmApi usada no node "Embeddings Google Gemini
-- (Ingestão)", workflow "Agente vendedor"): a ingestão original buscava TODOS
-- os produtos ativos de uma vez e estourava o limite a partir do 2º lote de
-- 100 dentro da mesma execução. Agora cada chamada só pega produtos que AINDA
-- NÃO têm embedding (até p_limit por vez, default 100 -- 1 chamada ao Gemini
-- por execução), permitindo rodar a ingestão várias vezes com espera entre
-- uma e outra até completar o catálogo, sem duplicar o que já foi feito.
--
-- Usado pelo node "Buscar Produtos Pendentes p⁄ RAG" (httpRequest, RPC) no
-- lugar do antigo "Buscar Produtos Ativos p⁄ RAG" (Supabase getAll).
--
-- Aplicado em produção via mcp__supabase__apply_migration (nome
-- "rag_produtos_pendentes_embedding_rpc") em 22/08/2026. Usado pra completar
-- a ingestão inicial dos 575 produtos ativos no mesmo dia (rodado em levas de
-- 100, com espera de 45s-4min entre uma leva e outra até o rate limit liberar).
create or replace function produtos_pendentes_embedding(p_limit int default 100)
returns table (
  id uuid,
  nome text,
  preco numeric,
  aliases text[]
)
language sql
security definer
set search_path to 'public'
as $$
  select p.id, p.nome, p.preco, p.aliases
  from produtos p
  where p.ativo = true
    and not exists (
      select 1 from produtos_documentos pd
      where pd.metadata ->> 'produto_id' = p.id::text
    )
  order by p.id
  limit p_limit;
$$;

revoke execute on function produtos_pendentes_embedding(int) from anon, public;
grant execute on function produtos_pendentes_embedding(int) to authenticated, service_role;
