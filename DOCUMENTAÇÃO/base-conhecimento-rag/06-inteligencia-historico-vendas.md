# 06 — Inteligência do Histórico de Vendas (ShopControl)

**Aviso obrigatório, para não ser ignorado:** a pasta `HISTORICO DE VENDAS` continha **9 tickets, 67 itens vendidos, cobrindo 15/09/2026 a 21/09/2026 (uma semana corrida)**. Isso é uma amostra pequena demais para qualquer conclusão real de sazonalidade ou "produto mais vendido" — uma semana não captura ciclo de compra escolar, promoção, nem variação normal de demanda. Este documento registra **o que dá para dizer com essa amostra** e é explícito sobre o que **não dá**, em vez de forçar uma conclusão que os dados não sustentam.

## A amostra, como ela realmente é

| Ticket | Data | Sequência | Vendedor(a) | Itens | Valor total |
|---|---|---|---|---|---|
| 1 | 21/09/2026 | 55106 | Nathan Duarte da Silva | 1 | R$ 25,98 |
| 2 | 21/09/2026 | 55075 | Maria Edileuza | 7 | R$ 105,43 |
| 3 | 21/09/2026 | 55072 | Wystinna | 11 | R$ 375,39 |
| 4 | 21/09/2026 | 55068 | Maria Edileuza | 3 | R$ 70,47 |
| 5 | 21/09/2026 | 55047 | Nathan Duarte da Silva | 14 | R$ 146,75 |
| 6 | 21/09/2026 | 55034 | Leonardo Santos | 10 | R$ 64,27 (com desconto) |
| 7 | 21/09/2026 | 55025 | Leonardo Santos | 7 | R$ 132,93 |
| 8 | 15/09/2026 | 54418 | Wystinna | 10 | R$ 109,20 |
| 9 | 15/09/2026 | 54415 | Wystinna | 4 | R$ 101,61 (com desconto) |
| **Total** | | | **4 vendedores distintos** | **67** | — |

Todos os tickets usam o cliente genérico `370 - VENDAS BALCAO` — não é possível segmentar por cliente recorrente.

## Cruzamento real com o catálogo (feito ao vivo no Supabase, não estimado)

Os 67 itens foram cruzados contra a tabela `produtos` (823 itens, já incluindo os 99 cadastrados nesta mesma rodada) por **SKU exato** primeiro, depois por **nome aproximado** para os que não bateram por código.

| Classificação | Quantidade (de 67) | Critério usado |
|---|---|---|
| **CORRESPONDÊNCIA CONFIRMADA** | 14 | SKU do ticket bate exatamente com `produtos.sku` |
| **CORRESPONDÊNCIA PROVÁVEL** | 18 | Nome muito parecido, mesma marca/linha, mas SKU diferente, variação de tamanho/cor não cadastrada, ou o produto está cadastrado com nome idêntico porém sem SKU preenchido |
| **NÃO FOI POSSÍVEL IDENTIFICAR** | 35 | Nenhuma correspondência razoável encontrada nem por código nem por nome |

Nenhuma associação incerta foi forçada — os 35 casos "não identificado" ficam exatamente assim, sem tentativa de adivinhar um produto parecido só para fechar número.

### Os 14 CONFIRMADOS (SKU exato)

`2346` (E.V.A liso cores 2mm, aparece 2x — tickets 5 e 8), `70435` (Palito ponta quadrada), `16457` (Estilete plástico largo Leonora), `665` (Papel celofane cores), `231` (Cartolina branca 150gm2), `598` (Cartolina 2 faces coloridas), `1174` (Bastão cola quente silicone fina), `14666` (Grafite CIS Big Tree/BRW/Tris 2.0), `4257` (Canetinha Hidrocor Compactor 24 cores), `47037` (Lápis de cor Faber Castell 24 cores + 4 pastel), `595` (Papel cenário Kraft ouro), `22839` (Papel Report A4 Senninha branco), `4341` (Lápis de cor Faber Castell kit escolar 12 cores).

### Os 18 PROVÁVEIS — e por que cada um não fechou 100%

