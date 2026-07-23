# Análise de Arquitetura — papelaria-bot

> Documento gerado antes de qualquer alteração de código, conforme solicitado.
> Cobre: visão geral, pontos positivos, problemas encontrados, sugestões,
> prioridades, riscos e plano de implementação.

## 1. Visão geral da arquitetura atual

O projeto é um bot de atendimento via WhatsApp (Evolution API) para uma
papelaria, com navegação por menu **determinístico** (sem LLM). A estrutura
atual (21 arquivos-fonte) já segue uma separação de responsabilidades clara:

```
src/
├── index.js              # bootstrap do Express
├── cli.js                # simulador de conversa no terminal (mesma stateMachine do webhook)
├── botEngine/             # NÚCLEO: máquina de estados, 100% função pura (sem I/O)
│   ├── stateMachine.js    # registra estados e processa transições
│   ├── actions.js         # traduz "intenção de ação" em chamada real (Evolution API)
│   └── states/            # um módulo por tela/fluxo de menu
│       ├── menuPrincipal.js
│       ├── submenuVendas.js
│       ├── listaEscolar.js   # fluxo multi-passo (escola → ano → período? → observação)
│       └── fallback.js       # helper de "opção inválida", não é um estado
├── services/              # I/O: Supabase (clientes/conversas/escolas) e Evolution API
├── webhook/                # controller HTTP + parser do payload da Evolution API
├── middlewares/            # verifyToken (auth do webhook) e reativacaoBot (pausa/retoma)
├── config/                 # env, notifyTargets, materiaisEscolares
└── utils/logger.js
```

### Fluxo de uma mensagem

1. `webhookController.receberWebhook` recebe o POST, valida token (`verifyToken`).
2. `payloadParser.parsePayload` normaliza o payload bruto da Evolution API.
3. `clientesService` faz upsert do cliente; `conversasService` busca/cria a conversa.
4. Se `fromMe` (humano respondeu manualmente), `reativacaoBot.pausarBot` e encerra.
5. `reativacaoBot.garantirBotAtivo` decide se o bot deve responder agora (ou está
   na janela de atendimento humano).
6. `montarSessao` reconstrói `{ estado, dados }` a partir da conversa persistida,
   pré-carregando `escolas` do Supabase quando o próximo estado pode precisar.
7. `stateMachine.processarMensagem(sessao, texto)` — **função pura** — decide a
   transição de estado e a resposta.
8. `actions.executarAcoes` executa as ações retornadas (notificar humano / enviar PDF).
9. `conversasService.atualizarEstadoConversa` persiste o novo estado/dados.
10. `evolutionApi.enviarTexto` manda a resposta ao cliente.

### Gerenciamento de sessão e estado

- A sessão é `{ estado: string, dados: object }`.
- **Persistida no Supabase** (tabela `conversas`, coluna `dados` como `jsonb`) —
  não em memória — porque cada mensagem chega como uma requisição HTTP isolada.
- `dados` é um "saco" flexível de contexto: guarda campos específicos de cada
  fluxo (`escolaSelecionada`, `anoSelecionado`, `periodoSelecionado`,
  `observacao`) e um cache (`escolas`) carregado sob demanda.
- Pausa/reativação do bot (`bot_ativo`, `ultima_interacao_em`) é um mecanismo
  à parte, orientado a timeout, e vive nas mesmas colunas da conversa.

## 2. Pontos positivos (preservar sempre)

- **`stateMachine.js` é uma função pura de verdade** — sem I/O, testável via
  `npm run chat` sem subir servidor nem Supabase. Isso é a base mais valiosa do
  projeto e deve continuar assim (não introduzir logging, chamadas de rede ou
  side effects diretamente nela).
- **Separação I/O vs. lógica já está correta**: regra de negócio nos
  `services/` e `botEngine/`, controllers finos, nenhuma lógica de negócio
  vazando para o webhook.
- **Módulos de estado já são, na prática, "handlers por domínio"** (menu
  principal, vendas, lista escolar) — o pedido de "separar handlers por
  domínio" já está satisfeito estruturalmente.
- **Extensibilidade pensada com cuidado**: `materiaisEscolares.js` já documenta
  exatamente onde plugar a tabela `materiais_lista_escolar` quando os PDFs
  forem para storage remoto, sem precisar tocar em `listaEscolar.js`.
- **Fail-fast de configuração** (`env.js` valida variáveis obrigatórias na
  subida) evita o bot rodar "pela metade".
- Comentários no código já seguem a prática de explicar o "porquê", não o "o
  quê" — consistente com o padrão que este projeto deve manter.
