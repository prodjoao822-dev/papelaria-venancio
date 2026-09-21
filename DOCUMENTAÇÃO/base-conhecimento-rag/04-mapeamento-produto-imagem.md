# 04 — Mapeamento Produto × Imagem

**O que este documento é:** o resultado de abrir e olhar, uma por uma, as 14 fotos que vieram na pasta (`produtos agente de IA/caderno Espiral/Fotos dos cadernos/` + `.../cadernos brochura/Fotos dos cadernos/`), comparando cada uma com o nome do arquivo e com o que a pesquisa externa (Documento 02) confirmou sobre cada linha. **Nenhuma foto foi editada, cortada ou enviada pro Supabase Storage nesta rodada** — o pedido original era documentar o que precisa ser feito, não processar as imagens.

**Achado central, que vale pra quase todo o lote:** a maioria das fotos de cadernos espirais "1 MAT [linha] [folhas]FLS" **não é uma foto de um SKU específico** — é uma foto de prateleira mostrando **várias estampas diferentes da mesma linha lado a lado**, com a marca da linha (Pepper/Vibe/etc.) visível claramente em só uma ou duas das capas fotografadas. Isso significa: a foto confirma "esse produto existe e é assim que a linha se parece", mas **não** prova qual estampa exata corresponde a qual SKU/cor específica do catálogo. Documentado explicitamente abaixo, linha por linha — não escondido.

---

## Correspondência exata (1 foto = 1 produto específico, sem ambiguidade)

| Arquivo | Linha / SKU | Confirmação |
|---|---|---|
| `CADERNO BROCHURAO TILIBRA GABRIEL MEDINA 80FLS.jpeg` | Tilibra Gabriel Medina 80fls (SKU 66612) | Capa única, sem variação: surfista no ar, camisa rosa "Jogos Olímpicos" — bate exatamente com a pesquisa externa (Documento 02). |
| `CADERNO JANDAIA STILO 80 FLS.jpeg` | Jandaia Stilo 80fls | Capa única preta lisa, logos "stilo" e "Jandaia" visíveis — bate exatamente. |

## Foto genérica confirmando a linha, mas com MÚLTIPLAS estampas (não 1:1 com SKU/cor)

| Arquivo | Linha | O que a foto mostra | Estampa com marca visível | Confiança de que é a linha certa |
|---|---|---|---|---|
| `CADERNO 1 MAT TILIBRA MAIS+ 96FLS.jpeg` | "Mais+" | 3 capas diferentes (tubarão, banda de rock, surfista) | Só a de surfista tem logo "D+" visível — nenhuma tem "Mais+" escrito | **Baixa** — reforça a dúvida já registrada no Documento 02 sobre "Mais+" ser ou não uma linha oficial separada |
| `CADERNO 1 MAT TILIBRA PEPPER 80 FLS.jpeg` | Pepper | 4 capas diferentes (futebol "This is my game", banda de rock, BMX "Let's ride", montanha "Adventure awaits") | A de montanha tem logo "PEPPER" visível | Média-alta — marca confirmada, estampa exata por SKU não |
| `CADERNO UNINV.ESPIRAL TILIBRA 1 MAT VIBE 80FLS.jpeg` | Vibe (feminino) | 3 capas diferentes (corações/pirulito, arco-íris pastel, "Ice Cream Lover") | A de sorvete tem logo "VIBE" visível | Média-alta — marca confirmada, estampa exata por SKU não |
| `CADERNO UNIV.ESPIRAL TILIBRA 1MAT VIBE MASC 80FLS.jpeg` | Vibe Masculino | 4 capas diferentes (esporte "Game Time", bateria "Hard Rock", BMX "Never Quit", skate "Born to Skate") | A de skate tem logo "VIBE" visível | Média-alta — marca confirmada, estampa exata por SKU não |
| `CADERNO BROCHURA TILIBRA STRONG 80FLS.jpeg` | Strong | 3 capas de camuflagem (laranja/azul, azul/amarelo, verde) | A verde tem "STRONG" + "tilibra" visíveis | Média — mesma linha já marcada como confiança baixa no Documento 02 por divergência de especificação |
| `CADERNO BROCHURAO TILIBRA X RACING 80 FLS.jpeg` | X-Racing | 3 capas de carro de corrida (edição "Santorini"/bandeira grega, "40° Rio", "Japan GP") | Todas têm "X RACING"; a do Japão tem "tilibra" visível | Alta — marca e linha confirmadas em todas as 3 capas |
| `CADERNO BROCHURA SÃO DOMINGOS PIXEL KRAFT 80FLS.jpeg` | São Domingos Pixel Kraft | 4 capas de jogos em pixel art (guerreiro-gato, aventura/baú, ninja plataforma, robô) | Todas as 4 têm "PIXEL KRAFT" visível | Alta — marca confirmada em todas as capas, mais consistente que os outros casos multi-estampa |

## Fotos genéricas de "cores lisas" (linha D+) — achado de possível duplicidade

| Arquivo | O que mostra |
|---|---|
| `CADERNO BROCHURA 96FLS.jpeg` | 5 cadernos de cor sólida (vermelho/azul/verde/amarelo/rosa), logo "D+" no canto inferior de cada um |
| `CADERNO BROCURA COR LISA 48 FLS.jpeg` | 5 cadernos de cor sólida (vermelho/azul/verde/amarelo/rosa), logo "D+" no canto inferior de cada um |

