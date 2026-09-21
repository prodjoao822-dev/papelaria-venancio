# 00 — Relatório Final: Base de Conhecimento Comercial (21/09/2026)

Relatório de encerramento da TAREFA 21/09/2026. Cobre os 15 pontos pedidos, na ordem pedida. Os documentos 01-07 (nesta mesma pasta) têm o detalhe completo de cada frente — este relatório resume e aponta pra eles.

## 1. Total de produtos encontrados na pasta

**122 itens**, distribuídos em 10 tickets de venda balcão reais do ShopControl (não catálogo de fabricante) — ver Documento 01, seção 1.

## 2. Quantos eram novos

**99 novos** (não existiam no catálogo antes desta rodada) — 21 cadernos + 78 dos demais grupos (canetas, borracha/apontador, canetinha, giz de cera, lápis de cor, lápis/lapiseira/grafite, marca texto).

## 3. Quantos já existiam

**22 itens** já estavam cadastrados, com preço batendo exatamente com o ticket — nenhuma alteração necessária.

## 4. Quantos precisaram de atualização

**1 item** precisou de atualização de preço: SKU 42233 (Marca texto Stabilo Boss Cores), de R$12,99 para R$14,99 — ver Documento 05 para a rastreabilidade completa.

## 5. Quantos ficaram com conflito ou duplicidade

**1 conflito** (o SKU 42233 acima, já resolvido). **0 duplicidades** — o cruzamento foi feito por SKU real do ShopControl, que já era o mesmo campo `produtos.sku`, então não houve ambiguidade "é o mesmo produto ou não".

## 6. Quantos produtos com imagem e sem imagem

Das 14 fotos da pasta, mapeadas contra os 21 cadernos pesquisados (Documento 04):
- **2 cadernos** com foto de correspondência exata e inequívoca (Gabriel Medina, Jandaia Stilo).
- **7 linhas** com foto genérica que confirma a linha, mas mostra várias estampas diferentes ao mesmo tempo (não 1 foto = 1 SKU): Mais+, Pepper, Vibe, Vibe Masculino, Strong, X-Racing, São Domingos Pixel Kraft.
- **2 fotos da linha D+ cores lisas** com suspeita de serem a mesma imagem salva com nomes diferentes (48fls vs 96fls) — precisa validação.
- **2 inconsistências nome de arquivo × conteúdo real da foto**, ainda não resolvidas: "D+ 48FLS" mostrando estampas temáticas em vez de cor lisa, e "Sapeca Fem" mostrando a linha "Kids" da Tilibra, sem nenhuma referência a "Sapeca" na imagem.
- **1 SKU sem foto nenhuma**: Tilibra Raptor (22631).
- Os 78 itens do cadastro leve (canetas, borrachas etc.) **não têm foto na pasta** — não fizeram parte do escopo de imagem desta rodada.

## 7. Quantos produtos com preço confirmado × precisando validação

**Todos os 122 preços entraram como CONFIRMADOS** — a fonte usada (ticket de venda balcão real do ShopControl) é o próprio ponto de venda, não uma estimativa. Nenhum item ficou pendente de validação de preço nesta rodada (Documento 05 explica por quê e o que mudaria esse cenário no futuro).

## 8. Principais achados da pesquisa externa

- Confirmadas com boa confiança 11 das 13 linhas de caderno pesquisadas, com fonte oficial de fabricante (Tilibra, Jandaia) sempre que existia.
- 2 linhas ficaram com confiança baixa/média e precisam de revisão: **Strong** (divergência entre o ticket e a fonte oficial) e **"Mais+"** (dúvida real se é uma linha oficial batizada ou um termo informal de gôndola — reforçada pela foto, que mostra estampas sem relação clara com esse nome).
- São Domingos não tem site institucional facilmente localizável — a pesquisa dessa marca usou múltiplos varejistas concordantes, registrado explicitamente como confiança média, nunca escondido (Documento 02).

## 9. Principais correspondências encontradas no histórico do ShopControl

Do cruzamento ao vivo dos 67 itens do histórico de vendas (9 tickets, 15-21/09/2026) contra o catálogo (Documento 06):
- **14 correspondências confirmadas** por SKU exato.
- **18 correspondências prováveis** — mesma marca/linha, mas variação de tamanho/cor não cadastrada, ou (achado relevante) produto com **nome idêntico já cadastrado, mas sem SKU preenchido** (5 casos: Cola Glitter, Massa E.V.A Make+, Grafite Faber Castell 0.9, Cola Silicone Jocar 60ml, Tela Souza/Roma 30x30) — isso é uma falha de dado a corrigir, não um produto ausente.
- **35 sem correspondência** — na maioria, itens de artesanato/hobby/infantil (tintas, E.V.A, avental, brinquedos, telas de pintura) que a loja vende no balcão mas que não fazem parte do escopo atual do catálogo do agente.