- Nomenclatura em português consistente em todo o projeto.

## 3. Problemas encontrados

| # | Problema | Onde | Severidade |
|---|----------|------|------------|
| 1 | Nenhum comando global (0 / # / * / "menu" / "ajuda") — cliente só consegue seguir o fluxo linear do estado atual | `stateMachine.js` | Alta (pedido explícito) |
| 2 | Duplicação da string `MENSAGEM_AGUARDAR_ATENDIMENTO` em 3 arquivos | `menuPrincipal.js`, `submenuVendas.js`, `listaEscolar.js` | Baixa (DRY) |
| 3 | Parsing de opção numérica (`Number(texto)-1` + `Number.isInteger` + limite do array) duplicado | `listaEscolar.js` (escola e ano) | Baixa (DRY) |
| 4 | Não existe conceito de "estado anterior" — impossível implementar "voltar" sem isso | `stateMachine.js` / sessão | Média |
| 5 | Menus (textos, opções, listas de anos) ainda vivem como constantes dentro do código de cada estado, não em config/JSON | `states/*.js` | Média (ver observação abaixo) |
| 6 | Nenhum teste automatizado no projeto (nem unitário, nem de integração) | projeto todo | Média/Alta a médio prazo |
| 7 | Sem analytics/telemetria — não há registro de menus mais acessados, opções inválidas, ou erros de forma estruturada além do console | projeto todo | Média |
| 8 | `mensagemId` é extraído pelo parser mas nunca usado — não há proteção contra reprocessar o mesmo webhook em caso de retry da Evolution API | `payloadParser.js` / `webhookController.js` | Baixa/Média |
| 9 | `evolutionApi.enviarArquivo` lê o PDF com `fs.readFileSync` (síncrono) — bloqueia o event loop brevemente | `evolutionApi.js` | Baixa (arquivos pequenos, baixo tráfego) |
| 10 | Projeto pensado para uma única empresa/instância (variáveis de ambiente fixas: `PHONE_CHEFE`, `PHONE_VANESSA`, etc.) — não há `empresa_id`/multi-tenant | `config/env.js`, `notifyTargets.js` | Baixa agora, alta se o negócio crescer para múltiplas lojas |

**Nenhum código morto foi encontrado.** Todos os módulos são referenciados e
usados. Não há duplicação estrutural além dos itens 2 e 3 acima.

### Observação importante sobre o item 5 (menus em JSON)

O pedido original sugere mover menus para JSON para reduzir alteração de
código ao criar novos menus. Isso é genuinamente vantajoso para telas de
**opção fixa → próximo estado** (ex.: menu principal, submenu de vendas). Mas
`listaEscolar.js` tem lógica condicional real (pergunta de período só aparece
para escolas/anos específicos; busca de PDF depende de escola+ano+período) que
não é só "menu" — é regra de negócio. Migrar isso para um formato 100%
declarativo exigiria desenhar um mini-motor de regras (não só um JSON de
opções), o que é uma mudança estrutural maior. Por isso este item entra no
**Plano de implementação como Fase 2**, documentado agora e não implementado
de imediato — para não arriscar reescrever o fluxo mais complexo do bot sem
alinhamento prévio.

### Observação sobre "carrinho / produto atual / categoria atual"

O prompt original pede que a sessão esteja preparada para guardar carrinho,
produto atual e categoria atual. Hoje o bot **não tem** catálogo de produtos
nem carrinho — é um roteador de intenção que termina em notificação humana.
Adicionar esses campos vazios agora seria especular sobre um recurso que ainda
não existe (contraria YAGNI/Clean Code). A boa notícia arquitetural: `dados`
já é um objeto livre (JSONB no Supabase), então quando o carrinho/catálogo
existir de fato, basta adicionar as chaves — **nenhuma migração de schema ou
refatoração será necessária por causa disso**. Registrado como Fase 3
(dependente de uma feature de catálogo real).

## 4. Sugestões de melhoria

1. **Comandos globais** — interceptar `0`/"menu" (menu principal), `#`
   (voltar), `*` (reiniciar) e "ajuda" antes de delegar ao `processar()` do
   estado atual, com um flag de opt-out (`aceitaTextoLivre`) para estados que
   capturam texto livre de verdade (hoje, só `LISTA_ESCOLAR_OBSERVACAO`).
2. **Histórico mínimo (`estadoAnterior`)** — guardado dentro do próprio
   `dados` (sem mudança de schema), o suficiente para o comando `#`. Uma pilha
   completa de histórico fica registrada como possível Fase 2 se o "voltar"
   precisar navegar mais de um nível.
3. **Extrair mensagens e validações duplicadas** para módulos compartilhados
   (`mensagensComuns.js`, `validadores.js`) dentro do próprio `botEngine`,
   sem alterar nenhum comportamento observável.
4. **Scaffold de analytics** (`analyticsService.js`) — contador em memória +
   log estruturado, plugado no `webhookController` (que já faz I/O), nunca
   dentro da `stateMachine` (que deve continuar pura). Pronto para depois
   escrever numa tabela do Supabase.
5. **Testes automatizados do `stateMachine` e dos `states/*`** — como já são
   funções puras, são triviais de testar sem mocks de rede/banco. Não
   implementado nesta rodada (exige escolher/instalar um test runner, o que é
   uma decisão que vale confirmar com o time antes), mas é a próxima
   prioridade real para "durar anos" com segurança em refatorações futuras.
6. **Menus configuráveis via JSON** para os fluxos simples (menu principal,
   submenu de vendas) — Fase 2, depois de validar o padrão de comandos globais
   em produção.
7. **Idempotência por `mensagemId`** para tolerar retries da Evolution API —
   Fase 2/3, baixo risco de não ter agora, mas vale nota para quando o volume
   de mensagens crescer.

## 5. Prioridades

**Fase 1 — implementada (pequena, aditiva, zero risco de regressão):**
- Comandos globais (0/#/*/menu/ajuda)
- Histórico mínimo (`estadoAnterior`) para suportar "voltar"
- Deduplicação de mensagens compartilhadas
- Deduplicação de validação de opção numérica
- Scaffold de analytics (contadores em memória + log)

**Fase 1.5 — implementada (testes automatizados, escolhida como próximo passo
antes da Fase 2):**
- Suíte de testes com o test runner nativo do Node (`node --test`, sem
  dependência nova) cobrindo `stateMachine` (fluxo completo do menu principal,
  submenu de vendas, lista escolar com e sem período, comandos globais e a
  exceção de texto livre da observação), `validadores`, `comandosGlobais`,
  `payloadParser` e `materiaisEscolares` — todos módulos puros, sem I/O.
- `npm test` roda a suíte (35 testes na primeira versão).
- Isso dá rede de segurança para a Fase 2 (mudança estrutural nos menus),
  que sem testes seria arriscada de validar só manualmente.

**Fase 1.6 — implementada (correção de bug + 1º item da Fase 2 adiantado):**
- Corrigido: a primeira mensagem de uma conversa nova (ex.: "Bom dia") era
  avaliada como resposta ao menu principal e caía direto em "opção inválida"
  antes do cliente sequer ter visto as opções. Agora `menuPrincipal.js` só
  acusa "opção inválida" depois que o menu já foi apresentado ao menos uma vez
  (`dados.menuApresentado`).
- Pilha de histórico completa (`dados.historicoEstados`, adiantada da Fase 2):
  o comando `#` agora desempilha um passo por vez e pode navegar vários
  níveis para trás em sequência, não só um. Substitui o antigo
  `dados.estadoAnterior` (string única).
- Mensagens personalizadas com o primeiro nome do cliente (pushName do
  WhatsApp, já extraído pelo `payloadParser` mas até então não usado):
  saudação do menu principal, "só um momento, já vamos te atender" e a
  mensagem final da lista escolar. Sem nome confiável disponível, cai de
  volta na versão genérica — nenhuma informação é inventada. `stateMachine`
  continua pura: o nome entra como um terceiro parâmetro opcional
  (`contexto`), nunca é persistido em `dados`/Supabase (já existe em
  `clientes.nome`).

**Fase 2 — menus em JSON: implementada.** `src/botEngine/menuEngine.js` (novo)
interpreta configuração declarativa de opção → ação. Cada opção é
`{ rotulo, tipo: 'estado', estado, limparCampos? }` ou
`{ rotulo, tipo: 'notificar', alvo, intencao?, proximoEstado? }`.
`menuPrincipal.js` e `submenuVendas.js` foram reescritos como configuração
pura em cima desse motor (nenhum `processar`/`mensagem` escrito à mão nesses
dois arquivos agora). `listaEscolar.js` continua como módulo escrito à mão de
propósito — tem lógica condicional real (pergunta de período condicional,
busca de PDF por escola+ano+período), não é só "menu". Suíte de testes
inalterada (mesmos 41 testes de comportamento passando sem edição) + 8 testes
novos cobrindo o motor isoladamente (`test/botEngine/menuEngine.test.js`) —
total 49 testes.

**Fase 2 — idempotência de webhook por `mensagemId`: implementada, com uma
ação manual pendente antes do deploy.** `receberWebhook` agora ignora um
webhook cujo `mensagemId` já foi totalmente processado para aquela conversa
(`conversa.ultima_mensagem_id`), evitando notificar o humano duas vezes,
mandar o PDF duas vezes ou responder duas vezes ao cliente num retry da
Evolution API. `conversasService.atualizarEstadoConversa` só grava
`ultima_mensagem_id` depois que todo o fluxo (ações + resposta) terminou com
sucesso — se o processo cair no meio, um retry genuíno ainda é reprocessado
(no lado seguro: melhor responder duas vezes numa falha real do que nunca
responder). Não cobre o caso raro de duas cópias do mesmo webhook chegando em
paralelo antes da primeira terminar.

**Requer rodar `supabase/schema.sql` de novo no projeto Supabase real antes
do deploy** (adiciona a coluna `ultima_mensagem_id` em `conversas`, via
`alter table ... add column if not exists`, sem tocar no resto). Sem isso, a
primeira mensagem depois do deploy quebra ao tentar gravar a conversa.

**Fase 3.5 — implementada (feature de negócio pedida pelo dono do projeto +
hardening de produção):**
- **Cotação pra empresa** (`SUBMENU_VENDAS` opção 7,
  `src/botEngine/states/cotacaoEmpresa.js`): fluxo de duas perguntas (lista de
  itens → observação) no mesmo padrão de `listaEscolar.js`, notificando a
  Vanessa com os dois campos na íntegra ao final. Sem catálogo/preço — o bot
  só coleta e repassa.
- **Cabeçalho institucional sempre visível + retorno pro submenu de Vendas**
  (`src/botEngine/horarioAtendimento.js`, `states/menuPrincipal.js`,
  `states/submenuVendas.js`, `states/listaEscolar.js`,
  `states/cotacaoEmpresa.js`): o menu principal agora sempre mostra um cartão
  institucional (nome da loja, aviso de atendimento por ordem de chegada,
  horários seg-sex 9h-18h/sáb 9h-14h e endereço das 3 lojas — calculado em
  `America/Sao_Paulo` porque o servidor de produção roda em UTC), não só fora
  do expediente; fora do horário (incluindo domingo), acrescenta uma linha de
  aviso extra dizendo que está fechado. Além disso, as opções 2-6 do submenu
  de Vendas e o fim dos fluxos de lista escolar/cotação pra empresa agora
  voltam pro `SUBMENU_VENDAS` em vez do `MENU_PRINCIPAL` — o cliente não
  precisa digitar "1" de novo pra pedir outra coisa de vendas em seguida
  (as notificações do menu principal — Financeiro/Compras/Serviços —
  continuam voltando pro `MENU_PRINCIPAL`, sem mudança).
- **Guarda contra duplicidade em paralelo** (`webhookController.js`): a Fase 2
  tinha documentado que a dedupe por `ultima_mensagem_id` no banco não cobre
  duas cópias do mesmo webhook chegando em paralelo antes da primeira
  terminar de escrever. Adicionado um `Set` em memória do processo
  (`mensagensEmProcessamento`) que marca `conversaId:mensagemId` assim que a
  dedupe por banco passa, e rejeita qualquer segunda cópia que chegue
  enquanto a primeira ainda está em voo — cobre exatamente esse gap para uma
  instância única do processo (não cobre múltiplas instâncias rodando em
  paralelo, o que não é o caso deste deploy).

**Fase 3.6 — implementada (bug de produção encontrado em teste real: bot se
pausava sozinho).** Depurado ao vivo direto na instância real da Evolution
API (histórico de mensagens via `/chat/findMessages`, estado da conversa no
Supabase): a Evolution API (Baileys por baixo) ecoa de volta pelo mesmo
webhook, como `messages.upsert` com `fromMe: true`, tanto uma mensagem que um
humano digita manualmente no WhatsApp da loja quanto uma mensagem que o
próprio bot acabou de mandar pela API — as duas saem da mesma sessão
autenticada, o WhatsApp não distingue a origem. Como `webhookController.js`
tratava qualquer `fromMe: true` como "humano assumiu, pausa o bot", o bot
pausava a si mesmo a cada resposta sua — e como `garantirBotAtivo` renova
`ultima_interacao_em` a cada mensagem nova do cliente enquanto pausado, o
timeout de reativação nunca chegava a zero se o cliente continuasse
mandando mensagem (silêncio efetivamente permanente).

Corrigido em `src/services/evolutionApi.js`: `enviarTexto`/`enviarArquivo`
agora guardam (por até 5 min, com expiração automática) o id de toda
mensagem que o próprio bot manda, num `Set` em memória
(`idsEnviadosPeloBot`), exposto via `foiEnviadaPeloBot(mensagemId)`.
`webhookController.js`, ao receber um `fromMe: true`, primeiro checa se é
eco de uma mensagem do próprio bot — se for, ignora sem pausar; só chama
`reativacaoBot.pausarBot` quando sobra um `fromMe` que não é nosso (humano
de verdade). Mesma limitação de escopo do `mensagensEmProcessamento` da Fase
3.5: cobre uma instância única do processo, não múltiplas instâncias em
paralelo.

**Fase 3 — depende de features de negócio que ainda não existem:**
- Estrutura de carrinho/produto/categoria atual na sessão (só quando existir
  catálogo de produtos de verdade)
- Busca textual de produtos
- Multi-empresa / múltiplos catálogos
- Integração Redis (cache de sessão / rate limit), OpenAI (fallback de NLU),
  outros canais (Telegram/Web)

## 6. Riscos

- **Colisão de comandos globais com texto livre**: qualquer novo estado que
  capture texto livre no futuro (como `LISTA_ESCOLAR_OBSERVACAO` hoje) precisa
  lembrar de marcar `aceitaTextoLivre: true`, senão um cliente que digitar
  literalmente "menu" ou "0" como resposta terá o texto interpretado como
  comando em vez de conteúdo. Mitigado documentando a convenção no próprio
  código e neste review.
- ~~**Histórico de um nível só**~~ — endereçado na Fase 1.6: `#` agora usa uma
  pilha completa (`dados.historicoEstados`) e navega vários passos para trás.
- **Analytics em memória**: contadores são perdidos a cada restart do
  processo (deploy, crash). Aceitável como scaffold; vira problema real só
  quando alguém depender desses números para decisão de negócio — nesse
  ponto, precisa de persistência (Supabase).
- ~~**Ausência de testes automatizados**~~ — endereçado na Fase 1.5 (`npm
  test`). Cobertura ainda é só dos módulos puros (`botEngine`, `payloadParser`,
  `materiaisEscolares`); os `services/` (Supabase, Evolution API) e o
  `webhookController` continuam sem teste automatizado, dependendo de teste
  manual (`npm run chat` cobre a máquina de estados; o restante só com webhook
  real ou mocks, que ainda não existem no projeto).
- ~~**Duplicidade em paralelo do mesmo webhook**~~ — endereçado na Fase 3.5
  (guarda em memória `mensagensEmProcessamento`). Continua sem cobertura se o
  processo rodar em múltiplas instâncias simultâneas (não é o caso deste
  deploy hoje; se isso mudar, a solução robusta é um lock a nível de banco,
  não em memória do processo).

## 7. Plano de implementação (Fase 1 — nesta rodada)

1. `src/botEngine/mensagensComuns.js` (novo) — mensagem compartilhada.
2. `src/botEngine/validadores.js` (novo) — parsing de opção numérica.
3. `src/botEngine/comandosGlobais.js` (novo) — reconhecimento de comandos
   globais + mensagem de ajuda.
4. `src/services/analyticsService.js` (novo) — contadores em memória + log.
5. `src/botEngine/stateMachine.js` (editado) — intercepta comandos globais
   antes de delegar ao estado atual; grava `estadoAnterior` em `dados` a cada
   transição real de estado.
6. `src/botEngine/states/menuPrincipal.js`, `submenuVendas.js`,
   `listaEscolar.js` (editados) — passam a usar `mensagensComuns` e
   `validadores`; `listaEscolar.js` marca o passo de observação como
   `aceitaTextoLivre: true`.
7. `src/webhook/webhookController.js` (editado) — registra evento de
   analytics (estado acessado) após processar a mensagem.
8. `README.md` (editado) — nova seção documentando comandos globais e "como
   estender o projeto" (novo menu, novo estado, novo handler, novo serviço,
   novo comando global).

Nenhum arquivo é movido, nenhuma tabela do Supabase muda, nenhum contrato
público (`stateMachine.processarMensagem`, formato de `sessao`/`dados`
persistido) é quebrado. Comportamento externo do bot é preservado — a única
mudança de comportamento observável é a **adição** dos comandos globais (que
antes simplesmente caíam em "opção inválida").
