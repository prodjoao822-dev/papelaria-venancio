# Plano Mestre de Implementação — Papelaria Venâncio

**Data da vistoria:** 15/08/2026
**Base normativa:** `DOCUMENTAÇÃO/Venancio_Documentacao_Requisitos.pdf` (v1.0, ago/2026) + `DOCUMENTAÇÃO/Guia_Mestre_Engenharia.md`
**Método:** vistoria por 4 agentes paralelos (backend do bot, painel web, banco Supabase, app mobile) + auditoria direta de n8n, infraestrutura, cobertura de testes e bundle de design. Todos os achados de banco foram reconfirmados por consulta ao Postgres de produção.

> ⚠️ **Leia o item B0 antes de qualquer outra coisa.** A vistoria encontrou exposição de dados pessoais de clientes acessível sem autenticação. É a única coisa deste documento com prazo de "hoje".

---

## 0. Como usar este documento

Este arquivo é **prompt de handoff**: foi escrito para ser colado inteiro em um novo chat do Claude Code que vai executar a implementação. Ele contém o estado real verificado do sistema, os desvios em relação aos requisitos, e o plano de fases com critérios de aceite.

**Instruções para quem executar:**

1. Leia `DOCUMENTAÇÃO/Guia_Mestre_Engenharia.md` antes de escrever qualquer linha — é o padrão obrigatório de aceite de código (18 seções).
2. Trabalhe **uma fase por vez**, na ordem. Cada fase tem critério de aceite objetivo; não avance sem cumpri-lo.
3. Toda escrita de status crítico passa por **RPC atômica** — nunca `UPDATE` direto de tabela a partir do client. Este é o padrão já estabelecido no projeto.
4. Toda RPC nova deve resolver a identidade do ator por `auth.uid()` **dentro** da função. Nunca aceitar o id do ator vindo do client (ver Bloqueador B1).
5. Commits temáticos, um assunto por commit, em português.
6. Antes de qualquer `git add`, revise `git status --porcelain` procurando segredo — este repositório já teve uma chave de API vazada em commit.

---

## 1. Arquitetura real (verificada, não a do papel)

```
Cliente (WhatsApp)
   ↓
Evolution API  ──POST /webhook (token fixo)──►  JS Bot (chatbot/papelaria-bot, Node/Express)
                                                   ├── stateMachine.js (pura, sem I/O)
                                                   ├── actions.js (todo o I/O)
                                                   └── n8nClient.js ──► n8n (Agente de Vendas)
                                                                          ├── Redis (debounce 3s)
                                                                          └── Sub-workflow Orçamento
                                                                                └── RPC aceitar_orcamento
   ↓
Supabase (projeto único: bot usa service_role; dashboard e app usam anon key + Auth + RLS)
   ↓                                    ↓
Venâncio Operations (React/Vite)     App Mobile (Expo) ← protótipo, 100% mock hoje
```

**Divergências entre a documentação e a realidade — corrigir o entendimento, não necessariamente o código:**

| Documentação diz | Realidade verificada |
|---|---|
| "Redis — debounce de mensagens e controle de concorrência no atendimento" | O bot **não tem Redis** (deps: `@supabase/supabase-js`, `dotenv`, `express`, `express-rate-limit`, `undici`). O Redis existe só dentro do workflow n8n. O controle de concorrência do bot é feito com `Set` em memória de processo (`webhookController.js:61,74,78`) e cache em arquivo local (`registroDeEcos.js:28`). |
| "App Mobile — telas de Separador e Operador" | O app é protótipo de UI com dados estáticos. Nenhuma chamada de rede, nenhuma dependência de Supabase, PIN aceito sem validação (`app-mobile/src/features/auth/LoginScreen.js:14`). |
| Login por código+PIN no Venâncio Operations e no App | Só o **Separador** tem código+PIN (implementado e testado). O **Operador** usa e-mail/senha do Supabase Auth (`venancio-ai-ops/src/pages/LoginPage.jsx:41`). |

---

## 2. Matriz de conformidade — requisitos × implementação

Legenda: ✅ completo · 🟡 parcial · ❌ ausente