**Estas duas fotos parecem ser o mesmo conjunto físico fotografado (mesmas 5 cores, mesmo enquadramento, mesma posição do logo "D+")**, apesar dos nomes de arquivo sugerirem "96fls" e "48fls" separadamente. Não dá pra confirmar se são de fato duas fotos distintas de dois lotes (48 e 96 folhas) ou a mesma foto reaproveitada/salva duas vezes com nomes diferentes — **precisa de validação visual mais próxima (zoom/comparação pixel a pixel) antes de decidir se são a mesma imagem ou não**. Na dúvida, não tratar como comprovação de que existem fotos separadas para as versões 48fls e 96fls.

## Inconsistência encontrada — nome do arquivo não bate com o conteúdo da foto

| Arquivo | O que o nome sugere | O que a foto realmente mostra | Status |
|---|---|---|---|
| `CADERNO BROCHURAO TILIBRA D+ 48 FLS.jpeg` | Linha D+ cores lisas (mesma coisa que as duas fotos acima) | 2 cadernos **estampados**, não lisos: rosa "Happy Time" (gatos/cachorros) e azul "free hugs" (cactos), com logo "D+" visível no azul | **Precisa validação** — o nome de arquivo indica "D+ 48 FLS" (que segundo o ticket ShopControl e o catálogo é a linha de cor lisa), mas a imagem mostra estampas temáticas, não cor lisa. Pode ser (a) um erro de nomeação do arquivo, (b) uma variante estampada da linha D+ que não estava no escopo desta pesquisa, ou (c) confusão entre duas linhas D+ diferentes. **Não foi assumida nenhuma dessas hipóteses como fato** — fica registrado como pendência. |
| `CADERNO BROCHURAO TILIBRA SAPECA FEM 48FLS.jpeg` | Linha Sapeca Feminino | 2 cadernos da linha **"Kids" da Tilibra** (bichos da floresta em fundo verde; piquenique de bichos em fundo azul-piscina), com o logo "tilibra" + "Kids" visível — **nenhuma menção a "Sapeca" na foto** | **Precisa validação** — o arquivo foi nomeado como Sapeca Fem, mas a foto mostra claramente a linha "Kids", que é outra linha da Tilibra. Pode ser erro de nomeação do arquivo na origem, ou a loja pode chamar informalmente de "Sapeca" uma linha que oficialmente se chama "Kids" — **não confirmado em nenhuma fonte externa**, então este item entra como divergência a esclarecer antes de repetir a informação pro cliente. |

## Foto sem confirmação direta da marca na imagem

| Arquivo | Linha esperada | O que a foto mostra | Observação |
|---|---|---|---|
| `CADERNO TILIBRA SCORE 80 FLS.jpeg` | Score | 2 cadernos temáticos esportivos: basquete (laranja/azul) e futebol (colorido, bola em destaque), logo "tilibra" visível no de futebol | Tematicamente compatível com um nome "Score" (temas esportivos), mas a palavra "Score" **não aparece escrita em nenhuma das duas capas**. Trata-se de uma inferência razoável, não uma confirmação — mantido como confiança média, igual já constava no Documento 02. |

## Produto sem foto nenhuma na pasta

| SKU | Produto |
|---|---|
| 22631 | Tilibra Raptor 80fls (brochurão) |

Nenhum arquivo na pasta corresponde a este produto — não há como usar o mapeamento de imagem pra ele nesta rodada. Fica marcado como "sem imagem" pra fins do relatório final (item 11 da tarefa).

## Resumo quantitativo

| Categoria | Quantidade |
|---|---|
| Fotos totais na pasta | 14 |
| Correspondência exata (1 foto = 1 SKU, sem ambiguidade) | 2 |
| Foto genérica confirmando a linha, mas com múltiplas estampas (marca visível) | 7 |
| Par de fotos com suspeita de duplicidade (mesmo conteúdo, nomes diferentes) | 2 (tratadas como 1 achado) |
| Inconsistência nome de arquivo × conteúdo real da foto | 2 |
| Foto sem confirmação textual da marca na própria imagem | 1 |
| SKU cadastrado sem nenhuma foto correspondente | 1 (Raptor, SKU 22631) |

## O que precisa ser feito antes de usar estas fotos de forma automática (ex.: bot mandando foto pro cliente)

1. Resolver as duas inconsistências nome×conteúdo (D+ 48fls estampado, Sapeca Fem = Kids) — idealmente confirmando com quem fotografou ou comparando fisicamente com o produto na loja.
2. Confirmar se as duas fotos "cores lisas" são de fato duas fotos distintas ou uma duplicata salva com nomes diferentes.
3. Para as 7 linhas com foto multi-estampa, decidir a política do agente: ou (a) usar a foto só como "isso é como a linha X geralmente se parece", nunca afirmando que é a estampa exata do SKU pedido, ou (b) tirar fotos novas, uma por estampa/SKU, se o catálogo passar a diferenciar estampas como produtos individuais.
4. Providenciar uma foto para o Raptor (SKU 22631).
5. Só depois disso faz sentido subir as imagens pro Supabase Storage e popular `produtos.imagem_url` — não foi feito nesta rodada.
