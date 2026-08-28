-- Mantém a busca do Agente de Vendas (RAG) em dia quando um produto é
-- editado. Até agora a indexação em `produtos_documentos` só rodava pra
-- produto que AINDA NÃO tinha documento (ver `produtos_pendentes_embedding`,
-- extensao_rag_produtos_pendentes_embedding.sql) -- uma vez indexado, o texto
-- (nome + apelidos + preço, ver o node de ingestão do workflow "Agente
-- vendedor") ficava congelado pra sempre, mesmo que o produto mudasse depois.
--
-- Descoberto em 28/08/2026 ao auditar o catálogo (577 produtos, os 575 ativos
-- já indexados em 22/08, nenhum editado nos últimos 7 dias) antes de uma
-- rodada de atualização em massa de preço/categoria/apelido.
--
-- Este gatilho apaga o(s) documento(s) indexado(s) de um produto sempre que
-- nome, apelidos ou preço mudam -- o pipeline de ingestão que já existe pega
-- o produto de novo sozinho na próxima leva, porque `produtos_pendentes_embedding`
-- só busca quem ainda não tem documento. Não mexe em nada do n8n.
create or replace function reindexar_produto_editado()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if (new.nome is distinct from old.nome)
     or (new.aliases is distinct from old.aliases)
     or (new.preco is distinct from old.preco) then
    delete from produtos_documentos
    where metadata ->> 'produto_id' = new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_produtos_reindexar_ao_editar on produtos;
create trigger trg_produtos_reindexar_ao_editar
after update on produtos
for each row execute function reindexar_produto_editado();
