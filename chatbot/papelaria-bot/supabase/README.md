# Banco de dados (Supabase / Postgres) — ordem de aplicação

> **Leia isto antes de rodar qualquer `.sql` deste diretório.**
> Escrito em 26/08/2026, junto com o baseline. Se você chegou aqui pelo
> `README.md` do bot, é este arquivo que vale.

---

## O problema que este arquivo resolve

Até 26/08/2026 o repositório **não era fonte de verdade do banco**. Isso está
registrado como **Bloqueador B6** (vistoria de 15/08/2026) e foi reconfirmado
na auditoria de 25/08/2026:

- produção tinha **137 policies** de RLS; os arquivos versionados aqui cobriam
  só uma fração delas — o resto foi aplicado direto pelo SQL Editor e nunca
  virou arquivo;
- o controle de migração do Supabase (`supabase_migrations.schema_migrations`)
  só começa em **20/08/2026**, com 11 migrações. Tudo o que veio antes está
  fora de qualquer controle de versão;
- consequência prática: quem montasse um banco novo a partir do repositório
  obtinha um banco **incompleto e sem boa parte da RLS** — ou seja, aberto.

A partir de agora existe `baseline_producao_26-08-2026.sql`, gerado por
introspecção do catálogo do Postgres de produção. É ele que fecha o buraco.

---

## Caminho A — banco NOVO (staging, ambiente local, recriar do zero)

Rode **nesta ordem**, tudo no SQL Editor do Supabase (ou via `psql`):

| # | Arquivo | O que é |
|---|---------|---------|
| 1 | `baseline_producao_26-08-2026.sql` | **Schema completo**: extensões, enums, 38 tabelas, constraints, índices, 62 funções, a view `v_clientes_crm`, 25 triggers, `enable row level security` + **as 137 policies**, GRANTs/REVOKEs por role e as publicações de realtime. |
| 2 | `extensao_indices_status_historico.sql` | Índices de FK em `pedidos_status_historico` / `orcamentos_status_historico`. Separado do baseline porque **ainda não estava aplicado em produção** em 26/08 — o baseline retrata produção, não o estado desejado. |
| 3 | `extensao_seguranca_p1_status_pedido.sql` | Fecha o problema P1 (`atualizar_status_pedido` executável por `anon` sem checagem de identidade). Mesmo motivo do item 2: ainda não estava em produção quando o baseline foi gerado. |
| 4 | `seed_escolas.sql` | Dado de catálogo: as 25 escolas. |
| 5 | `seed_produtos_orcamentos2026.sql` | Dado de catálogo: produtos. |

Depois disso o banco novo é equivalente ao de produção **mais** os itens 2 e 3.

### O que o baseline NÃO cobre

Seja explícito sobre isso ao usar:

- **schemas `auth`, `storage`, `realtime`, `vault`, `extensions`** — são
  gerenciados pelo Supabase e vêm prontos em qualquer projeto novo. Só o
  schema `public` foi extraído.
- **usuários / roles** — os roles `anon`, `authenticated`, `service_role` e
  `postgres` já existem em qualquer projeto Supabase. Os **usuários de login**
  (linhas em `auth.users`) não são exportados; sem eles, `operadores` e
  `funcionarios` ficam sem contraparte em `auth`, e nenhum login funciona.
  Crie os usuários pelo painel e acerte `operadores.id` (que É o `auth.uid()`)
  e `funcionarios.auth_user_id`.
- **dados de negócio** — clientes, conversas, orçamentos, pedidos, eventos.
  Só os seeds de catálogo acima estão versionados.
- **embeddings** (`produtos_documentos`) — a tabela é criada vazia. A carga é
  feita pela branch manual "Rodar Ingestão de Embeddings" do workflow
  "Agente vendedor" no n8n.
- **configuração fora do banco** — Storage buckets, Edge Functions, cron jobs,
  webhooks e as chaves de API.

---

## Caminho B — o banco de PRODUÇÃO (o que já existe)

**Nunca** rode o baseline inteiro em produção. Ele é um retrato, não uma
migração: rodá-lo por cima faria `drop policy` / `drop trigger` de coisas que
podem ter mudado depois de 26/08.

Em produção, aplique **só o arquivo novo da mudança**, e registre a migração:

1. Escreva o `.sql` neste diretório, com o comentário de cabeçalho explicando
   **por quê** (data + incidente que motivou) — siga o estilo dos arquivos
   existentes, p. ex. `extensao_seguranca_p1_status_pedido.sql`.
2. Aplique via `mcp__supabase__apply_migration` (registra sozinho em
   `supabase_migrations.schema_migrations`) **ou** rode o SQL no SQL Editor e
   em seguida insira a linha correspondente em
   `supabase_migrations.schema_migrations`.