| Req | Banco | Backend (bot) | Painel web | App mobile | Veredito |
|---|---|---|---|---|---|
| **RF-01** Login código+PIN | ✅ funcionarios + pin via Supabase Auth | 🟡 só Separador (`separadorAuthController.js`) | 🟡 Separador ✅ / Operador usa e-mail+senha | ❌ mock, aceita qualquer PIN | 🟡 |
| **RF-02** Pedido digital (F10) | 🟡 faltam `forma_pagamento`, `status_pagamento`, horário **previsto** | 🟡 bot nunca preenche `forma_entrega`/`endereco_entrega`/`sequencia` | 🟡 sem pagamento e sem horário previsto no formulário | ❌ | 🟡 |
| **RF-03** Tarefas agendadas | ❌ tabela não existe | ❌ | ❌ nenhuma tela/service | ❌ | ❌ |
| **RF-04** Lista de espera | ❌ tabela não existe | ❌ | ❌ | ❌ | ❌ |
| **RF-05** Separação delegada | ✅ RPCs completas e auditáveis | ✅ (via RPC direta, sem rota HTTP) | ✅ realtime sem polling | ❌ mock | 🟡 |
| **RF-06** Separação Rápida (≤7) | ✅ validado no servidor | ✅ | ✅ `LIMITE_ITENS = 7` | n/a (é fluxo do Operador) | ✅ |
| **RF-07** Chat interno | ✅ RPC resolve autor por `auth.uid()` | ✅ | ✅ realtime | ❌ mock | 🟡 |
| **RF-08** Push | 🟡 `notificacoes_internas.push_enviado` existe, nunca vira `true` | ❌ sem disparador | ❌ | ❌ sem `expo-notifications` | ❌ |

**Resumo:** o núcleo de separação (RF-05/06/07) está sólido no banco e no web. O que falta é (a) **dois requisitos inteiros nunca construídos** (RF-03 tarefas, RF-04 lista de espera), (b) **push do zero** (RF-08), (c) **o app mobile inteiro** conectado a dados reais, e (d) **fechar as lacunas do RF-02** que o design de tela já pressupõe.

---

## 3. Bloqueadores — corrigir ANTES de construir feature nova

Índice por severidade (a numeração é de identificação, não de prioridade):

| Sev. | Id | Assunto | Quem resolve |
|---|---|---|---|
| 🔴 Máxima | **B0** | PII de clientes legível sem login + RPCs de orçamento executáveis por `anon` | Dev — hoje |
| 🔴 Crítico | **B6** | Repositório não reproduz o banco (101 policies só em produção) | Dev |
| 🔴 Crítico | **B1** | Trilha de auditoria falsificável | Dev |
| 🔴 Crítico | **B2** | Chave da Evolution API provavelmente nunca rotacionada | **Dono** |
| 🟠 Alto | **B3** | Locks em memória impedem escalar | Dev |
| 🟠 Alto | **B4** | Nenhum tratamento de erro global no n8n | Dev |
| 🟠 Alto | **B5** | Sem Docker, sem CI | Dev |
| 🟡 Médio | **B7** | Design permite conclusão parcial; servidor proíbe | **Dono** (decisão) |

### B0 · CRÍTICO MÁXIMO — dados de cliente expostos sem autenticação

**Este item é anterior a tudo. Corrigir hoje, antes de qualquer feature.**

Dois furos independentes, ambos confirmados por consulta direta ao Postgres de produção em 15/08/2026, e ambos exploráveis apenas com a **anon key** — que é pública por design e pode ser extraída do bundle JavaScript do dashboard publicado.

**B0.1 — A view `v_clientes_crm` ignora a RLS e é legível por `anon`.**

| Propriedade | Valor verificado |
|---|---|
| Dono da view | `postgres` |
| Dono tem `BYPASSRLS` | **sim** |
| `security_invoker` | **não definido** (`reloptions` vazio) |
| `SELECT` para `anon` | **concedido** |

Sem `security_invoker = true`, a view executa com a permissão do **dono**. Como o dono é `postgres` e ele bypassa RLS, toda a proteção de linha das tabelas `clientes`/`pedidos`/`orcamentos` é anulada ao ler pela view.

Colunas expostas: `telefone, nome, cpf, cnpj, endereco, cep, cidade, estado, telefone_contato, razao_social, inscricao_estadual, total_gasto, ticket_medio, ultima_compra_em, ...`

Ou seja: um `GET /rest/v1/v_clientes_crm` com a anon key devolve **nome, telefone, CPF/CNPJ, endereço e perfil de gasto de toda a base de clientes**, sem login.

Correção imediata:
```sql
alter view v_clientes_crm set (security_invoker = true);
revoke select on v_clientes_crm from anon;
```

**B0.2 — Três RPCs `SECURITY DEFINER` sem checagem de identidade, executáveis por `anon`.**

| Função | `SECURITY DEFINER` | Checagem de autorização no corpo | `EXECUTE` para `anon` |
|---|---|---|---|
| `aceitar_orcamento` | sim | **nenhuma** | **sim** |
| `atualizar_status_orcamento` | sim | **nenhuma** | **sim** |
| `criar_orcamento_com_itens_tx` | sim | **nenhuma** | **sim** |

