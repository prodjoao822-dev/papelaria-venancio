# PROMPT 03 — Inteligência Multimodal + RAG do Catálogo

## Contexto

Projeto Papelaria Venâncio. Monorepo `bot/`, `app/`, `docs/`, `n8n/`.
Backend: Supabase (PostgreSQL). Bot: Node.js. Agentes IA: n8n.
pgvector: NÃO está habilitado ainda — configurar do zero.
Catálogo: ~80 produtos ativos na tabela `produtos` do Supabase.

## Problema

1. O agente de IA consulta produtos via tool call SQL direto (ferramenta `Estoque_produtos` no n8n), que retorna matches exatos. Buscas semânticas (ex: "material de desenho", "algo pra colorir") não funcionam.
2. O bot não entende áudio, imagem nem PDF enviados pelo cliente. No Volta às Aulas passado, pais pediam fotos de mochilas/estojos constantemente, travando o atendimento.
3. Não existe sistema de PDFs prontos por categoria visual para envio rápido.

## Objetivo

3 entregas independentes que podem rodar em paralelo:

---

### Entrega 1: RAG com pgvector no Supabase

**Passo 1 — Habilitar pgvector:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Passo 2 — Criar tabela de embeddings:**
```sql
CREATE TABLE produtos_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid REFERENCES produtos(id) ON DELETE CASCADE,
  conteudo text NOT NULL,
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON produtos_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);
```

**Passo 3 — Script de ingestão:**
Criar `bot/scripts/gerar-embeddings.js`:
- Busca todos os produtos ativos da tabela `produtos`.
- Para cada produto, monta um texto rico: `"{nome} - {descricao} - Categoria: {categoria} - Marca: {marca} - Preço: R$ {preco}"`.
- Gera embedding via OpenAI `text-embedding-3-small` (1536 dims).
- Insere na tabela `produtos_embeddings`.
- Deve ser idempotente (upsert por `produto_id`).
- Deve rodar manualmente (`node bot/scripts/gerar-embeddings.js`) e também poder ser chamado via cron/n8n quando o catálogo mudar.

**Passo 4 — Função de busca semântica no Supabase:**
```sql
CREATE OR REPLACE FUNCTION buscar_produtos_similares(
  query_embedding vector(1536),
  limite int DEFAULT 5,
  threshold float DEFAULT 0.7
)
RETURNS TABLE (
  produto_id uuid,
  nome text,
  categoria text,
  preco numeric,
  similaridade float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.categoria,
    p.preco,
    1 - (pe.embedding <=> query_embedding) AS similaridade
  FROM produtos_embeddings pe
  JOIN produtos p ON p.id = pe.produto_id
  WHERE p.ativo = true
    AND 1 - (pe.embedding <=> query_embedding) > threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT limite;
END;
$$;
```

**Passo 5 — Integrar no n8n:**
- No workflow do Agente Comercial, adicionar uma tool alternativa chamada `Busca_Inteligente` que:
  1. Recebe a query do cliente (já qualificada pelo prompt consultivo — ver PROMPT-02).
  2. Gera embedding da query via OpenAI.
  3. Chama `buscar_produtos_similares()` via Supabase.
  4. Retorna os produtos ranqueados por similaridade.
- Manter a tool `Estoque_produtos` (busca exata) como fallback para quando o cliente especificar produto exato.
- No system prompt do agente, instruir: "Use Busca_Inteligente para pedidos genéricos/descritivos. Use Estoque_produtos para buscas por nome/marca exata."

---

### Entrega 2: Classificador de mídia no bot (áudio, imagem, PDF)

No `webhookController.js`, ANTES de enviar ao agente, classificar o tipo de mídia recebida:

```
Texto puro → segue fluxo normal
Áudio → transcrever via OpenAI Whisper → segue como texto
Imagem do cliente → descrever via GPT-4o Vision ("O que o cliente está mostrando?") → segue como texto com contexto visual
PDF/Documento → extrair texto (pdf-parse ou similar) → segue como texto
```

**Implementação:**

