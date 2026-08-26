# VENÂNCIO AI — AUDITORIA DE FINALIZAÇÃO

**Data da vistoria:** 25/08/2026
**Método:** leitura direta do código de todos os subprojetos, execução real das 3 suítes de teste, consulta ao vivo ao Postgres de produção (Supabase MCP) e leitura ao vivo dos 5 workflows n8n de produção, incluindo as execuções reais desta noite.
**Natureza:** documento de DIAGNÓSTICO + PLANO. Nada foi implementado nesta sessão.

> **Tudo neste documento foi verificado ao vivo.** Uma primeira versão desta auditoria foi escrita sem acesso ao n8n e trazia hipóteses sobre os workflows. O acesso foi restabelecido e **todas as hipóteses foram testadas contra a instância real** — uma delas se provou errada e está corrigida na seção 11. A causa raiz da falha de fechamento foi encontrada nas execuções reais de hoje e está na seção 5.

---

## 1. Resumo Executivo

### O que é o Venâncio AI, em uma frase

É um atendente digital de WhatsApp para a Papelaria Venâncio que conversa com o cliente, monta o pedido sozinho e entrega esse pedido pronto para a equipe da loja separar e entregar — com um painel no computador para o balcão e um aplicativo no celular para quem separa e quem entrega.

### Onde estamos, sem rodeios

O projeto está **muito mais perto do fim do que do começo**. Existe software real, testado e rodando: o cliente manda "boa noite" no WhatsApp e o sistema conduz a conversa até um orçamento montado com produtos e preços reais do catálogo. Isso aconteceu de verdade hoje à noite, 25/08, e está gravado no banco de produção.

Mas o projeto **não está pronto para operar**, e por três motivos que não são de código:

1. **Ele não está em lugar nenhum.** O bot roda no computador do dono, num terminal. Se o computador desliga, a loja fica sem atendimento. Não existe Dockerfile, não existe servidor, não existe pipeline.
2. **Uma semana de trabalho não está salva.** O último commit do Git é de **18/08**. Todo o trabalho de 19 a 25 de agosto — a feature inteira de Entrega/Ocorrência, o app mobile do entregador, o processamento de áudio e imagem, a fila de atendimento, 11 arquivos de banco e 4 arquivos de teste — está solto no disco. São **52 arquivos modificados e 68 arquivos novos**. Um acidente qualquer apaga sete dias.
3. **A venda ainda não fecha de forma confiável.** O caminho "conversa → orçamento" funciona. O caminho "orçamento → pedido" está falhando, e eu encontrei a causa exata olhando os dados de hoje (ver seção 5 e problema **P5**).

### As três coisas mais importantes deste documento

| | Achado | Por que importa |
|---|---|---|
| 🔴 | **`atualizar_status_pedido` está aberta para qualquer um** (problema **P1**) | Com a chave pública do painel, sem login nenhum, é possível mudar ou cancelar o status de qualquer pedido. É a mesma falha que já foi corrigida em três outras funções — esta ficou para trás, e na verdade **piorou** numa correção de segurança feita em 24/08. |
| 🔴 | **Sete dias de trabalho fora do Git** (problema **P2**) | Não é um bug, é risco de perda total de uma semana de desenvolvimento. É a coisa mais barata de resolver e a mais cara de ignorar. |
| 🟠 | **A venda não fecha, e a causa raiz está achada** (problemas **P5** + **P6**) | Um bug conhecido do n8n faz a busca do orçamento em aberto devolver a linha errada — às vezes de **outro cliente**. Isso força a criação de um rascunho novo a cada chamada; o bot então aponta o vendedor para o rascunho vazio mais recente e o pedido nunca fecha. Reconstituído execução por execução nos dados de hoje. |

### O tamanho do que falta

Não é reconstrução. É **fechamento**. O plano da seção 23 tem 9 fases; as 4 primeiras são correção e endurecimento do que já existe, e só a Fase 4 (App Mobile) e a Fase 3 (notificação do entregador) constroem coisa nova de verdade. Duas funcionalidades do documento de requisitos original — *tarefas agendadas* e *lista de espera de produto* — nunca foram construídas e continuam fora, por decisão a tomar (seção 20).

---

## 2. Estado Atual do Projeto

### Legenda

🟢 PRONTO · 🟡 PARCIAL · 🟠 PRECISA DE AJUSTE · 🔴 BLOQUEADOR · ⚪ FORA DE ESCOPO

### Componente por componente — verificado, não presumido

| Componente | Estado | O que foi verificado de fato |
|---|---|---|
| **JS Bot** (`chatbot/papelaria-bot`) | 🟠 | 4.523 linhas de código, **231 testes passando** (rodei agora), cobertura 87% de linhas. Código de qualidade acima da média. Ajuste: descarta mensagem em silêncio sob concorrência (**P4**) e depende de locks em memória. |
| **Node / Express** | 🟢 | 8 rotas, autenticação em todas, CORS por allowlist, rate limit em duas camadas, tratamento global de `unhandledRejection`/`uncaughtException`. |
| **Evolution API** (WhatsApp) | 🟠 | Serviço externo (Cloudfy). Funciona. Chave nunca rotacionada (**P16**) — risco assumido, depende do fornecedor. |
| **n8n / Agentes de IA** | 🟠 | 5 workflows ativos, lidos ao vivo. Mais maduros que o repositório sugere: RAG, tier de material, 4 ramos de tratamento de erro, extração determinística de entrega. Ajuste: um nó com filtro quebrado derruba o fechamento (**P6**), e o repositório não reproduz a instância (**P8**). |
| **Supabase / PostgreSQL** | 🟠 | 38 tabelas, todas com RLS ligada e policies reais. 60+ funções. Uma RPC crítica ainda aberta (**P1**); controle de migração só existe desde 20/08 (**P8b**). |
| **RLS** | 🟢 | Verificado tabela a tabela: escrita sempre atrás de `eh_operador_ativo()` / `funcionario_atual_id()`. Nenhuma policy `using(true)`. Nenhum PII exposto a `anon`. |
| **RPCs** | 🟠 | O padrão certo (ator resolvido por `auth.uid()` dentro da função) está aplicado em 24 das 25 funções de negócio. A exceção é **P1**. |
| **Realtime** | 🟢 | 14 tabelas publicadas. Dashboard e app assinam e re-consultam. Funciona nos dois. |
| **Redis** | ⚪ | **Não existe no bot.** Existe só dentro do n8n (buffer de 7s e bloqueio de conversa). A documentação antiga dizia o contrário — está errada. |
| **Dashboard** (`venancio-ai-ops`) | 🟡 | 22 telas, 21 services, 14 hooks, ~10.900 linhas. Completo em funcionalidade. Fraco em teste (1 arquivo) e tem uma tela de 1.004 linhas (**P18**). |
| **App Mobile** (`app-mobile`) | 🟡 | Real, não mais protótipo: Supabase de verdade, sessão cifrada, Realtime, 32 testes passando. Falta o que transforma em app instalável (**P19**) e notificação (**P20**). |
| **Autenticação** | 🟡 | Duas identidades: Operador por e-mail/senha; Separador/Entregador por código + PIN de 6 dígitos com bloqueio após 5 erros. Funciona. Não foi unificado. |
| **Logs** | 🟢 | Logger central com mascaramento recursivo de campos sensíveis (`apikey`, `token`, `senha`...). |
| **Observabilidade** | 🟡 | Existe telemetria própria (tabela `eventos`, 158 registros; medição de latência do agente). Não existe painel de saúde nem alerta. |
| **Tratamento de erros** | 🟢 | Melhor parte do projeto. Timeout, retentativa seletiva, recuperação por banco quando a resposta HTTP se perde, best-effort em toda etapa não-crítica. |
| **Testes** | 🟡 | **270 testes, todos passando** (231 bot + 32 app + 7 dashboard). Cobrem serviços e rotas; não cobrem nenhuma tela. |
| **Deploy** | 🔴 | Não existe. Sem Docker, sem CI, sem servidor. Roda no computador do dono. |
| **Git** | 🔴 | Sete dias sem commit, 120 arquivos pendentes (**P2**). |

### O estado real dos dados de produção (25/08, 22h40 UTC)

Isso é o retrato mais honesto de "onde estamos" que existe:

| Tabela | Linhas | Leitura |
|---|---|---|
| `produtos` | 577 (575 ativos) | Catálogo carregado e indexado para busca semântica (575/575 com embedding). |
| `clientes` | 21 | Clientes reais de teste. |
| `conversas` | 1 | Só a conversa de teste de hoje. |
| `mensagens` | 21 | A conversa de hoje, ponta a ponta. |
| `orcamentos` | 4 | **Todos em `rascunho`.** Nenhum fechado. |
| `pedidos` | **0** | **Nenhum pedido existe hoje no sistema.** |
| `eventos` | 158 | Trilha de auditoria de 08/08 a 25/08 — inclui 80 eventos de pedidos que **não existem mais** (**P22**). |
| `funcionarios` / `operadores` | 2 / 1 | Um separador/entregador e um operador ativos. |

**Como ler isso:** a base foi limpa em algum momento depois de 22/08, sem limpar a trilha de eventos junto. E a sessão de teste de hoje terminou em rascunho, não em pedido. Não é "o sistema está vazio porque é novo" — é "o caminho de fechamento não completou hoje".

---

## 3. Arquitetura Completa

### Explicando como se fosse a loja física

Imagine a papelaria como uma loja de verdade e cada peça de software como uma pessoa:

- **A Evolution API** é a linha telefônica. Ela não pensa, só entrega o recado do WhatsApp para dentro da loja e leva a resposta de volta.
- **O JS Bot** é o recepcionista da porta. Ele é rápido, educado, e não improvisa: sabe o menu de cor, sabe quem chamar para cada assunto, sabe quando calar a boca porque uma pessoa de verdade assumiu a conversa. Ele **nunca inventa nada**, porque não usa IA.
- **O n8n** é a sala dos fundos onde ficam os vendedores especialistas. Quando o cliente quer comprar de verdade, o recepcionista leva o recado até lá e espera na porta pela resposta.
- **O Agente de Vendas** é o vendedor. Esse sim usa IA. Ele consulta o catálogo, monta o orçamento, e fecha a venda.
- **O Supabase** é o arquivo da loja: o cadastro de cliente, o catálogo, os orçamentos, os pedidos, o histórico de tudo. Todo mundo escreve e lê lá.
- **O Dashboard** é o balcão: onde o operador vê os pedidos chegando, delega separação, acompanha entrega e conversa com o cliente quando precisa.
- **O App Mobile** é o crachá de quem trabalha no estoque e na rua: o separador vê o que separar, o entregador vê o que entregar.

### O desenho

```
                        Cliente (WhatsApp)
                               │
                    ┌──────────▼──────────┐
                    │   Evolution API     │  (Cloudfy, externo)
                    └──────────┬──────────┘
                          POST /webhook
                        (token compartilhado)
                               │
   ┌───────────────────────────▼────────────────────────────┐
   │  JS BOT — Node/Express  (chatbot/papelaria-bot)         │
   │                                                          │
   │   payloadParser ─► dedupe ─► reativacaoBot               │
   │        │                                                 │
   │        ├─ mídia?  mediaProcessor (OpenRouter)            │
   │        │            áudio→texto / imagem→descrição       │
   │        │                                                 │
   │        ├─ menu?   stateMachine (função PURA, sem I/O)    │
   │        │            └─► actions.js (todo o I/O)          │
   │        │                                                 │
   │        └─ venda?  n8nClient ──────────────┐              │
   └───────────────────────────────────────────┼──────────────┘
                                               │ HTTP síncrono
                                               │ timeout 55s
                    ┌──────────────────────────▼──────────────┐
                    │  n8n  (Cloudfy)                          │
                    │   Agente de Vendas                       │
                    │    ├─ Redis (buffer 7s / lock)           │
                    │    ├─ RAG "Busca Inteligente"            │
                    │    │    └─ produtos_documentos (vetor)   │
                    │    ├─ Tier de Material                   │
                    │    ├─ Perguntar ao Operador              │
                    │    └─ Sub-workflow Orçamento             │
                    │         criar / adicionar item / fechar  │
                    │           └─ RPC aceitar_orcamento       │
                    │   Notificação de Status (WhatsApp)       │
                    │   Error Handler global                   │
                    └──────────────────────────┬──────────────┘
                                               │
   ┌───────────────────────────────────────────▼──────────────┐
   │  SUPABASE  (projeto único, 38 tabelas)                    │
   │   bot → service_role (ignora RLS, é servidor)             │
   │   dashboard/app → anon key + Supabase Auth + RLS          │
   └────────┬──────────────────────────────────┬──────────────┘
            │ Realtime                          │ Realtime
   ┌────────▼─────────┐              ┌──────────▼───────────┐
   │ Venâncio         │              │  App Mobile (Expo)    │
   │ Operations       │              │  Separador /          │
   │ (React + Vite)   │              │  Entregador           │
   │ Operador         │              │  código + PIN         │
   └──────────────────┘              └───────────────────────┘
```

### Peças da arquitetura que NÃO estão no repositório

Isso é importante para o plano de amanhã — não dá para automatizar o que não está no disco:

