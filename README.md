# Papelaria Bot

## Visão geral

Bot de atendimento via WhatsApp (usando a Evolution API) para uma papelaria.
O bot recebe mensagens por webhook, navega o cliente por um menu **determinístico**
(sem uso de IA/LLM) e, dependendo da intenção identificada, notifica um humano
específico da equipe para dar continuidade ao atendimento.

Nesta fase o projeto é intencionalmente determinístico: as decisões de navegação
são baseadas em opções numéricas/palavras-chave fixas do menu, sem interpretação
de linguagem natural. Isso simplifica o desenvolvimento inicial, torna o
comportamento previsível e testável, e deixa a porta aberta para, em uma fase
futura, evoluir partes do fluxo para IA sem comprometer a base já construída.

## Fluxo de navegação

```
Menu principal (MENU_PRINCIPAL)
├── 1 Vendas (SUBMENU_VENDAS)
│   ├── 1 Lista escolar
│   │   ├── LISTA_ESCOLAR_ESCOLA      -> "Qual a escola?" (lista dinâmica, tabela "escolas", ORDER BY nome)
│   │   ├── LISTA_ESCOLAR_ANO         -> "Qual o ano?" (Maternal, Jardim, 1º-9º Fundamental, 1º-3º Médio)
│   │   ├── LISTA_ESCOLAR_PERIODO     -> "Qual o período?" (Integral/Regular) — só aparece quando a
│   │   │                                escola tem lista diferente por período pra aquele ano
│   │   └── LISTA_ESCOLAR_OBSERVACAO  -> "Você tem alguma observação a fazer?"
│   │                                     -> se já existe o PDF da lista pra essa escola+ano(+período),
│   │                                        o bot manda o arquivo direto pro cliente
│   │                                     -> sempre notifica a Vanessa também (escola + ano + período + observação)
│   ├── 2 Material escolar            -> notifica Vanessa
│   ├── 3 Material de escritório      -> notifica Vanessa
│   ├── 4 Informática                 -> notifica Vanessa
│   ├── 5 Brinquedos                  -> notifica Vanessa
│   ├── 6 Atendimento                 -> notifica Vanessa
│   └── 7 Cotação pra empresa
│       ├── COTACAO_EMPRESA_LISTA        -> "Me manda a lista de itens que a empresa quer cotar"
│       └── COTACAO_EMPRESA_OBSERVACAO   -> "Alguma observação sobre essa cotação (prazo, quantidade, CNPJ, etc.)?"
│                                           -> notifica a Vanessa com a lista de itens + observação
├── 2 Financeiro                      -> notifica o chefe
├── 3 Compras                         -> notifica o setor de compras
└── 4 Serviços gráfica / xerox        -> notifica o setor de serviços
```

Depois de qualquer notificação vinda do **menu principal** (Financeiro/Compras/Serviços), o
bot volta para o `MENU_PRINCIPAL`. Depois de qualquer ação de **Vendas** — opções 2 a 6, ou o
fim dos fluxos de lista escolar/cotação pra empresa —, o bot volta para o `SUBMENU_VENDAS` em
vez do menu principal, pra o cliente não precisar digitar "1" de novo se quiser pedir outra
coisa de vendas em seguida. Nos dois casos, quem efetivamente continua o atendimento a partir
dali é a pessoa notificada, pelo WhatsApp da loja — o bot só fica pronto pra uma próxima
pergunta.

### Cotação pra empresa (Vendas > 7)

Fluxo de duas perguntas (mesmo padrão da lista escolar, em
[`src/botEngine/states/cotacaoEmpresa.js`](src/botEngine/states/cotacaoEmpresa.js)): primeiro
pede a lista de itens que a empresa quer cotar (texto livre, pode ser várias linhas numa
mensagem só), depois pergunta se há alguma observação (prazo, quantidade, CNPJ etc.). Ao
final, notifica a Vanessa com a lista de itens + observação na íntegra — o bot não tem
catálogo/preço, só coleta e repassa pra quem monta o orçamento de fato.

### Saudação institucional e horário de atendimento

