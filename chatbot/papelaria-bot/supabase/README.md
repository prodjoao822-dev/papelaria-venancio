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
| 31 | `extensao_fix_duplicacao_e_remocao_item_orcamento_02-09.sql` | RPCs novas `adicionar_item_orcamento` (idempotente por `produto_id`, SET em vez de duplicar linha) e `remover_item_orcamento` (só em rascunho, idempotente). Fecha o incidente real do pedido PED-2026-0257 (02/09). Aplicado e validado ao vivo. ~~Falta o n8n trocar o INSERT cru pela RPC nova e ganhar a ferramenta de remoção~~ — **feito**: sub-workflow `RVwx3aBcDcQBohpg` já usa `RPC · Adicionar Item ao Orçamento`/`RPC · Remover Item do Orçamento` (confirmado ao vivo em 09-12/09, inclusive corrigindo 2 bugs nessas mesmas ferramentas — ver itens da rodada de 09-10/09). |
| 32 | `extensao_sincroniza_separado_itens_pedido_03-09.sql` | `marcar_item_separado_solicitacao`/`concluir_separacao` passam a replicar `separado` para `itens_pedido` (sentido único app mobile → `itens_pedido`, nunca o inverso — decisão do dono, 03/09). Fecha a divergência entre o checklist do dashboard e o checklist da Separação Delegada/Rápida do app. Aplicado e validado ao vivo com dado de teste descartável. |
| 33 | `fix_grant_update_conversas_authenticated_12-09.sql` | Fix "permission denied for table conversas" ao reativar a IA pelo dashboard — a policy de RLS de UPDATE (`operadores_atualizacao`, gated por `eh_operador_ativo()`) já existia, faltava só o `grant update` de base pra `authenticated` (mesmo padrão do item 30, agora em `conversas`). Também revoga INSERT/UPDATE/DELETE de `anon` em `conversas` (defesa em profundidade, RLS já bloqueava). Aplicado e validado ao vivo em 12/09. |
| 34 | `extensao_seguranca_p4_revoga_anon_tabelas_sem_revoke_12-09.sql` | Auditoria motivada pelo item 33: 6 tabelas criadas sem `revoke` de `anon` desde a origem (`tarefas`, `lista_espera`, `listas_modelo`, `listas_modelo_itens`, `solicitacoes_entrega`, `ocorrencias`) — RLS já protegia, nenhum fluxo legítimo dependia do grant. `authenticated`/`service_role` intactos. Aplicado e validado ao vivo em 12/09. **Achado de fragilidade documentado, não corrigido**: `orcamentos` tem o mesmo desenho column-restricted do item 30/33 — sem erro hoje, mas quebra do mesmo jeito se um campo novo entrar no fluxo de edição sem o grant correspondente. **Também fora de escopo**: ~25 tabelas mais antigas do dashboard ainda com grant de escrita completo pra `anon` desde o baseline de 26/08 (mesma classe de achado, envolve PII/conteúdo de WhatsApp — recomendado como varredura dedicada separada). |
| 35 | `extensao_desempate_busca_produto_fuzzy_12-09.sql` | TRB-2026-0004: `buscar_produto_fuzzy` tinha `order by similaridade desc` sem desempate — em empate de similaridade o Postgres não garante ordem estável entre chamadas, causa estrutural confirmada por leitura da definição (bate com o incidente real de troca silenciosa de produto). Acrescenta `p.nome asc, p.id asc` como desempate, sem mudar `WHERE`/match. Aplicado e validado ao vivo: `buscar_produto_fuzzy('caneta', 5)` tem um empate real de similaridade, rodado 3x seguidas com ordem idêntica nas 3 (antes, sem garantia nenhuma). |
| 36 | `extensao_seguranca_p5_revoga_anon_tabelas_legado_12-09.sql` | TRB-2026-0010: fecha o "Achado 3" do item 34 — revoga INSERT/UPDATE/DELETE de `anon` em 31 tabelas antigas do dashboard (`clientes`, `mensagens`, `operadores`, `produtos`, etc.) que tinham o grant completo desde o baseline de 26/08 e nunca foram revogadas. RLS + policies gateadas por `eh_operador_ativo()`/`eh_admin()` já bloqueavam a escrita; nenhum fluxo legítimo (bot = `service_role`, dashboard = sessão `authenticated`) depende do grant. Aplicado e validado ao vivo: confirmadas as 93 linhas de grant (31×3) antes, 0 depois; `authenticated`/`service_role` intactos. |
| 37 | `extensao_fix_marcar_pronto_saiu_entrega_falha_silenciosa_14-09.sql` | Bug real reportado pelo dono em 14/09: clicar em "Pronto p/ Retirada" às vezes não atualizava nada, sem erro visível. Causa: `marcar_pronto_retirada_pedido`/`marcar_saiu_entrega_pedido` faziam `UPDATE ... WHERE status='pronto' AND forma_entrega=...` e retornavam `null` em silêncio quando a condição não batia (mesmo bug nas duas, só não tinha aparecido ainda no botão de entrega) — o dashboard só checava `error`, nunca o `data`, então mostrava sucesso sem nada ter mudado. Fix: as duas funções agora lançam exceção explícita em `not found` (mesma convenção de `atualizar_status_pedido`), o que já propaga como erro real pro toast do dashboard sem mudar nada no JS. Aplicado e validado ao vivo; teste de regressão adicionado em `pedidos.service.test.js` (27/27 passando). |
| 38 | `extensao_seguranca_p6_revoga_anon_pedidos_15-09.sql` | TRB-2026-0018: Auditoria Completa de 15/09 achou que `pedidos` escapou das duas varreduras anteriores (itens 34/36) — ainda tinha os 7 privilégios completos pra `anon` desde o baseline. RLS já protegia (mesma defesa das outras 37 tabelas), e nenhum fluxo legítimo depende do grant direto (`consultar_status_pedido_cliente` é LANGUAGE SQL comum, documentado pra depender de `service_role` do chamador, não de grant a `anon`). Aplicado e validado ao vivo: 7 linhas de grant antes, 0 depois; `authenticated`/`service_role` intactos. |
| 39 | `extensao_perf_p1_service_role_policy_to_role_15-09.sql` | TRB-2026-0019: causa raiz dos 542 avisos `multiple_permissive_policies` do Performance Advisor — 38 tabelas tinham a policy `service_role_full_access` declarada `to public` em vez de `to service_role` (2 tabelas mais novas, `listas_modelo`/`listas_modelo_itens`, já tinham nascido com o padrão certo). `ALTER POLICY ... TO service_role` em cada uma — só troca a lista de roles, o `using (auth.role() = 'service_role')` não muda, zero mudança de comportamento. Aplicado e validado ao vivo: advisor confirmou queda de 542 pra 25 avisos (os 25 restantes são sobreposições legítimas e intencionais de policies diferentes, não o bug de metadado corrigido aqui). |
| 40 | `extensao_marca_resposta_bloqueada_16-09.sql` | Bug real encontrado num teste ao vivo do dono (PED-2026-0313): a memória de conversa do Agente de Vendas (Postgres Chat Memory, LangChain) grava o texto que o modelo GEROU, não o que realmente chegou ao cliente — quando um guard bloqueia/reescreve a resposta, a memória fica "lembrando" de algo que o cliente nunca viu, o que já causou um fechamento de pedido sem confirmação real. RPC nova `marcar_resposta_bloqueada(conversa_id, valor)` faz merge atômico em `conversas.dados` (nunca sobrescreve o resto do jsonb) — usada pelo workflow n8n "Agente vendedor" pra marcar/limpar uma flag de "resposta anterior não chegou ao cliente" e injetar um aviso pro modelo no turno seguinte. Só `service_role` pode chamar. Aplicado e validado ao vivo. |
| 41 | `extensao_painel_admin_config_bot_18-09.sql` | Suporte de banco pro Painel Admin do JS Bot (novo, `admin-panel/`, só o dono acessa): tabela `configuracoes_bot` guarda valores de comportamento hoje fixos em `.env` (timeouts, telefones/JID de notificação, liga/desliga do Agente de Vendas) pra edição sem reiniciar o bot. RLS mais restrita do projeto até agora — zero policy pra `anon`/`authenticated`, só `service_role`; autorização de "só admin" fica 100% na aplicação (`verifyAdmin.js`), não no banco. Nunca guarda segredo/credencial (allowlist de chaves fica em `configResolver.js`, que nem conhece as chaves de API). `telefone_vendas` é um JID de grupo do WhatsApp (`@g.us`), não um número simples — `tipo='telefone'` aceita as duas formas. Seed do arquivo usa placeholder pros 4 telefones (dado sensível não vai pro git); produção foi seedada com os valores reais de `.env` via UPDATE direto, fora deste arquivo. Aplicado e validado ao vivo em 18/09 (RLS confirmada: `anon`/`authenticated` sem SELECT; 7 linhas de seed conferidas). |
| 42 | `extensao_fase1_campos_obrigatorios_fechamento_18-09.sql` | Fase 1 do plano de Separação/Entrega (diagnóstico prévio achou que forma_entrega/horario_retirada_desejado já eram extraídos pelo Agente de Vendas mas podiam ficar em branco, forma_pagamento nunca era perguntado, e `pedidos` não tinha coluna de observações). Nova coluna `pedidos.observacoes`; RPC `aceitar_orcamento` ganha `p_forma_pagamento`/`p_observacoes` e passa a **lançar exceção** se `forma_entrega`/`horario_retirada_desejado`/`forma_pagamento` vierem vazios — trava na RPC, não só no prompt do agente (defesa em profundidade, mesmo espírito dos guards do "Agente vendedor"). `status_pagamento` fica de fora da trava de propósito (regra do dono: pagamento nunca bloqueia o fluxo) — continua nascendo `'pendente'` por default. Aplicado e validado ao vivo com transação de teste + rollback (sem sujar produção): confirmado que fecha sem os 3 campos, e fecha certinho com eles preenchidos, gravando observações. |
| 43 | `extensao_fase1_fix_escopo_agente_e_overload_18-09.sql` | Fix no mesmo dia do item 42, achado ao revisar antes de dar a fase por concluída: (a) `create or replace` com assinatura diferente (7 vs 5 parâmetros) não substitui a função, criou 2 overloads coexistindo — `drop function` explícito do antigo resolve; (b) a trava de campos obrigatórios quebrava `aceitar_orcamento_dashboard` (venda de balcão/telefone pelo `venancio-ai-ops`, que nunca passa forma_entrega/horario/pagamento) — escopada com `if p_origem = 'agente_vendas_n8n'`, já que a regra do dono foi dada especificamente sobre o Agente de Vendas fechando pela conversa. Validado ao vivo: 1 overload confirmado; fluxo dashboard cria pedido normalmente (3 campos null, como sempre foi); fluxo agente continua exigindo os 3. |
| 44 | `extensao_fase2_status_item_separacao_18-09.sql` | Fase 2 do plano Separador/Entrega: novo `status_item` (pendente/separado/faltou_substituido) em `solicitacoes_separacao_itens`, resolvendo uma decisão que já estava documentada como pendente no código do app-mobile (D1, "conclusão parcial" — `concluir_separacao` rejeitava qualquer item não-separado sem exceção). `marcar_item_separado_solicitacao` ganha `p_status_item`/`p_observacao` mantendo 100% retrocompatibilidade com quem só chama com boolean (dashboard `venancio-ai-ops`). Fix no mesmo overload órfão do item 43 (`drop function` do 2-param antes do `create or replace` com 4 params) — achado ao testar a retrocompatibilidade logo em seguida. `concluir_separacao` também tinha um bug real: forçava `itens_pedido.separado = true` pra TODOS os itens ao concluir, mesmo os nunca marcados — corrigido pra só confirmar true quem de fato tem `status_item='separado'`; item "faltou/substituído" nunca aparece como encontrado, e sua observação vai pro mesmo campo que a Ficha de Separação do dashboard já exibe. Validado ao vivo simulando um separador real (`request.jwt.claim.sub`, sem dado fictício de autorização): fecha com 1 separado + 1 faltou_substituido (antes seria bloqueado); chamada antiga (só boolean) continua funcionando; item pendente continua bloqueando conclusão. Tudo com transação + rollback, produção intacta. |
| 45 | `extensao_fase3_pedido_em_separacao_ao_atribuir_18-09.sql` | Fase 3 do plano Separador/Entrega. Diagnóstico ao vivo mostrou que a máquina de estados pedida pelo dono ("recebido → atribuído → separado → aguardando_retirada\|despachado → entregue") já existe quase inteira em produção: `atualizar_status_pedido` (matriz confirmado→em_separacao→pronto→concluido, sem nenhuma checagem de status_pagamento — a regra "pagamento nunca bloqueia" já era 100% verdade) + `statusDerivado.js` no dashboard (deriva os 8 status de "vitrine" do enum real de 5 + forma_entrega + timestamps) + `marcar_pronto_retirada_pedido`/`marcar_saiu_entrega_pedido` (já cobrem aguardando_retirada/despachado). Único gap real: nem `delegar_separacao` nem `separacao_rapida` (as 2 formas de atribuir um pedido a um separador) tocavam em `pedidos.status` — um pedido sendo separado via app mobile continuava aparecendo como "Novo Pedido" no Kanban até a conclusão. Corrigido: as duas RPCs chamam `atualizar_status_pedido(...,'em_separacao',...)` no momento da atribuição, só quando o pedido ainda está 'confirmado' (idempotente pra re-delegação). `cancelar_separacao` NÃO reverte o status de volta — fora de escopo desta fase, documentado no próprio arquivo. Validado ao vivo com transação + rollback simulando os dois papéis reais (operador via `delegar_separacao`/`separacao_rapida`/`marcar_pronto_retirada_pedido`/`atualizar_status_pedido`, separador via `assumir_separacao`/`marcar_item_separado_solicitacao`/`concluir_separacao`): trilha completa confirmada em `pedidos_status_historico`, `status_pagamento` continuou 'pendente' do início ao fim sem bloquear nada. Achado à parte, não corrigido (pré-existente, fora de escopo): `concluir_separacao` não grava em `pedidos_status_historico` quando muda pedido pra 'pronto' — só `atualizar_status_pedido` grava; a trilha de auditoria tem esse buraco específico. |
| 46 | `extensao_fase4_evento_pedido_separado_18-09.sql` | Fase 4 do plano Separador/Entrega. Diagnóstico ao vivo achou que o projeto JÁ TEM uma tabela de eventos de domínio genérica (`eventos`), alimentada por gatilho em `pedidos_status_historico` (`registrar_evento_pedido()`, mesmo padrão já usado pra orçamentos) — exatamente a infra de "evento desacoplado do destino" que a fase pede. Fecha o buraco documentado no item 45 (`concluir_separacao` agora grava em `pedidos_status_historico`, o que sozinho já dispara o evento genérico) e adiciona um evento NOMEADO `pedido.separado` (mesma função `registrar_evento_pedido()`, condicional a `status_novo='pronto'`) resolvendo na hora quem delegou a separação (só pra tipo='delegada' — em 'rapida' notificar o próprio operador que acabou de separar seria ruído). A notificação ao operador (MVP: aviso pra impressão manual) saiu de dentro de `concluir_separacao` e virou um gatilho NOVO e separado (`notificar_pedido_separado()`, `AFTER INSERT ON eventos WHEN tipo_evento='pedido.separado'`) — trocar o destino no futuro é editar só essa função, nunca `concluir_separacao`. `FichaSeparacaoPage.jsx` (dashboard) passou a buscar o pedido de novo imediatamente antes de imprimir, em vez de confiar no que já estava carregado em memória — fecha "ficha sempre a partir do estado atual, nunca snapshot antigo". Validado ao vivo com transação + rollback: fluxo delegado gera os 2 eventos (`pedido_status_alterado` + `pedido.separado`) e exatamente 1 notificação nova pro operador delegante; fluxo de Separação Rápida gera os mesmos 2 eventos mas 0 notificações (evita autonotificação). 512 testes do dashboard e 402 do bot continuam passando (nenhum mudou o suficiente pra precisar de teste novo neste pacote). |