| Peça | Onde vive | Consequência |
|---|---|---|
| **Workflows n8n (versão viva)** | Instância Cloudfy | Os arquivos do repo são de julho/início de agosto. O que roda hoje é diferente. **P8** |
| **Credenciais do n8n** | Cofre do n8n | Não versionáveis (correto), mas nenhum inventário de quais existem. |
| **Evolution API / instância WhatsApp** | Cloudfy | Fora do nosso controle; chave não rotacionável hoje. |
| **Configuração de Auth do Supabase** | Painel Supabase | Ex.: proteção contra senha vazada está **desligada** (**P21**). |
| **`.env` de cada projeto** | Disco local | Só existem os `.env.example`. Nenhum inventário de qual valor está onde. |

---

## 4. Fluxo de Atendimento

### O caminho completo, passo a passo

**1. O cliente escreve.** "boa noite" chega no WhatsApp da loja. A Evolution API dispara um `POST /webhook` para o bot, com um token secreto no cabeçalho.

**2. O bot filtra.** Descarta tudo que não é mensagem (eventos de conexão, status de entrega). Extrai telefone, nome, texto, e o tipo de mídia.

**3. O bot se protege de repetição.** Duas travas: uma no banco (`conversas.ultima_mensagem_id`) para reenvios da Evolution, e uma em memória para duas cópias chegando ao mesmo tempo. *Isto funciona — foi testado sob carga.*

**4. O bot identifica o cliente.** `upsertCliente` por telefone. Detalhe importante já corrigido: quando a mensagem é da própria loja (`fromMe`), o bot ignora o nome, porque senão gravava "Papelaria Venâncio" por cima do nome do cliente.

**5. O bot decide se pode falar.** Três situações:
- **Um humano respondeu pelo WhatsApp da loja** → o bot se cala e registra a mensagem no histórico, para o operador ver no painel.
- **É o eco da própria mensagem do bot** → ignora (senão o bot se pausava sozinho a cada resposta).
- **Passou o tempo de silêncio** (padrão 120 min) → reativa sozinho.

**6. Mídia vira texto.** Áudio é transcrito e imagem é descrita via OpenRouter, e o resultado segue como se o cliente tivesse digitado. Se falhar ou não estiver configurado, avisa a equipe de vendas — nunca trava. PDF é sempre encaminhado direto para vendas, mesmo com o bot pausado.

**7. Menu ou vendedor?**
- Opções numéricas, lista escolar, cotação para empresa, cadastro fiscal → **máquina de estados** (determinística, sem IA).
- Material escolar / escritório / informática / brinquedos → **Agente de Vendas** no n8n.

**8. A chamada ao vendedor.** Aqui está a parte mais delicada da arquitetura: é uma chamada **síncrona**, com até 55 segundos de espera. O bot fica segurando a requisição do WhatsApp enquanto a IA pensa. Isso é assumido de propósito (a latência real medida é de 8 a 34 segundos), e é blindado por:
- **Timeout nunca gera nova tentativa** — porque abortar do lado do bot não cancela a execução do n8n, e tentar de novo criaria dois vendedores mexendo no mesmo orçamento (foi exatamente o que causou pedidos duplicados em 30/07).
- **Se a conexão cai depois de enviar**, o bot não reenvia: vai *ler a resposta no banco*, porque o n8n grava a resposta lá de qualquer forma.
- **Se tudo falhar**, o cliente recebe "Vou te conectar com nossa equipe agora", um humano é notificado, e o bot se cala naquela conversa.

**9. A resposta volta e é gravada.** Quem grava as mensagens do Agente de Vendas é o próprio n8n; quem grava as de menu é o bot. Essa divisão é deliberada — se os dois gravassem, o histórico duplicaria.

**10. O operador vê.** A tela de Atendimento mostra a conversa em tempo real, com fila de espera, atribuição automática de operador online, e alerta visual quando passa de 5 conversas aguardando.

### Estado deste fluxo: 🟢 com uma ressalva 🟠

Funciona ponta a ponta, comprovado hoje. A ressalva é o **P4**: se o cliente mandar 2-3 mensagens seguidas enquanto o vendedor ainda pensa na anterior, o bot **descarta as extras em silêncio** — sem responder, sem avisar, sem registrar. No teste de carga, 90% das mensagens concorrentes sumiram assim.

---

## 5. Fluxo de Pedido

### Como deveria ser

```
Conversa → Orçamento (rascunho) → Itens adicionados → Cliente confirma
   → aceitar_orcamento (RPC atômica) → PEDIDO criado (status confirmado)
   → Preparação → Separação → Pronto → Entrega/Retirada → Concluído
```

### Como está de fato

O trecho **Conversa → Orçamento → Itens** funciona. O trecho **Cliente confirma → Pedido** é onde o projeto está travado agora, e os dados de hoje mostram exatamente por quê.

### A reconstituição da conversa de hoje (evidência real)

| Hora (UTC) | O que aconteceu |
|---|---|
| 21:37 | Cliente: "boa noite" → menu → opção 1 → opção 2. **Menu 🟢** |
| 21:38 | Cliente: "material escolar" → o vendedor **não** despejou lista da cabeça, pediu detalhe. **Regra anti-alucinação 🟢** |
| 21:41 | Cliente: "quero com 500 folhas, branca" → busca semântica devolveu **3 produtos reais com preço real**. **RAG 🟢** |
| 21:41:46 | Criado `ORC-2026-0185` — **vazio** (execução `11766`) |
| 21:41:49 | **"Adicionar Item ao Orçamento" FALHOU** (execução `11767`). Bot ao cliente: *"não está disponível no momento para ser adicionado ao carrinho"* |
| 21:42 | Tentou de novo (execução `11769`). **Falhou de novo.** |
| 22:38:07 | Criado `ORC-2026-0186` (execução `11772`); item adicionado às 22:38:08 (execução `11773`), R$ 29,99. Funcionou. |
| 22:38:10 | **Três segundos depois: criado `ORC-2026-0187` — vazio** (execução `11774`). Rascunho duplicado. |
| 22:39:10 | O bot injeta no texto: *"ele já tem o orçamento **ORC-2026-0187** em aberto. Use esse protocolo; não crie um orçamento novo."* — **apontando para o orçamento VAZIO.** |
| 22:39:12 | Vendedor confirma retirada e resume "Total: R$ 29,99" — mas está prestes a fechar o orçamento errado. |
| — | **Nenhum pedido foi criado.** |

### A causa raiz — encontrada na execução 11774

Abri a execução do n8n que criou o rascunho duplicado (`11774`, 22:38:10). Ela pediu o orçamento em aberto da conversa `493b2143-…` e recebeu de volta:

```
Supabase · Buscar Orçamento Aberto  →  ORC-2026-0181
    cliente_id:  09e95018-…   ← OUTRO CLIENTE
    conversa_id: null          ← nem pertence a conversa nenhuma
    status:      rascunho
```

A consulta pedia `conversa_id = 493b2143-… E status = rascunho`. Só o **segundo** filtro foi aplicado. O primeiro — justamente o que garante o isolamento entre clientes — foi ignorado.

**Isto é um bug conhecido do n8n, e o próprio time já o documentou.** Existe um sticky note dentro do workflow, *"Auditoria nodes Supabase — filtro multi-condição (03/08)"*, que diz textualmente:

> Bug: node Supabase v1 (getAll/update) **ignora silenciosamente a 2ª+ condição** de um filtro com 2+ condições.

E registra o efeito real em produção: a consulta devolvia orçamento em rascunho de outro cliente, o guarda `Pertence a Esta Conversa?` barrava a escrita a tempo (**por isso não houve vazamento de dado**), mas o cliente ficava travado recebendo *"não consegui adicionar"* para sempre, porque o `orcamento_id` devolvido nunca era dele.

### Por que isso explica as três coisas de uma vez

| O que se via | Explicação |
|---|---|
| **"Adicionar Item" falhando às 21:41 e 21:42** | O `orcamento_id` que o vendedor tinha em mãos era de outro cliente. O guarda `Pertence a Esta Conversa?` recusou — corretamente. O agente traduziu isso para o cliente como "não está disponível para ser adicionado". |
| **Rascunho duplicado às 22:38:10** | Não foi corrida nem concorrência. Foi o guarda **funcionando**: às 22:00 de hoje o `Já Existe Orçamento Aberto?` foi endurecido para exigir também `conversa_id` igual. Ao receber a linha do outro cliente, ele corretamente concluiu "isto não é meu" e mandou criar um novo. |
| **Três rascunhos numa conversa só** | Consequência direta: enquanto a **consulta** devolver a linha errada, o caminho de reaproveitar nunca dispara. O sub-workflow passa a criar um rascunho novo em **toda** chamada de "Criar Orçamento" — e o prompt manda chamá-la de novo imediatamente antes de fechar. |

### O ponto que ficou de fora da correção de hoje

A correção de 25/08 às 22:00 endureceu o **guarda**, não a **consulta**. O nó `Supabase · Buscar Orçamento Aberto` continua com as duas condições e continua devolvendo a linha errada — verifiquei o nó ao vivo agora.

O efeito é que o sistema saiu de *"falha perigosa"* (podia pegar o orçamento de outro cliente) para *"falha segura mas inútil"* (nunca reaproveita, sempre cria novo). É uma melhora real de segurança, mas o fluxo de venda continua quebrado — e agora quebra **por um caminho diferente**, que é o P5.

### Onde o P5 entra

Com um rascunho vazio sendo criado a cada chamada, a função do banco `orcamento_ativo_cliente` faz o resto do estrago:

```sql
select * from orcamentos
where cliente_id = p_cliente_id and status in ('rascunho','enviado')
order by criado_em desc limit 1;
```

**O mais recente, não o que tem itens.** O bot injeta esse protocolo em toda mensagem para o vendedor. Às 22:39 ele mandou: *"use ORC-2026-0187"* — o vazio, criado 3 segundos depois do que tinha o item.

**São dois defeitos independentes que se somam.** Corrigir só um não resolve: sem corrigir a consulta, continuam nascendo rascunhos vazios; sem corrigir o `orcamento_ativo_cliente`, o bot continua apontando para o vazio sempre que um existir.

### Um efeito colateral que já está no banco

Mesmo quando "funciona", metade dos itens não fica ligada ao catálogo: no `ORC-2026-0181` (17:21 de hoje) **5 dos 7 itens estão gravados sem `produto_id`**, só como texto livre. Isso alimenta a separação com item que não referencia produto real — vale investigar junto, mas é problema separado (**P6b**).

### O que existe de bom neste fluxo

- `aceitar_orcamento` é uma RPC **atômica**: cria o pedido, copia os itens, grava o histórico e muda o status numa transação só. Isso está certo e é o padrão do projeto.
- Existe validação de posse: o sub-workflow confere se o orçamento pertence àquela conversa antes de fechar.
- Existe guarda de idempotência: fechar duas vezes não cria dois pedidos.
- O bot manda "Perfeito! Já estou confirmando..." **antes** de rodar o fechamento, e o protocolo depois — na ordem certa, corrigida em 30/07.
- Se o fechamento falhar, o cliente recebe um aviso honesto e a equipe de vendas recebe a ficha completa para fazer na mão.

### Estado: 🔴 BLOQUEADOR

Não porque o código seja ruim, mas porque **o produto não cumpre sua função principal** — transformar conversa em pedido — de forma confiável hoje.

---

## 6. Fluxo de Separação

### Como funciona

1. **O operador delega.** No painel, escolhe o pedido, escolhe o separador, define prioridade e horário. Isso chama a RPC `delegar_separacao`, que cria uma `solicitacao_separacao` e uma linha por item.
2. **O separador recebe.** No app (ou na tela web do separador), a solicitação aparece **em tempo real**, sem precisar atualizar nada.
3. **Ele assume.** `assumir_separacao` — a partir daí a solicitação é dele.
4. **Ele marca item por item.** Cada item marcado é uma chamada `marcar_item_separado_solicitacao`, e o operador vê o progresso ao vivo.
5. **Ele conclui.** `concluir_separacao` só aceita se **todos** os itens estiverem marcados. Notifica o operador que delegou.
6. **Chat interno.** Separador e operador conversam dentro da solicitação (`enviar_mensagem_separacao`), também em tempo real.

**Separação Rápida:** para pedidos de até 7 itens, o próprio operador separa, sem delegar. Validado no servidor, não só na tela.

### Qualidade desta parte

Esta é a **parte mais bem construída do projeto**. Todas as escritas passam por RPC atômica; toda RPC descobre quem é a pessoa por `auth.uid()` dentro da própria função, nunca aceita o id vindo da tela; toda transição inválida é rejeitada com exceção; a RLS restringe cada separador às suas próprias solicitações. É o padrão que o resto do projeto deveria seguir.

### Os dois furos

**Furo 1 — a conclusão da separação não mexe no pedido (P10).** Li o corpo de `concluir_separacao`: ela muda `solicitacoes_separacao.status` para `'pronta'` e notifica o operador. Ela **não** muda `pedidos.status` para `'pronto'`. Quem faz isso é o operador, manualmente, no painel. Consequência: existe uma janela em que a separação está pronta e o pedido continua "em separação" — e como é a mudança de status do *pedido* que dispara a notificação de WhatsApp para o cliente, **o cliente só é avisado quando alguém lembra de clicar**.

**Furo 2 — a timeline não mostra separação (P10b).** A tabela `eventos` recebe gatilhos de pedido, orçamento, entrega, ocorrência e consulta — mas `solicitacoes_separacao` não tem gatilho. A linha do tempo do pedido pula a etapa de separação inteira.

### Estado: 🟢 no núcleo, 🟠 na costura com o pedido

### A decisão de produto em aberto (D1)

