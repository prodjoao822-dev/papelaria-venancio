

---

## 0. O que você vai fazer

Você vai **executar** o plano da auditoria de finalização do Venâncio AI, usando os agentes especializados que já existem neste repositório. Não é para replanejar, não é para auditar de novo — o diagnóstico está pronto e foi verificado ao vivo (banco de produção e instância n8n).

**Leia primeiro, antes de qualquer ação:**

1. `PLANEJAMENTOS E IMPLEMENTAÇÕES/AUDITORIA_FINALIZACAO_25-08-2026.md` — **esta é a fonte operacional.** O artifact colado no chat é a mesma coisa, formatada para leitura.
2. `DOCUMENTAÇÃO/Guia_Mestre_Engenharia.md` — padrão de aceite de código do projeto.

O trabalho está dividido em **dois blocos**. Confirme comigo em qual bloco estamos antes de começar:

- **BLOCO HOJE** — fundação: salvar o trabalho, fechar a falha de segurança, fazer a venda voltar a fechar.
- **BLOCO AMANHÃ** — App Mobile e testes.

---

## 1. Regras invioláveis

Estas valem para os dois blocos e para todos os agentes. Violar qualquer uma delas é motivo para parar e me chamar.

1. **Commit antes de tocar em qualquer código.** Há sete dias de trabalho não commitado no repositório. Enquanto isso não estiver salvo, **nenhuma alteração nova pode ser feita** — se misturar, não dá mais para separar o que era meu do que foi seu. Isso é a tarefa T0.
2. **Nunca edite um workflow n8n sem me perguntar antes.** Se eu estiver com o editor aberto no navegador, a alteração via API é sobrescrita quando eu salvar. Pergunte: *"você está com o editor do n8n aberto?"* e espere a resposta.
3. **Toda mudança de banco vira arquivo de migração versionado.** Nunca aplique DDL só pelo painel do Supabase. O repositório precisa passar a ser a fonte de verdade.
4. **Não remova os guardas de `IF` do sub-workflow de Orçamento.** `Pertence a Esta Conversa?` e `Já Existe Orçamento Aberto?` são a defesa em profundidade que impediu vazamento entre clientes. Eles ficam, mesmo depois da consulta ser corrigida.
5. **Não refatore por gosto.** A seção 17 da auditoria lista o que deve ficar como está. Se você acha que algo deveria ser reescrito e não está no plano, anote no relatório final e siga em frente.
6. **Não invente funcionalidade.** Se uma tarefa parecer exigir algo que não está no plano, pare e pergunte.
7. **Teste vermelho trava o avanço.** Se uma suíte quebrar, investigue e corrija antes de ir para a próxima tarefa. Nunca marque uma tarefa como concluída com teste falhando.
8. **Nada de segredo em arquivo versionado.** Antes de qualquer commit, rode `git ls-files | grep -i env` e confirme que só aparecem `.env.example`.

---

## 2. Os agentes e quem faz o quê

Este repositório já tem agentes especializados em `.claude/agents/`. Use-os — não faça tudo na thread principal.

| Agente | Domínio | Tarefas deste plano |
|---|---|---|
| `supabase-db` | Schema, RLS, RPCs, migrações | T1.1, T1.2, T1.3, T1.4, T2.2, T3.1 |
| `n8n-workflows` | Workflows de produção | T2.1 |
| `bot-backend` | `chatbot/papelaria-bot/` | T2.3, T2.4, T4.1 |
| `mobile-app` | `app-mobile/` | T3.2, T3.3, T3.4, T3.5 |
| `dashboard-web` | `venancio-ai-ops/` | T4.2 |
| `devops-infra` | Deploy, CI, organização | T0, T4.3 |

**Regras de coordenação:**

- Tarefas de blocos diferentes **não** rodam em paralelo.
- Dentro de um bloco, respeite as dependências declaradas. Onde não houver dependência, pode paralelizar.
- Cada agente **reporta de volta** o que mudou, o que testou e o resultado. Você consolida.
- Se dois agentes precisarem tocar o mesmo arquivo, serialize.