Verificado lendo o corpo das funções: `aceitar_orcamento` só tem guardas de **regra de negócio** (idempotência e "orçamento tem pelo menos 1 item") — nenhuma referência a `auth.uid()`, `eh_operador_ativo()`, `funcionario_atual_id()`, `current_user` ou equivalente.

Como `SECURITY DEFINER` roda com a permissão do dono, a RLS não protege. Com a anon key, um terceiro pode **criar orçamentos arbitrários e convertê-los em pedidos reais** no sistema de produção — os dois passos encadeiam, porque `criar_orcamento_com_itens_tx` devolve o id que `aceitar_orcamento` consome.

Correção: adicionar gate de identidade no corpo das três funções (padrão `eh_operador_ativo()` já usado no projeto) **e** `revoke execute ... from anon`.

> **Contraste que prova que o padrão certo já existe no projeto:** `delegar_separacao`, `separacao_rapida`, `concluir_separacao`, `assumir_separacao`, `enviar_mensagem_separacao`, `marcar_item_separado_solicitacao` e `cancelar_separacao` também são `SECURITY DEFINER` e também estão expostas a `anon` — mas todas resolvem o ator internamente via `funcionario_atual_id()`/`eh_operador_ativo()` e lançam exceção quando não há ator válido. São seguras. A extensão de separação delegada foi feita corretamente; as funções antigas de orçamento é que ficaram para trás.

Viola §8 (BOLA, autenticação robusta) e §9 (LGPD, vazamento de PII) do Guia Mestre — ambos prioridade Crítico.

### B1 · CRÍTICO — BOLA na auditoria do dashboard

Cinco funções recebem o id do ator pelo client e gravam esse valor como responsável, sem comparar com `auth.uid()`:

`atualizar_status_pedido_dashboard` · `atualizar_status_orcamento_dashboard` · `aceitar_orcamento_dashboard` · `atribuir_responsavel_pedido` · `aprender_de_resposta_operador`

Evidência: `chatbot/papelaria-bot/supabase/extensao_dashboard.sql:296,303,305,312,322,329,331,344,350,352,359,366`; confirmado em produção — as cinco têm parâmetro de ator vindo do client e nenhuma referência a `auth.uid()` no corpo.

Diferente do B0, aqui as funções **não** são `SECURITY DEFINER`, então a RLS continua valendo e o chamador precisa ser um operador ativo de verdade para escrever. O dano não é escalada de privilégio: é **falsificação da trilha de auditoria** — um operador legítimo pode registrar a ação em nome de outro. Quebra o requisito não-funcional de Auditoria ("toda alteração de status deve registrar responsável e timestamp") e o §8 do Guia Mestre (BOLA).

**Correção:** derivar o operador de `auth.uid()` dentro da função, ignorando o parâmetro do client. O padrão correto já existe no projeto — `funcionario_atual_id()` em `extensao_separacao_delegada.sql`. Replicar.

### B2 · CRÍTICO — chave da Evolution API possivelmente ainda válida

A chave `07FAFEC2BA5A-...` apareceu **em texto plano no log de produção** em 14/08/2026, vinda de `bloodybarracuda-evolution.cloudfy.live`. É a mesma chave que a auditoria de 13/08 assumiu como rotacionada — indica que só a *estrutura* da credencial foi migrada, o valor nunca foi trocado no provedor.

Mitigação de código já aplicada (15/08): mascaramento por nome de campo em `chatbot/papelaria-bot/src/utils/logger.js` (`apikey`, `authorization`, `token`, `senha`, `password`, `secret`, `chave`).

**Pendente e só o dono pode fazer:** rotacionar a chave no painel da Evolution API e atualizar `EVOLUTION_API_KEY` no `.env` do bot e a credencial no n8n.

### B3 · ALTO — locks em memória impedem escalar

`webhookController.js:61,74,78` usa três `Set` de processo como lock de deduplicação/concorrência, e `registroDeEcos.js:28` persiste cache em arquivo local `.cache/`. Ambos quebram em qualquer cenário com mais de uma instância — o que inclui o deploy em container com restart, e o pico de Volta às Aulas.

**Correção:** migrar locks para Redis (`SETNX` + TTL) e o cache de ecos para Redis com TTL nativo. Isso é pré-requisito do requisito não-funcional de Desempenho (200+ msg/dia sem perda) e do §1 do Guia Mestre (12-Factor, stateless).