O desenho de tela do app oferece "Concluir com itens pendentes / Concluir parcial mesmo assim". A regra do banco **proíbe** isso (`raise exception 'Ainda há % item(ns) não separado(s)'`). São duas visões incompatíveis do mesmo botão, e **só o dono decide**:

- **(a)** Manter a proibição e remover o botão do desenho. *Recomendado se "pedido pronto" precisa significar "tudo separado".*
- **(b)** Permitir conclusão parcial, criando automaticamente uma Ocorrência do tipo `item_faltante` e deixando o pedido num estado explícito de incompleto.

---

## 7. Fluxo de Entrega

### Como funciona

Espelha a separação, com vocabulário próprio:

```
Operador delega → Entregador assume → Inicia rota → Entregue
                                                 └→ Insucesso (com motivo)
                                                 └→ Cancelada
```

Regras verificadas no banco:
- Só pedidos com `forma_entrega = 'entrega_propria'` podem ser delegados (`uber_flash` é terceirizado, `retirada` não tem rota).
- Só funcionário ativo com o papel `entrega` pode receber.
- Um pedido não pode ter duas entregas ativas ao mesmo tempo.
- `concluir_entrega` exige que a entrega esteja atribuída a quem está chamando e no status `em_rota`.

### Ocorrências

Existe uma entidade `ocorrencias` cobrindo dois mundos:
- **Operacional:** item faltante, endereço não encontrado, cliente ausente, produto avariado.
- **Pós-venda:** troca, devolução, produto errado. *Este é o caso que o dono destacou como mais crítico* — a busca do painel precisa sempre achar o pedido certo quando o cliente volta à loja.

`abrir_ocorrencia` e `resolver_ocorrencia` resolvem o ator internamente. A RLS deixa o funcionário ver as ocorrências das solicitações dele.

### O furo específico da entrega (P9)

**`delegar_entrega` não notifica ninguém.** Li a função inteira: ela insere a solicitação e retorna. Não escreve em `notificacoes_internas`. E a policy de leitura dessa tabela cobre só `destinatario_tipo` igual a `'operador'` ou `'separador'` — **`'entregador'` não existe ali**.

Resultado prático: **o entregador nunca é avisado de nada.** Ele só descobre que tem entrega se abrir o app e olhar a lista. Sem push (**P20**), isso significa que uma entrega delegada às 15h pode ficar parada até alguém ligar para ele.

**Furo menor (P13):** a policy de leitura de `operadores` só permite a pessoa ler a si mesma ou um admin ler todos. Nem separador nem entregador têm cláusula. Por isso, no app, o campo "delegado por" aparece **sem nome**.

### Estado: 🟡 — o fluxo executa, mas depende do funcionário olhar o app por conta própria

Registro importante: as 4 fases desta feature (banco, dashboard, app, timeline) foram **validadas com dado real de produção em 19/08** — orçamento aceito → pedido → separado → pronto → entrega delegada a um entregador real → assumida → em rota → entregue → ocorrência aberta, tudo aparecendo na linha do tempo. Funcionou de verdade uma vez.

---

## 8. Dashboard — Venâncio Operations

### O papel do operador

O operador é a pessoa do balcão. O painel é o lugar onde ela:

| Tela | O que faz ali |
|---|---|
| **Dashboard** | Visão do dia: KPIs, métricas comerciais, feed de atividade ao vivo. |
| **Pedidos** | O centro de tudo. Lista com filtros por status, busca global, modal com timeline completa, retiradas agendadas. |
| **Atendimento** | Conversas do WhatsApp em tempo real, fila de espera, assumir/liberar conversa, responder o cliente pelo WhatsApp real, ligar/desligar a IA por conversa. |
| **Separação** | Delegar, acompanhar, Separação Rápida, chat interno, ficha de separação para impressão. |
| **Logística** | Delegar entrega, acompanhar rota. |
| **Ocorrências** | Abrir e resolver. |
| **Orçamentos** | Criar manualmente, aceitar, gerar PDF e enviar pelo WhatsApp. |
| **Clientes / Catálogo / Marcas e Categorias / Funcionários** | Cadastros. |
| **Consultas IA** | Quando o vendedor não sabe algo (produto não encontrado, dúvida), ele registra aqui e a loja responde — e a resposta vai pro cliente pelo WhatsApp. |
| **Memória IA / Demanda / Relatórios** | Inteligência: o que o cliente pediu e não tínhamos, o que a IA aprendeu com o operador. |

### Como está construído

- React 18 + Vite, 4 dependências de produção. Enxuto.
- `contexts` para sessão, `hooks` para dados + Realtime, `services` para acesso ao Supabase, `pages` para tela. Separação de camadas consistente.
- **30 RPCs distintas** chamadas — o padrão "escrita crítica sempre por RPC" está de fato aplicado.
- Realtime em vez de polling nas telas que precisam.
- `ErrorBoundary` global, `Toast`, `EmptyState`, `ErrorState`, `LoadingSpinner` — os estados de tela estão tratados.
- Modo demonstração **opt-in** (`VITE_DEMO_MODE`): por padrão desligado, e uma falha real aparece como erro explícito em vez de virar dado falso. Isso é uma decisão madura.

### Os problemas

- **`AtendimentoPage.jsx` tem 1.004 linhas** e carrega dentro de si os dados de demonstração. Precisa ser quebrado. (**P18**)
- **Um único arquivo de teste** em todo o dashboard (7 testes, de métricas). (**P18**)
- **O Separador tem uma implementação inteira duplicada aqui** — 3 páginas, 2 services, 1 contexto, 1 client Supabase — que hoje é a mesma coisa que o app mobile faz. (**P23**)
- Ainda existe escrita direta em tabela (não por RPC) em `produtos`, `clientes`, `orcamentos`, `consultas_operacionais` — o que é aceitável para cadastro, mas foi o que obrigou a criar policies de INSERT/UPDATE hoje mesmo.

### Estado: 🟡 — completo em função, frágil em teste e manutenção

---

## 9. App Mobile

### O papel de quem usa

Um app só, três chapéus. No login por código + PIN, o backend devolve os papéis da pessoa (`separacao`, `entrega`, ou os dois), e as abas aparecem de acordo. Não existe tela de "escolher papel" — o app simplesmente mostra o que aquela pessoa pode fazer. **Essa decisão está certa.**

### Arquitetura verificada

```
app-mobile/src/
├── supabase/
│   ├── largeSecureStore.js   ← sessão CIFRADA (AES) no AsyncStorage,
│   │                            com a chave no SecureStore
│   └── separadorClient.js    ← client isolado, storageKey própria
├── services/                 ← separacao / entrega / auth
├── contexts/SeparadorAuthContext.js
├── hooks/                    ← resumos com Realtime
├── theme/                    ← colors + spacing (tokens)
├── components/icons.js       ← SVG próprio, sem lib de ícone
└── features/                 ← 10 telas
```

### Ponto a ponto do que foi pedido na vistoria

| Item | Estado | Verificação |
|---|---|---|
| **Arquitetura** | 🟢 | Camadas limpas, tokens de tema, sem lógica de dado dentro de tela. |
| **Telas** | 🟢 | 10 telas, 2.524 linhas: Login, Home, Painel, Detalhe, Confirmação, Chat, Notificações, Perfil, Painel de Entregas, Detalhe de Entrega. |
| **Autenticação** | 🟢 | Nunca chama `signInWithPassword` direto. Passa pelo bot, que valida PIN, controla bloqueio e devolve a sessão. |
| **Sessão** | 🟢 | **Melhor que o esperado.** O `expo-secure-store` tem limite de ~2KB no Android e a sessão do Supabase passa disso. A solução é o padrão oficial: chave AES pequena no SecureStore, sessão cifrada no AsyncStorage. Token e PII nunca ficam legíveis no aparelho. |
| **Navegação** | 🟢 | Stack raiz por sessão + tabs condicionais por papel + stack por área. |
| **Comunicação com backend** | 🟢 | Supabase direto para leitura (protegido por RLS) e RPC para escrita. Bot só para o login. |
| **Realtime** | 🟢 | 8 assinaturas `postgres_changes`, com re-consulta completa no callback — mesmo padrão do painel web. |
| **Separação / checklist** | 🟢 | Assumir, marcar item, concluir, cancelar. Botão de concluir só habilita com tudo marcado. |
| **Chat** | 🟡 | Existe para separação. **Não existe para entrega** — decisão consciente, não há tabela. |
| **Estados** | 🟢 | Carregando, vazio, erro tratados nas telas. |
| **Tratamento de erros** | 🟡 | Existe, mas é `throw` cru do service para a tela — sem camada de tradução de erro do Postgres para linguagem de gente. Uma exceção de RPC chega como texto técnico. |
| **Experiência do separador** | 🟢 | Fluxo curto e direto: abre, vê a fila, assume, marca, conclui. |
| **Segurança** | 🟢 | Client isolado, chave anon (nunca service), RLS restringindo às próprias solicitações, sessão cifrada. |
| **Preparação Android/iOS** | 🔴 | **Bloqueador. Não é possível gerar um APK/IPA hoje.** O `app.json` não tem `android.package` nem `ios.bundleIdentifier`, não existe `eas.json`, não existe `projectId` de EAS, o nome do app ainda é literalmente `"app-mobile"` e o ícone é o padrão do Expo. Só roda no Expo Go. (**P19**) |
| **Notificações push** | 🔴 | **Não existe nada.** `expo-notifications` não está instalado, a tabela `push_tokens` não existe no banco, a RPC de registro não existe, e `notificacoes_internas.push_enviado` nunca vira `true`. (**P20**) |
| **Notificação do entregador** | 🔴 | Nem no app: a policy de `notificacoes_internas` não cobre `'entregador'`, e a tela de Notificações filtra `destinatario_tipo = 'separador'`. (**P9**) |
| **Testes** | 🟡 | 32 testes, todos de service. Nenhum teste de tela. |

### O que falta para o App ser considerado operacional

Em ordem, e nada além disso:

1. **Identidade de build**: `android.package`, `ios.bundleIdentifier`, nome e ícone reais, `eas.json`, versionamento.
2. **Push de verdade**: `expo-notifications`, tabela `push_tokens` com RLS de dono, RPC `registrar_push_token` resolvendo o dono por `auth.uid()`, e um disparador — o caminho mais simples é um workflow n8n lendo `notificacoes_internas` com `push_enviado = false`.
3. **Notificação para o entregador**: estender o CHECK e a policy de `notificacoes_internas` para `'entregador'`, e fazer `delegar_entrega` escrever a notificação.
4. **Nome de quem delegou**: policy de leitura em `operadores` para funcionário atribuído.
5. **Erros em linguagem de gente**: uma camada fina traduzindo exceção de RPC para mensagem de tela.
6. **Teste em aparelho real** — Android e iOS, com credencial real. Nunca foi feito.

### Estado: 🟡 — o app funciona; o app **instalável** ainda não existe

---

## 10. JS Bot

### O que ele é, e o que ele não é

É um servidor Node/Express de 4.523 linhas que **não usa IA em nenhuma decisão própria**. Toda a inteligência está no n8n. O bot é a camada determinística, previsível e testável — e essa separação é uma das melhores decisões do projeto.

### Estrutura

| Pasta | Responsabilidade |
|---|---|
| `webhook/` | Entrada. `payloadParser` (classifica) + `webhookController` (orquestra). |
| `botEngine/` | Máquina de estados **pura**: recebe sessão + texto, devolve sessão + resposta + lista de ações. Zero I/O. |
| `botEngine/states/` | 7 estados: menu, submenu de vendas, lista escolar, cotação empresa, cadastro fiscal, agente ativo, fallback. |
| `services/` | Todo o I/O: Supabase, Evolution API, escalonamento, analytics, arquivos. |
| `integracoes/` | `n8nClient` — os dois webhooks dos agentes. |
| `middlewares/` | Token do webhook, sessão do operador, rate limit, pausa/reativação. |
| `config/` | `env.js` valida na subida e **falha rápido** se faltar variável obrigatória. |
| `utils/` | Logger com mascaramento, processador de mídia. |

### O que está excelente

- **`stateMachine` pura.** Testável sem nenhum mock. É por isso que existem 231 testes.
- **Tratamento de rede de nível profissional.** Timeout em toda chamada externa; pool HTTP sem conexão ociosa (resolveu a maior parte dos `ECONNRESET`); distinção entre "a requisição não saiu" e "saiu e a resposta se perdeu" (pelo `syscall`), com comportamentos diferentes para cada caso; recuperação da resposta pelo banco quando o corpo HTTP se perde.
- **Comentários que explicam o *porquê*, com data e incidente.** Praticamente cada decisão não-óbvia tem um comentário dizendo qual bug real ela resolveu. Isso é raro e é o que torna o projeto manutenível por outra pessoa.
- **Best-effort disciplinado.** Registro de histórico, arquivamento de PDF e notificação do Agente de Orçamento nunca derrubam o fluxo principal.
- **Logger que mascara segredo por nome de campo, em qualquer profundidade** — mas preserva o objeto `Error` intacto para não perder o stack.

### O que precisa mudar