1. Criar `bot/src/utils/mediaProcessor.js`:
   - `transcreverAudio(mediaUrl)` → chama Whisper API, retorna texto.
   - `descreverImagem(mediaUrl)` → chama GPT-4o Vision, retorna descrição.
   - `extrairTextoPDF(mediaUrl)` → baixa e extrai texto.
   - Todas as funções recebem a URL da mídia que vem no payload da Evolution API.

2. No `webhookController.js`, antes de chamar `consultarAgenteVendasComRedeDeSeguranca`:
   - Detectar tipo de mídia no payload da Evolution API.
   - Se for áudio/imagem/PDF, processar com `mediaProcessor.js`.
   - Passar o texto resultante (transcrição, descrição ou conteúdo extraído) como campo `texto` no payload para o n8n, acrescentando contexto: `"[Áudio transcrito]: {texto}"` ou `"[O cliente enviou uma imagem]: {descrição}"`.

3. **Limite de segurança**: se o processamento de mídia falhar (timeout, API indisponível), enviar o texto `"O cliente enviou um(a) {tipo} que não consegui processar. Por favor, peça para ele descrever em texto."` e seguir normalmente.

---

### Entrega 3: PDFs prontos por categoria visual

Sistema para envio rápido de catálogos visuais quando o cliente pede foto de produtos.

**Implementação:**

1. Criar tabela `catalogos_visuais` no Supabase:
```sql
CREATE TABLE catalogos_visuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL UNIQUE,
  arquivo_url text NOT NULL,
  descricao text,
  atualizado_em timestamptz DEFAULT now()
);
```

2. Categorias iniciais (João vai montar os PDFs, o sistema só precisa servir):
   - Mochilas
   - Estojos
   - Cadernos (10 matérias, capa dura, etc.)
   - Canetas e lápis especiais
   - Materiais de arte

3. No system prompt do agente (n8n), adicionar regra:
```
# PEDIDO DE FOTO / CATÁLOGO VISUAL
Quando o cliente pedir para "ver fotos", "mandar foto", "mostrar como é", ou variações:
- Use a ferramenta Catalogo_Visual passando a categoria do produto.
- Se a ferramenta retornar um PDF, envie com: "Aqui tá o nosso catálogo de {categoria}! Dá uma olhada e me fala qual te interessa 😊"
- Se não tiver catálogo da categoria, diga: "Esse catálogo ainda estou atualizando, mas posso te descrever as opções que temos. Quer?"
```

4. Criar a tool `Catalogo_Visual` no n8n que consulta a tabela e retorna a URL do PDF.

5. Upload dos PDFs: usar Supabase Storage (bucket `catalogos`, acesso por signed URL — NÃO público, por segurança competitiva).

## Restrições

- NÃO alterar `stateMachine.js`.
- Media processor deve ser tolerante a falhas (never throw, always fallback).
- Embeddings: usar `text-embedding-3-small` (mais barato, suficiente para ~80 produtos).
- PDFs dos catálogos visuais serão criados manualmente pelo João — o sistema só armazena e serve.
- ⚠️ O fluxo de lista escolar (`listaEscolar.js`) continua DESATIVADO em produção.

## Critérios de aceite

- [ ] pgvector habilitado e tabela `produtos_embeddings` criada
- [ ] Script de ingestão roda com sucesso para os ~80 produtos
- [ ] Busca semântica retorna resultados relevantes para "material de desenho", "algo pra escola"
- [ ] Tool `Busca_Inteligente` funcionando no n8n e integrada ao agente
- [ ] Áudio recebido pelo bot é transcrito e enviado ao agente como texto
- [ ] Imagem recebida é descrita e enviada ao agente como contexto
- [ ] Tabela `catalogos_visuais` criada e tool `Catalogo_Visual` no n8n funcionando
- [ ] Signed URLs do Supabase Storage funcionando (não público)

## Dependências

- PROMPT-02 deve ser aplicado antes ou junto — o RAG funciona melhor com o prompt consultivo (a query já chega qualificada).

## Rollback

- pgvector: `DROP EXTENSION vector CASCADE;` (remove tudo).
- Media processor: remover a chamada no webhookController, voltar a processar só texto.
- Catálogos visuais: dropar tabela, remover tool do n8n.