### B4 · ALTO — nenhum tratamento de erro global no n8n

Nenhum dos 3 workflows de produção tem `Error Trigger` nem `errorWorkflow` configurado. No sub-workflow de Orçamento, **42 de 42 nodes** estão sem `onError`; no Agente de Vendas, 32 de 33.

Evidência: leitura direta de `chatbot/AGENTES N8N/*.json`.

Isso viola o critério de aprovação do §13 do Guia Mestre ("tratamento de erros globais com nós de Error Trigger"). Falha silenciosa em produção é hoje o comportamento padrão.

> Ressalva: a MCP do n8n caiu durante esta sessão, então a auditoria foi feita sobre os arquivos versionados. Reconferir contra a instância viva antes de corrigir.
>
> Positivo confirmado: a raia "Fechar" **já usa** a RPC (`RPC · Aceitar Orçamento`) e **já valida posse** por `conversa_id` — as correções 2 e A3 do diagnóstico de 30/07 estão de fato aplicadas.

### B5 · ALTO — sem Docker, sem CI, deploy por PM2 + ngrok

Não existe `Dockerfile`, `docker-compose.yml`, `.github/` nem qualquer pipeline no monorepo inteiro. `chatbot/papelaria-bot/ecosystem.config.js` (versionado) ainda descreve deploy por PM2 com túnel ngrok — configuração que o dono já abandonou na prática (o bot passou a rodar direto no terminal em 14/08), mas o arquivo continua no repositório induzindo a erro.

O plano de correção já existe e está escrito: `PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_DEPLOY_DOCKER_ORACLE.md`. Nunca foi executado.

Viola §17/§18 do Guia Mestre (prioridade Crítico).

### B6 · CRÍTICO — o banco versionado não reproduz o banco de produção

Verificado por consulta direta ao Postgres de produção em 15/08/2026:

| | Produção | SQL versionado no repositório |
|---|---|---|
| Tabelas com RLS habilitada | **34 de 34** | 7 |
| Policies | **135** | 34 |
| Tabelas com policy | **34** | 9 (`funcionarios`, `marcas`, `notificacoes_internas`, `operadores`, `orcamentos_status_historico`, `pedidos_status_historico`, `solicitacoes_separacao`, `..._itens`, `..._mensagens`) |

**A boa notícia:** a segurança em produção está correta. Todas as 34 tabelas têm RLS ligada, e as policies de escrita são gateadas por `eh_operador_ativo()` — inclusive as de role `public`, que só passam porque a função faz o controle. Nenhuma policy `using (true)` e nenhuma exposta a `anon` sem gate. Não há vazamento de PII hoje.

**O problema:** ~101 policies cobrindo 25 tabelas — incluindo `clientes`, `mensagens`, `conversas`, `pedidos`, `orcamentos`, ou seja, todo o PII e todo o conteúdo de conversa de WhatsApp — **existem apenas no banco de produção e não estão em nenhum arquivo do repositório**. Foram aplicadas fora do controle de versão (provavelmente pelo painel do Supabase).

Consequência concreta: o `venancio-ai-ops/README.md` documenta como recriar o banco rodando os arquivos SQL em ordem. Quem seguir esse procedimento hoje monta um banco **sem RLS em 25 tabelas de PII**, exposto pela anon key que é pública por design no bundle do frontend. Também não há ambiente de staging reproduzível, e qualquer rollback de banco perde as policies.

Viola §6 do Guia Mestre ("migrações versionadas", prioridade Crítico) e §9 (LGPD).

**Correção:** fazer o dump das 135 policies e dos `enable row level security` de produção para um arquivo versionado (`extensao_rls_completa.sql`), validar que o repositório recria o banco idêntico à produção, e passar a tratar o painel do Supabase como somente-leitura para DDL.

### B7 · MÉDIO — conflito entre o design e a regra de negócio do servidor

A tela **10 · Confirmar conclusão parcial** do bundle de design oferece "Concluir com itens pendentes? / Concluir parcial mesmo assim". A RPC `concluir_separacao` **rejeita** essa operação: `raise exception 'Ainda há % item(ns) não separado(s)'` (`extensao_separacao_delegada.sql`, linha ~455).

**Decisão de produto necessária antes da Fase 4** — ver seção 9, item D1.

---

## 4. Modelo de dados — o que falta criar

Comparação da Seção 6 do documento de requisitos com o **banco de produção** (consultado diretamente em 15/08/2026 — 34 tabelas no schema `public`).

