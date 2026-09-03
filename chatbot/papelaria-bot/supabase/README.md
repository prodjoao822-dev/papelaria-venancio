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
| 6 | `extensao_p5_orcamento_ativo_correto.sql` | Fecha o problema P5 (`orcamento_ativo_cliente` devolvia o rascunho mais recente em vez do que tinha itens). Ainda não estava em produção quando o baseline foi gerado. |
| 7 | `extensao_p5_indice_unico_rascunho_conversa.sql` | Rede de segurança de P5: índice único parcial (1 rascunho por `conversa_id`). **Falha de propósito** se ainda houver rascunhos duplicados por conversa não resolvidos pela tarefa T2.4 — leia o cabeçalho antes de rodar. |
| 8 | `extensao_push_tokens.sql` | Fecha o problema P20 (RF-08): tabela `push_tokens` + RPC `registrar_push_token`, fundação de banco para push. Ainda não estava em produção quando o baseline foi gerado. |
| 9 | `extensao_fix_recalculo_valor_security_definer.sql` | Fix "permission denied for table orcamentos" no dashboard (26/08). |
| 10 | `extensao_notificacao_entregador.sql` | Notificação do Entregador (P9) + leitura do delegante em `operadores` (P13) (26/08). |
| 11 | `extensao_concluir_separacao_avanca_pedido.sql` | `concluir_separacao` passa a avançar o pedido pra "pronto" (decisão D2, 27/08). |
| 12 | `extensao_fix_marcar_pronto_saiu_entrega.sql` | Fix "permission denied for table pedidos" ao marcar pronto/saiu pra entrega (27/08). |
| 13 | `extensao_fix_registrar_evento_security_definer.sql` | Fix sistêmico: trigger de `consultas_operacionais` não conseguia gravar em `eventos` (28/08). |
| 14 | `extensao_produtos_documentos_reindexa_ao_editar.sql` | Reindexação do RAG quando um produto é editado, não só quando é criado (28/08). |
| 15 | `extensao_categorias_taxonomia_ampliada.sql` | Taxonomia de categorias ampliada + classificação em massa (29/08). |
| 16 | `extensao_categorias_taxonomia_ampliada_fix_acentos.sql` | Fix do item 15, mesmo dia: regras de categoria não batiam com nome acentuado. **Rodar logo depois do item 15.** |
| 17 | `extensao_categorias_segunda_leva_29-08.sql` | Segunda leva de classificação, fecha os grupos que sobraram dos itens 15/16 (29/08). |
| 18 | `extensao_ajusta_precos_e_sku_auditoria_shopcontrol_29-08.sql` | Corrige 9 preços e popula 42 SKUs reais a partir de recibos do Shop Control (29/08). |
| 19 | `extensao_cadastra_produtos_faltantes_shopcontrol_29-08.sql` | Cadastra 145 produtos que a loja vende mas não existiam no catálogo (29/08). **Depende do item 18** (mesmo cruzamento de recibos). |
| 20 | `extensao_b6_policy_faltante_operadores.sql` | Fecha o B6 pela primeira vez (31/08): 1 policy órfã de `operadores` que rodava em produção sem existir em nenhum arquivo. |
| 21 | `extensao_listas_modelo_escolar_01-09.sql` | Tabelas `listas_modelo`/`listas_modelo_itens` + RPC `criar_pedido_de_lista_modelo` (01/09). **Rodar antes do item 22.** |
| 22 | `extensao_listas_modelo_dados_01-09.sql` | As 227 listas / 5.711 itens de dado real (01/09). **Depende do item 21.** |
| 23 | `extensao_pedido_rastreia_lista_modelo_01-09.sql` | Coluna `pedidos.lista_modelo_id` + RPC atualizada pra rastrear a origem (01/09). **Depende do item 21.** |
| 24 | `extensao_rls_escolas_leitura_operador_01-09.sql` | Policy de leitura de `escolas` pro operador do dashboard — faltava desde sempre (01/09). |
| 25 | `extensao_seguranca_p2_revoga_anon_dashboard_01-09.sql` | Revoga EXECUTE de `anon` nas 5 RPCs `*_dashboard` (defesa em profundidade, item B1, 01/09). |
| 26 | `extensao_tarefas_rf03_01-09.sql` | Tabela `tarefas` + RPCs `criar_tarefa`/`concluir_tarefa`/`reatribuir_tarefa` (RF-03, decisão D3 do dono, 01/09). |
| 27 | `extensao_lista_espera_rf04_01-09.sql` | Tabela `lista_espera` + RPCs `registrar_interesse_lista_espera`/`listar_interessados_produto`/`marcar_cliente_notificado` (RF-04, mesma decisão D3, 01/09). |
| 28 | `extensao_pedidos_pagamento_horario_previsto_rf02_01-09.sql` | Colunas `forma_pagamento`/`status_pagamento`/`horario_previsto` em `pedidos` (RF-02/P14, decisão D5 do dono, 01/09). |
| 29 | `extensao_operador_login_codigo_pin_01-09.sql` | Colunas `codigo`/`pin_tentativas_falhas`/`pin_bloqueado_ate` em `operadores` — login por código+PIN pros demais operadores, ao lado do e-mail/senha (01/09). |
| 30 | `extensao_fix_grant_pagamento_pedidos_02-09.sql` | Fix "permission denied for table pedidos" ao criar pedido com pagamento — faltava `grant update (coluna)` pra `authenticated` nas colunas do RF-02 (02/09). |
| 31 | `extensao_fix_duplicacao_e_remocao_item_orcamento_02-09.sql` | RPCs novas `adicionar_item_orcamento` (idempotente por `produto_id`, SET em vez de duplicar linha) e `remover_item_orcamento` (só em rascunho, idempotente). Fecha o incidente real do pedido PED-2026-0257 (02/09). Aplicado e validado ao vivo. **Falta o n8n trocar o INSERT cru pela RPC nova e ganhar a ferramenta de remoção** — tarefa separada, ver nota no arquivo. |
| 32 | `extensao_sincroniza_separado_itens_pedido_03-09.sql` | `marcar_item_separado_solicitacao`/`concluir_separacao` passam a replicar `separado` para `itens_pedido` (sentido único app mobile → `itens_pedido`, nunca o inverso — decisão do dono, 03/09). Fecha a divergência entre o checklist do dashboard e o checklist da Separação Delegada/Rápida do app. Aplicado e validado ao vivo com dado de teste descartável. |