| | Problema |
|---|---|
| 🟠 **P4** | Descarte silencioso de mensagem concorrente. Três `Set` em memória (`mensagensEmProcessamento`, `conversasComAgenteVendasEmAndamento`, `conversasEmFinalizacao`) e um cache em arquivo (`.cache/`). Quando a trava pega, a mensagem **evapora**. |
| 🟠 **P3b** | Esses mesmos locks impedem rodar mais de uma instância. Aceitável para o deploy planejado (instância única), mas é o teto de escala. |
| 🟠 **P7** | Rate limit de 300 req/min **por IP** — e como Evolution API e n8n chamam do mesmo servidor, isso é o teto *total* do bot, não por cliente. Em rajada de 150 conversas, 37% tomaram 429. |
| 🟡 | `webhookController.js` tem 886 linhas. É legível, mas está no limite. |
| 🟡 | Cobertura fraca em `clientesService` (61%), `evolutionApi` (65%), `orcamentosService` (68%), `n8nClient` (68%). |

### Estado: 🟠 — código bom, com uma falha de comportamento real sob concorrência

---

## 11. Agentes e n8n

> Esta seção foi **lida ao vivo** na instância de produção em 25/08, incluindo as execuções da noite.

### Os 5 workflows ativos

| Workflow | Id | Nós | Última alteração |
|---|---|---|---|
| **Agente vendedor** | `qqN54gUwSLYq14bZ` | 61 | 25/08 22:01 |
| **Orçamento (Sub-workflow)** | `RVwx3aBcDcQBohpg` | 56 | 25/08 22:00 |
| **Agente Orçamento** | `a2phYICkOHqrgXDk` | 33 | 18/08 |
| **Notificação Status Pedido (WhatsApp)** | `kUWnco3sYzRf1Ujj` | 15 | 24/08 |
| **Error Handler · Registra Falha em Eventos** | `7avueuqRAXvGGjI0` | 3 | 18/08 |

Há ainda 6 workflows **inativos** no mesmo n8n (agentes da geração anterior, um workflow de terceiro chamado `[SDR] - Oficial - BG`, e o `Expirar Consultas Operacionais` que está desligado). Vale confirmar se esse último deveria estar ligado.

**A distância entre o repositório e a produção é grande:** o export versionado do vendedor tem 40 nós, a produção tem 61. O do sub-workflow tem 46, a produção tem 56. É o **P8**.

### Os agentes, um por um

#### Agente de Vendas — o vendedor

| | |
|---|---|
| **Responsabilidade** | Conversar, buscar produto no catálogo, montar orçamento, fechar a venda. |
| **Quando é acionado** | Quando o cliente escolhe uma categoria de venda no menu, quando a conversa já está em `AGENTE_VENDAS_ATIVO`, quando o cliente diz que quer pagar/fechar, e quando volta a falar depois de um pedido criado. |
| **O que recebe** | `cliente_id`, `conversa_id`, `telefone`, `texto`. O texto pode vir **prefixado** pelo bot com o protocolo do orçamento/pedido em aberto. |
| **Ferramentas** | Busca Inteligente (RAG semântico sobre `produtos_documentos`), Consultar Categorias, Criar Orçamento, Adicionar Item, Fechar Orçamento, Consultar Alternativa de Qualidade (tier), Perguntar ao Operador, Atualizar Estado da Conversa. |
| **O que produz** | `{ resposta, encerrar_atendimento_ia, acionar_humano, motivo }` |
| **Para onde envia** | De volta ao bot pela mesma conexão HTTP; e grava a resposta em `mensagens` por conta própria. |
| **Dependências** | OpenRouter (modelo), Redis (buffer/lock), Supabase, Gemini (embeddings do RAG), Evolution API. |
| **Falhas possíveis** | Inventar `produto_id`; criar rascunho duplicado; estourar iterações; rate limit do modelo; a resposta HTTP se perder no caminho (bug conhecido da infra Cloudfy). |

**O prompt.** Li a versão de 20/08 completa. É um documento sério de engenharia de prompt, não um texto solto. Tem regras absolutas bem construídas:

- **Nunca citar produto ou preço que não veio de uma ferramenta nesta conversa.** Preço de memória é proibido sem exceção.
- **Nunca dizer "não temos" nem mencionar estoque.** Se não achou, registra uma consulta para o operador e responde "deixa eu confirmar com a loja".
- **Nunca confirmar sucesso que não aconteceu.** Só diz "adicionei" ou "pedido confirmado" depois que a ferramenta devolveu sucesso de verdade.
- **Frase-código de escalonamento.** Em falha técnica, responde uma frase exata que o bot reconhece e usa para chamar um humano.
- **Disciplina de `produto_id`**, inclusive avisando sobre a armadilha do "Código original: 22839" que aparece na descrição de alguns produtos e não é o id.

Isso é o motivo de o bot **não** ter alucinado preço na conversa de hoje. A engenharia de prompt está boa.

#### Sub-workflow Orçamento — o caixa

Recebe `acao` (`criar` / `adicionar_item` / `fechar`) e executa com validação em camadas: UUID válido → orçamento existe → pertence a esta conversa → ainda é rascunho → produto existe → quantidade válida. Cada rejeição tem uma mensagem própria. No fechamento, exige pelo menos 1 item e chama a RPC atômica `aceitar_orcamento`.

**Uma hipótese minha que se provou errada — registrada de propósito.** A primeira versão desta auditoria levantou que o nó `RPC · Aceitar Orçamento` usaria `SUPABASE_ANON_KEY` (é o que está no export versionado), e que isso quebraria o fechamento, já que `aceitar_orcamento` não aceita mais `anon`. **Falso.** O nó ao vivo usa credencial gerenciada (`predefinedCredentialType` / `supabaseApi`), não monta chave à mão, e já passa `p_forma_entrega`, `p_endereco_entrega` e `p_horario_retirada_desejado` — casando com a assinatura real da função no banco. O fechamento **não** está bloqueado por permissão. O arquivo versionado é que está velho.

**O que o sub-workflow ganhou desde o export** (nada disso está no repositório): fallback `Supabase · Buscar Produto por Nome` quando o `produto_id` não é encontrado; e uma raia de extração determinística de entrega — se o cliente não informou forma de entrega/horário, o workflow lê as mensagens recentes e usa um extrator de informação (IA pequena e dedicada) para preencher, em vez de confiar no agente principal.

#### Agente de Orçamento / Notificação de Status — o mensageiro

Recebe uma mudança de status, busca pedido + cliente + template, renderiza e manda no WhatsApp. Tem controle de duplicidade (registra a notificação antes de enviar e marca como enviada depois). Ativado em produção em 22/08.

#### Tratamento de erro — muito melhor do que o repositório sugere

Esta é a maior correção desta seção. A auditoria de 15/08 registrou como bloqueador **B4** que "nenhum workflow tem tratamento de erro". Lendo a instância viva, **isso está obsoleto**. O `Agente vendedor` tem hoje quatro mecanismos reais:

| Mecanismo | O que faz |
|---|---|
| `Erro · Registra Evento` → `Erro · Set Resposta Escalonamento` | Saída de erro do nó do agente: grava o evento e devolve a frase de escalonamento em vez de vazar exceção pro cliente. |
| `Agente Sinalizou Falha de Tool?` | Detecta quando o próprio agente reporta falha de ferramenta e escala — cobre o buraco conhecido de `onError` não pegar falha de tool. |
| `Verifica Pedido Existe · Guard` + `Alega Fechamento Sem Confirmar? · Guard` | **Antiga alucinação de "pedido fechado".** Antes de deixar a resposta sair, confere no banco se o pedido existe mesmo. Se o agente alegou fechamento sem que exista pedido, troca a resposta por um fallback. |
| `Erro · Registra Falha no Respond to Webhook` | Saída de erro do próprio `Respond to Webhook` — cobre o bug de corpo vazio da infra. |

Somado ao workflow `Error Handler · Registra Falha em Eventos`, ativo e dedicado. **B4 deve ser rebaixado de "bloqueador alto" para "verificar cobertura"** — o que falta é conferir se os 5 workflows têm `errorWorkflow` vinculado, não construir o tratamento do zero.

#### As ferramentas do agente estão bem desenhadas

Verifiquei as três tools de orçamento ao vivo. `conversa_id` e `cliente_id` **nunca** vêm da IA — são preenchidos a partir da sessão (`$('Prepara Sessão')`). Só `orcamento_id`, `produto_id`, `nome_produto` e `quantidade` vêm do modelo, que é o correto. As descrições das tools são longas e defensivas, incluindo a instrução de copiar `metadata.produto_id` caractere por caractere e a regra de R$100 para entrega própria. Não é aqui que está o problema.

### Memória do agente

Duas camadas, e vale entender a diferença porque foi origem de bug real:

- **A memória da conversa** (buffer/Postgres, dentro do n8n) guarda *o que foi dito*.
- **O estado do pedido** (Supabase) guarda *o que existe de verdade*.

A IA lembra do diálogo, **não** do estado do banco. Por isso o bot injeta o protocolo em toda mensagem. Sem isso, a partir da segunda mensagem o agente dizia que "o pedido não tem itens" e criava um rascunho novo. **A correção está certa na ideia e errada na escolha do protocolo — é exatamente o P5.**

### Problemas do n8n

| | |
|---|---|
| 🔴 **P6** | **Filtro multi-condição do node Supabase v1.** `Supabase · Buscar Orçamento Aberto` tem 2 condições e o n8n aplica só uma. É a causa raiz da falha de fechamento (seção 5). **Único nó afetado** — reauditei todos os outros nós Supabase dos dois workflows e nenhum tem 2+ condições, incluindo os criados depois de 03/08. |
| 🟠 **P8** | **O repositório não reproduz o n8n.** 61 nós em produção contra 40 versionados; 56 contra 46. Se a instância cair, não há de onde restaurar. |
| 🟡 **P6c** | **Exposição latente entre clientes, hoje mitigada.** Enquanto a consulta devolver linha de outro cliente, a proteção depende inteiramente de dois guardas de `IF`. Eles funcionam — mas a defesa correta é a consulta não trazer o dado errado, não um guarda pegar depois. |
| 🟡 | Nenhum nó tem `onError` individual; o tratamento é por ramo de erro explícito (funciona, mas é caso a caso). Confirmar `errorWorkflow` vinculado nos 5 ativos. |
| 🟡 | 6 workflows inativos poluindo a instância, incluindo um de terceiro (`[SDR] - Oficial - BG`, 154 nós). `Expirar Consultas Operacionais` está desligado — confirmar se deveria. |
| 🟡 | `WORKFLOW EXEMPLO.JSON` na raiz do repo (120 KB) é a cópia desse workflow de terceiro. Não é deste projeto. |

### Estado: 🟠 — mais maduro do que o repositório sugere, com um bug de nó bem localizado

---

## 12. Supabase / Banco

### As entidades principais, em linguagem simples

| Grupo | Tabelas | Para que serve |
|---|---|---|
| **Quem fala com a gente** | `clientes`, `conversas`, `mensagens` | Cadastro, o estado da conversa no WhatsApp e todo o histórico. |
| **O que vendemos** | `produtos`, `categorias`, `marcas`, `produtos_relacionados`, `produtos_documentos` | Catálogo + a versão "vetorial" do catálogo, que é o que permite a busca por significado. |
| **A venda** | `orcamentos`, `itens_orcamento`, `pedidos`, `itens_pedido` | Orçamento é a proposta; pedido é a venda fechada. São tabelas separadas de propósito. |
| **O histórico** | `orcamentos_status_historico`, `pedidos_status_historico`, `eventos` | Quem mudou o quê, quando, por qual origem. `eventos` é a linha do tempo unificada. |
| **A operação** | `solicitacoes_separacao` (+ itens, + mensagens), `solicitacoes_entrega`, `ocorrencias`, `notificacoes_internas` | Delegar, executar e acompanhar separação e entrega. |
| **A equipe** | `operadores`, `funcionarios` | Duas tabelas de propósito: operador é sessão de e-mail/senha; funcionário é código + PIN. |
| **A inteligência** | `consultas_operacionais`, `memoria_produtos`, `confirmacoes_produto`, `consultas_demanda`, `alertas_demanda` | O que a IA não soube responder, o que ela aprendeu, e o que o cliente pediu e não tínhamos. |
| **Apoio** | `empresa`, `configuracoes`, `templates_mensagem`, `escolas`, `materiais_lista_escolar`, `taxas_entrega_bairro`, `followups`, `memorias` | Configuração e cadastros auxiliares. |

### Como o dado circula

```
mensagem chega ──► clientes ──► conversas ──► mensagens
                                    │
                          Agente de Vendas
                                    │
                    orcamentos ──► itens_orcamento
                                    │  aceitar_orcamento (transação única)
                                    ▼
                    pedidos ────► itens_pedido
                        │  └─► pedidos_status_historico ─► eventos (gatilho)
                        │
        ┌───────────────┴────────────────┐
        ▼                                ▼
solicitacoes_separacao          solicitacoes_entrega
   (+ itens, + mensagens)          └─► eventos (gatilho)
   ✗ sem gatilho de eventos
        │                                │
        └────────► ocorrencias ◄─────────┘
                      └─► eventos (gatilho)
```

### O que está bom

- **38 tabelas, todas com RLS ligada.** Verifiquei uma por uma.
- **Escrita sempre atrás de um portão.** Nenhuma policy `using(true)`. Nenhum PII acessível pela chave pública.
- **A view `v_clientes_crm` foi corrigida:** `security_invoker = true` e leitura revogada de `anon`. Confirmado ao vivo.
- **As três RPCs críticas de orçamento foram fechadas:** `aceitar_orcamento`, `atualizar_status_orcamento` e `criar_orcamento_com_itens_tx` não são mais executáveis por `anon`. Confirmado ao vivo.
- **A falsificação de auditoria foi corrigida:** as 5 funções que aceitavam o id do ator vindo da tela agora resolvem por `auth.uid()`. Confirmado ao vivo.
- Existe um dump versionado da RLS completa (`extensao_rls_completa.sql`).