---

## 3. Protocolo de cada tarefa

Para **toda** tarefa, sem exceção:

```
ANALISAR   → leia o código/estado atual antes de mudar. Confirme que o problema
             descrito na auditoria ainda existe. Se já estiver resolvido, diga
             e pule.
IMPLEMENTAR→ a menor mudança que resolve. Comentário explicando o PORQUÊ,
             no padrão do projeto (data + incidente que motivou).
TESTAR     → rode a suíte do subprojeto afetado. Escreva teste novo quando a
             tarefa mudar comportamento.
VALIDAR    → confirme o critério de aceite objetivo da tarefa.
CORRIGIR   → se falhou, investigue a causa. Não contorne o teste.
CONFIRMAR  → só então marque como concluída e vá para a próxima.
```

**Comandos de verificação das suítes:**

```bash
cd chatbot/papelaria-bot && npm test      # esperado: 231 passando
cd venancio-ai-ops       && npm test      # esperado: 7 passando
cd app-mobile            && npm test      # esperado: 32 passando
```

Esses números são a linha de base de 25/08. Eles podem **subir** (testes novos), nunca descer.

---

## 4. BLOCO HOJE — fundação

**Objetivo do bloco:** ao final, o trabalho está salvo, não há mais nenhuma função de banco aberta sem autenticação, e uma conversa de WhatsApp consegue virar pedido.

### T0 · Salvar os sete dias — `devops-infra`

**Faça primeiro. Nada mais começa antes disso terminar.**

- Revise `git status` (52 arquivos modificados, 68 novos).
- Commite em blocos temáticos: entrega/ocorrência, app mobile, multimodal (áudio/imagem), escalonamento/fila, SQL, testes, dashboard.
- **Você está autorizado a commitar e a dar push** nesta tarefa específica.
- Se algum arquivo parecer lixo ou temporário, **não apague** — pergunte.

✅ **Aceite:** `git status` limpo; `git log origin/main..HEAD` vazio; `git ls-files | grep -i env` devolve só os `.env.example`; as 3 suítes com os mesmos números de antes.

---

### T1 · Fechar a segurança do banco — `supabase-db`

**T1.1 · `atualizar_status_pedido` (problema P1)** — *depende de T0*

É a única função de negócio que é `SECURITY DEFINER`, aceita `anon` e não checa quem chama. Verifiquei em 25/08: **não tem nenhum chamador** — nem no bot, nem no dashboard, nem no app, nem nos 5 workflows n8n. Só há uma menção em comentário, em `venancio-ai-ops/src/utils/statusDerivado.js:6`.

- Reconfirme a ausência de chamadores antes de mexer.
- Adicione o portão de identidade no corpo, no mesmo padrão de `atualizar_status_pedido_dashboard`.
- `revoke execute on function atualizar_status_pedido(...) from anon;`
- Migração versionada em `chatbot/papelaria-bot/supabase/`.

✅ **Aceite:** consulta a `pg_proc` mostra **zero** funções de negócio com `prosecdef = true` + `EXECUTE` para `anon` + corpo sem `auth.uid()`/`eh_operador_ativo()`. Advisor de segurança do Supabase sem alerta novo.

**T1.2 · Varredura das demais `SECURITY DEFINER`** — *depende de T1.1*

Percorra todas as funções `SECURITY DEFINER` executáveis por `anon` e confirme, uma a uma, que têm portão. Documente as que são portão por natureza (`eh_admin`, `eh_operador_ativo`, `funcionario_atual_id`, `empresa_id_padrao`) — essas podem continuar como estão.

✅ **Aceite:** uma tabela no relatório com função × tem portão × decisão.

**T1.3 · Índices que nunca foram aplicados (P11)** — *paralelo a T1.1*

`chatbot/papelaria-bot/supabase/extensao_indices_status_historico.sql` está pronto, é idempotente e **nunca foi rodado**. `pedidos_status_historico` e `orcamentos_status_historico` têm só a PK hoje.