| Entidade exigida | Situação | Ação |
|---|---|---|
| `funcionarios` | 🟡 existe, mas dividida em **duas** tabelas (`operadores` + `funcionarios`); **não tem `pin_hash`** (o PIN vive no Supabase Auth, cumprindo o espírito do requisito mas não a letra); `papel` é array livre, não enum | Documentar a decisão ou consolidar. Não é falha de segurança — o PIN está hasheado pelo GoTrue |
| `solicitacoes_separacao` | ✅ existe | — |
| `itens_solicitacao_separacao` | ✅ existe como `solicitacoes_separacao_itens` | Nome diverge do documento; manter o do banco e corrigir o documento |
| `mensagens_internas` | ✅ existe como `solicitacoes_separacao_mensagens` | Idem. Nota: hoje só ancora em `solicitacao_id`; o requisito prevê ancorar **também** em `pedido_id` (tela 27 do design, "Chat / Validações Rápidas" do Operador) |
| `tarefas` | ❌ **não existe** | Criar (Fase 6) |
| `lista_espera` | ❌ **não existe** | Criar (Fase 6) |

**Colunas faltando para o RF-02** — confirmado por consulta a `information_schema` em produção: `pedidos` tem 20 colunas e **nenhuma** das três abaixo.

- `pedidos.forma_pagamento` — exigido pelo RF-02 e pela tela 17 do design ("Passo 3: Pagamento")
- `pedidos.status_pagamento` (pago/pendente) — hoje só existe indiretamente pelo enum `status_pedido = 'aguardando_pagamento'`, o que não é a mesma coisa
- `pedidos.horario_previsto` — os campos existentes (`pronto_para_retirada_em`, `saiu_para_entrega_em`) são timestamps do **fato ocorrido**, não da **previsão informada pelo cliente**

**Para o RF-08** (nenhuma das duas existe em produção):

- Tabela `push_tokens` (funcionario_id, expo_push_token, plataforma, atualizado_em) + RLS de dono
- RPC `registrar_push_token(p_token, p_plataforma)` resolvendo o dono por `auth.uid()`

> **Nota de método:** as tabelas `tarefas`, `lista_espera` e `push_tokens` foram confirmadas como inexistentes listando as 34 tabelas reais do schema `public` em produção, não apenas por busca nos arquivos `.sql`.

---

## 5. Plano de implementação por fases

A ordem respeita o roadmap oficial (Seção 11 do documento de requisitos), com uma Fase 0 acrescentada para os bloqueadores.

### Fase 0 — Bloqueadores e higiene (pré-requisito de tudo)

0. **Corrigir B0 primeiro, no mesmo dia.** `security_invoker` na view + gate de identidade nas 3 RPCs de orçamento + `revoke` de `anon`. Só depois seguir para o resto.
1. Corrigir B1 (BOLA nas RPCs `*_dashboard` e `atribuir_responsavel_pedido`) — derivar operador de `auth.uid()`.
2. Corrigir B6: exportar as 135 policies e os `enable row level security` de produção para arquivo versionado, e provar que o repositório recria o banco idêntico ao de produção. **Este é o item de maior risco latente do projeto** — hoje o repositório não é fonte de verdade do banco.
3. Resolver a duplicação `app-mobile/` vs `AppMobile/`: manter `app-mobile/` (é o projeto vivo), mover `PROMPT_ESTRUTURA_APP_MOBILE.md` para `PLANEJAMENTOS E IMPLEMENTAÇÕES/` (hoje há **uma única cópia**, em `AppMobile/`), mover o bundle de design para `app-mobile/docs/`, apagar `AppMobile/`. Risco real de conflito de case-sensitivity em Git/CI.
4. Apagar `app-mobile/backend/` e `app-mobile/frontend/` (vazias).
5. Corrigir `app-mobile/AGENTS.md` — manda ler docs do Expo **v57**, mas o projeto está no SDK **54** (`package.json:8`). Instrução inconsistente que quebra build se seguida.
6. Remover ou marcar como obsoleto `chatbot/papelaria-bot/ecosystem.config.js` (PM2 + ngrok).
7. Adicionar `forma_pagamento`, `status_pagamento` e `horario_previsto` a `pedidos` (migração aditiva, já em arquivo versionado conforme o item 2).
8. Criar índices em `pedidos_status_historico` e `orcamentos_status_historico` — hoje têm **apenas a PK**, apesar de serem lidas em toda transição de status (§6 do Guia Mestre: "todas as chaves estrangeiras devem ter índices adequados").

