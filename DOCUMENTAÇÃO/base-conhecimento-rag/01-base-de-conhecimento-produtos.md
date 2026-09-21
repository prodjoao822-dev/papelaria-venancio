# 01 — Base de Conhecimento de Produtos

**Origem desta base:** análise de 10 tickets de venda balcão do ShopControl (pasta `JOÃO VICTOR (produtos)/produtos agente de IA/`), cruzados com o catálogo ao vivo do Agente de IA (Supabase `produtos`, 724 itens antes desta rodada). Executado em 21/09/2026.

**Como ler este documento:** ele explica a METODOLOGIA e separa claramente o que é conhecimento estável do produto (o que vai para a base do agente) do que é dado dinâmico (nunca deve ser "decorado" pela RAG). Os documentos 02 a 07 trazem o conteúdo específico de cada frente.

---

## 1. O que a pasta realmente continha

A pasta não trouxe catálogos de fabricante nem fichas técnicas prontas — trouxe **10 tickets de venda balcão reais do ShopControl** (ERP da loja), um por categoria de produto, todos gerados pelo próprio dono em 19-21/09/2026 (vendedor "JOAO VICTOR MONTEIRO DE", cliente genérico "370 - VENDAS BALCAO"). Cada ticket lista, por categoria, um item de cada produto físico da prateleira, com **código (SKU real do ERP), nome e preço atual**. Na prática, é um snapshot confiável de SKU + preço direto da fonte — não um material de marketing.

| Ticket | Itens | Valor total do ticket |
|---|---|---|
| Canetas | 22 | R$160,29 |
| Borracha e apontador | 11 | R$67,86 |
| Canetinha | 9 | R$260,87 |
| Giz de cera | 8 | R$100,42 |
| Lápis de cor | 15 | R$433,84 |
| Lápis, lapiseira e grafite | 16 | R$125,26 |
| Marca texto | 18 | R$223,78 |
| Cadernos espirais (estampas genéricas) | 5 | R$175,85 |
| Caderno brochurão cores lisas TILIBRA (D+) | 10 | R$109,90 |
| Cadernos brochura (estampas genéricas) | 8 | R$354,80 |
| **Total** | **122** | — |

Além disso, **14 fotos de cadernos** (5 da pasta Espiral, 9 da pasta Brochura) com nomes de arquivo já descritivos (marca + linha + folhas) — ver Documento 04.

## 2. Cruzamento com o catálogo (resultado resumido — detalhe completo no Documento 03)

| | Total | Já existia (preço confirma) | Já existia (preço divergia) | Novo |
|---|---|---|---|---|
| **122 itens da pasta** | 122 | 22 | 1 | **99** |

Dos 99 novos: **21 são cadernos** (receberam pesquisa externa profunda, ver Documento 02) e **78 são os demais** (canetas, borracha/apontador, canetinha, giz de cera, lápis de cor, lápis/lapiseira/grafite, marca texto — receberam cadastro leve, sem pesquisa de característica nesta rodada; ver Documento 07).

## 3. Metodologia aplicada (fiel ao pedido original)

Ordem seguida, sem pular etapas:

`arquivos → análise → identificação → pesquisa → validação → estruturação → catálogo → imagens → preços → inteligência de vendas → base de conhecimento`

- **Análise/identificação**: leitura completa dos 10 tickets (texto extraído diretamente do PDF, não OCR aproximado — os tickets são PDFs com camada de texto real), conferência item a item.
- **Pesquisa**: pesquisa externa via site oficial do fabricante (Tilibra, Jandaia) sempre que existia; quando não existia site institucional localizável (São Domingos), usados múltiplos varejistas com specs concordantes, e isso foi **documentado como confiança média**, nunca escondido.
- **Validação**: nenhuma característica foi inventada. Duas linhas de caderno (Strong e Mais+) tiveram divergência/lacuna real entre o que o ticket mostra e o que a fonte oficial confirma — documentado explicitamente no produto e no Documento 02, marcado como "precisa validação"/"confiança baixa" quando aplicável.
- **Estruturação → catálogo**: os 99 produtos novos já foram inseridos na tabela `produtos` do Supabase (fonte de verdade operacional do agente) — ver migrações `extensao_catalogo_produtos_novos_leves_21-09.sql` e `extensao_catalogo_cadernos_pesquisados_21-09.sql`.
- **Imagens/preços/inteligência de vendas**: Documentos 04, 05 e 06.
- **Base de conhecimento**: este conjunto de 7 documentos, pensado para virar fonte de uma RAG comercial — não uma lista técnica, mas material pensado para o agente **conversar** sobre os produtos.

## 4. Separação conhecimento estável × dado dinâmico (regra estrutural, vale para TODOS os documentos)

Esta base **nunca** deve embutir na RAG um valor que muda com frequência. A regra usada em todo o conjunto:

### Conhecimento do produto (RAG pode/deve memorizar)
- O que é, características físicas, especificações técnicas (folhas, gramatura, encadernação, matérias)
- Marca, modelo/linha, categoria
- Diferenciais comerciais (licenciamento, sustentabilidade, público-alvo)
- Variações existentes (cores, formatos)

### Dado dinâmico (a RAG nunca deve "decorar" — sempre consultar a fonte ao vivo)
- **Preço** → sempre `produtos.preco` no Supabase, nunca um valor fixado num texto de treinamento
- **Estoque/disponibilidade** → `produtos.estoque`, e a política já vigente do Agente de Vendas (nunca menciona estoque ao cliente, ver `politica-produto-nao-encontrado.md`)
- **Promoções, condições comerciais** → não existe estrutura pra isso ainda; se vier a existir, vai numa tabela própria, nunca num texto estático
- **Localização física na loja** → não mapeado nesta rodada

Na prática, cada produto novo já foi cadastrado com essa separação: o `descricao` no Supabase carrega o conhecimento estável (o texto que you lê nos Documentos 02/07), e `preco` fica na coluna própria — a RAG, quando for montada, deve puxar preço da tabela em tempo de resposta, nunca do texto do documento de conhecimento.

## 5. O que NÃO foi feito nesta rodada (documentado, não escondido)

- **Upload de fotos pro Supabase Storage** — as 14 fotos continuam só localmente. O pedido original foi "documentar o que precisa ser feito", não processar as imagens — ver Documento 04.
- **Pesquisa profunda dos 78 itens não-caderno** — decisão do dono (21/09/2026): cadernos primeiro, o resto entra num cadastro leve agora e pesquisa depois — ver Documento 07.
- **Inteligência de vendas robusta** — a pasta "HISTORICO DE VENDAS" só tinha uma amostra de 1 semana (9 tickets), insuficiente para sazonalidade/produto mais vendido de verdade — ver Documento 06, que já registra essa limitação explicitamente em vez de forçar uma conclusão que os dados não sustentam.