✅ **Aceite:** os dois índices aparecem em `pg_indexes`.

**T1.4 · Baseline de migração (P8b)** — *depende de T1.1*

O controle de migração do Supabase só começa em 20/08 (11 migrações). Todo o schema anterior está fora de controle de versão. Gere uma migração de *baseline* a partir do banco atual, para o repositório conseguir recriar a produção.

✅ **Aceite:** existe um arquivo de baseline versionado; o `README` do banco explica a ordem de aplicação e não induz mais a montar um banco sem RLS.

---

### T2 · Fazer a venda fechar

> **Esta é a parte mais importante do dia.** Sem ela o produto não cumpre a função dele.
> Leia a **seção 5 inteira** da auditoria antes de começar — o diagnóstico já está fechado, com número de execução do n8n.

**T2.1 · Corrigir a consulta do orçamento (P6)** — `n8n-workflows` — *depende de T1*

**Pergunte antes se eu estou com o editor do n8n aberto.**

O nó `Supabase · Buscar Orçamento Aberto`, no workflow `Orçamento (Sub-workflow)` (`RVwx3aBcDcQBohpg`), filtra por `conversa_id` **e** `status`. O node Supabase v1 do n8n **aplica só uma condição e descarta a outra em silêncio** — devolve rascunho de outro cliente. Provado na execução `11774`.

A correção de 25/08 às 22:00 endureceu o **guarda** (`Já Existe Orçamento Aberto?`), não a **consulta**. Por isso o reaproveitamento nunca dispara e nasce um rascunho novo a cada chamada.

Duas opções — escolha e justifique:
- **(a)** Trocar por `HTTP Request` no PostgREST (`?conversa_id=eq.X&status=eq.rascunho&limit=1`), usando a credencial gerenciada `supabaseApi` que já existe e já é usada pelo nó `RPC · Aceitar Orçamento`.
- **(b)** Deixar só `conversa_id` no filtro (a condição que garante isolamento) e validar `status` no `IF`, que já faz isso.

Depois de corrigir, **reaudite** todos os nós Supabase dos dois workflows procurando outros filtros com 2+ condições, e atualize o sticky note `Auditoria nodes Supabase — filtro multi-condição` com a data de hoje. Em 25/08 este era o único.

✅ **Aceite:** duas chamadas seguidas de "Criar Orçamento" na mesma conversa devolvem o **mesmo** `orcamento_id`, e a segunda vem com `novo: false`.

**T2.2 · Corrigir a escolha do orçamento (P5) + rede no banco** — `supabase-db` — *depende de T2.1*

`orcamento_ativo_cliente` faz `order by criado_em desc limit 1` — devolve o rascunho **mais novo**, não o que tem itens. É o que fez o bot mandar o vendedor usar o `ORC-2026-0187` vazio.

- Reescreva para preferir o rascunho **com itens**; em empate, o mais recente.
- Chamador único: `chatbot/papelaria-bot/src/services/pedidosService.js:21`. Confirme antes.
- Adicione índice único parcial `orcamentos (conversa_id) where status = 'rascunho'` como rede de segurança. **Limpe os rascunhos duplicados antes**, senão a criação do índice falha.

✅ **Aceite:** com um rascunho vazio mais novo e um com itens na mesma conversa, a função devolve o **com itens**. O índice existe e uma tentativa de criar segundo rascunho na mesma conversa é recusada pelo banco.

**T2.3 · Mensagem concorrente nunca some (P4)** — `bot-backend` — *paralelo a T2.1*

Em `webhookController.js`, quando `conversasComAgenteVendasEmAndamento` pega, hoje o webhook responde 200 e a mensagem **evapora** — sem resposta ao cliente, sem notificação, sem histórico. No teste de carga de 24/08, 90% das mensagens concorrentes sumiram assim.

- Responda ao cliente algo como *"só um instante, ainda estou vendo sua mensagem anterior"*.
- Registre a mensagem no histórico mesmo quando descartada, para o operador ver na tela de Atendimento.
- Teste novo cobrindo esse caminho.