### O que está ruim

| | Achado | Evidência ao vivo |
|---|---|---|
| 🔴 **P1** | `atualizar_status_pedido` é `SECURITY DEFINER`, executável por `anon`, e **não tem nenhuma checagem de identidade no corpo** — só regras de transição de estado. | `has_function_privilege('anon', ..., 'EXECUTE') = true`, `prosecdef = true`, corpo sem `auth.uid()`. Confirmado também pelo próprio advisor do Supabase. |
| 🟠 **P8b** | O controle de migração começa em **20/08**. Só 11 migrações registradas. Todo o schema base, RLS e RPCs anteriores foram aplicados fora de controle de versão. | `supabase_migrations.schema_migrations` |
| 🟠 **P8c** | O arquivo `extensao_rag_produtos_vectorstore_nativo.sql` **não descreve a tabela real**: o arquivo diz 768 dimensões, coluna `produto_id` e índice `ivfflat`; a produção tem 3072 dimensões, sem `produto_id` e **sem índice nenhum**. | Comparação direta arquivo × `information_schema` |
| 🟡 **P11** | Os índices de chave estrangeira em `pedidos_status_historico` e `orcamentos_status_historico` **nunca foram aplicados** — as duas tabelas têm só a chave primária. O arquivo SQL está pronto e não versionado. | `pg_indexes` |
| 🟡 **P12** | `produtos_documentos` não tem índice vetorial. Com 3072 dimensões o `pgvector` não aceita `ivfflat` nem `hnsw`, então **toda busca do RAG é varredura completa**. Com 575 produtos é aceitável; não escala. | `pg_indexes` |
| 🟡 **P14** | `pedidos` não tem `forma_pagamento`, `status_pagamento` nem `horario_previsto` — exigidos pelo RF-02 e pelo desenho de tela. | `information_schema.columns` |
| 🟡 **P22** | 158 eventos, incluindo 80 de pedidos que não existem mais. A limpeza da base não levou a trilha junto. | `eventos` × `pedidos` |
| ⚪ **P21** | 29 funções com `search_path` mutável; `pg_trgm` e `vector` instalados no schema `public`; proteção contra senha vazada **desligada** no Auth. | Advisor do Supabase |

### Estado: 🟠 — a fundação está sólida; falta fechar uma porta e tornar o repositório fonte de verdade

---

## 13. APIs e Integrações

### As portas do bot

| Rota | Quem chama | Proteção |
|---|---|---|
| `GET /` | Qualquer um | Nenhuma (só devolve "ok"). |
| `POST /webhook` | Evolution API | Token fixo + rate limit 300/min + medição de tempo. |
| `POST /webhook/agente-orcamento` | n8n | Mesmo token. Só grava log de auditoria. |
| `POST /operador/mensagens/enviar` | Dashboard | CORS por allowlist + **sessão real do operador** (JWT do Supabase, valida se está ativo). |
| `POST /operador/consultas/:id/notificar` | Dashboard | Idem. |
| `POST /operador/orcamentos/enviar-pdf` | Dashboard | Idem + limite de tamanho. |
| `POST /operador/separador/login` | App e web do separador | **Sem sessão** (é o login) + rate limit dedicado de 10/min + bloqueio por conta após 5 erros. |
| `POST /operador/separador/:id/reset-pin` | Dashboard | Sessão de operador **admin**. Nunca self-service. |

### As integrações externas

| Integração | Direção | Timeout | Retentativa |
|---|---|---|---|
| **Evolution API** | bot → WhatsApp | 15s | Até 3, mas **só para erros seguros** — se a mensagem provavelmente saiu, não repete (evita mandar duas vezes para o cliente). |
| **n8n Agente de Vendas** | bot → n8n (síncrono) | 55s | 1 retentativa **só** para falha antes de chegar. Timeout nunca repete. |
| **n8n Agente de Orçamento** | bot → n8n (dispara e esquece) | 30s | Nenhuma. Falha só vira aviso. |
| **OpenRouter** | bot → IA (áudio/imagem) | 25s | Nenhuma. Falha cai no aviso humano. |
| **Supabase** | todos | padrão | padrão |
| **n8n Notificação de Status** | dashboard → n8n | — | Token no cabeçalho (público por ser `VITE_*`, e isso está documentado como consciente). |

### Detalhe de segurança bem resolvido

A credencial da Evolution API **nunca** aparece numa variável `VITE_*`. O dashboard não fala com o WhatsApp — ele pede ao bot, e o bot fala. É o desenho certo.

### Estado: 🟢

---

## 14. Segurança

### Como a autenticação funciona, em linguagem simples

Há **três chaves diferentes** no sistema, e é importante entender que não são intercambiáveis:

1. **A chave de serviço (`service_role`)** — só o bot tem. Ela ignora todas as regras de permissão do banco, porque o bot é o servidor e já validou quem está falando. **Nunca sai do servidor.**
2. **A chave pública (`anon`)** — está dentro do código do painel e do app. Qualquer pessoa pode extraí-la do navegador. Ela **sozinha não dá acesso a nada** — é a sessão do usuário que dá.
3. **A sessão do usuário** — um token que o Supabase emite no login. É ele que diz "eu sou o operador João" ou "eu sou a funcionária Fabiana", e é sobre ele que todas as regras do banco decidem.

### As três camadas de proteção

**Camada 1 — RLS (Row Level Security).** Cada tabela tem regras dizendo quais *linhas* cada pessoa pode ver e escrever. Exemplos reais verificados:
- Um separador só enxerga as solicitações onde ele é o separador.
- Um entregador só enxerga o cliente e os itens dos pedidos que foram atribuídos a ele.
- Um operador vê tudo, mas só se estiver **ativo** (`eh_operador_ativo()`).
- Exclusão de dado é sempre só admin.

**Camada 2 — RPC.** Toda mudança importante (mudar status, delegar, concluir, aceitar orçamento) passa por uma função no banco que faz a coisa inteira de uma vez só, valida a regra de negócio, e **descobre quem é a pessoa sozinha**. A tela nunca informa "quem sou eu" — se informasse, poderia mentir.

**Camada 3 — as rotas do bot.** Sessão real do operador, CORS por lista de origens permitidas, rate limit e mascaramento de segredo no log.

### O que já foi corrigido (verificado ao vivo hoje)

| Achado histórico | Situação |
|---|---|
| PII de cliente legível sem login pela view `v_clientes_crm` | ✅ **Fechado** — `security_invoker=true` + leitura revogada de `anon`. |
| 3 RPCs de orçamento executáveis por `anon` | ✅ **Fechado** — nenhuma delas tem mais `EXECUTE` para `anon`. |
| 5 funções que aceitavam o id do ator vindo da tela (falsificação de auditoria) | ✅ **Fechado** — todas resolvem por `auth.uid()`. |
| RLS ausente em 25 tabelas de PII no repositório | ✅ **Fechado** — dump completo versionado. |
| Escrita direta contornando as RPCs | ✅ **Fechado** — policies de escrita direta removidas de `pedidos`, `orcamentos`, históricos e `eventos`. |
| Chave da Evolution API em texto plano no log | ✅ **Mitigado** — logger mascara por nome de campo. Valor não rotacionado. |

### O que continua aberto

| | Achado |
|---|---|
| 🔴 **P1** | **`atualizar_status_pedido`.** É a única função de negócio que é `SECURITY DEFINER`, aceita `anon` e não checa identidade. Com a chave pública e o UUID de um pedido, dá para mover ou **cancelar** qualquer pedido — e gravar no histórico uma origem inventada. Ironia: ela virou `SECURITY DEFINER` **na correção de segurança de 24/08**, sob a premissa (que não confere) de que já tinha checagem interna. Antes disso a RLS a protegia; hoje não protege mais. |
| 🟡 **P16** | Chave da Evolution API nunca rotacionada. Depende do fornecedor (Cloudfy). Risco assumido e registrado. |
| 🟡 **P9b** | RLS de `notificacoes_internas` não cobre entregador — é gap funcional, mas também significa que a regra foi escrita para um mundo de dois papéis e o terceiro entrou sem revisão. |
| ⚪ **P21** | Proteção contra senha vazada desligada no Supabase Auth; extensões no schema `public`; `search_path` mutável em 29 funções. Todos de baixo risco, todos de correção trivial. |

### Estado: 🟠 — a postura de segurança é boa e melhorou muito; uma porta ficou aberta

---

## 15. Performance

### O cenário previsto

50 a 200 mensagens por dia, com picos na Volta às Aulas.

### O que o teste de carga (24/08, k6) mostrou

| Cenário | Resultado |
|---|---|
| **Volume diário** (200 msgs espalhadas em 8h) | 🟢 **Confortável.** Muito abaixo de qualquer limite. |
| **Rajada** (150 conversas quase simultâneas) | 🟠 **Estoura.** 37% das requisições receberam 429 do rate limit. |
| **Concorrência na mesma conversa** (cliente manda 3 seguidas) | 🔴 **90% das mensagens perdidas em silêncio.** |
| **Mensagem duplicada** (reenvio da Evolution) | 🟢 Deduplicação funcionou perfeitamente, inclusive sob concorrência. |

### As latências reais medidas em produção

| Trecho | Tempo |
|---|---|
| Agente de Vendas (n8n, ponta a ponta) | **8 a 34 segundos** |
| Timeout configurado no bot | 55 segundos |
| Buffer de agrupamento de mensagem no n8n | 7 segundos |
| Evolution API | 15s de teto |

Ou seja: **o cliente espera entre 15 e 40 segundos por uma resposta de venda.** Isso é aceitável para WhatsApp, mas é a característica que define toda a arquitetura — é por isso que a chamada é síncrona com timeout longo, e é por isso que a concorrência dói.

### Gargalos identificados

1. **Rate limit por IP compartilhado (P7).** Como Evolution API e n8n saem do mesmo servidor, os 300/min são o teto do bot inteiro, não por cliente.
2. **Descarte por lock (P4).** O mais grave, e não é performance — é perda de dado.
3. **Busca vetorial sem índice (P12).** 575 produtos varridos a cada busca. Invisível hoje.
4. **Histórico de status sem índice (P11).** Lido em toda transição e em toda tela de detalhe.
5. **`AtendimentoPage`** re-consulta a lista inteira a cada evento de Realtime.

### Estado: 🟡 — dimensionado para o volume previsto, frágil em rajada

---

## 16. Escalabilidade

### O teto atual

**Uma instância.** E isso é uma decisão consciente, não um descuido — está documentada no plano de deploy. O motivo é concreto: três `Set` em memória e um cache em arquivo controlam deduplicação e concorrência. Duas instâncias ao mesmo tempo quebram os quatro.

### O que escala bem hoje

- **Supabase** — gerenciado, cresce sozinho.
- **n8n** — o trabalho pesado (IA) já está fora do bot.
- **Dashboard** — SPA estática, escala trivialmente em CDN.
- **App mobile** — cada aparelho fala direto com o Supabase.
- **A arquitetura de camadas** — o bot é fino e a inteligência está isolada. Trocar de modelo de IA não toca no bot.

### O que precisa mudar para crescer

| Item | Hoje | Para escalar |
|---|---|---|
| Locks | `Set` em memória de processo | Redis (`SETNX` + TTL) |
| Cache de ecos | Arquivo `.cache/` | Redis com TTL nativo |
| Rate limit | Contador em memória, por IP | Redis, e por conversa em vez de por IP |
| Busca vetorial | Varredura completa | Índice, ou reduzir para ≤2000 dimensões |
| Sessão | Sem estado (já OK) | — |

**A boa notícia:** nada disso é reconstrução. É trocar quatro implementações por Redis, mantendo as mesmas interfaces. O Redis inclusive **já existe** na infraestrutura (o n8n usa).

### Estado: 🟡 — a arquitetura permite crescer; a implementação atual, não

---

## 17. Qualidade e Manutenção

### Nota honesta por dimensão

| Dimensão | Nota | Comentário |
|---|---|---|
| **Clean Code** | 🟢 | Nomes em português consistentes, funções curtas, poucos aninhamentos. |
| **SOLID / Responsabilidade única** | 🟢 no bot, 🟡 no dashboard | O bot separa estado puro de I/O de forma exemplar. O dashboard tem uma página de 1.004 linhas. |
| **Modularidade** | 🟢 | Cada estado do bot é um arquivo; cada domínio do dashboard é um service. |
| **Acoplamento** | 🟢 | O bot não conhece o n8n além do contrato JSON. O dashboard não conhece a Evolution API. |
| **Duplicação** | 🟠 | Separador implementado duas vezes (web + mobile). |
| **Complexidade** | 🟡 | `webhookController` (886 linhas) e `AtendimentoPage` (1.004 linhas) são os dois pontos densos. |
| **Legibilidade** | 🟢 | **Destaque do projeto.** Comentários explicam o porquê, com data e incidente real. Um dev novo entende as decisões. |
| **Manutenibilidade** | 🟡 | Alta no código; baixa na infraestrutura (o n8n e o banco não são reproduzíveis a partir do repositório). |
| **Organização** | 🟠 | Estrutura dos subprojetos é boa; a raiz do monorepo está bagunçada (seção 19). |
| **Segurança** | 🟠 | Boa postura, uma porta aberta. |
| **Performance** | 🟡 | Adequada ao volume, frágil em rajada. |
| **Escalabilidade** | 🟡 | Teto de uma instância. |
| **Tratamento de erros** | 🟢 | O melhor aspecto técnico do projeto. |
| **Logs** | 🟢 | Centralizado, com mascaramento. |
| **Observabilidade** | 🟡 | Há telemetria; não há painel nem alerta. |
| **Testabilidade** | 🟢 | 270 testes rodam em segundos, sem serviço externo. |