O cabeçalho do menu principal (
[`src/botEngine/horarioAtendimento.js`](src/botEngine/horarioAtendimento.js)) sempre mostra um
"cartão de visita" com o nome da loja, o aviso de atendimento por ordem de chegada, os
horários (segunda a sexta 9h-18h, sábado 9h-14h) e o endereço das 3 lojas — não só fora do
expediente. A verificação de horário (sempre em `America/Sao_Paulo`, calculada explicitamente
porque em produção o servidor roda em UTC) decide só uma coisa a mais: fora do horário de
atendimento (incluindo domingo), acrescenta uma linha de aviso extra dizendo que a loja está
fechada no momento. O cliente navega o menu normalmente nos dois casos.

### Envio automático do PDF da lista de material

Nesta fase de teste, 4 escolas já têm PDFs reais associados (**CEC**, **Múltipla**,
**Linus Pauling** e **Mundo Livre**), guardados em [`materiais/`](materiais/) na raiz do
projeto e mapeados em [`src/config/materiaisEscolares.js`](src/config/materiaisEscolares.js).

> **`materiais/` não é versionado neste repositório** (está no `.gitignore`) — os PDFs são
> dados de negócio, não código. Para rodar o envio automático localmente, crie a pasta
> `materiais/<escola>/<arquivo>.pdf` seguindo o mapeamento em `materiaisEscolares.js`. Sem
> os arquivos, o fluxo cai normalmente no caminho padrão (só notifica a Vanessa).

- Se a combinação escola + ano (+ período) tem PDF cadastrado, o bot manda o arquivo direto
  pro cliente (ação `ENVIAR_ARQUIVO`) e ainda assim notifica a Vanessa, pra ela acompanhar.
- Se não tem (cobertura é parcial de propósito — ex.: Mundo Livre só tem a lista do 3º ano
  fundamental pronta, e nenhuma das 4 escolas tem Maternal/Jardim mapeado ainda), o bot cai no
  comportamento padrão: só notifica a Vanessa com escola/ano/observação, sem enviar arquivo.
- A pergunta de período (Integral/Regular) só aparece quando a própria escola tem listas
  diferentes por período pra aquele ano (hoje, só a Linus Pauling do 1º ao 5º ano).

Quando os PDFs de outras escolas forem organizados, o lugar certo pra adicionar é o objeto
`MATERIAIS` em `materiaisEscolares.js` (tem comentário explicando o formato) — o resto do
fluxo não precisa mudar. Esse arquivo também documenta por que Maternal/Jardim ainda não
estão mapeados (a forma como cada escola organiza a Educação Infantil não bate 1:1 com esses
dois nomes do menu, então preferimos deixar em aberto a confirmar depois em vez de adivinhar).

A tabela `materiais_lista_escolar` (no schema do Supabase) continua existindo pensando no
próximo passo — quando os PDFs estiverem hospedados (ex.: Supabase Storage) em vez de
guardados localmente no projeto, ela pode virar a fonte de verdade no lugar deste arquivo.

## Destinos de notificação

| Intenção do cliente              | Variável de ambiente |
|-----------------------------------|-----------------------|
| Financeiro                        | `PHONE_CHEFE`         |
| Compras                           | `PHONE_COMPRAS`       |
| Serviços gráfica                  | `PHONE_SERVICOS`      |
| Vendas: Material                  | `PHONE_VANESSA`       |
| Vendas: Escritório                | `PHONE_VANESSA`       |
| Vendas: Informática                | `PHONE_VANESSA`       |
| Vendas: Brinquedos                | `PHONE_VANESSA`       |
| Vendas: Atendimento               | `PHONE_VANESSA`       |
| Vendas: Lista escolar             | `PHONE_VANESSA` (ao final do fluxo escola → ano → observação) |
| Vendas: Cotação pra empresa       | `PHONE_VANESSA` (ao final do fluxo lista de itens → observação) |

## Pausa e reativação do bot

Quando um humano responde manualmente pelo WhatsApp da loja (a Evolution API
identifica essa mensagem através do campo `fromMe: true` no payload do webhook),
o bot entra em modo pausado para aquela conversa específica — ele para de
responder automaticamente para não atropelar o atendimento humano.