✅ **Aceite:** teste automatizado provando que uma segunda mensagem durante o processamento (a) recebe resposta e (b) aparece no histórico.

**T2.4 · Limpeza de dados** — `supabase-db` — *depende de T2.2*

- Os 4 rascunhos órfãos de produção (`ORC-2026-0181`, `0185`, `0186`, `0187`).
- Os 80 eventos apontando para pedidos que não existem mais (P22). **Pergunte antes de apagar** — pode ser preferível manter como histórico.

---

### Critério de aceite do BLOCO HOJE

**Uma conversa real pelo WhatsApp, do "oi" até "pedido confirmado", cria exatamente um pedido no banco, com os itens ligados ao `produto_id` correto, e o cliente recebe o protocolo. Repetir 3 vezes sem falha, sem nenhum rascunho órfão criado no processo.**

Esse teste é manual e sou eu que faço. Me avise quando estiver pronto para eu testar.

---

## 5. BLOCO AMANHÃ — App Mobile e testes

**Contexto:** amanhã eu estou no trabalho e quero focar no app e em testes. Organize o trabalho sabendo que **eu tenho o celular na mão** — algumas coisas só eu consigo fazer.

### Divisão de trabalho

| Você (agentes) | Eu (no trabalho, com aparelho) |
|---|---|
| Configurar identidade de build, push, tradução de erro, notificação do entregador, testes | Rodar o build, instalar no aparelho, testar login real, receber o push, validar em campo |

Prepare tudo antes de me pedir alguma coisa, para eu não ficar esperando.

### T3 · App Mobile operacional

**T3.1 · Notificação do entregador (P9)** — `supabase-db` — *fazer primeiro, o app depende*

Hoje o entregador **não recebe notificação nenhuma**. `delegar_entrega` não escreve em `notificacoes_internas`, e a policy de leitura dessa tabela só cobre `'operador'` e `'separador'` — `'entregador'` não existe.

- Estender o CHECK e a policy de `notificacoes_internas` para `'entregador'`.
- Fazer `delegar_entrega` escrever a notificação, no mesmo padrão de `concluir_separacao`.
- Policy de leitura em `operadores` para funcionário atribuído (P13) — hoje "delegado por" aparece sem nome no app.

✅ **Aceite:** delegar uma entrega gera linha em `notificacoes_internas` com `destinatario_tipo = 'entregador'`, e o entregador consegue lê-la pela anon key com a sessão dele.

**T3.2 · Identidade de build (P19)** — `mobile-app` — *depende de T3.1*

Hoje **não é possível gerar um APK**. Falta tudo: `android.package`, `ios.bundleIdentifier`, `eas.json`, `projectId`. O app ainda se chama `"app-mobile"` e usa o ícone padrão do Expo.

- Nome e identificadores reais (sugestão: `com.papelariavenancio.equipe` — **confirme comigo antes**).
- `eas.json` com perfil de desenvolvimento e de produção.
- Versionamento.
- Ícone e splash — se não houver arte, use o `logo-mascote.png` que existe em `venancio-ai-ops/public/`.

✅ **Aceite:** o comando de build roda sem erro de configuração. A instalação no aparelho é minha.

**T3.3 · Push (P20)** — `mobile-app` + `supabase-db` — *depende de T3.2*

Não existe nada hoje: sem `expo-notifications`, sem tabela `push_tokens`, sem RPC, e `notificacoes_internas.push_enviado` nunca vira `true`.

- Banco: tabela `push_tokens` (funcionario_id, expo_push_token, plataforma, atualizado_em) com RLS de dono, e RPC `registrar_push_token` resolvendo o dono por `auth.uid()` — **nunca** aceitando o id vindo do app.
- App: `expo-notifications`, pedir permissão, registrar o token no login.
- Disparador: workflow n8n lendo `notificacoes_internas` com `push_enviado = false`, enviando e marcando. **Pergunte antes de criar o workflow.**