### "Outro desenvolvedor conseguiria assumir?"

**No código: sim, com folga.** É um dos repositórios mais bem comentados que se vê — cada decisão estranha tem um comentário dizendo qual bug real ela evita.

**Na infraestrutura: não.** Uma pessoa nova hoje:
- não sabe quais variáveis de ambiente existem além dos `.env.example`;
- não consegue recriar os workflows n8n (os arquivos estão velhos);
- não consegue recriar o banco (as migrações começam em 20/08);
- não tem como subir o sistema (não há Docker, README de deploy nem CI).

**Este é o verdadeiro débito do projeto:** não é o código, é a **reprodutibilidade**.

### O que NÃO precisa ser mexido

Para deixar claro no plano de amanhã: não refatore por gosto. Especificamente, **deixe como está**:
- a máquina de estados pura e seus estados;
- o tratamento de rede do `n8nClient` e do `evolutionApi`;
- o desenho das RPCs de separação e entrega;
- a separação de duas identidades (operador vs. funcionário);
- o modo demonstração opt-in do dashboard;
- o `largeSecureStore` do app.

---

## 18. Problemas Encontrados

Ordenados por severidade. Cada um com o que é, onde está, e como se prova.

### 🔴 Bloqueadores

**P1 · `atualizar_status_pedido` aberta e sem checagem de identidade**
`SECURITY DEFINER`, `EXECUTE` para `anon`, corpo sem `auth.uid()` nem `eh_operador_ativo()`. Permite mover ou cancelar qualquer pedido com a chave pública, e gravar histórico com origem inventada.
*Prova:* `pg_proc` + advisor do Supabase. *Origem:* migração `b7_fecha_bypass_rls_rpcs_criticas` (24/08).
*Correção:* adicionar o portão de identidade no corpo **e** `revoke execute ... from anon`. As irmãs já corrigidas são o modelo.

**P2 · Sete dias de trabalho fora do Git**
Último commit em 18/08. 52 arquivos modificados (+7.793/−4.782 linhas) e 68 arquivos novos, incluindo a feature de Entrega/Ocorrência inteira, o app do entregador, `mediaProcessor.js`, `escalonamentoService.js`, 11 arquivos SQL e 4 arquivos de teste.
*Prova:* `git status`, `git log`.
*Correção:* revisar e commitar em blocos temáticos. Uma hora de trabalho.

**P3 · Não existe deploy**
Sem `Dockerfile`, sem `docker-compose.yml`, sem `.github/`, sem lint. O bot roda no terminal do dono. O `ecosystem.config.js` (PM2 + ngrok) está no repositório marcado como obsoleto.
*Prova:* busca no monorepo inteiro.
*Correção:* executar `PLANO_DEPLOY_DOCKER_ORACLE.md`, que já está escrito.

**P5 · O bot aponta o vendedor para o orçamento errado**
`orcamento_ativo_cliente` devolve o rascunho **mais recente**, não o que tem itens. Com um duplicado vazio, o bot instrui o vendedor a usar o vazio.
*Prova:* corpo da função + `ORC-2026-0186` (com item) vs `ORC-2026-0187` (vazio, 3s depois) + a mensagem real de 22:39 de hoje.
*Correção:* preferir o rascunho **com itens**; em empate, o mais recente. Uma linha de SQL.

### 🟠 Precisa de ajuste

**P4 · Descarte silencioso de mensagem concorrente**
`conversasComAgenteVendasEmAndamento` faz o webhook responder 200 sem resposta ao cliente, sem notificação e sem registro. 90% de perda no teste.
*Correção:* responder "ainda estou processando sua mensagem anterior", registrar no histórico, e idealmente enfileirar.

**P6 · O n8n ignora a segunda condição do filtro — causa raiz da falha de venda** 🔴
`Supabase · Buscar Orçamento Aberto` filtra por `conversa_id` **e** `status`, mas o node Supabase v1 do n8n aplica só uma condição. A consulta devolve um rascunho qualquer — na execução `11774` devolveu o de **outro cliente**, com `conversa_id` nulo. Efeito: o caminho de reaproveitar o rascunho nunca dispara, então nasce um rascunho novo em toda chamada de "Criar Orçamento". Isso explica de uma vez as falhas de "Adicionar Item" das 21:41/21:42 e o duplicado das 22:38.
*Prova:* execução n8n `11774`; nó lido ao vivo; sticky note "Auditoria nodes Supabase — filtro multi-condição (03/08)" dentro do próprio workflow. Reauditei os demais nós Supabase dos dois workflows: **este é o único com 2+ condições.**
*Correção:* trocar por uma consulta que aplique os dois filtros de verdade — o caminho mais direto é um `HTTP Request` no PostgREST (`?conversa_id=eq.X&status=eq.rascunho`), já que a credencial gerenciada do Supabase existe e é usada por outros nós. Alternativa: deixar só `conversa_id` no filtro (a condição que garante isolamento) e validar `status` no `IF`, que já faz isso. Somar um índice único parcial em `orcamentos (conversa_id) where status='rascunho'` como rede de segurança no banco.

**P6b · Metade dos itens grava sem `produto_id`**
Em `ORC-2026-0181` (hoje, 17:21), 5 de 7 itens estão só como `descricao_livre`, sem ligação com o catálogo. Existe um fallback novo (`Supabase · Buscar Produto por Nome`, `ilike`), mas ele grava o item mesmo quando não casa.
*Correção:* instrumentar quantas vezes o fallback por nome é usado; decidir se item sem `produto_id` deve ser aceito ou recusado.

**P6c · Isolamento entre clientes depende só de guardas de `IF`** 🟠
Como a consulta pode devolver linha de outro cliente, hoje o que impede a mistura é o `Pertence a Esta Conversa?` e o `Já Existe Orçamento Aberto?` (este último endurecido em 25/08 às 22:00). **Funcionam** — não houve vazamento. Mas é defesa em profundidade fazendo o trabalho da defesa primária.
*Correção:* cai junto com o P6. Manter os guardas depois de corrigir a consulta.

**P7 · Rate limit inadequado para rajada**
300/min por IP = teto total do bot. 37% de 429 em rajada.
*Correção:* separar limite de rajada de limite médio; considerar limitar por conversa.

**P8 · Repositório não reproduz o n8n**
Produção: 61 nós no vendedor e 56 no sub-workflow. Versionado: 40 e 46. Faltam no repositório o RAG, o tier de material, os 4 ramos de tratamento de erro, a extração determinística de entrega e o fallback de produto por nome.
*Correção:* exportar os 5 workflows ativos e versionar; adotar a regra de exportar a cada alteração.

**P8b · Migrações só desde 20/08**
11 migrações registradas; todo o schema anterior aplicado fora de controle.
*Correção:* gerar uma migração de *baseline* a partir do banco atual.

**P8c · Arquivo de RAG não descreve a tabela real**
Arquivo: 768 dims, `produto_id`, índice `ivfflat`. Produção: 3072 dims, sem `produto_id`, sem índice.
*Correção:* atualizar o arquivo para refletir a produção.

**P9 · O entregador não recebe nenhuma notificação**
`delegar_entrega` não escreve em `notificacoes_internas`; a policy não cobre `'entregador'`; a tela do app filtra `'separador'`.
*Correção:* estender CHECK + policy + escrever a notificação na RPC + ajustar o filtro do app.

**P10 · Conclusão de separação/entrega não move o pedido**
`concluir_separacao` não põe o pedido em `pronto`; `concluir_entrega` não põe em `concluido`. Depende do operador clicar — e é essa mudança que avisa o cliente.
*Correção:* decidir entre encadear na RPC (automático) ou manter manual e tornar isso explícito na tela.

**P10b · Separação não aparece na timeline**
`solicitacoes_separacao` não tem gatilho para `eventos`.

### 🟡 Ajustes menores e dívidas

| Id | Problema | Correção |
|---|---|---|
| **P11** | Índices de FK nos históricos nunca aplicados | Aplicar o arquivo pronto (idempotente) |
| **P12** | Busca vetorial sem índice (3072 dims) | Reduzir dimensão ou aceitar e documentar |
| **P13** | "Delegado por" sem nome no app | Policy de leitura em `operadores` para funcionário atribuído |
| **P14** | Faltam `forma_pagamento`, `status_pagamento`, `horario_previsto` em `pedidos` | Migração aditiva + campos na tela |
| **P16** | Chave da Evolution não rotacionada | Depende da Cloudfy — **só o dono** |
| **P18** | `AtendimentoPage` com 1.004 linhas; 1 teste no dashboard | Extrair componentes; testar os services |
| **P19** | App não é instalável (sem `package`/`bundleIdentifier`/EAS) | Configurar identidade de build |
| **P20** | Push não existe | `expo-notifications` + `push_tokens` + RPC + disparador |
| **P21** | `search_path` mutável, extensões em `public`, senha vazada não checada | Correções triviais de painel/SQL |
| **P22** | 80 eventos órfãos apontando para pedidos apagados | Limpar ou aceitar e documentar |
| **P23** | Separador duplicado (web + mobile) | Decidir qual é o canal oficial |
| **P24** | Lixo no repositório | Ver seção 19 |

---

## 19. Código / Componentes Desnecessários

Cada item abaixo foi verificado quanto a referências antes de ser listado.

### Pode remover com segurança

| Item | Tamanho | Por quê | Verificação feita |
|---|---|---|---|
| **`WORKFLOW EXEMPLO.JSON`** (raiz) | 120 KB | Workflow de terceiro: Pinecone, Google Drive, Gmail, ElevenLabs, OpenAI. **Nada disso existe neste projeto.** | Li os 154 nós. Nenhuma referência no repositório. |
| **`chatbot/papelaria-bot/ecosystem.config.js`** | — | PM2 + ngrok, modelo abandonado em 14/08. O próprio arquivo se declara obsoleto no cabeçalho. | O comentário de `src/index.js` que o cita pode ser reescrito. |
| **`chatbot/papelaria-bot/.env.bak-111526`** | — | Backup de `.env`. Já ignorado pelo Git, mas continua no disco. | — |
| **`chatbot/AGENTE DE IA (N8N)/`** | 4 arquivos | Pasta ignorada pelo Git, duplicando `chatbot/AGENTES N8N/`. Duas pastas de workflow confundem quem chega. | Ambas listadas. |
| **`servidor supabase/supabase-mcp-server/supabase-mcp-server/`** | — | Pasta aninhada em si mesma. O MCP hoje é HTTP (`.mcp.json`), este servidor local não é mais usado. | `.mcp.json` aponta para `mcp.supabase.com`. |
| **`_deprecated/`** | 13 arquivos | Já é a lixeira. Vale decidir: apagar de vez ou mover para fora do repositório. | Nenhuma referência ativa. |

### Não remova — parece morto e não é

| Item | Por quê |
|---|---|
| `src/cli.js` (bot) | Referenciado por `npm run chat` e pelo README. É a forma de testar o bot sem WhatsApp. |
| `src/botEngine/states/listaEscolar.js` | **Ativo de propósito**, confirmado com o dono. Aguarda a atualização das listas do ano letivo. |
| `extensao_indices_status_historico.sql` | Nunca aplicado, mas é uma **pendência**, não lixo. |
| `event-log.service.js` (dashboard) | Documentação antiga dizia que não era usado. **Está sendo** — `ActivityFeed.jsx` o usa. |
| `followups` (tabela vazia) | Sem policy de operador hoje, mas é o caminho pretendido para o follow-up (hoje feito com tag). |
| `materiais/` e `ORÇAMENTOS 2026.../` | PDFs reais das listas escolares. Ignorados pelo Git de propósito — mas **isso significa que não há backup deles no repositório**. |

### Documentação com informação errada — corrigir, não apagar

| Arquivo | O que está errado |
|---|---|
| `analisa técnica.md` (raiz) | Diz que o bot usa Redis (não usa) e que `listaEscolar` deve ficar desativado (é ativo de propósito). |
| `arquitetura_auditoria.md`, `PROMPT.MD`, `PROMPT_EXECUCAO_CORRECOES.md`, `PROMPT_VISTORIA_APP_MOBILE.md` (raiz) | Prompts de tarefa já executados. Poluem a raiz. Mover para `PLANEJAMENTOS E IMPLEMENTAÇÕES/`. |
| `PLANO_MESTRE_IMPLEMENTACAO.md` | Ainda descreve o app mobile como "100% mock" — falso desde 18/08. Marcar as partes superadas. |
| `venancio-ai-ops/README.md` | Documenta recriar o banco rodando os SQL em ordem — o que hoje produz um banco diferente do de produção. |

### A raiz do monorepo

Hoje tem 9 arquivos soltos, 5 dos quais são prompts já executados. Um repositório com esta qualidade de código merece uma raiz com `README.md`, `.gitignore`, e as pastas dos subprojetos.

---

## 20. Funcionalidades Pendentes

### Nunca construídas (do documento de requisitos original)