## 10. Produtos mais relevantes segundo o histórico

Com a ressalva do ponto 12 abaixo: a única repetição observável na amostra foi de **E.V.A liso cores 2mm** e **Rolo de espuma Condor**, cada um vendido em 2 tickets distintos dentro da mesma semana. Não há base estatística pra chamar isso de "mais vendido" — é o único sinal de repetição que a amostra permite reportar, registrado como tal (Documento 06).

## 11. Problemas encontrados na base atual do catálogo

- **Sub-representação de variantes de cor/estampa em cadernos**: antes desta rodada, o catálogo tinha só 1 SKU por linha de caderno na maioria dos casos, enquanto o ShopControl trata cada cor como produto separado — um cliente perguntando por "caderno D+ vermelho" não teria correspondência antes desta rodada, mesmo a loja tendo o produto físico (Documento 03).
- **SKU vazio em produtos já cadastrados** (5 casos identificados via histórico, ponto 9 acima) — compromete qualquer cruzamento automático futuro por código.
- **Categoria de artesanato/hobby ausente do catálogo do agente** — a amostra do histórico revelou que a loja vende fisicamente tintas, E.V.A, massinha, aventais e brinquedos que o catálogo do Agente de Vendas simplesmente não cobre.
- **Fotos que não identificam um SKU específico de forma confiável** — a maioria das fotos de cadernos espirais mostra várias estampas por linha, não uma por produto (Documento 04).

## 12. Informações ainda faltando

- Pesquisa profunda de características para os 78 itens do cadastro leve (Documento 07).
- Resolução das 2 inconsistências foto×nome de arquivo (D+ 48fls, Sapeca Fem) e da suspeita de imagem duplicada (cores lisas 48/96fls).
- Foto do caderno Raptor (nenhuma na pasta).
- Amostra de histórico de vendas maior (1 semana / 9 tickets é insuficiente pra sazonalidade ou ranking real de produtos, ver Documento 06).
- Confirmação humana sobre se "Mais+" é uma linha oficial e resolução da divergência técnica da linha Strong.

## 13. Sugestões pra próxima etapa da arquitetura catálogo/RAG

- Rodar uma segunda leva de pesquisa externa para os 78 itens pendentes, reaproveitando exatamente a metodologia do Documento 02.
- Corrigir os 5 SKUs vazios encontrados via histórico antes de repetir cruzamentos automáticos por código.
- Decidir, com o dono, se vale abrir uma categoria de artesanato/hobby no catálogo do agente ou manter o escopo restrito à papelaria escolar/office.
- Pedir ao ShopControl um export de 2-3 meses de vendas reais para permitir uma análise de sazonalidade que a amostra desta rodada não sustenta.
- Só depois de resolver as pendências de imagem (ponto 12) faz sentido subir fotos para o Supabase Storage e popular `produtos.imagem_url` em massa.
- Manter a separação estática/dinâmica (Documento 01, seção 4) como regra obrigatória de qualquer nova rodada de RAG: preço e estoque nunca em texto de treinamento.

## 14. Base de conhecimento entregue

7 documentos em `DOCUMENTAÇÃO/base-conhecimento-rag/`:
- `01-base-de-conhecimento-produtos.md` — metodologia e visão geral
- `02-cadernos-e-materiais-escolares.md` — as 13 linhas de caderno pesquisadas, com fonte e confiança
- `03-catalogo-atualizado.md` — cruzamento completo pasta × catálogo
- `04-mapeamento-produto-imagem.md` — as 14 fotos, correspondências e inconsistências
- `05-atualizacao-de-precos.md` — rastreabilidade de preço e o conflito resolvido
- `06-inteligencia-historico-vendas.md` — cruzamento real dos 67 itens do histórico
- `07-produtos-pendentes-validacao.md` — os 78 itens do cadastro leve, agrupados

Mais 2 migrações SQL já aplicadas ao vivo no Supabase (`extensao_catalogo_cadernos_pesquisados_21-09.sql`, `extensao_catalogo_produtos_novos_leves_21-09.sql`) e o `README.md` do schema atualizado com os itens #47 e #48.

## 15. Estado final do catálogo

**823 produtos** no Supabase (724 antes desta rodada + 99 novos), confirmado por contagem ao vivo. Nenhuma foto foi enviada pro Storage nesta rodada — decisão explícita de escopo, documentada no Documento 04.