| Item do ticket | O que existe no catálogo | Motivo da divergência |
|---|---|---|
| Rolo de espuma Condor 5cm (2x) | Rolo de espuma Condor 4cm (mesma ref. 8094A) | Tamanho vendido (5cm) ≠ tamanho cadastrado (4cm) |
| Tinta PVA Verde Olivia 545 100ml | Tinta PVA Verde Oliva 545 37ml | Mesmo código de cor, tamanho vendido é maior que o cadastrado |
| Tinta PVA Verde Esmeralda 571 100ml | Tinta PVA Verde Esmeralda 571 37ml | Mesmo código de cor, tamanho diferente |
| Lixa de madeira 1040/100 | Lixa de madeira 1040/180 | Mesma linha, granulação (grão) diferente |
| Ecolápis Max Nº2 kit 6un + apontador | Ecolápis Max Nº2 avulso (azul) | Mesma linha, embalagem/kit vendido é diferente do avulso cadastrado |
| Cola Glitter Acrilex Ouro 201 15g | Produto de nome **idêntico** cadastrado | Cadastro existe mas está **sem SKU preenchido** — falha de dado, não falta de produto |
| Pincel Condor 473 nº8 | Pincel Condor 473 nº4/6/12 cadastrados | Linha existe, número específico (8) não está cadastrado |
| Massa de E.V.A Make+ 20 cores 250g 13067 | Produto de nome **idêntico** cadastrado | Sem SKU preenchido |
| Grafite Faber Castell 0.9 B/2B | Produto de nome **idêntico** cadastrado | Sem SKU preenchido |
| Cola silicone líquida Jocar Office 60ml | Produto de nome **idêntico** cadastrado (com acento) | Sem SKU preenchido |
| Fita crepe 19x50 Adere | Fita crepe 19mm x 10m Adere | Mesma marca/linha, medida vendida diferente da cadastrada |
| Fita de cetim Nº05 azul royal | Fita de cetim Nº05 verde musgo | Mesmo número/linha, cor diferente |
| Tinta guache Acrilex vermelho fogo 507 15ml | Tinta guache Acrilex vermelho/rosa 537/507 250ml | Mesmo código, tamanho vendido bem menor |
| Massinha de modelar Soft Acrilex azul 109 | Massinha de modelar Soft Acrilex laranja 105 | Mesma linha, cor diferente |
| Pincel Condor 456 nº10 | Pincel Condor 456 nº8/12/14/20 cadastrados | Linha existe, número específico não cadastrado |
| Tela virada Souza/Roma 30x30 | Produto de nome **idêntico** cadastrado | Sem SKU preenchido |
| Pasta catálogo DAC 1/2 of. 30 env. | Envelope p/ pasta catálogo DAC + Pasta catálogo DAC 100 env. finos | Mesma marca/categoria, modelo/capacidade diferente |

**Achado de qualidade de dado, importante para a próxima etapa:** 5 desses 18 casos (Cola Glitter, Massa E.V.A, Grafite 0.9, Cola Silicone 60ml, Tela 30x30) têm **nome cadastrado idêntico ao do ticket**, mas o campo `produtos.sku` está vazio. Ou seja, o produto **já existe** no catálogo — não é um "novo" nem um "não identificado" de verdade, é uma falha de preenchimento de SKU que faria qualquer cruzamento automático por código futuro classificar esse item errado. Vale corrigir o preenchimento de SKU desses registros antes de repetir este tipo de cruzamento.

### Os 35 NÃO IDENTIFICADOS — padrão observado

A maior parte dos itens sem correspondência (ex.: tinta PVA verde musgo 513, verniz vitral fosco, aventais infantis Leo&Leo, potes de borracha temáticos, canetinhas Vai e Vem, brinquedos como o "Big Balde" e "Bolha de Sabão", telas de pintura, livros de raciocínio lógico e cartilhas de atividades, cola branca Ateliê, marcador permanente de ponta dupla) pertence a uma linha de produtos de **artesanato/hobby e itens infantis/lúdicos** que a loja também vende no balcão, mas que **não fazem parte do escopo de papelaria escolar/de escritório** que o catálogo do Agente de Vendas cobre hoje. Isso não é um erro desta rodada — é um retrato de que o catálogo do agente foi construído em torno de papelaria, e esta amostra de histórico revelou uma categoria de produto inteira (artesanato/tintas/E.V.A/aventais/brinquedos) que a loja vende fisicamente mas que o agente de IA não tem cadastrada.

## O que dá para concluir com segurança desta amostra

- A loja vende, no mesmo balcão e no mesmo período, tanto papelaria escolar quanto artesanato/hobby — os dois universos aparecem misturados nos mesmos tickets (ex.: ticket 5 tem lapiseira e caneta gel ao lado de massa de E.V.A e tinta guache).
- 4 vendedores(as) diferentes emitiram tickets nesta janela — não há concentração em uma única pessoa.
- Dois itens se repetem entre tickets diferentes dentro da mesma semana (E.V.A liso 2mm e Rolo de espuma Condor) — isso é um sinal fraco demais para chamar de "mais vendido", mas é o único padrão de repetição observável nesta amostra.

## O que esta amostra NÃO permite concluir (e por que não forçar)

- **Sazonalidade**: precisaria de meses de dados cobrindo diferentes períodos do calendário letivo/comercial; uma semana não mostra nem um ciclo completo.
- **Produto mais vendido de verdade**: 67 itens em 9 tickets é estatisticamente pequeno demais — um único cliente grande de artesanato pode ter distorcido a amostra sozinho (ex.: ticket 3, R$375,39, tem itens de brinquedo e lápis de cor caros que puxam a média).
- **Marcas/categorias mais relevantes no negócio como um todo**: o que apareceu aqui reflete só quem passou no balcão nesses 9 atendimentos, não o volume real de vendas da loja.

## Recomendação para a próxima etapa

Pedir ao ShopControl um export real de **vendas de pelo menos 2-3 meses**, cobrindo idealmente um período de volta às aulas e um período fora dele, para permitir uma análise de sazonalidade e ranking de produtos que realmente sustente decisões (o que destacar pro agente recomendar, o que reforçar em estoque, etc.). Com esse volume, o mesmo tipo de cruzamento SKU×catálogo feito aqui pode virar um processo recorrente de auditoria de catálogo, aproveitando também o achado de "nome idêntico sem SKU" para limpar dados existentes.