| 47 | `extensao_catalogo_produtos_novos_leves_21-09.sql` | TAREFA 21/09/2026 (base de conhecimento comercial p/ RAG): cruzamento de 10 tickets de venda balcão do ShopControl (`JOÃO VICTOR (produtos)/produtos agente de IA`, 122 itens reais com SKU/nome/preço) contra o catálogo achou 99 novos, 22 já existentes com preço batendo, 1 com preço divergente. Esta migração cobre os 78 novos NÃO-caderno (cadastro leve — nome/sku/preço/categoria/marca, sem pesquisa de característica ainda, tag `pendente_pesquisa`) e corrige o preço divergente (Marca Texto Stabilo Boss Cores, SKU 42233: catálogo tinha R$12,99, ticket de 19/09 mostra R$14,99 — fonte primária ERP prevalece, rastreabilidade gravada na descrição). Categoria/marca de cada item decidida por precedente dos itens do mesmo ticket que já existiam. Aplicado e validado ao vivo: 823 produtos no total (724 + 99), 78 confirmados com a tag. |
| 48 | `extensao_catalogo_cadernos_pesquisados_21-09.sql` | Mesma tarefa, os 21 cadernos novos — dono pediu pesquisa externa profunda pra esses especificamente antes do cadastro. Pesquisa em site oficial Tilibra/Jandaia (a maioria) e varejistas quando o fabricante não tinha site institucional localizável (São Domingos). Cada produto grava fonte e nível de confiança na própria descrição — 2 linhas com achado de baixa/média confiança documentado explicitamente (não escondido): "Strong" só tem confirmação oficial na versão espiral multimatéria, não na brochura 80fls/1-matéria deste ticket; "Mais+" pode ser nome de gôndola, não nome de linha oficial. Novas marcas Jandaia e São Domingos criadas. Aplicado e validado ao vivo: 21 produtos confirmados. |
| 49 | `extensao_segunda_rodada_pesquisa_22-09.sql` | Segunda rodada da mesma tarefa (22/09/2026): pesquisa externa dos 78 itens que ficaram com cadastro leve no item 47 (`pendente_pesquisa`) — borrachas/apontadores, canetas/canetinhas/marca-texto, giz de cera, lápis de cor, lapiseiras/grafites — mais a revalidação de Strong e "Mais+" do item 48. UPDATE, não INSERT (produtos já existiam). Achados registrados com fonte e confiança em cada descrição; 9 itens ficaram com `precisa_validacao` explícito (não repassar característica específica ao cliente sem confirmar o produto físico) e 1 correção de entendimento (SKU 39121 não é lápis de cor, é grafite comum com cabo neon — mesma categoria "Lápis", que já mistura os dois tipos). "Mais+" teve a dúvida original resolvida (linha real, confirmada por varejista autorizado) mas ganhou uma divergência nova de formato/folhas em relação ao produto cadastrado; "Strong" manteve confiança baixa. Aplicado e validado ao vivo: 78/78 produtos atualizados, 0 com `pendente_pesquisa` restante. Detalhe completo no Documento 08 da base de conhecimento. |

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

