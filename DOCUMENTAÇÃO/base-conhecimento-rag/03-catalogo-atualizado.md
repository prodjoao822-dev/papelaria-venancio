# 03 — Catálogo Atualizado (cruzamento pasta × Supabase)

**Fonte de verdade operacional continua sendo a tabela `produtos` no Supabase** — este documento é um relatório do cruzamento feito em 21/09/2026, não um catálogo paralelo. Nunca use os números deste arquivo no lugar de uma consulta ao vivo.

## Resultado do cruzamento (122 itens da pasta × catálogo)

| Categoria (ticket ShopControl) | Total | NOVO | EXISTENTE (preço ok) | CONFLITO (preço diverge) |
|---|---|---|---|---|
| Canetas | 22 | 16 | 6 | 0 |
| Borracha/Apontador | 11 | 10 | 1 | 0 |
| Canetinha | 9 | 8 | 1 | 0 |
| Giz de cera | 8 | 8 | 0 | 0 |
| Lápis de cor | 15 | 14 | 1 | 0 |
| Lápis/Lapiseira/Grafite | 16 | 8 | 8 | 0 |
| Marca texto | 18 | 14 | 3 | **1** |
| Caderno (espiral + brochura) | 23 | 21 | 2 | 0 |
| **Total** | **122** | **99** | **22** | **1** |

Nenhum item ficou classificado como **DUPLICADO** — o cruzamento foi feito por SKU (código real do ShopControl, que já era o mesmo campo `produtos.sku` no catálogo), então não houve ambiguidade de "é o mesmo produto ou não" — SKU igual = mesmo produto, sem exceção encontrada.

## O CONFLITO encontrado

| SKU | Produto | Preço no catálogo (antes) | Preço no ticket (19/09/2026) | Ação |
|---|---|---|---|---|
| 42233 | MARCA TEXTO STABILO BOSS CORES | R$12,99 | R$14,99 | **Atualizado para R$14,99** (fonte primária ERP prevalece) — ver Documento 05 |

## Achado estrutural (não era uma das 15 perguntas da tarefa, mas é relevante pra próxima etapa)

O catálogo, antes desta rodada, tinha **só 1 SKU cadastrado por linha de caderno na maioria dos casos** (ex.: só a cor azul do "D+ 48fls" existia, as outras 4 cores não). O ShopControl, por outro lado, trata **cada cor/variação como um produto/SKU separado**. Isso significa que, historicamente, o catálogo do agente estava sub-representando linhas inteiras — um cliente perguntando por "caderno D+ vermelho" não teria correspondência no catálogo antes desta rodada, mesmo a loja tendo o produto físico. Essa lacuna provavelmente existe também em outras categorias fora do escopo desta tarefa (não verificado aqui).

## O que já foi feito com os 99 novos

- **21 cadernos** → cadastrados com pesquisa externa completa (Documento 02), migração `extensao_catalogo_cadernos_pesquisados_21-09.sql`.
- **78 demais** → cadastrados com nome/SKU/preço/categoria/marca (Documento 07), migração `extensao_catalogo_produtos_novos_leves_21-09.sql`, marcados com a tag `pendente_pesquisa` pra próxima rodada.

Total de produtos no catálogo após esta rodada: **823** (724 + 99).
