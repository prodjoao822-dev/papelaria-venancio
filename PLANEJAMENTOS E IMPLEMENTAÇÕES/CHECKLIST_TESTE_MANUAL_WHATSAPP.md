# Checklist de Teste Manual — Bot da Papelaria Venâncio (WhatsApp)

**Para quem vai executar este teste:** obrigado por ajudar! Você não precisa entender nada de programação. Este documento tem passo a passo: o que digitar no WhatsApp e o que esperar como resposta. Onde a resposta vier diferente do esperado, você **anota na coluna "Resultado" e escreve o que aconteceu de verdade** — isso é o mais importante do teste.

---

## Antes de começar

1. Use o número de WhatsApp indicado por quem te passou este checklist (o número oficial da papelaria).
2. Confirme com essa pessoa que o **bot está ligado** no momento do teste (ele roda no computador dela, precisa estar rodando).
3. Se possível, teste a partir de um número que **nunca conversou com esse WhatsApp antes** (ou peça pra "zerar" a conversa) — isso é importante especialmente para o Teste 1 (cliente novo).
4. Tenha um bloco de notas (papel ou celular) para anotar hora e print de tela sempre que algo parecer errado.
5. Vá em ordem. Alguns testes só fazem sentido depois de outro ter sido feito antes (isso está indicado em cada bloco).

### Como marcar cada linha

- ✅ **OK** — a resposta veio como o esperado.
- ❌ **FALHOU** — veio diferente, não veio nada, ou veio errado. Escreva exatamente o que aconteceu.
- Sempre que marcar ❌, **tire print da tela** da conversa naquele momento e anote o horário.

---

## BLOCO 1 — Primeiro contato (cliente novo)

> Objetivo: ver se o bot recebe bem uma pessoa que nunca falou com a papelaria.

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| 1.1 | Mande "Oi" ou "Bom dia" | Deve vir uma mensagem de boas-vindas com o nome da loja e uma lista numerada de opções (Comprar, Financeiro, Fornecedor, Serviços) | ☐ |
| 1.2 | Mande algo aleatório, tipo "blablabla" ou "9999" (sem ter mandado nada antes) | Não deve dizer "opção inválida" — é a primeira mensagem, então deve só mostrar o menu | ☐ |

---

## BLOCO 2 — Navegação pelo menu principal