Essa pausa é temporária: após um período configurável de inatividade na
conversa (`REACTIVATION_TIMEOUT_MINUTES`, padrão sugerido de 120 minutos), o
bot é reativado automaticamente e volta a responder normalmente ao cliente.

"Inatividade" conta a partir de `ultima_interacao_em`, que é atualizada a cada
mensagem — tanto do cliente quanto do humano. Ou seja, se o cliente continuar
mandando mensagens enquanto o bot está pausado, a janela de atendimento humano
se renova a cada mensagem; o timer só chega a zero quando ninguém (nem cliente,
nem humano) interage por `REACTIVATION_TIMEOUT_MINUTES` seguidos.

## Modelagem das tabelas (Supabase)

SQL completo de criação em [`supabase/schema.sql`](supabase/schema.sql). Resumo das colunas:

> **Já tem um projeto Supabase rodando de uma versão anterior?** Rode
> `supabase/schema.sql` de novo no SQL Editor — todo o arquivo é escrito com
> `if not exists`, então só aplica o que ainda falta (hoje: a coluna
> `ultima_mensagem_id` em `conversas`). Se pular esse passo antes de atualizar
> o código, o bot vai falhar ao responder qualquer mensagem (erro ao gravar a
> conversa, coluna inexistente).

### `clientes`
- `id` — identificador único do cliente
- `telefone` — número de WhatsApp do cliente (chave de identificação)
- `nome` — nome do cliente, extraído do payload da Evolution API
- `criado_em` — data/hora do primeiro contato
- `atualizado_em` — data/hora da última atualização do registro

### `conversas`
- `id` — identificador único da conversa
- `cliente_id` — referência ao cliente dono da conversa (uma conversa "viva" por cliente)
- `estado_atual` — estado atual da máquina de estados do bot para essa conversa
- `dados` — contexto temporário coletado durante um fluxo de várias perguntas (ex.: escola e
  ano escolhidos na lista escolar, antes da pergunta de observação). Fica no banco, e não em
  memória, porque cada mensagem chega como uma requisição HTTP separada ao webhook
- `bot_ativo` — indica se o bot está respondendo automaticamente ou pausado
- `ultima_interacao_em` — data/hora da última mensagem (cliente ou humano)
- `criado_em` — data/hora de criação da conversa
- `ultima_mensagem_id` — id da última mensagem da Evolution API já processada por completo
  nesta conversa; usado para ignorar webhooks duplicados (retry da Evolution API) sem
  notificar o humano ou responder ao cliente duas vezes

### `escolas`
- `id` — identificador único da escola
- `nome` — nome da escola
- `ativa` — indica se a escola está disponível para seleção no fluxo de lista escolar

### `materiais_lista_escolar`
Pensada para quando os PDFs estiverem hospedados (ex.: Supabase Storage) em vez de guardados
localmente no projeto. Hoje o código ainda não consulta essa tabela — o mapeamento real usado
pelo bot está em [`src/config/materiaisEscolares.js`](src/config/materiaisEscolares.js), que
aponta pra arquivos em [`materiais/`](materiais/). A tabela fica pronta pra virar a fonte de
verdade nessa migração, sem precisar mudar o restante do fluxo.
- `id` — identificador único
- `escola_id` — referência à escola
- `ano` — mesmo texto usado no menu "Qual o ano?" (ex.: "1º ano - Fundamental")
- `pdf_url` — link do PDF da lista de material (nulo até o material estar pronto)
- `atualizado_em` — data/hora da última atualização do registro

### `mensagens`
- `id` — identificador único da mensagem
- `conversa_id` — referência à conversa à qual a mensagem pertence
- `remetente` — origem da mensagem (cliente, bot ou humano)
- `conteudo` — texto da mensagem
- `enviado_em` — data/hora de envio/recebimento da mensagem

> A tabela `mensagens` já está no schema, mas o código desta fase ainda não grava nela
> (não fazia parte do escopo definido) — fica pronta para um histórico/auditoria futuro.