**Aceite:** `anon` não consegue mais ler `v_clientes_crm` nem executar as 3 RPCs de orçamento (testar com curl usando só a anon key — deve retornar erro de permissão); B1 fechado com teste que prove que passar o id de outro operador não altera o histórico; banco recriável do zero pelo repositório com as 34 tabelas e 135 policies; monorepo com uma única pasta de app mobile; build do app continua rodando.

### Fase 1 — Fundação de qualidade (destrava o resto com segurança)

1. Introduzir **Zod** nos controllers do bot — hoje toda validação é regex manual (§7 do Guia Mestre). Fazer isso *antes* de criar as rotas novas do mobile.
2. Adicionar `requestId` (Correlation ID) gerado no webhook e propagado em todos os logs da requisição (§14/§15).
3. Configurar script de cobertura no bot. **Baseline medido nesta vistoria: 81,97% linhas / 79,42% branches / 85,95% funções** — acima do mínimo de 80% do Guia Mestre para linhas, mas com buracos críticos: `webhookController.js` 56,6% · `clientesService.js` 61,1% · `evolutionApi.js` 64,1% · `orcamentosService.js` 68,1% · `n8nClient.js` 68,5%.
4. Escrever os testes que faltam para a regra de negócio mais crítica do sistema: `finalizarCadastroEPedido` (`actions.js`) — hoje **sem nenhum teste**, apesar de ser a função que fecha o ciclo de venda.
5. Instalar Vitest + Testing Library no `venancio-ai-ops` (hoje **zero testes**, sem sequer script `test`) e cobrir `statusDerivado.js`, `formatters.js` e `statusSeparacao.js`.

**Aceite:** `npm test` roda nos dois projetos; cobertura do bot ≥85% linhas; nenhuma rota nova sem schema Zod.

### Fase 2 — RF-01 completo (login unificado por código+PIN)

Hoje só o Separador tem código+PIN. O Operador usa e-mail/senha.

1. Generalizar `separadorAuthController.login` para aceitar ambos os papéis, ou criar `POST /operador/login` análogo (mesmo rate limit de 10/min/IP + lockout de 5 tentativas/15min já implementados).
2. Trocar `venancio-ai-ops/src/pages/LoginPage.jsx` para código+PIN.
3. Manter reset de PIN exclusivo de admin (RN-03) — já implementado em `separadorAdmin.service.js`.

**Aceite:** funcionário cadastrado autentica com código + PIN de 6 dígitos no painel web e é redirecionado à tela do seu papel; código inativo é rejeitado.

### Fase 3 — RF-02 completo (pedido digital substitui o F10 de verdade)

1. Adicionar ao `NovoPedidoModal.jsx` os campos que faltam: forma de pagamento, status de pagamento e horário previsto de retirada/entrega (telas 15–17 do design).
2. Fazer o fluxo do bot preencher `forma_entrega`/`endereco_entrega` no fechamento (hoje `actions.js:140-188` cria o pedido sem esses campos, deixando-os vazios até alguém preencher à mão no dashboard).
3. Manter `sequencia`/`operacao` (referência cruzada com o Shop Control) como estão — já implementados.

**Aceite:** Operador cria pedido de balcão completo sem papel, com no máximo 5 campos obrigatórios (critério literal do RF-02).

### Fase 4 — App Mobile do Separador com dados reais

Esta é a fase de maior valor: substitui o F10 na ponta.

1. Instalar `@supabase/supabase-js`, `expo-secure-store`.
2. Criar `app-mobile/src/services/` — **camada que hoje não existe**: as telas importam `mockDb` direto, o que vai gerar retrabalho. Espelhar `venancio-ai-ops/src/services/separacaoSeparador.service.js`, que já define o contrato completo (ver Anexo A).
3. Config por `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_BOT_API_URL`. **Nunca a service key no app.**
4. Login real: `POST /operador/separador/login` → `supabase.auth.setSession(...)`. Nunca `signInWithPassword` direto do app — é o bot que faz rate limiting e lockout.
5. Sessão em `expo-secure-store` (é token/PII, não usar AsyncStorage puro).
6. Realtime nas 4 tabelas já publicadas em `supabase_realtime` (`solicitacoes_separacao`, `..._itens`, `..._mensagens`, `notificacoes_internas`) — atende o critério de aceite "sem refresh manual" e serve de **segunda camada** caso o push falhe na rede instável da loja (mitigação exigida na Seção 10 do documento de requisitos).
7. Implementar as telas 03–13 do bundle de design.

**Aceite:** Separador loga com código+PIN real, vê solicitações reais, marca itens, aciona "Separação Pronta", e o Operador vê no painel web em tempo real sem atualizar a página.

### Fase 5 — RF-08 Push (Expo + FCM)