> Faça um teste por vez, e depois de cada um mande **"menu"** ou **"0"** pra voltar ao início antes do próximo.

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| 2.1 | Digite **1** (Comprar / Ver preços) | Deve abrir um novo menu (submenu de vendas) com opções tipo Lista escolar, Material escolar, Escritório, etc. | ☐ |
| 2.2 | Volte ao menu (digite "menu") e digite **2** (Financeiro) | Deve responder algo como "já vamos te atender" — é pra time financeiro, não é a IA | ☐ |
| 2.3 | Volte ao menu e digite **3** (Fornecedor/representante) | Mesma ideia — mensagem de "já vamos te atender" | ☐ |
| 2.4 | Volte ao menu e digite **4** (Serviços/Xerox) | Mesma ideia — mensagem de "já vamos te atender" | ☐ |
| 2.5 | Volte ao menu e digite um número que não existe, tipo **9** | Deve dizer algo como "opção inválida" e mostrar o menu de novo | ☐ |
| 2.6 | A qualquer momento, no meio de qualquer conversa, digite **"menu"** ou **0** | Deve sempre voltar pro menu principal, não importa onde você estava | ☐ |
| 2.7 | Escolha uma opção de submenu (ex: 1) e depois digite **#** | Deve voltar um passo (voltar pro menu anterior) | ☐ |
| 2.8 | No meio de qualquer fluxo, digite **\*** | Deve reiniciar o atendimento do zero (volta pro menu principal, esquece o que você tava fazendo) | ☐ |
| 2.9 | Digite **"ajuda"** | Deve mostrar uma listinha de comandos (menu, #, *, ajuda, atendente) e continuar de onde você estava | ☐ |

---

## BLOCO 3 — Comprar de verdade com a IA de vendas

> Objetivo: testar o "vendedor virtual". Volte ao **menu principal** e digite **1** pra entrar no submenu de vendas antes de cada teste novo desta seção.

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| 3.1 | No submenu de vendas, digite **2** (Material escolar) | Deve te transferir pra conversa com a IA de vendas (a resposta muda de "menu numerado" pra uma conversa mais natural) | ☐ |
| 3.2 | Pergunte por um produto que **existe** no catálogo, ex: "vocês têm caderno report?" | A IA deve responder com informação real (nome, se tem ou não) — **nunca deve inventar um preço que não existe** | ☐ |
| 3.3 | Pergunte por um produto que **não existe**, ex: "vocês têm foguete espacial?" | A IA não deve travar nem dizer "não temos" — ela deve registrar a dúvida pra alguém da loja responder depois (ou pedir mais detalhes) | ☐ |
| 3.4 | Peça pra adicionar 2 ou 3 itens diferentes ao pedido (um de cada vez, ex: "quero 2 cadernos", depois "quero também uma caixa de lápis de cor") | A IA deve ir confirmando cada item adicionado | ☐ |
| 3.5 | Peça pra **fechar o pedido** (ex: "pode fechar", "quero pagar") | A IA deve confirmar o fechamento e te dar um **número de protocolo** (tipo PED-2026-xxxx) | ☐ |
| 3.6 | Depois de fechar, mande outra mensagem qualquer (ex: "oi", "obrigado") | Não deve tratar como um pedido novo do zero — deve reconhecer que você já tem um pedido em aberto | ☐ |
| 3.7 | Volte ao menu principal digitando "menu" | A mensagem do menu deve avisar que você **já tem um pedido em andamento**, com o protocolo | ☐ |

**⚠️ Anote em qualquer um destes casos, mesmo que pareça "só um detalhe":**
- A IA disse um preço que você desconfia que está errado
- A IA disse "pedido fechado" mas você não recebeu nenhum número de protocolo
- A IA repetiu a mesma pergunta várias vezes sem sentido
- A resposta demorou muito (mais de 1 minuto sem nada)

---

## BLOCO 4 — Horário de retirada / entrega

> Continue de dentro de uma conversa com a IA de vendas (bloco 3), ou comece um pedido novo.

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| 4.1 | No momento de fechar o pedido, informe um horário, ex: "quero retirar hoje às 17h" | A IA deve confirmar o horário combinado na resposta final | ☐ |
| 4.2 | Em outro pedido, peça **entrega** em vez de retirada (ex: "pode entregar na minha casa?") e informe um endereço | A IA deve perguntar o endereço (se não informado) e confirmar a forma de entrega na resposta final | ☐ |
| 4.3 | Confirme com quem tem acesso ao painel (dashboard) se esse horário/endereço aparece registrado no pedido | Deve bater com o que você informou | ☐ |

---

## BLOCO 5 — Pedir atendimento humano (a IA "desliga")

> Esse bloco testa a passagem de bastão da IA pra uma pessoa de verdade.

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| 5.1 | A qualquer momento (mesmo no meio de uma conversa com a IA), digite **"atendente"** | Deve confirmar que vai chamar alguém, e a partir daí a IA **não deve mais responder nada sozinha** | ☐ |
| 5.2 | Depois do 5.1, mande outra mensagem qualquer (ex: "oi", "alguém aí?") | O bot **não deve responder** — quem responde a partir daqui é uma pessoa de verdade da loja (confirme com a equipe se a mensagem chegou pra eles) | ☐ |
| 5.3 | Repita o teste 5.1 escrevendo **"reclamação"** em vez de "atendente" (em uma conversa nova) | Mesmo comportamento do 5.1 | ☐ |
| 5.4 | No submenu de vendas (menu > 1), escolha a opção **"Falar com um atendente"** (normalmente é a opção 6) | Deve avisar que "já vamos te atender" e, igual ao 5.2, parar de responder sozinho depois disso | ☐ |

---

## BLOCO 6 — Áudio, foto e PDF

> Objetivo: testar quando você manda mídia em vez de texto. **Use uma conversa nova pra cada item, se der.**

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| 6.1 | Grave um áudio curto falando algo tipo "quero saber o preço da resma de papel A4" e mande | O bot deve entender o que você falou e responder como se você tivesse digitado aquilo (pode demorar alguns segundos a mais que o texto normal) | ☐ |
| 6.2 | Tire uma foto de um produto (ou qualquer objeto) e mande com uma legenda tipo "vocês têm isso?" | O bot deve reconhecer que é uma imagem e responder algo relacionado ao que aparece nela | ☐ |
| 6.3 | Mande um arquivo PDF qualquer (pode ser qualquer PDF pequeno) | O bot deve confirmar "recebemos seu arquivo" — esse PDF vai direto pra equipe de vendas olhar, não é processado pela IA | ☐ |

---

## BLOCO 7 — Situações de estresse (IMPORTANTE — já sabemos que pode dar problema aqui)

> Este bloco é o mais importante do teste de hoje. Já identificamos um risco aqui num teste técnico anterior — precisamos confirmar se ele aparece também no uso real.

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| 7.1 | Mande 3 mensagens **bem rápido, uma atrás da outra, sem esperar resposta** (ex: "oi", "quero 2 cadernos", "e também uma caneta"), tudo em menos de 5 segundos, numa conversa que já está com a IA de vendas ativa | **Anote quantas dessas 3 mensagens foram respondidas.** Se alguma delas simplesmente sumir (você nunca recebe resposta pra ela e ela não aparece considerada no pedido), **isso é o problema que estamos investigando** — marque como FALHOU e descreva exatamente quais das 3 sumiram | ☐ |
| 7.2 | Mande a mesma mensagem exata duas vezes seguidas rapidinho (ex: aperte enviar duas vezes por engano) | O bot deve responder **uma vez só** (não deve duplicar a resposta nem criar dois pedidos) | ☐ |

**Este bloco é o que mais queremos saber o resultado — reporte com detalhe, mesmo que pareça ter funcionado bem.**

---

## BLOCO 8 — Fora do horário / casos especiais

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| 8.1 | Se der pra testar fora do horário de funcionamento da loja, mande "oi" | O menu deve aparecer com um aviso de que está fora do horário de atendimento | ☐ |
| 8.2 | Escolha "Cotação pra empresa" no submenu de vendas e siga o fluxo até o fim (ele vai pedir CNPJ/dados da empresa) | Deve conseguir preencher os dados e fechar uma cotação, recebendo um protocolo no final | ☐ |
| 8.3 | Escolha "Lista escolar" no submenu de vendas e siga até escolher escola + ano | Deve te mostrar as escolas cadastradas e, ao escolher, te dar a lista de material ou o orçamento, dependendo da escola | ☐ |

---

## BLOCO 9 — Só se você também tiver acesso ao painel (dashboard) ou ao app do Separador

> Pule este bloco se você só tem acesso ao WhatsApp de teste.

| # | O que fazer | O que deve acontecer | Resultado |
|---|---|---|---|
| 9.1 | Confirme que os pedidos fechados nos testes acima (Bloco 3 e 4) aparecem no painel, com os dados certos (itens, protocolo, horário/endereço) | Devem aparecer certinhos, sem itens faltando | ☐ |
| 9.2 | No painel, delegue a separação de um dos pedidos de teste pra um separador cadastrado | O separador deve receber a solicitação (login por código+PIN no app/telinha do separador) | ☐ |
| 9.3 | Login do separador: marque todos os itens como separados e conclua a separação | O status do pedido deve mudar, e quem delegou deve ver a mudança **sem precisar atualizar a página** (tempo real) | ☐ |

---

## Como reportar o que você encontrar

Pra cada linha marcada como ❌ FALHOU, preencha isto e devolva pra quem te passou o checklist:

```
Teste número: ____
Horário exato: ____:____
O que eu digitei/mandei: "..."
O que eu esperava que acontecesse: ...
O que aconteceu de verdade: ...
Print da tela: (anexar)
```

---

## Resumo final (preencher no fim de tudo)

| Bloco | Total de testes | OK | Falhou |
|---|---|---|---|
| 1 — Primeiro contato | 2 | | |
| 2 — Navegação do menu | 9 | | |
| 3 — Compra com a IA | 7 | | |
| 4 — Horário/entrega | 3 | | |
| 5 — Atendimento humano | 4 | | |
| 6 — Áudio/foto/PDF | 3 | | |
| 7 — Estresse (mensagens rápidas) | 2 | | |
| 8 — Casos especiais | 3 | | |
| 9 — Painel/Separador (opcional) | 3 | | |

Obrigado pelo teste! Qualquer dúvida durante a execução, pare e pergunte antes de continuar — é melhor perguntar do que "forçar" um teste que não reflete o uso real de um cliente.