## Testando o webhook localmente (sem a instância real da Evolution API)

O token do webhook é validado pelo header `x-webhook-token` (ou `?token=` na query string),
comparado com `WEBHOOK_SECRET_TOKEN` do `.env`. Com o servidor rodando (`npm start` ou
`npm run dev`), os exemplos abaixo simulam os payloads que a Evolution API manda no evento
`messages.upsert`:

### Mensagem comum do cliente (fromMe: false)

```bash
curl -X POST "http://localhost:3000/webhook" \
  -H "Content-Type: application/json" \
  -H "x-webhook-token: SEU_WEBHOOK_SECRET_TOKEN" \
  -d '{
    "event": "messages.upsert",
    "instance": "sua-instancia",
    "data": {
      "key": { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": false, "id": "MSG1" },
      "pushName": "Cliente Teste",
      "message": { "conversation": "1" }
    }
  }'
```

### Mensagem enviada manualmente pela loja (fromMe: true — pausa o bot)

```bash
curl -X POST "http://localhost:3000/webhook" \
  -H "Content-Type: application/json" \
  -H "x-webhook-token: SEU_WEBHOOK_SECRET_TOKEN" \
  -d '{
    "event": "messages.upsert",
    "instance": "sua-instancia",
    "data": {
      "key": { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": true, "id": "MSG2" },
      "pushName": "Cliente Teste",
      "message": { "conversation": "Oi, já te atendo por aqui!" }
    }
  }'
```

Sem uma instância real da Evolution API e um projeto Supabase configurados, essas
chamadas devem falhar ao tentar salvar/consultar dados (erro 500 de conexão) — isso já
confirma que a validação do token, o parsing do payload e o roteamento estão funcionando.
Para testar o fluxo completo, preencha `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` com um projeto
real (rodando antes o `supabase/schema.sql`) e `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` com uma
instância válida.

Também dá pra testar só a máquina de estados, sem subir o servidor nem o Supabase, com o
simulador de terminal:

```bash
npm run chat
```

## Testes automatizados

```bash
npm test
```

Usa o test runner nativo do Node (`node --test`, sem dependência nova) porque as
partes mais importantes de cobrir são funções puras — `stateMachine`, `validadores`,
`comandosGlobais`, `payloadParser` e `materiaisEscolares` não fazem I/O, então os testes
rodam sem precisar de Supabase, Evolution API nem variáveis de ambiente configuradas.
Os arquivos ficam em [`test/`](test/), espelhando a estrutura de `src/`.

Ao adicionar um novo estado/fluxo de menu, o padrão é: primeiro escrever o teste em
`test/botEngine/stateMachine.test.js` navegando pela `stateMachine` (como o simulador de
terminal faz), depois implementar o estado.

## Comandos globais

Além das opções específicas de cada menu, os comandos abaixo funcionam a partir de
**qualquer estado** da conversa (exceto na pergunta de observação da lista escolar, que
captura texto livre de propósito — ver `aceitaTextoLivre` em
[`src/botEngine/comandosGlobais.js`](src/botEngine/comandosGlobais.js)):

| Comando | Efeito |
|---------|--------|
| `0` ou `menu` | Volta para o menu principal (limpa o contexto do fluxo atual) |
| `#` | Volta um passo (para o estado anterior) |
| `*` | Reinicia o atendimento do zero |
| `ajuda` | Mostra a lista de comandos + a pergunta do estado atual novamente |

O `#` é implementado guardando uma pilha (`historicoEstados`) dentro do próprio `dados`
da sessão, empilhando um item a cada transição real de estado. Cada `#` desempilha um
passo, então dá pra voltar vários níveis em sequência (ex.: da pergunta de ano da lista
escolar até o menu principal, "#" três vezes) — não fica limitado a um único nível.

## Arquitetura interna e como estender o projeto

Ver [`ARCHITECTURE_REVIEW.md`](ARCHITECTURE_REVIEW.md) para a análise completa da
arquitetura (pontos fortes, problemas, prioridades e roadmap em fases). Resumo prático
de como adicionar coisas novas sem quebrar o que já existe:

- **Novo menu/estado simples** (opção numérica → notifica humano ou muda de estado,
  sem lógica condicional real): não escreva `processar`/`mensagem` à mão — descreva o
  menu como configuração e passe para
  [`criarEstadoDeMenu`](src/botEngine/menuEngine.js), como
  [`menuPrincipal.js`](src/botEngine/states/menuPrincipal.js) e
  [`submenuVendas.js`](src/botEngine/states/submenuVendas.js) já fazem. Cada opção é
  `{ rotulo, tipo: 'estado', estado }` (muda de estado, com `limparCampos: [...]`
  opcional pra descartar contexto de um fluxo anterior) ou
  `{ rotulo, tipo: 'notificar', alvo, intencao?, proximoEstado? }` (notifica um humano
  e opcionalmente muda de estado depois). Registre o módulo resultante em
  [`stateMachine.js`](src/botEngine/stateMachine.js) normalmente — ele continua
  exportando `{ STATE, mensagem, processar }`, só que gerado pelo motor.
- **Novo fluxo com várias perguntas em sequência**: siga o padrão de
  [`listaEscolar.js`](src/botEngine/states/listaEscolar.js), que exporta
  `{ estados: [...] }` (um array de `{ STATE, mensagem, processar }`).
- **Estado que precisa capturar texto livre** (não é uma opção de menu): marque
  `aceitaTextoLivre: true` na definição do estado, senão o texto do cliente pode ser
  interpretado como um comando global (`menu`, `ajuda`, etc.) em vez de conteúdo real.
- **Nova ação disparada por um estado** (ex.: além de `NOTIFICAR_HUMANO` e
  `ENVIAR_ARQUIVO`): adicione o executor em
  [`src/botEngine/actions.js`](src/botEngine/actions.js) — os estados continuam só
  descrevendo a intenção (`{ tipo, alvo, dados }`), nunca fazendo I/O diretamente.
- **Nova integração externa** (banco, API, etc.): sempre em `src/services/`, nunca
  dentro de `botEngine/` — a máquina de estados é uma função pura de propósito (sem
  I/O), o que permite testá-la só com `npm run chat`.
- **Mensagem ou validação repetida em mais de um estado**: centralize em
  [`mensagensComuns.js`](src/botEngine/mensagensComuns.js) ou
  [`validadores.js`](src/botEngine/validadores.js) em vez de duplicar.
- **Métricas de uso**: registre eventos via
  [`analyticsService.registrarEvento(tipo, detalhes)`](src/services/analyticsService.js)
  no `webhookController` (ou outro ponto que já faça I/O) — hoje fica em memória + log,
  pronto para depois persistir numa tabela do Supabase sem mudar quem chama.

## Checklist de implementação

- [x] 1. Webhook recebendo e logando o payload
- [x] 2. Extrair telefone, nome e texto da mensagem
- [x] 3. Upsert em clientes
- [x] 4. Máquina de estados em memória (menu, submenu de vendas, lista escolar em 3 passos)
- [x] 5. Persistir estado_atual (e dados) em conversas
- [x] 6. Enviar resposta via Evolution API
- [x] 7. Detectar fromMe e implementar bot_ativo com reativação por timeout
- [x] 8. Fluxo dinâmico de lista escolar puxando de escolas
- [x] 9. Envio automático do PDF de material para as escolas de teste (CEC, Múltipla, Linus Pauling, Mundo Livre)
- [x] 10. Cotação pra empresa (Vendas > 7): lista de itens + observação, notifica a Vanessa
- [x] 11. Saudação sensível ao horário de atendimento (dentro/fora do expediente)
- [ ] 12. Cadastrar PDFs das demais escolas e confirmar a conversão Maternal/Jardim -> "grupos" de cada escola
- [ ] 13. Migrar os PDFs para um storage real (ex.: Supabase Storage) e trocar `materiaisEscolares.js` pela tabela `materiais_lista_escolar`
- [ ] 14. Deploy (Railway ou Render) e teste real com o chefe