Depois disso o banco novo é equivalente ao de produção em 01/09/2026 (tarde) — 148 policies + as 10 novas dos itens 26/27 (5 `tarefas` + 5 `lista_espera`), verificado por diff ao vivo contra `pg_policies` na 1ª rodada (ver nota de fechamento no fim de `extensao_seguranca_p2_revoga_anon_dashboard_01-09.sql`) e por consulta direta às tabelas/RPCs/constraints novas dos itens 26-28 (ver nota de fechamento em cada arquivo).

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

Atualização 02/09/2026: os itens 2, 3, 6 e 7 (marcados "pendente" desde
26/08 porque foram escritos por agentes sem `execute_sql`/`apply_migration`
disponíveis na sessão) foram **confirmados ao vivo como já aplicados em
produção** (`has_function_privilege`/`pg_indexes` batendo com o esperado).
As notas de execução de cada arquivo foram corrigidas — nenhuma ação
pendente aqui.

Também pendente: `extensao_push_tokens.sql` (T3.3, problema P20 — tabela
`push_tokens` + RPC `registrar_push_token`, fundação de banco do RF-08).
Mesma limitação de ferramentas (sessão só com `list_tables`) — ver a nota de
execução no final do arquivo antes de aplicar.

Aplicado em 02/09/2026: `extensao_fix_grant_pagamento_pedidos_02-09.sql`
(bug "Erro ao criar pedido: permission denied for table pedidos" reportado
pelo dono) — `forma_pagamento`/`status_pagamento`/`horario_previsto`
(adicionadas por `extensao_pedidos_pagamento_horario_previsto_rf02_01-09.sql`)
nunca tinham ganhado o `grant update (coluna) ... to authenticated`
equivalente às outras colunas de `pedidos`; RLS estava correta, era só
GRANT de coluna faltando. Aplicado via `apply_migration` e validado ao
vivo (`information_schema.column_privileges` confirma UPDATE pra
`authenticated` nas 3 colunas).

Também pendente: `extensao_fix_duplicacao_e_remocao_item_orcamento_02-09.sql`
(incidente real PED-2026-0257/ORC-2026-0256, 02/09) — RPCs novas
`adicionar_item_orcamento` (idempotente por `produto_id`, corta a
duplicação de item na raiz) e `remover_item_orcamento` (só em orçamento
`rascunho`, idempotente). Mesma limitação de ferramentas (sessão só com
`list_tables`, sem `execute_sql`/`apply_migration`, e sem conexão direta
possível via `DATABASE_URL` a partir deste sandbox) — nem aplicado nem
validado ao vivo ainda. Ver nota de execução e roteiro de validação no
final do arquivo antes de aplicar.

Também pendente: `extensao_sincroniza_separado_itens_pedido_03-09.sql`
(divergência entre o checklist manual do dashboard e o checklist da
Separação Delegada/Rápida do app mobile, ambos marcando "separado" sem se
comunicar — decisão do dono, 03/09: sincronizar só no sentido app mobile →
`itens_pedido`, nunca o inverso, porque só o lado do app tem checagem de
identidade de quem pode marcar o item). Mesma limitação de ferramentas
desta semana (sessão só com `list_tables`) — a definição vigente das duas
funções foi confirmada por introspecção read-only (baseline de 26/08 +
nenhum arquivo posterior redefinindo `marcar_item_separado_solicitacao`;
`extensao_concluir_separacao_avanca_pedido.sql` como última definição de
`concluir_separacao`), mas o `CREATE OR REPLACE` em si NÃO foi aplicado
nem validado ao vivo. Ver nota de execução e roteiro de validação no
final do arquivo antes de aplicar.

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