Atualização 03/09/2026: `extensao_push_tokens.sql` estava marcado "pendente"
aqui, mas confirmado ao vivo (vistoria final pré-Volta às Aulas) que a
tabela `push_tokens` já existe em produção, com RLS ligada e as 6 colunas
batendo exatamente com o arquivo — já estava aplicado, só a nota do README
nunca foi corrigida. Nenhuma ação pendente aqui.

Aplicado em 02/09/2026: `extensao_fix_grant_pagamento_pedidos_02-09.sql`
(bug "Erro ao criar pedido: permission denied for table pedidos" reportado
pelo dono) — `forma_pagamento`/`status_pagamento`/`horario_previsto`
(adicionadas por `extensao_pedidos_pagamento_horario_previsto_rf02_01-09.sql`)
nunca tinham ganhado o `grant update (coluna) ... to authenticated`
equivalente às outras colunas de `pedidos`; RLS estava correta, era só
GRANT de coluna faltando. Aplicado via `apply_migration` e validado ao
vivo (`information_schema.column_privileges` confirma UPDATE pra
`authenticated` nas 3 colunas).

Aplicado em 02/09/2026: `extensao_fix_duplicacao_e_remocao_item_orcamento_02-09.sql`
(incidente real PED-2026-0257/ORC-2026-0256) — RPCs novas
`adicionar_item_orcamento` (idempotente por `produto_id`, corta a
duplicação de item na raiz) e `remover_item_orcamento` (só em orçamento
`rascunho`, idempotente). Aplicado via `apply_migration` e validado ao vivo
com dado de teste descartável (idempotência de adicionar, remoção +
recálculo, trava de "só rascunho").

