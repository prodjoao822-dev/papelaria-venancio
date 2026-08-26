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
│   │   ├── LISTA_ESCOLAR_ESCOLA      -> "Qual a escola?" (lista dinâmica, tabela "escolas", ORDER BY nome,
│   │   │                                + opção final "Não encontrei minha escola / outra escola")
│   │   ├── LISTA_ESCOLAR_ANO         -> "Qual o ano?" (menu montado por escola: só as turmas que ELA
│   │   │                                tem, no vocabulário dela — "Grupo 4", "Infantil 3", "Creche 1",
│   │   │                                1º-9º Fundamental, 1º-3º Médio — + "Não encontrei a turma")
│   │   ├── LISTA_ESCOLAR_ANO_OUTRO   -> "Qual a turma ou o ano?" (texto livre) — só quando o cliente
│   │   │                                escolhe "Não encontrei a turma do meu filho"
│   │   ├── LISTA_ESCOLAR_PERIODO     -> "Qual o período?" (Integral/Regular) — só aparece quando a
│   │   │                                escola tem lista diferente por período pra aquela turma
│   │   └── LISTA_ESCOLAR_OBSERVACAO  -> "Você tem alguma observação a fazer?"
│   │                                     -> escola conhecida: se já existe o PDF da lista pra essa
│   │                                        escola+ano(+período), o bot manda o arquivo direto pro
│   │                                        cliente; de qualquer forma, sempre notifica a Vanessa também
│   │                                     -> "outra escola" (não está na lista carregada): não há PDF pra
│   │                                        buscar automaticamente, então o fluxo segue pro Cadastro
│   │                                        Fiscal (ver seção própria abaixo) e cria um orçamento formal
│   ├── 2 Material escolar            -> Agente de Vendas (n8n), com Vanessa como rede de segurança
│   ├── 3 Material de escritório      -> Agente de Vendas (n8n), com Vanessa como rede de segurança
│   ├── 4 Informática                 -> Agente de Vendas (n8n), com Vanessa como rede de segurança
│   ├── 5 Brinquedos                  -> Agente de Vendas (n8n), com Vanessa como rede de segurança
│   ├── 6 Atendimento                 -> notifica Vanessa diretamente
│   └── 7 Cotação pra empresa
│       ├── COTACAO_EMPRESA_LISTA        -> "Me manda a lista de itens que a empresa quer cotar"
│       └── COTACAO_EMPRESA_OBSERVACAO   -> "Alguma observação sobre essa cotação (prazo, quantidade, CNPJ, etc.)?"
│                                           -> segue pro Cadastro Fiscal (ver seção própria abaixo) e cria
│                                              um orçamento formal
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
final, segue pro fluxo de **Cadastro Fiscal** abaixo, que cria o orçamento formal (protocolo,
itens gravados em `itens_orcamento`) e já o aceita como pedido — o bot não tem catálogo/preço
automático; quem precifica de fato é o Agente de Orçamento (n8n), acionado depois do
fechamento.

### Cadastro fiscal (antes de qualquer orçamento virar pedido)