1. Migração: tabela `push_tokens` + RPC `registrar_push_token` (dono por `auth.uid()`).
2. App: `expo-notifications` + `expo-device`, pedir permissão, registrar token no login.
3. Disparador: **Edge Function do Supabase com trigger AFTER INSERT em `notificacoes_internas`** é a opção recomendada — todas as RPCs já escrevem nessa tabela de forma centralizada, evita duplicar lógica e não reintroduz dependência de processo sempre vivo. A alternativa (bot escutando Realtime) contraria o desenho RPC-cêntrico já adotado.
4. Marcar `push_enviado = true` após envio (a coluna existe e **nunca é escrita** hoje).
5. Configurar `app.json`: `scheme` (hoje ausente, necessário para push abrir tela específica), `expo.notification`, credenciais FCM/APNs, `eas.json`.
6. Configurar `linking` no `NavigationContainer` (hoje ausente).

**Aceite:** com o app fechado, o Separador recebe alerta em poucos segundos após a delegação; tocar na notificação abre a solicitação certa.

### Fase 6 — RF-03 Tarefas + RF-04 Lista de Espera

Dois requisitos que nunca saíram do papel. Menor urgência que o núcleo de separação, conforme o próprio roadmap oficial.

1. `tarefas` (pedido_id, responsavel_id, descricao, data_execucao, status pendente/concluida) + RPCs de criar/concluir/reatribuir.
2. Job que gera `notificacoes_internas` do tipo `tarefa_agendada_vencendo` — **o enum já prevê esse tipo** (`extensao_separacao_delegada.sql:192-195`) mas nada o popula; é placeholder morto hoje.
3. `lista_espera` (produto_id, cliente_id, quantidade_desejada, status, observacao) + RPCs. Notificação é **sempre manual** nesta fase (Seção 9 do documento de requisitos).
4. Telas 21–26 do design, no painel web e no app (perfil Operador).

**Aceite:** tarefa criada para data futura aparece na lista de pendências do responsável no dia marcado; Operador consulta lista de espera de um produto e marca clientes como notificados individualmente.

### Fase 7 — App Mobile do Operador

Telas 14–20 e 27–28 do design. Depende das Fases 3 e 6 estarem prontas no banco.

### Fase 8 — Deploy e carga

1. Executar `PLANO_DEPLOY_DOCKER_ORACLE.md`: Dockerfile multi-stage com `USER node`, docker-compose com `restart: always`, Caddy + HTTPS, VM Oracle Always Free.
2. Migrar os locks para Redis (B3) — pré-requisito para mais de uma instância.
3. Pipeline CI rodando `npm test` dos dois projetos antes do deploy.
4. Teste de carga simulando o pico de Volta às Aulas (200+ mensagens/dia), conforme Fase 8 do roadmap oficial.
5. Corrigir B4 (Error Trigger nos workflows n8n).

---

## 6. O que NÃO tocar

Verificado como correto — mexer aqui só gera regressão:

- Pureza da `stateMachine.js` (zero I/O) — decisão de design respeitada.
- RPCs de separação delegada — resolvem o ator por `auth.uid()`/`funcionario_atual_id()`, usam `IS DISTINCT FROM`/`IS NOT TRUE` para evitar bypass por NULL, e a escrita é exclusiva via `security definer`. É o padrão de referência do projeto.
- Validação de "até 7 itens" da Separação Rápida no servidor, não só na UI.
- `concluir_separacao` rejeitando itens pendentes (mas ver decisão D1).
- Isolamento de sessões por `storageKey` entre Operador e Separador no painel web.
- Raia "Fechar" do sub-workflow n8n: já usa RPC e já valida posse por `conversa_id`.
- Mascaramento de dados sensíveis no `logger.js` do bot (aplicado em 15/08).

---

## 7. Anexo A — Contrato que o app mobile deve consumir

Extraído de `venancio-ai-ops/src/services/separacaoSeparador.service.js` e das RPCs em `extensao_separacao_delegada.sql`.