| Req | O que é | Situação | Recomendação |
|---|---|---|---|
| **RF-03 · Tarefas agendadas** | Tarefas internas com prazo e responsável | Tabela não existe. Nenhuma tela. Nenhum código. | **Adiar.** Não bloqueia a operação. Decidir se ainda faz parte do produto. |
| **RF-04 · Lista de espera de produto** | Cliente pede algo que não temos e é avisado quando chegar | Tabela não existe. | **Adiar** — mas note que `consultas_operacionais` + `consultas_demanda` já capturam a *demanda*. Falta só o aviso de volta. Meio caminho já andado. |
| **RF-08 · Push** | Avisar o funcionário com o app fechado | Nada existe. | **Fazer** — é o que falta para o app ser operacional de verdade. |
| **RF-02 (parcial)** | Pagamento e horário previsto no pedido | Faltam 3 colunas. | **Fazer** se o balcão precisa registrar pagamento. Decisão do dono. |

### Construídas pela metade

| Item | Falta |
|---|---|
| **Notificação do entregador** | Papel `'entregador'` em `notificacoes_internas` + escrita em `delegar_entrega` (**P9**) |
| **Timeline** | Eventos de separação (**P10b**) |
| **Follow-up** | Hoje é uma tag na conversa; a tabela `followups` existe mas sem permissão para operador |
| **Chat de entrega** | Existe para separação, não para entrega — decisão consciente |
| **App instalável** | Identidade de build (**P19**) |
| **Login unificado** | Operador continua com e-mail/senha; a ideia de unificar em código+PIN nunca foi executada |

### Decisões de produto pendentes (só o dono responde)

| Id | Pergunta | Impacto |
|---|---|---|
| **D1** | Conclusão **parcial** de separação: permitir ou proibir? | Bloqueia o desenho da tela 10 do app. Ver seção 6. |
| **D2** | A conclusão da separação deve mover o pedido para "pronto" **automaticamente**? | Define se o cliente é avisado na hora ou quando alguém clica. Ver **P10**. |
| **D3** | RF-03 e RF-04 continuam no escopo? | Define se o plano tem 9 ou 11 fases. |
| **D4** | O painel web do Separador continua existindo, ou o app é o canal único? | Define se **P23** vira remoção de código. |
| **D5** | `forma_pagamento` / `status_pagamento` entram agora? | Ver **P14**. |

---

## 21. Riscos

Ordenados por **probabilidade × impacto**, não por severidade técnica.

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| **R1** | **Perda dos 7 dias não commitados** — falha de disco, `git checkout` acidental, limpeza de pasta | Média | **Catastrófico** — uma semana de trabalho | Commitar hoje. Empurrar para o remoto. |
| **R2** | **A loja depende do computador do dono estar ligado** — reinício do Windows, queda de energia, atualização | **Alta** | Alto — sem atendimento até alguém perceber | Executar o plano de deploy |
| **R3** | **Cliente conversa, monta o pedido e o pedido não fecha** — o que aconteceu hoje | **Alta** | Alto — perda de venda e de confiança | Corrigir P5, P6, P6b antes de qualquer coisa nova |
| **R4** | **Mensagem de cliente perdida em silêncio no pico** — sem rastro para investigar depois | Média (alta na Volta às Aulas) | Alto | Corrigir P4 |
| **R5** | **Manipulação de pedido por terceiro** via `atualizar_status_pedido` | Baixa (precisa do UUID) | Alto — cancelar pedido, corromper auditoria | Corrigir P1 |
| **R6** | **n8n cai ou é alterado sem volta** — não há cópia fiel | Baixa | **Muito alto** — o cérebro da venda para | Versionar os 5 workflows |
| **R7** | **Entrega delegada e esquecida** — o entregador não é avisado | **Alta** | Médio | Corrigir P9 + push |
| **R8** | **Cliente não é avisado de que o pedido ficou pronto** — depende do operador clicar | **Alta** | Médio | Resolver D2 / P10 |
| **R9** | **Chave da Evolution API vazada e válida** | Baixa | Alto — sequestro do WhatsApp da loja | Fora do nosso controle. Monitorar. |
| **R10** | **Rajada da Volta às Aulas derruba 37% das mensagens** | Média | Alto (sazonal) | Corrigir P7 |
| **R11** | **Não é possível recriar o ambiente** — banco e n8n não reproduzíveis | Baixa | Alto | Baseline de migração + export do n8n |
| **R12** | **Regressão silenciosa** — 270 testes que ninguém roda automaticamente | Média | Médio | CI |

---

## 22. O que precisa estar pronto para produção

Separado em **inegociável** e **desejável**, para o plano não inchar.

### Inegociável

| | Item | Por quê |
|---|---|---|
| ☐ | Todo o trabalho commitado e no remoto | Sem isso, nada mais importa |
| ☐ | `atualizar_status_pedido` fechada | Único furo de segurança conhecido |
| ☐ | Orçamento certo escolhido + duplicado impedido | Sem isso o produto não cumpre sua função |
| ☐ | "Adicionar Item" confiável e com `produto_id` correto | Idem |
| ☐ | Mensagem concorrente nunca some em silêncio | Perda de mensagem de cliente é inaceitável |
| ☐ | Bot rodando em servidor com HTTPS e reinício automático | A loja não pode depender de um PC |
| ☐ | Rate limit dimensionado para rajada | Volta às Aulas |
| ☐ | Os 5 workflows n8n versionados | Sem cópia, sem recuperação |
| ☐ | Baseline de migração do banco | Reprodutibilidade |
| ☐ | Entregador recebe notificação | O papel não funciona sem isso |
| ☐ | Um teste real ponta a ponta com dado real | Prova de que fecha |

### Desejável antes do go-live

| | Item |
|---|---|
| ☐ | App instalável (APK/IPA) em vez de Expo Go |
| ☐ | Push |
| ☐ | CI rodando os 270 testes |
| ☐ | Índices de histórico aplicados |
| ☐ | Timeline mostrando separação |
| ☐ | Nome de quem delegou visível no app |
| ☐ | Painel de saúde: bot no ar, últimas execuções do n8n, fila de atendimento |

### Explicitamente fora do go-live

RF-03 (tarefas), RF-04 (lista de espera), login unificado do operador, chat de entrega, migração dos locks para Redis (só necessário para múltiplas instâncias), refatoração de `AtendimentoPage`.

---

## 23. Plano de Finalização por Fases

**Regra de ouro para a execução automatizada:** uma fase por vez. Nenhuma fase começa sem o critério de aceite da anterior cumprido. Se um teste falhar, investigue e corrija **antes** de avançar — nunca siga em frente com teste vermelho.

**Ciclo obrigatório de cada tarefa:**
`ANALISAR → IMPLEMENTAR → TESTAR → VALIDAR → CORRIGIR → CONFIRMAR ACEITE → PRÓXIMA`

---

### FASE 0 — Congelar o que existe

**Objetivo:** garantir que nada do que já foi feito possa ser perdido, e que exista um ponto de retorno antes de qualquer mudança.

| # | Tarefa | Depende de |
|---|---|---|
| 0.1 | Rodar as 3 suítes e registrar o resultado como linha de base | — |
| 0.2 | Revisar `git status` e commitar em blocos temáticos (entrega/ocorrência, app mobile, multimodal, escalonamento, SQL, testes, dashboard) | 0.1 |
| 0.3 | Empurrar para o remoto e confirmar que chegou | 0.2 |
| 0.4 | Criar a branch de trabalho da finalização | 0.3 |
| 0.5 | Inventariar as variáveis de ambiente reais de cada projeto (**nomes, nunca valores**) num arquivo versionado | — |

**Arquivos afetados:** nenhum arquivo de produção. Só Git e um documento novo.
**Riscos:** commitar segredo por acidente. **Mitigação:** conferir que nenhum `.env` entra (`git ls-files | grep env`) antes de empurrar.
**Testes:** as 3 suítes antes e depois — os números têm que ser idênticos.
**✅ Critério de aceite:** `git status` limpo; `git log origin/main..HEAD` vazio; 231 + 32 + 7 testes passando; nenhum arquivo `.env` versionado.

---

### FASE 1 — Fechar a segurança e firmar a fundação do banco

**Objetivo:** eliminar o último furo conhecido e tornar o repositório capaz de recriar o banco.

| # | Tarefa | Depende de |
|---|---|---|
| 1.1 | Adicionar o portão de identidade em `atualizar_status_pedido` (padrão `eh_operador_ativo()`) e `revoke execute from anon` — via migração versionada | Fase 0 |
| 1.2 | Varrer **todas** as funções `SECURITY DEFINER` executáveis por `anon` e confirmar, uma a uma, que têm portão; documentar as que são portão por natureza (`eh_admin`, `funcionario_atual_id`) | 1.1 |
| 1.3 | Aplicar `extensao_indices_status_historico.sql` (idempotente) | Fase 0 |
| 1.4 | Gerar a migração de *baseline* do schema atual, para o repositório recriar a produção | Fase 0 |
| 1.5 | Corrigir `extensao_rag_produtos_vectorstore_nativo.sql` para descrever a tabela real | 1.4 |
| 1.6 | Ajustes de higiene: `search_path` fixo nas 29 funções; ligar proteção de senha vazada no Auth | 1.1 |
| 1.7 | Policy de leitura em `operadores` para funcionário atribuído (**P13**) | 1.1 |

**Componentes afetados:** `chatbot/papelaria-bot/supabase/*`, banco de produção.
**Riscos:** endurecer uma permissão e quebrar quem a usava. **Mitigação:** antes de cada `revoke`, buscar no bot, dashboard, app e exports do n8n quem chama a função.
**Testes:** para cada RPC endurecida — chamada sem sessão deve falhar; chamada como operador ativo deve funcionar. Depois, as 3 suítes.
**✅ Critério de aceite:** consulta ao `pg_proc` mostra **zero** funções de negócio `SECURITY DEFINER` com `EXECUTE` para `anon` e sem `auth.uid()` no corpo; os dois índices existem; o advisor de segurança sem alerta novo; 270 testes verdes.

---

### FASE 2 — Fazer a venda fechar

> **A fase mais importante do plano.** Sem ela, o produto não cumpre sua função.

**Objetivo:** garantir que uma conversa que chega ao "quero fechar" vira um pedido no banco, sempre.

| # | Tarefa | Depende de |
|---|---|---|
| 2.1 | **Corrigir o P6 — a consulta, não só o guarda.** Trocar `Supabase · Buscar Orçamento Aberto` por uma consulta que aplique `conversa_id` **e** `status` de verdade (HTTP Request no PostgREST com a credencial gerenciada, ou filtro de condição única + validação no `IF`). *Diagnóstico já feito: ver seção 5.* | Fase 1 |
| 2.1b | Rede de segurança no banco: índice único parcial em `orcamentos (conversa_id) where status='rascunho'`. Limpar os rascunhos duplicados antes, senão o índice falha. | 2.1 |
| 2.2 | Exportar os 5 workflows ativos e versionar em `chatbot/AGENTES N8N/` com data; arquivar/limpar os 6 inativos | 2.1 |
| 2.3 | Corrigir **P5**: `orcamento_ativo_cliente` deve preferir o rascunho **com itens**; em empate, o mais recente | 2.1 |
| 2.4 | Confirmar que o reaproveitamento voltou a funcionar: uma segunda chamada de "Criar Orçamento" na mesma conversa tem que devolver `novo: false` e o **mesmo** `orcamento_id` | 2.1, 2.1b |
| 2.5 | **P6b:** instrumentar o fallback `Buscar Produto por Nome` e decidir se item sem `produto_id` é aceito ou recusado | 2.4 |
| 2.6 | Corrigir **P4**: quando a trava de conversa pegar, responder ao cliente e registrar a mensagem no histórico. Nunca sumir em silêncio | Fase 1 |
| 2.7 | Limpar os 4 rascunhos órfãos de produção e decidir o que fazer com os 80 eventos órfãos (**P22**) | 2.3, 2.4 |

**Arquivos afetados:** banco (`orcamento_ativo_cliente`, novo índice), `webhookController.js`, workflows n8n.
**Riscos:** (a) o editor do n8n aberto no navegador sobrescreve alterações feitas por API — **perguntar ao dono antes de editar workflow**; (b) o índice único pode falhar se já existirem duplicados — limpar antes; (c) mexer no nó de busca pode reintroduzir o risco de pegar orçamento de outro cliente — **não remover os guardas de `IF`**, eles são a defesa em profundidade.
**Testes:** teste novo no bot cobrindo "existe rascunho vazio mais novo e um com itens → escolhe o com itens"; teste novo cobrindo "segunda mensagem durante processamento → cliente recebe aviso e a mensagem aparece no histórico"; e **um teste manual real pelo WhatsApp**, ponta a ponta.
**✅ Critério de aceite:** uma conversa real de WhatsApp, do "oi" ao "pedido confirmado", cria **exatamente um** pedido no banco, com todos os itens ligados ao `produto_id` correto, e o cliente recebe o protocolo. Repetir 3 vezes seguidas sem falha. Nenhum rascunho órfão criado no processo.

---

### FASE 3 — Fechar o ciclo operacional

**Objetivo:** o pedido, depois de criado, andar até o fim sem depender de alguém lembrar de clicar.