Disparado logo antes de fechar qualquer orçamento (Cotação pra empresa, Lista escolar "outra
escola", e futuramente Venda geral) — nota fiscal é exigida independente do tipo de venda. Fica
em [`src/botEngine/states/cadastroFiscal.js`](src/botEngine/states/cadastroFiscal.js).

- **Passo 0 (silencioso):** antes de perguntar qualquer coisa, o `webhookController` chama a
  função `cliente_tem_cadastro_completo(cliente_id)` do Supabase. Se `true` (cliente recorrente
  já tem CPF, ou CNPJ+Razão Social+indicador de IE completos), o formulário inteiro é pulado e o
  pedido é fechado direto.
- **Passo 1 (atalho):** "Você já tem cadastro em nosso sistema? (sim/não)" — "sim" pula direto
  pra "qual seu CPF ou CNPJ?" e fecha o pedido sem repetir o formulário completo (o bot não
  valida nem busca esse dado no Shop Control, só repassa pro operador conferir lá manualmente);
  "não" segue pro formulário completo.
- **Passo 2 (formulário, uma pergunta por vez):** pessoa física ou jurídica; PF pede só o CPF;
  PJ pede CNPJ, Razão Social e Nome Fantasia (perguntas separadas, não agrupadas — ver comentário
  em `cadastroFiscal.js` sobre por que uma mensagem só quebrou em produção com o Enter do
  WhatsApp), depois o indicador de Inscrição Estadual (contribuinte/isento/não contribuinte); se
  "contribuinte", a Inscrição Estadual é obrigatória antes de prosseguir. Depois pergunta retirada
  na loja ou entrega — só pede CEP/endereço/cidade/estado se for entrega. Por fim, nome (se ainda
  não coletado) e telefone de contato.
- **Fechamento:** grava os dados fiscais em `clientes`, cria o orçamento com os itens
  (`orcamentosService.criarOrcamentoComItens`), aceita direto via `aceitar_orcamento()` (o pedido
  nasce com status `confirmado` e os itens são copiados de `itens_orcamento` pra `itens_pedido`
  numa única transação no banco), confirma o protocolo pro cliente e avisa o grupo de vendas com
  os dados fiscais prontos pro operador copiar no Shop Control (sem integração automática — fica
  pro operador copiar manualmente).

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

As 25 escolas do catálogo têm PDFs associados — 212 arquivos cobrindo 267 combinações de
escola + turma (+ período). Os arquivos ficam em [`materiais/`](materiais/) na raiz do projeto
e o mapeamento vive em [`src/config/materiais.json`](src/config/materiais.json);
[`src/config/materiaisEscolares.js`](src/config/materiaisEscolares.js) é só a camada de
consulta.

> **`materiais/` não é versionado neste repositório** (está no `.gitignore`) — os PDFs são
> dados de negócio, não código. Para montar a pasta localmente, rode o importador (abaixo).
> Sem os arquivos, o fluxo cai normalmente no caminho padrão (só notifica a Vanessa).

- Se a combinação escola + turma (+ período) tem PDF cadastrado, o bot manda o arquivo direto
  pro cliente (ação `ENVIAR_ARQUIVO`) e ainda assim notifica a Vanessa, pra ela acompanhar.
- Se não tem, o bot cai no comportamento padrão: só notifica a Vanessa com
  escola/turma/observação, sem enviar arquivo.
- A pergunta de período (Integral/Regular) só aparece quando a própria escola tem listas
  diferentes por período pra aquela turma (hoje, só a Linus Pauling: Grupo 2 a 5 e 1º ao 5º ano).

**O menu de ano é montado por escola.** Cada escola só oferece as turmas que ela realmente
tem, com o nome que ela mesma usa. Isso resolve dois problemas: evita opção morta (não adianta
oferecer Ensino Médio pra escola que vai até o 9º ano) e dispensa traduzir Educação Infantil —
cada escola nomeia as turmas no seu sistema ("Grupo 4", "Infantil 3", "Nível 2", "Creche 1",
"Pré 1", "Berçário", "Jardim 2") e não existe conversão confiável entre eles: "Grupo 4" é
Maternal numa escola e Jardim I na outra. O cliente responde no vocabulário da escola dele, que
é o que ele sabe responder. Quem não se encontra na lista escolhe a última opção e digita a
turma — aí não há PDF e o atendimento segue com a Vanessa.

### Importando as listas de um novo ano letivo

```bash
node scripts/importarListasEscolares.js --origem "<pasta do Drive>"            # dry-run
node scripts/importarListasEscolares.js --origem "<pasta do Drive>" --aplicar  # copia e grava
```

O script lê a pasta de listas do ano, normaliza os nomes dos arquivos (que são inconsistentes
entre escolas) e gera `materiais/`, `src/config/materiais.json` e `src/config/escolas.json`.
Estrutura permanente no código, dados substituíveis no JSON: no ano que vem é só apontar
`--origem` pra pasta nova. Rode sempre em dry-run antes (é o padrão) e **faça backup de
`materiais/` — a pasta não é versionada, então sobrescrever é irreversível pelo git.**

O que o bot envia é o **ORÇAMENTO** (a cotação com preço). A lista crua da escola (pasta
`LISTAS`) só é usada nas turmas que não têm orçamento na origem — hoje 14 de 267: o Grupo 2 da
Integra, o 4º ano Integral da Linus Pauling e a maior parte do Salesiano JC (que tem 17 listas
e só 4 orçamentos). A escolha é feita **turma a turma**, e nunca mistura as duas origens dentro
da mesma turma-e-período.

Três armadilhas da pasta de origem que o script trata e vale conhecer:

- **Arquivo de escola trocado de pasta.** Há `ORCAMENTO_INTEGRA_*` dentro de IDADE KIDS (e o
  inverso), e um `ORÇAMENTO_MUNDO LIVRE_1°ANO` dentro de LINUS PAULING. O script descarta o
  arquivo que se identifica como de outra escola — mandar a cotação do colégio errado é pior
  que não mandar nada. Os descartes aparecem no relatório do dry-run.
- **Orçamento de livros didáticos** (`ORÇAMENTO_LIVROS_CEC_6°ANO`) é outro produto e é
  ignorado; sem isso ele venceria o orçamento de material do mesmo ano, por ser mais específico.
- **Cotações alternativas** ("custo benefício", "somente pessoal") perdem para a padrão.

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
| Vendas: Cotação pra empresa       | `PHONE_VANESSA` (ao final do Cadastro Fiscal, com o pedido já confirmado) |
| Cadastro fiscal: pedido confirmado | `PHONE_VANESSA` (dados fiscais prontos pro operador copiar no Shop Control) |
| Comando global "atendente"/"reclamação" | `PHONE_CHEFE` (alvo `lideranca`, ver `notifyTargets.js`) |

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

> ⚠️ **Não rode `supabase/schema.sql`.** Até 26/08/2026 esta seção mandava
> rodá-lo como "SQL completo de criação". Ele é o schema da **primeira**
> versão do bot (14/07/2026): 4 tabelas e **nenhuma linha de RLS** — quem
> seguia essa instrução montava um banco com as tabelas abertas. O banco real
> hoje tem 38 tabelas e 137 policies.
>
> **Para montar um banco (novo ou existente), a instrução vale é a de
> [`supabase/README.md`](supabase/README.md)**, que traz a ordem de aplicação
> e o baseline extraído da produção
> (`supabase/baseline_producao_26-08-2026.sql`).

O resumo de colunas abaixo cobre só as 4 tabelas originais do bot e é material
de leitura, **não** instrução de criação:

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
- `nome` — nome da escola. É a chave real de ligação com os PDFs: `materiaisEscolares.js`
  normaliza esse texto pra slug (`"Múltipla"` -> `multipla`) e procura em `materiais.json`.
  Renomear aqui sem regerar o mapeamento faz o bot parar de achar o arquivo.
- `ativa` — indica se a escola está disponível para seleção no fluxo de lista escolar

Popule com [`supabase/seed_escolas.sql`](supabase/seed_escolas.sql), que espelha
`src/config/escolas.json` e é idempotente. **Em produção quem manda é esta tabela**
(`escolasService.listarEscolasAtivas()`); o JSON só vale como fallback offline (`npm run chat`).

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
real (montado antes seguindo o "Caminho A" de [`supabase/README.md`](supabase/README.md) —
**não** o `supabase/schema.sql`, que é legado e sem RLS) e
`EVOLUTION_API_URL`/`EVOLUTION_API_KEY` com uma instância válida.

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
| `atendente` ou `reclamação` | Notifica a liderança (`PHONE_CHEFE`, alvo `lideranca`) imediatamente e pausa o atendimento automático desta conversa (mesmo mecanismo de `reativacaoBot.pausarBot`, usado quando um humano assume manualmente) |

`atendente`/`reclamação` é a única exceção que funciona mesmo dentro de um estado que captura
texto livre de verdade (observação da lista escolar/cotação empresa, passos de texto livre do
cadastro fiscal) — é uma válvula de escape que precisa interromper qualquer fluxo. Como a
`stateMachine` é pura (sem I/O), ela só devolve a ação `NOTIFICAR_HUMANO`; quem efetivamente
pausa o bot é o `webhookController`, ao detectar esse comando (ver
`src/webhook/webhookController.js`).

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
- [x] 12. Cadastro fiscal (PF/PJ, atalho "já tenho cadastro", retirada vs. entrega) disparado antes de qualquer orçamento virar pedido, com checagem silenciosa (`cliente_tem_cadastro_completo`) pra cliente recorrente não repetir o formulário
- [x] 13. `orcamentosService`/`pedidosService` — orçamento e pedido como entidades formais (protocolo, `itens_orcamento` -> `itens_pedido` via `aceitar_orcamento()`), plugados no fim de `cotacaoEmpresa.js` e no ramo "outra escola" de `listaEscolar.js`
- [x] 14. Comando global `atendente`/`reclamação`: notifica a liderança e pausa o atendimento automático da conversa
- [x] 15. Integração com o Agente de Vendas (n8n) para as opções de produto do submenu de Vendas, com rede de segurança (timeout/erro pausa o bot e notifica Vanessa)
- [x] 16. Cadastrar PDFs das demais escolas (25 escolas, 209 PDFs, via `scripts/importarListasEscolares.js`) e resolver a Educação Infantil — em vez de converter "grupos" pra Maternal/Jardim, o menu de ano passou a ser por escola, com o vocabulário dela
- [ ] 17. Migrar os PDFs para um storage real (ex.: Supabase Storage) e trocar `materiaisEscolares.js` pela tabela `materiais_lista_escolar`
- [ ] 18. Integração via API com o Shop Control (hoje o operador copia manualmente os dados fiscais)
- [ ] 19. Deploy (Railway ou Render) e teste real com o chefe