| Operação | Chamada | Payload |
|---|---|---|
| Login | `POST {BOT_API_URL}/operador/separador/login` | `{ codigo_funcionario, pin }` → `{ ok, sessao: { access_token, refresh_token }, funcionario }` |
| Listar minhas solicitações | `select` em `solicitacoes_separacao` (RLS filtra pelo separador logado) | joins com `pedidos`, `clientes`, `solicitacoes_separacao_itens`, `itens_pedido` |
| Assumir | RPC `assumir_separacao` | `{ p_solicitacao_id }` — só `tipo='delegada'`, só o próprio separador, só se `status='pendente'` |
| Marcar item | RPC `marcar_item_separado_solicitacao` | `{ p_solicitacao_item_id, p_separado }` — exige `status='em_andamento'` |
| Separação Pronta | RPC `concluir_separacao` | `{ p_solicitacao_id }` — **rejeita se houver item pendente** |
| Cancelar | RPC `cancelar_separacao` | `{ p_solicitacao_id, p_motivo? }` |
| Enviar mensagem | RPC `enviar_mensagem_separacao` | `{ p_solicitacao_id, p_texto }` — autor sempre por `auth.uid()` |
| Notificações | `select` em `notificacoes_internas` + RPC `marcar_notificacao_lida` | `{ p_id }` |

Solicitações de `tipo='rapida'` têm `separador_id = null`, então a RLS já as exclui naturalmente da lista do Separador — mas vale um teste explícito ao trocar o mock por dado real.

---

## 8. Anexo B — Telas do bundle de design

Referência visual obrigatória: `AppMobile/docs/Papelaria Venâncio app design/Venancio App Mobile.dc.html` (mover para `app-mobile/docs/` na Fase 0). São **28 telas de alta fidelidade** — bem mais do que as 4 telas do scaffolding atual.

**Separador (Fase 4):**
`01` Login · `02` Login com erro · `03` Home Separador · `04` Lista de Solicitações · `05` Lista vazia · `06` Lista carregando · `07` Lista com erro · `08` Checklist em andamento · `09` Checklist pronta para enviar · `10` Confirmar conclusão parcial *(ver B7)* · `11` Aguardando confirmação do operador · `12` Chat da solicitação · `13` Notificação push recebida

**Operador (Fase 7):**
`14` Home/Dashboard · `15` Criar Pedido — Passo 1: Cliente · `16` Passo 2: Itens · `17` Passo 3: Pagamento *(exige as colunas do RF-02, Fase 3)* · `18` Pedido criado · `19` Delegar Separação · `20` Separação Rápida (≤7 itens) · `21` Tarefas Agendadas *(RF-03, Fase 6)* · `22` Tarefas vazio · `23` Criar Nova Tarefa · `24` Lista de Espera de Produto *(RF-04, Fase 6)* · `25` Espera vazia · `26` Cadastrar Novo Interesse · `27` Chat / Validações Rápidas *(ver D2)* · `28` Perfil / Menu

O design inclui estados de vazio, carregamento e erro — implementá-los junto, não depois. Prioridade declarada no próprio bundle: *"toques grandes, poucas etapas, prioridade visual clara entre imediato e agendado"*, com prioridade imediata sempre em amarelo.

---

## 9. Decisões que dependem do dono (bloqueiam fases específicas)

**D0 — Como o banco passa a ser versionado (bloqueia Fase 0, ver B6).**
Duas saídas possíveis: (a) adotar Supabase CLI com migrations de verdade (`supabase db diff`/`db push`), o que é o caminho correto mas exige disciplina nova; ou (b) manter o modelo atual de arquivos `.sql` aditivos, apenas garantindo que **todo** DDL passe por arquivo versionado e nunca pelo painel. A opção (a) é a recomendada — resolve versionamento, staging e rollback de uma vez.

**D1 — Conclusão parcial de separação (bloqueia Fase 4).**
O design (tela 10) permite concluir com itens pendentes; a RPC proíbe. Qual vale?
- *Manter a proibição* preserva a integridade (não existe pedido "meio separado" no sistema) mas obriga o Separador a cancelar quando falta item no estoque.
- *Permitir parcial* exige um status novo (`pronta_parcial`) e uma regra de o que acontece com o item faltante — provavelmente vira registro na lista de espera (RF-04).

**D2 — Chat interno ancorado em pedido (afeta Fase 6/7).**
A tela 27 do design ("Chat / Validações Rápidas" do Operador) pressupõe conversa vinculada a **pedido**, não só a solicitação de separação. O requisito RF-07 também prevê os dois. Hoje a tabela só ancora em `solicitacao_id`. Ampliar agora ou na Fase 7?

**D3 — Rotação da chave da Evolution API (B2).** Ação exclusiva do dono, no provedor.

**D4 — Escopo do app do Operador.** O roadmap oficial só define até a Fase 4 (Separador). O design já entrega 15 telas de Operador. Construir o app do Operador antes ou depois de RF-03/RF-04?

---

*Documento gerado a partir de vistoria multiagente em 15/08/2026. Toda afirmação de estado foi verificada em código, schema ou execução — onde não foi possível verificar, está marcado explicitamente.*
