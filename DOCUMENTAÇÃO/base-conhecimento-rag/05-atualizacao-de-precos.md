# 05 — Atualização de Preços

**Regra estrutural (repetida do Documento 01, vale para este documento inteiro):** preço é dado dinâmico. Este documento explica **como e por que** cada preço foi definido em 21/09/2026 — ele não é, e nunca deve virar, a fonte que o agente consulta em tempo real. Isso continua sendo `produtos.preco` no Supabase.

## Fonte usada para preço: os tickets do ShopControl (ERP)

Os 10 tickets de venda balcão (Documento 01) são o **ponto de venda real** — o preço que estava na etiqueta/sistema da loja em 19-21/09/2026, não uma tabela de referência ou sugestão de fabricante. Por isso, nesta rodada, o preço do ticket ShopControl foi tratado como **fonte primária de preço**, acima do valor que já estava cadastrado no catálogo do agente.

## Os 122 itens da pasta × preço

| Situação | Quantidade | O que foi feito |
|---|---|---|
| Já existia no catálogo, preço do ticket bate com o preço cadastrado | 22 | Nenhuma alteração — preço confirmado por concordância entre as duas fontes. |
| Já existia no catálogo, preço do ticket diverge do preço cadastrado | 1 (SKU 42233) | Preço atualizado para o valor do ticket — ver detalhe abaixo. |
| Não existia no catálogo (novo) | 99 | Cadastrado com o preço do ticket como valor inicial. |

**Todos os 122 preços entram como PREÇO CONFIRMADO** — nenhum foi inferido, arredondado ou estimado. Cada um tem rastreabilidade completa: Informação → Fonte → Data → Status.

### Exemplo de rastreabilidade (formato usado em todos os 122 itens)

| Informação | Fonte | Data | Status |
|---|---|---|---|
| Preço MARCA TEXTO STABILO BOSS CORES = R$14,99 | Ticket ShopControl "Marca texto", sequência 19/09/2026 | 2026-09-19 | Confirmado |
| Preço CADERNO JANDAIA STILO 80FLS = (valor do ticket "Caderno brochura") | Ticket ShopControl, sequência 21/09/2026 | 2026-09-21 | Confirmado |

## O único CONFLITO encontrado — SKU 42233

| Campo | Valor |
|---|---|
| Produto | Marca texto Stabilo Boss Cores |
| Preço no catálogo (antes desta rodada) | R$ 12,99 |
| Preço no ticket ShopControl (19/09/2026) | R$ 14,99 |
| Diferença | +R$ 2,00 (+15,4%) |
| Origem provável da divergência | Não é possível afirmar com certeza — pode ser reajuste de fornecedor não repassado ao catálogo do agente, ou o catálogo nunca ter sido atualizado desde o cadastro original. **Não foi assumida nenhuma das duas hipóteses como fato.** |
| Ação tomada | Preço atualizado para R$ 14,99 no Supabase (fonte primária ERP prevalece sobre catálogo desatualizado) |
| Traceability gravada | Nota de rastreabilidade anexada ao campo `descricao` do produto no Supabase, registrando o valor antigo, o novo, a fonte e a data — ver migração `extensao_catalogo_produtos_novos_leves_21-09.sql` |
| Status | Confirmado (mudança já aplicada e verificada ao vivo) |

## Sobre preço "sugerido pelo fabricante" x preço de balcão (nota de escopo)

Durante a pesquisa externa dos 21 cadernos (Documento 02), sites de fabricante/varejo às vezes exibem um preço de referência/MSRP. **Esse valor não foi usado para alterar nem validar nenhum preço do catálogo** — o preço de venda real da loja (ticket ShopControl) sempre prevalece, porque reflete custo, margem e política comercial da própria Papelaria Venâncio, que um site de fabricante não conhece. Nenhum preço de referência externo foi registrado neste documento para evitar confusão entre "quanto a loja cobra" e "quanto o fabricante sugere".

## Por que não há nenhum item classificado como "PREÇO PRECISA DE VALIDAÇÃO" nesta rodada

Pela natureza da fonte usada (ponto de venda real, não uma estimativa), os 122 preços entraram todos como confirmados. Uma futura necessidade de validação apareceria em cenários como:
- Produto sem nenhum ticket recente que confirme o preço atual (não é o caso de nenhum dos 122 itens desta pasta).
- Divergência entre múltiplas fontes internas (ex.: duas gôndolas com preços diferentes) — não observado aqui.

## Como o preço deve continuar funcionando na arquitetura do agente (para a próxima etapa de RAG)

- A RAG (documentos 01-07) nunca deve embutir um valor de R$ fixo em texto de treinamento — nem os que foram "confirmados" aqui.
- Toda resposta que envolva preço deve consultar `produtos.preco` no momento da conversa.
- Sugestão para manter os preços atualizados de forma contínua: um processo periódico (mensal ou por evento de reajuste) que exporte um novo snapshot do ShopControl e rode o mesmo tipo de cruzamento feito aqui (ticket × catálogo), gerando uma lista curta de divergências para revisão humana — em vez de confiar que o cadastro manual do catálogo nunca fique desatualizado.