| # | Tarefa | Depende de |
|---|---|---|
| 3.1 | **Decisão D2 com o dono:** conclusão de separação move o pedido automaticamente? | Fase 2 |
| 3.2 | Implementar a decisão de 3.1 (encadear na RPC, ou tornar o passo manual explícito na tela) | 3.1 |
| 3.3 | Mesma decisão e implementação para `concluir_entrega` → pedido `concluido` | 3.1 |
| 3.4 | **P9:** estender `notificacoes_internas` para `'entregador'` (CHECK + policy), escrever a notificação em `delegar_entrega`, ajustar o filtro da tela do app | Fase 2 |
| 3.5 | **P10b:** gatilho de `eventos` para `solicitacoes_separacao` | Fase 2 |
| 3.6 | **Decisão D1 com o dono:** conclusão parcial. Implementar a escolha | Fase 2 |
| 3.7 | Confirmar que a notificação de status por WhatsApp dispara nas transições certas | 3.2, 3.3 |

**Arquivos afetados:** RPCs de separação/entrega, `notificacoes_internas`, `NotificacoesScreen.js`, telas de separação e logística.
**Riscos:** encadear status na RPC pode disparar notificação em momento indesejado — validar em 3.7 antes de dar a fase por fechada.
**Testes:** teste de contrato lendo o SQL e provando o encadeamento; teste manual: delegar entrega → o entregador vê a notificação.
**✅ Critério de aceite:** um pedido percorre delegar → separar → concluir → delegar entrega → em rota → entregue, e em cada passo (a) o status do pedido reflete a realidade, (b) o funcionário certo é notificado, (c) o cliente recebe a mensagem certa, (d) a timeline mostra todos os passos, separação inclusive.

---

### FASE 4 — Tornar o App operacional

**Objetivo:** sair do Expo Go e virar um aplicativo que a equipe instala e recebe aviso.

| # | Tarefa | Depende de |
|---|---|---|
| 4.1 | Identidade de build: `android.package`, `ios.bundleIdentifier`, nome e ícone reais, `eas.json`, versionamento | Fase 3 |
| 4.2 | Gerar um build de desenvolvimento e **instalar num Android real** | 4.1 |
| 4.3 | Validar em aparelho real: login com código+PIN, bloqueio após 5 erros, sessão sobrevivendo a fechar o app, Realtime cruzado com o painel web | 4.2 |
| 4.4 | Push — banco: `push_tokens` com RLS de dono + RPC `registrar_push_token` por `auth.uid()` | Fase 3 |
| 4.5 | Push — app: `expo-notifications`, pedir permissão, registrar o token no login | 4.4 |
| 4.6 | Push — disparador: workflow n8n lendo `notificacoes_internas` com `push_enviado = false`, enviando e marcando | 4.5 |
| 4.7 | Camada de tradução de erro: exceção de RPC vira mensagem em português de gente | 4.2 |
| 4.8 | **Decisão D4:** o painel web do Separador continua existindo? Se não, remover (**P23**) | 4.3 |

**Arquivos afetados:** `app-mobile/*`, banco, um workflow n8n novo.
**Riscos:** build de iOS exige conta Apple paga — se não houver, entregar só Android e registrar a limitação.
**Testes:** os 32 existentes + teste do serviço de push; validação manual em aparelho.
**✅ Critério de aceite:** um separador e um entregador reais instalam o app num aparelho real, entram com código+PIN, **recebem uma notificação com o app fechado**, e concluem uma tarefa que aparece no painel do operador em tempo real.

---

### FASE 5 — Reprodutibilidade

**Objetivo:** qualquer pessoa consegue recriar o ambiente a partir do repositório.

| # | Tarefa | Depende de |
|---|---|---|
| 5.1 | `Dockerfile` multi-estágio do bot (usuário não-root, variáveis em runtime) | Fase 4 |
| 5.2 | `docker-compose.yml` (bot + Caddy, `restart: always`) e `Caddyfile` | 5.1 |
| 5.3 | CI: rodar as 3 suítes a cada push | 5.1 |
| 5.4 | Confirmar que o repositório recria um banco equivalente ao de produção | Fase 1 |
| 5.5 | `README.md` na raiz: o que é cada pasta, como subir cada projeto, como fazer o deploy | 5.2 |
| 5.6 | Limpeza do repositório (seção 19) e correção da documentação com informação errada | 5.5 |

**Riscos:** limpar algo que não é lixo. **Mitigação:** buscar referências de cada item antes de remover; um commit por remoção, para reverter fácil.
**Testes:** a imagem Docker sobe e responde no `GET /`; o CI fica verde.
**✅ Critério de aceite:** `docker compose up` sobe o bot funcionando; o CI roda os 270 testes e fica verde; um `README.md` na raiz explica o projeto inteiro; nenhum arquivo da seção 19 permanece.

---

### FASE 6 — Aguentar o pico

**Objetivo:** sobreviver à Volta às Aulas sem perder mensagem.

| # | Tarefa | Depende de |
|---|---|---|
| 6.1 | Redimensionar o rate limit: separar rajada de volume médio; considerar limite por conversa (**P7**) | Fase 5 |
| 6.2 | Repetir os 3 cenários k6 e comparar com a linha de base de 24/08 | 6.1 |
| 6.3 | Confirmar que **zero** mensagens somem em silêncio no cenário de concorrência | 6.2 |
| 6.4 | Medir a latência do RAG com o catálogo cheio; decidir sobre o índice vetorial (**P12**) | 6.2 |
| 6.5 | Documentar os limites conhecidos: teto de uma instância, latência de 8-34s, ponto de ruptura medido | 6.3 |

**✅ Critério de aceite:** no cenário de rajada, menos de 5% de 429; no cenário de concorrência, **0%** de mensagem perdida em silêncio (todas respondidas ou registradas); resultados anexados ao repositório.

---

### FASE 7 — Deploy

**Objetivo:** o sistema deixa de depender do computador do dono.

| # | Tarefa | Depende de |
|---|---|---|
| 7.1 | VM Oracle Always Free + IP reservado + DuckDNS + portas liberadas | Fase 6 |
| 7.2 | Subir o bot com `docker compose`, HTTPS automático via Caddy | 7.1 |
| 7.3 | Apontar o webhook da Evolution API para o novo endereço | 7.2 |
| 7.4 | Atualizar as URLs de callback nos workflows n8n | 7.3 |
| 7.5 | Publicar o dashboard na Vercel | Fase 5 |
| 7.6 | Atualizar `DASHBOARD_ORIGIN` e `EXPO_PUBLIC_BOT_API_URL` para os endereços reais | 7.5 |
| 7.7 | Confirmar reinício automático: derrubar o contêiner de propósito e ver voltar | 7.2 |

**Riscos:** janela de indisponibilidade na troca do webhook. **Mitigação:** fazer fora do horário de atendimento (a loja fecha 19h em dia de semana, 14h no sábado).
**✅ Critério de aceite:** o bot responde no domínio HTTPS público; o computador do dono é **desligado** e o WhatsApp continua sendo atendido; o contêiner reinicia sozinho depois de derrubado à força.

---

### FASE 8 — Preparar a operação real

**Objetivo:** entregar para pessoas, não para desenvolvedores.

| # | Tarefa | Depende de |
|---|---|---|
| 8.1 | Painel mínimo de saúde: bot no ar, últimas execuções do n8n, fila de atendimento, erros da última hora | Fase 7 |
| 8.2 | Roteiro de teste manual completo, do WhatsApp à entrega, executado ponta a ponta com dado real | Fase 7 |
| 8.3 | Guia rápido do operador (1 página) e do separador/entregador (1 página) | 8.2 |
| 8.4 | Procedimento de plantão: o que fazer se o bot cai, se o n8n cai, se o WhatsApp desconecta | 8.1 |
| 8.5 | Rotina de backup: banco, workflows n8n, PDFs de lista escolar | Fase 7 |
| 8.6 | Piloto acompanhado: 1 dia de operação real com alguém observando | 8.2, 8.3 |
| 8.7 | Registro final dos riscos aceitos (chave da Evolution, instância única, RF-03/RF-04 fora) | 8.6 |

**✅ Critério de aceite:** um dia inteiro de operação real, com clientes de verdade, sem intervenção técnica; todos os incidentes do dia registrados e classificados; a equipe da loja opera sem precisar perguntar nada ao desenvolvedor.

---

### Fases opcionais, depois do go-live

| Fase | Conteúdo | Quando |
|---|---|---|
| **9** | Migrar os locks e o cache para Redis; permitir mais de uma instância | Quando o volume justificar |
| **10** | RF-03 (tarefas) e RF-04 (lista de espera) | Se D3 disser que continuam no escopo |
| **11** | Refatorar `AtendimentoPage`; testes de tela; login unificado | Manutenção contínua |

---

## 24. Critérios de Aceite

Resumo em uma tabela, para a rotina automatizada consultar sem reler o plano inteiro. **Cada critério é verificável por comando ou por observação direta — nenhum é subjetivo.**

| Fase | Critério objetivo | Como verificar |
|---|---|---|
| **0** | Nada pendente no Git; 270 testes verdes; nenhum `.env` versionado | `git status`, `git log origin/main..HEAD`, as 3 suítes, `git ls-files \| grep env` |
| **1** | Zero funções de negócio `SECURITY DEFINER` abertas a `anon` sem `auth.uid()`; 2 índices novos; advisor limpo | Consulta a `pg_proc`; `pg_indexes`; advisor do Supabase |
| **2** | 3 conversas reais seguidas de WhatsApp geram 3 pedidos, com `produto_id` correto e zero rascunho órfão | `select` em `pedidos`, `itens_pedido`, `orcamentos`; conversa manual |
| **3** | Um pedido percorre o ciclo inteiro com status, notificação, mensagem ao cliente e timeline corretos em cada passo | Execução manual + `select` em `eventos` e `notificacoes_internas` |
| **4** | App instalado em aparelho real recebe push com o app fechado e conclui uma tarefa visível no painel | Teste em aparelho |
| **5** | `docker compose up` funciona; CI verde; `README.md` na raiz; lixo removido | Comandos + inspeção |
| **6** | Rajada com <5% de 429; concorrência com **0%** de perda silenciosa | Relatório do k6 |
| **7** | Bot responde em HTTPS público com o PC do dono desligado; contêiner reinicia sozinho | Teste ao vivo |
| **8** | Um dia de operação real sem intervenção técnica | Registro do piloto |

---

## 25. Checklist de Go-Live

Para imprimir e marcar no dia.

### Antes

- ☐ Todo o código commitado e no remoto
- ☐ Backup do banco feito **hoje**
- ☐ Os 5 workflows n8n exportados e versionados **hoje**
- ☐ Todas as variáveis de ambiente conferidas nos 3 ambientes
- ☐ `atualizar_status_pedido` fechada e conferida
- ☐ 270 testes verdes
- ☐ Teste de carga repetido e dentro do critério
- ☐ 3 pedidos de teste ponta a ponta, do WhatsApp à entrega
- ☐ App instalado nos aparelhos da equipe
- ☐ Operador, separador e entregador **treinados**
- ☐ Guias de 1 página impressos e no balcão

### No dia

- ☐ Deploy fora do horário de atendimento
- ☐ Webhook da Evolution API apontando para o endereço novo
- ☐ URLs de callback do n8n atualizadas
- ☐ Dashboard publicado e acessível
- ☐ Primeira mensagem de teste real respondida
- ☐ Primeiro pedido real acompanhado do início ao fim
- ☐ Contêiner derrubado de propósito e reiniciado sozinho
- ☐ Computador do dono desligado e o sistema continua

### Depois

- ☐ Primeira hora acompanhada de perto
- ☐ Primeiro dia com alguém de plantão
- ☐ Incidentes do dia registrados
- ☐ Riscos aceitos documentados e assinados
- ☐ Data marcada para revisar os itens adiados (RF-03, RF-04, Redis)

---

## 26. Próximos Passos

### Hoje, antes de dormir (30 minutos)

**Commite os sete dias.** É a única coisa deste documento com prazo de "agora". Não precisa ser bonito, não precisa ser em blocos temáticos se o tempo for curto — um commit único chamado `wip: trabalho de 19-25/08` já elimina o risco R1, que é o maior do projeto.

### Amanhã, na ordem

1. **Ler este documento inteiro** e discordar do que achar que está errado. Ele foi verificado, mas eu não conheço a loja — algumas prioridades podem estar trocadas.
2. **Responder as 5 decisões de produto** (D1 a D5, seção 20). Sem D1 e D2 respondidas, a Fase 3 trava.
3. **Aprovar ou ajustar o plano de 9 fases.**
4. **Montar a rotina de execução automatizada** a partir da seção 23. O plano já está no formato certo: tarefas pequenas, dependências explícitas, critério verificável por comando.

### O que esta auditoria NÃO conseguiu verificar

Registrado para não virar falsa confiança:

- **O app em aparelho real.** Nunca foi executado em Android ou iOS de verdade — só os testes de unidade e o bundle compilando.
- **Se os 5 workflows têm `errorWorkflow` vinculado.** O tratamento de erro por ramo existe e é bom; falta confirmar o vínculo global.
- **A rotação da chave da Evolution API.** Depende do fornecedor.

### Uma observação final, sobre o projeto

Este não é um projeto em dificuldade técnica. O código é bom — em alguns pontos (tratamento de erro, comentários que explicam o porquê, disciplina anti-alucinação no prompt) é melhor do que a média do que se vê em produção.

O que falta não é engenharia. É **fechamento**: salvar o que foi feito, fechar a última porta aberta, fazer a venda completar, e tirar o sistema do computador de uma pessoa. Nenhuma dessas quatro coisas exige inventar nada novo — todas já têm o caminho escrito.