✅ **Aceite:** eu recebo uma notificação no celular **com o app fechado**, quando uma separação ou entrega é delegada para mim.

**T3.4 · Erros em linguagem de gente** — `mobile-app` — *paralelo a T3.3*

Hoje uma exceção de RPC chega crua na tela do separador. Crie uma camada fina que traduza os erros conhecidos (`Esta solicitação não está atribuída a você`, `Ainda há N item(ns) não separado(s)`, `R$100`) para português de balcão.

✅ **Aceite:** nenhuma tela mostra texto de exceção do Postgres.

**T3.5 · Ajustar o filtro de notificações** — `mobile-app` — *depende de T3.1*

`NotificacoesScreen.js` filtra `destinatario_tipo = 'separador'` fixo. Precisa cobrir os papéis que o funcionário realmente tem.

### T4 · Testes

**T4.1 · Cobrir o que está fraco no bot** — `bot-backend`

Arquivos abaixo da média, em ordem de importância: `clientesService.js` (61%), `evolutionApi.js` (65%), `orcamentosService.js` (68%), `n8nClient.js` (68%).

✅ **Aceite:** os quatro acima de 80% de linhas; suíte total continua verde.

**T4.2 · Primeiros testes do dashboard** — `dashboard-web`

Hoje existe **um** arquivo de teste em todo o dashboard. Comece pelos services que mexem em dinheiro e status: `pedidos.service.js`, `orcamentos.service.js`, `separacao.service.js`. Não faça teste de tela ainda.

✅ **Aceite:** os três services com teste; `npm test` verde.

**T4.3 · CI (P17)** — `devops-infra` — *fazer por último*

Não existe pipeline nenhum no monorepo. Crie um workflow que rode as 3 suítes a cada push.

✅ **Aceite:** o pipeline roda e fica verde num push de teste.

---

## 6. Quando parar e me perguntar

Pare e pergunte — **não decida sozinho** — em qualquer um destes casos:

| # | Assunto | Por quê |
|---|---|---|
| **D1** | Conclusão **parcial** de separação: permitir ou proibir? | O desenho de tela oferece, a regra do banco proíbe. Bloqueia parte do app. |
| **D2** | Concluir separação deve mover o pedido para "pronto" automaticamente? | Define se o cliente é avisado na hora ou quando alguém lembra de clicar. |
| **D4** | O painel web do Separador continua existindo, ou o app é o canal único? | Define se o código duplicado sai ou fica. |
| — | Identificador do app (`com.papelariavenancio.…`) | Depois de publicado não dá para mudar. |
| — | Apagar qualquer coisa | Inclusive os 80 eventos órfãos e qualquer arquivo que pareça lixo. |
| — | Editar workflow n8n | Sempre. Sem exceção. |
| — | Algo fora do plano | Se a tarefa parecer exigir funcionalidade nova, pare. |

**D1 e D2 travam o T3 completo?** Não. Faça tudo que não depende deles e me traga as duas perguntas com sua recomendação.

---

## 7. Como me reportar

Ao final de **cada tarefa**, uma linha: o que mudou, o que testou, resultado.

Ao final de **cada bloco**, um relatório curto:

1. **O que foi feito** — tarefa por tarefa, com o critério de aceite marcado ou não.
2. **O que não foi feito e por quê** — seja explícito, não omita.
3. **O que quebrou no caminho** e como foi resolvido.
4. **Números das suítes** antes e depois.
5. **O que precisa de mim** — decisões, testes manuais, coisas de aparelho.
6. **Riscos novos** que você encontrou e não estavam na auditoria.

Não me diga que algo está pronto se o critério de aceite não foi verificado de verdade. Prefiro saber que ficou pela metade.

---

## 8. Comece assim

1. Confirme que leu a auditoria e diga, em 3 linhas, qual você entendeu ser o problema central.
2. Me diga em qual bloco estamos (HOJE ou AMANHÃ).
3. Rode as 3 suítes e me mostre os números da linha de base.
4. Comece pelo **T0**. Nada antes dele.
