-- RAG semântico do catálogo (PROMPT-03, Entrega 1) -- busca por descrição
-- ("material de desenho", "algo pra colorir") além da busca fuzzy por nome
-- exato que já existe (buscar_produto_fuzzy). Habilitado em 22/08/2026.
--
-- Nota sobre o texto embedado: os campos categoria_id/marca_id de `produtos`
-- estão todos nulos hoje (dado real verificado antes de escrever esta
-- migration) e `descricao` é lixo do sistema antigo (só "Código original:
-- NNNNN"), então o sinal semântico real vem de `nome` + `aliases` (já
-- populados pelo fix de busca fuzzy de 19/08). Ingestão feita por
-- chatbot/papelaria-bot/scripts/gerar-embeddings.js.
--
-- Aplicado em produção via mcp__supabase__apply_migration (nome
-- "rag_produtos_embeddings") em 22/08/2026.

create extension if not exists vector;

create table if not exists produtos_embeddings (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null unique references produtos(id) on delete cascade,
  conteudo text not null,
  embedding vector(1536) not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table produtos_embeddings is
  'Embeddings (OpenRouter -> openai/text-embedding-3-small, 1536 dims) do texto de cada produto ativo, pra busca semantica. Ingestao via scripts/gerar-embeddings.js -- idempotente (upsert por produto_id).';

create index if not exists produtos_embeddings_embedding_idx
  on produtos_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

alter table produtos_embeddings enable row level security;

create policy "operadores leem produtos_embeddings"
  on produtos_embeddings for select
  to authenticated
  using (eh_operador_ativo());

revoke all on produtos_embeddings from anon, public;
grant select on produtos_embeddings to authenticated, service_role;
grant insert, update, delete on produtos_embeddings to service_role;

-- Busca semântica: mesmo teto de 5 resultados que a busca fuzzy já usa por
-- padrão. threshold default 0 (sem corte) -- diferente do 0.7 sugerido no
-- planejamento original: cosine similarity real medida em nomes curtos de
-- produto de papelaria (ex. "CADERNO 10 MAT TILIBRA SPICE") fica bem abaixo
-- de 0.7 mesmo em matches corretos: 0.7 devolveria vazio quase sempre. Corte
-- fica a critério de quem chama (a tool do agente já limita a 5 pelo ORDER
-- BY + LIMIT); ajustar o default aqui depois de medir com dado real.
create or replace function buscar_produtos_similares(
  query_embedding vector(1536),
  limite int default 5,
  threshold float default 0
)
returns table (
  produto_id uuid,
  nome text,
  preco numeric,
  aliases text[],
  similaridade float
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  select
    p.id,
    p.nome,
    p.preco,
    p.aliases,
    1 - (pe.embedding <=> query_embedding) as similaridade
  from produtos_embeddings pe
  join produtos p on p.id = pe.produto_id
  where p.ativo = true
    and 1 - (pe.embedding <=> query_embedding) > threshold
  order by pe.embedding <=> query_embedding
  limit limite;
end;
$function$;

revoke execute on function buscar_produtos_similares(vector, int, float) from anon, public;
grant execute on function buscar_produtos_similares(vector, int, float) to authenticated, service_role;