3. Valide com uma consulta de leitura que o efeito foi o esperado.
4. Commite o `.sql`. **Migração que existe só no banco é exatamente o B6.**

Pendente em 26/08/2026: os itens 2 e 3 da tabela do Caminho A **ainda não
foram aplicados em produção**.

---

## Arquivos históricos (não use para montar banco novo)

Estes continuam aqui como registro de **por que** cada coisa é como é — vários
têm o raciocínio de segurança escrito no cabeçalho, o que o baseline gerado por
máquina não tem. Para montar um banco, eles foram **substituídos pelo
baseline**.

- `schema.sql` — ⚠️ **LEGADO (14/07/2026). NÃO RODE.** É o schema da primeira
  versão do bot, com 4 tabelas e **sem uma linha de RLS**. Foi por muito tempo
  o arquivo apontado pelo README do bot como "SQL completo de criação" — quem
  seguisse aquilo montava um banco aberto. Mantido só como histórico.
- `squemanovo.sql` — schema consolidado que substituiu o `schema.sql`.
- `extensao_dashboard.sql`, `extensao_rls_status_historico.sql`,
  `extensao_notificacoes_e_retomada.sql`, `extensao_cadastro_fiscal.sql`,
  `extensao_correcao_empresa_id.sql`, `extensao_funcionarios_responsaveis.sql`,
  `extensao_marcas.sql`, `correcoes_criticas.sql`,
  `extensao_separacao_delegada.sql`, `fix_realtime_publication.sql`,
  `extensao_rls_completa.sql`, `extensao_auditoria_b1_dashboard.sql`,
  `extensao_seguranca_b0_orcamentos.sql`, `extensao_entrega_ocorrencia.sql`,
  `extensao_rls_leitura_funcionarios_atribuidos.sql`,
  `extensao_horario_retirada_pedido.sql`, `extensao_escalonamento_fila.sql`,
  `extensao_taxa_entrega_bairro_e_minimo.sql`,
  `extensao_consultar_status_pedido_cliente.sql`,
  `extensao_rag_produtos_embeddings.sql`,
  `extensao_rag_produtos_vectorstore_nativo.sql`,
  `extensao_rag_produtos_pendentes_embedding.sql`
  — extensões incrementais, aplicadas entre 23/07 e 22/08/2026, na ordem de
  data do cabeçalho de cada arquivo. Cuidado: a data de modificação do arquivo
  no disco **não** é confiável como ordem (`squemanovo.sql` é a base, mas tem
  mtime posterior a `extensao_dashboard.sql`, por ter sido editado depois).
  Vários deles se sobrescrevem via `CREATE OR REPLACE FUNCTION` — é por isso
  que rodá-los fora de ordem é perigoso, e por isso o baseline existe.

---

## Regras que não mudam

- **Nunca** `grant execute` / `grant select` para `anon` por padrão. Só com um
  motivo documentado (endpoint público de verdade).
- Ao revogar EXECUTE de uma função, **revogue de `public` também**, não só de
  `anon`/`authenticated`. Todo role herda de `public`; um
  `revoke ... from anon` sozinho pode não fechar nada. Confira com
  `has_function_privilege('anon', '<fn>(<args>)', 'EXECUTE')` depois.
- RPC nova só é `SECURITY DEFINER` quando precisa mesmo furar a RLS por
  design — e nesse caso **tem** que ter checagem de identidade no corpo, a
  menos que o único chamador legítimo seja `service_role`.
- Ao comparar o ator com um valor que pode ser `NULL`, use
  `IS DISTINCT FROM` / `IS NOT TRUE` e um `... is not null` explícito. Compare
  `<>` puro contra `NULL` dá `NULL`, e um `if NULL then raise` **não dispara** —
  autorização passa em silêncio.
- Nunca use `CREATE OR REPLACE FUNCTION` para mudar o comportamento de uma
  função em uso sem deixar, no arquivo novo, um comentário apontando qual
  definição anterior ele substitui. O projeto já teve duas definições
  divergentes da mesma função se sobrescrevendo em silêncio.

---

## Como regerar o baseline

O baseline foi gerado por `scripts/gerarBaselineSupabase.mjs`, um script de
introspecção **somente-leitura** (`pg_catalog` + `information_schema`) rodado
contra produção — ele não executa DDL nenhum. Ele não é um
`pg_dump` — `pg_dump` não estava disponível no ambiente. Diferenças a
conhecer: não traz `ALTER ... OWNER TO`, não ordena tabelas por dependência
(por isso as FKs vêm depois, na seção 4, e não inline no `CREATE TABLE`), e
os `GRANT`s foram reconstruídos a partir de `relacl`/`attacl`/`proacl`.
Ao regerar, confira os totais no cabeçalho contra o banco.