Aplicado em 03/09/2026: `extensao_sincroniza_separado_itens_pedido_03-09.sql`
(divergência entre o checklist manual do dashboard e o checklist da
Separação Delegada/Rápida do app mobile, ambos marcando "separado" sem se
comunicar — decisão do dono: sincronizar só no sentido app mobile →
`itens_pedido`, nunca o inverso, porque só o lado do app tem checagem de
identidade de quem pode marcar o item). Aplicado via `apply_migration` e
validado ao vivo com pedido/solicitação de teste descartável (item marcado
reflete imediatamente, `concluir_separacao` deixa tudo consistente).

Aplicado em 03/09/2026: `extensao_seguranca_p3_revoga_anon_rpcs_delegacao_03-09.sql`
(achado da vistoria final pré-Volta às Aulas) — 17 RPCs `SECURITY DEFINER`
de separação/entrega/ocorrência (`concluir_separacao`, `separacao_rapida`,
`delegar_entrega`, `abrir_ocorrencia` etc.) tinham `EXECUTE` aberto pra
`anon`/`public` desde o baseline de 26/08, sem que P1/P2 as cobrissem —
não era BOLA ativo (todas já tinham portão interno correto), mas defesa em
profundidade fechada mesmo assim. Aplicado e validado ao vivo
(`has_function_privilege`: `anon=false`/`authenticated=true` nas 17).

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
