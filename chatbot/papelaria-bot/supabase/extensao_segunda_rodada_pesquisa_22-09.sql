-- =====================================================================
-- VENÂNCIO — TAREFA 21/09/2026, segunda rodada (22/09/2026)
-- =====================================================================
-- Pesquisa externa profunda dos 78 produtos que ficaram com a tag
-- `pendente_pesquisa` (Documento 07 da base de conhecimento), mais
-- revalidação das 2 linhas de caderno com confiança baixa/média
-- (Strong, Mais+ — Documento 02). Metodologia idêntica à rodada
-- anterior: site oficial do fabricante > varejistas concordantes,
-- nunca inventar característica, registrar Fonte/Confiança por linha.
-- Detalhe completo por linha, com URLs de fonte, no Documento 08
-- (DOCUMENTAÇÃO/base-conhecimento-rag/08-segunda-rodada-pesquisa.md).
--
-- Estes 78 produtos JÁ EXISTIAM na tabela (cadastro leve da primeira
-- rodada) — esta migração é só UPDATE de descricao/tags, nunca INSERT.
-- =====================================================================

with pesquisados(sku, descricao, tags) as (values

  -- ===== BORRACHAS E APONTADORES =====
  ('44745','Apontador com depósito, corpo triangular ergonômico (facilita a pegada), lâmina de aço temperado, sistema de fechamento que evita vazamento de resíduo, depósito espaçoso. Disponível em tons pastel (azul, verde, rosa, lilás). Fonte: site oficial Faber-Castell.',
   array['confirmado_site_oficial']),
  ('4387','Apontador com depósito da Faber-Castell. "Since 1761" é o ano de fundação da marca, impresso como selo de heritage na embalagem — não é o nome comercial de uma linha específica localizada no catálogo oficial (43 produtos de apontador revisados, nenhum batizado assim). Não repassar característica técnica específica ao cliente sem confirmar o modelo físico na loja.',
   array['precisa_validacao']),
  ('62827','Apontador 1 furo, com depósito, material polipropileno, lâmina de aço carbono resistente, cores sortidas. Certificado INMETRO (registro 005883/2018). Fonte: site oficial Tilibra.',
   array['confirmado_site_oficial']),
  ('71782','Apontador 2 furos, com depósito, material polipropileno, lâmina de aço carbono. Existe em várias versões temáticas (Panda, Doodles, Magic) dentro da família "2 furos com depósito" da Tilibra. Certificado INMETRO (registro 003713/2022). A variante exata "bicho sortido" não foi localizada por esse nome específico — pode ser uma das versões temáticas ou um sortimento delas. Fonte: site oficial Tilibra.',
   array['confianca_media']),
  ('68799','Borracha branca, tamanho padrão "40" (aprox. 3,3 x 2,3 x 0,8cm) — convenção de tamanho (0/20/40/60) usada por toda a indústria de borrachas escolares (Mercur, Tilibra, Leo e Leo também vendem "branca 40"). Não foi localizada página de produto específica da Sky Paper para este item.',
   array['confianca_baixa']),
  ('2102','Nome comercial oficial é "FC Max Glitz" (o ticket registra "Glitter" — mesmo produto). Fórmula PVC-free, alto desempenho de apagamento, tampa protetora contra sujeira, acabamento com glitter, cores vibrantes/neon. Fonte: site oficial Faber-Castell.',
   array['confirmado_site_oficial']),
  ('10077','Dimensões 42 x 21 x 11mm, tampa protetora vermelha, material borracha sintética PVC-free, carga inerte e pigmentos. Linha "FC Max" também existe em tamanho grande e em tons pastel/black. Página oficial desta variante específica (pequena branca) não localizada — confirmado por varejistas concordantes.',
   array['confianca_media']),
  ('2007','Formato com pontas chanfradas (cantos), textura mais macia que o padrão Mercur, cores sortidas (rosa, verde, azul, amarelo, laranja, roxo), não mancha o papel. Feita com látex de seringueira (parte do látex vem do Projeto Seringueira Nativa, apoio a comunidades extrativistas do Pará); reformulação em andamento trocando carga mineral por fécula de mandioca (até 75% renovável).',
   array['confianca_media']),
  ('4088','Formato retangular, tamanho "20" (entre Zero e 40 na escala Mercur), macia e lisa, aplicável a qualquer graduação de grafite. Composta de borracha natural, borracha sintética, carga, agente de vulcanização, pigmento e óleo — certificada INMETRO (Portaria 333/2012). Reformulação recente trocando carga mineral por farinha de mandioca (até 77% renovável), menos "borrinha" ao apagar. Fonte: central de atendimento oficial Mercur.',
   array['confirmado_site_oficial']),
  ('250','Mesma linha Record da Mercur, tamanho "40" (aprox. 3,3 x 2,3 x 0,8cm, classificação "média"). Mesma composição e mesma reformulação renovável da Record 20. Fonte: central de atendimento oficial Mercur.',
   array['confirmado_site_oficial']),

  -- ===== CANETAS, CANETINHAS E MARCA-TEXTO =====
  ('38672','Caneta apagável Frixion — esferográfica ponta 0,7mm em aço inox/tungstênio, tinta térmica que desaparece a aprox. 60°C (fricção da borrachinha na tampa gera calor) e retorna a -10°C, recarregável (carga Frixion Ball 0.7), grip emborrachado. Não indicada para documentos oficiais/provas, pois a tinta pode desaparecer com calor ou atrito não intencional. Fonte: site oficial Pilot.',
   array['confirmado_site_oficial']),
  ('31167','Mesma linha Frixion (ver SKU 38672), cor azul claro. Fonte: site oficial Pilot.', array['confirmado_site_oficial']),
  ('38671','Mesma linha Frixion (ver SKU 38672), cor preto. Fonte: site oficial Pilot.', array['confirmado_site_oficial']),
  ('38775','Mesma linha Frixion (ver SKU 38672), cor rosa. Fonte: site oficial Pilot.', array['confirmado_site_oficial']),
  ('38776','Mesma linha Frixion (ver SKU 38672), cor vermelha. Fonte: site oficial Pilot.', array['confirmado_site_oficial']),
  ('28813','Mesma linha Frixion (ver SKU 38672), cor violeta. Fonte: site oficial Pilot.', array['confirmado_site_oficial']),
  ('236','Esferográfica clássica, corpo hexagonal transparente, esfera de tungstênio, tinta seca rápido, escreve até 2km, tampa ventilada (norma de segurança). Não foi possível confirmar com certeza se o modelo vendido é a "Cristal" clássica de ponta média ou outra variante da linha — nome do ticket não especifica.',
   array['confianca_media']),
  ('67999','Ponta agulha 0.7mm, esfera de aço inoxidável, tinta gel de secagem rápida, corpo longo (aprox. 17,5cm) com design listrado, tampa ventilada com clipe. Cor azul. Marca sem site institucional de produto individual localizado.',
   array['confianca_media']),
  ('67996','Mesma linha CIS Spiro gel (ver SKU 67999), cor rosa.', array['confianca_media']),
  ('70160','Ponta de aço 0.7mm com esfera de tungstênio, corpo sextavado transparente (permite ver o nível de tinta e não rola na mesa), escreve até 5km, certificada INMETRO. Cor azul. Fonte: site oficial Compactor.',
   array['confirmado_site_oficial']),
  ('70161','Mesma linha Compactor Basic (ver SKU 70160), cor preta. Fonte: site oficial Compactor.', array['confirmado_site_oficial']),
  ('70158','Mesma linha Compactor Basic (ver SKU 70160), cor vermelha. Fonte: site oficial Compactor.', array['confirmado_site_oficial']),
  ('69975','Linha de entrada mais simples da Compactor (corpo fino, "Economic"). Não foi localizada uma ficha técnica própria distinta da linha Basic — características descritas por extrapolação da mesma marca, não confirmadas para este modelo específico. Cor azul.',
   array['confianca_baixa','precisa_validacao']),
  ('69977','Mesma linha Compactor Economic (ver SKU 69975), cor vermelha.', array['confianca_baixa','precisa_validacao']),
  ('15036','Corpo triangular ergonômico transparente (permite visualizar o nível de tinta), ponta com esfera de tungstênio, tinta de longa duração, escrita macia sem falhas. Cor azul. Fonte: site oficial Faber-Castell.',
   array['confirmado_site_oficial']),
  ('30939','Mesma linha Trilux (ver SKU 15036). O nome cadastrado "vermelha/azul" não corresponde a nenhuma variante bicolor oficial encontrada — o site oficial mostra as cores individualmente. Pode ser um kit com uma caneta de cada cor, ou uma variante regional não indexada, ou um erro de cadastro. Não descrever como "caneta bicolor" ao cliente sem confirmar o produto físico.',
   array['precisa_validacao']),
  ('43730','Sistema "Vai e Vem": ponta retrátil por pressão (não afunda ao guardar), tinta lavável à base de água, atóxica, tampa ventilada, 36 cores incluindo 4 tons neon, espaço para escrever o nome do usuário. Mecanismo e composição confirmados na linha oficial de 12 cores; a variante de 36 cores específica não tem página própria localizada no site oficial (confirmada via varejistas concordantes).',
   array['confianca_media']),
  ('41670','Corpo redondo, carga à base de água, ponta de fibra de poliéster, atóxica e lavável, certificada INMETRO. Traço médio ~1mm, descrita pelo fabricante como "super-resistente" (não achata nem afunda a ponta). Não recomendado para menores de 3 anos (peças pequenas). Fonte: portal institucional B2B da BRW.',
   array['confianca_media']),
  ('43835','Linha básica da mesma família CA8003 (ver SKU 41670), 12 cores específicas: azul-escuro, azul-claro, verde-escuro, verde-claro, amarelo, laranja, vermelho, rosa, roxo, lilás, marrom, preto. Fonte: portal institucional B2B da BRW.',
   array['confianca_media']),
  ('4376','Canetinha hidrográfica lavável e atóxica da Faber-Castell. Existe possibilidade de este item corresponder à linha "12 Cores" tradicional (página oficial própria) ou à linha "Bicolor" — não foi possível confirmar com certeza qual delas é o produto físico vendido sob este nome.',
   array['precisa_validacao']),
  ('1810','Existem 2 produtos oficiais candidatos para "24 cores": a linha Bicolor (12 canetas físicas = 24 cores, ponta cônica com 2 espessuras de traço) ou uma hidrocor tradicional de 24 cores avulsas. Não repassar a característica "2 cores em 1" ao cliente até confirmar qual é o produto físico da loja.',
   array['precisa_validacao']),
  ('17855','Ponta 2.0mm, traço 1mm, corpo redondo na cor da tinta, tampa antiasfixiante, atóxica certificada, comprimento 140mm. Marca sem página institucional de produto individual localizada — confirmado por varejistas concordantes.',
   array['confianca_media']),
  ('72251','Tinta à base de água atóxica, ponta de 2mm resistente, não recarregável, lavável, certificada INMETRO (Portaria 333/2012). Cores incluem amarelo, azul, azul-claro, cinza, laranja, marrom, preto, rosa, roxo, verde, verde-claro, vermelho. Página de produto específica não localizada diretamente no site oficial da Pilot — confirmada via varejistas.',
   array['confianca_media']),
  ('70601','Corpo robusto e ponta grossa ("jumbo"), tampa antiasfixiante, composição resina termoplástica + carga à base de água + ponta de fibra de poliéster, atóxica. A pesquisa só confirmou a existência da versão 12 cores jumbo da marca — a versão de 24 cores (nosso SKU) não foi confirmada especificamente. Não afirmar "jumbo 24 cores" como fato ao cliente sem validação adicional.',
   array['confianca_baixa','precisa_validacao']),
  ('25886','Ponta chanfrada (traço 1-4mm), corpo em perfil "D" (lado cilíndrico + lado plano de apoio pro polegar), tampa reversível para destros/canhotos, tinta resistente a UV (não desbota). Cor azul — não aparece explicitamente na lista oficial de cores da linha (5 neon + 6 pastel) encontrada nesta pesquisa; pode ser cor descontinuada ou regional. Fonte: site oficial Compactor (mecânica geral da linha).',
   array['confirmado_site_oficial','precisa_validacao']),
  ('25888','Mesma linha Compactor Destaq (ver SKU 25886), cor laranja.', array['confirmado_site_oficial']),
  ('25887','Mesma linha Compactor Destaq (ver SKU 25886), cor rosa.', array['confirmado_site_oficial']),
  ('34956','Mesma linha Compactor Destaq (ver SKU 25886), cor verde.', array['confirmado_site_oficial']),
  ('67481','Mesma base técnica da linha Destaq (ponta chanfrada, corpo em "D"), com perfume frutado (morango, laranja, uva). Kit com 4 unidades (composição de cor sortida). Fonte: site oficial Compactor, linha Fruit-Tella.',
   array['confirmado_site_oficial']),
  ('66177','Corpo de resina termoplástica, ponta chanfrada 1-4mm (a versão pastel varia 1-3,5mm), corpo ergonômico "slim" (mais fino que o padrão de mercado), atóxico, tinta de secagem rápida. Marca sem site institucional de produto localizado.',
   array['confianca_media']),
  ('65281','Ponta chanfrada 4.0mm, composição resina termoplástica + tinta à base de glicol/corante/água, atóxico, lavável. Fonte: site oficial Maxprint.',
   array['confirmado_site_oficial']),
  ('40974','Nome comercial completo é "Lumi Color 200-SL". Ponta chanfrada de poliéster 4.0mm (traço 3,8mm), tinta fluorescente de alta intensidade, traçado duplo (fino para sublinhar, grosso para destacar), não recarregável. A lista oficial de cores da linha cita 5 tons (amarelo, azul, laranja, rosa, verde) — o catálogo tem "violeta", que não bate exatamente com essa lista; pode haver uma variante regional. Cor azul. Fonte: site oficial Pilot.',
   array['confirmado_site_oficial']),
  ('15560','Mesma linha Pilot 200-SL/Lumi Color (ver SKU 40974), cor laranja.', array['confirmado_site_oficial']),
  ('40975','Mesma linha Pilot 200-SL/Lumi Color (ver SKU 40974), cor rosa.', array['confirmado_site_oficial']),
  ('15561','Mesma linha Pilot 200-SL/Lumi Color (ver SKU 40974), cor violeta — cor não confirmada na lista oficial de 5 tons da linha (ver observação no SKU 40974).', array['confirmado_site_oficial','precisa_validacao']),
  ('46699','Provavelmente um estojo/kit com 4 unidades da linha Original Stabilo Boss (preço R$49,99 é compatível com 4 canetas avulsas a R$14,99 cada). Página oficial específica de um "estojo c/4" isolado não foi localizada.',
   array['confianca_media']),
  ('65478','Variante sustentável da linha Boss: corpo 100% plástico reciclado, embalagem reciclada/reciclável, cores em tons terrosos (ex.: Lama Verde, Âmbar, Cinza Quente), inclui preto como "esconde-texto". Tecnologia Anti-Dry-Out (fica destampado até 4h sem secar). Fonte: site oficial Stabilo.',
   array['confirmado_site_oficial']),
  ('17728','Linha clássica Stabilo Boss, referida como "nº1 da Europa desde 1971". Ponta chanfrada com 2 larguras de traço (2mm e 5mm), tinta à base d''água, tecnologia Anti-Dry-Out, recarregável. Disponível em 9 cores fluorescentes + 14 tons pastel + 7 tons "natureza". Fonte: site oficial Stabilo.',
   array['confirmado_site_oficial']),

  -- ===== GIZ DE CERA (Acrilex) =====
  ('69127','140g, formato anatômico (arredondado), ceras de alta qualidade, cobertura total e traços vívidos. 15 cores: preto, marrom, roxo, azul marinho, azul claro, verde, verde claro, vermelho, bordô, laranja, rosa, bege, amarelo, amarelo queimado, branco. Formato "Big" (bastão maior/mais grosso que a linha comum), ajuda coordenação motora. Público infantil/pré-escola.',
   array['confianca_media']),
  ('38647','Nome comercial oficial "Fantasy Glitter Jumbo Wax Crayon" (Big Giz de Cera Fantasia Glitter com efeito Neon). 52g, 6 cores neon com efeito glitter (amarelo neon, laranja, "maravilha", vermelho, verde, azul), formato grande/anatômico, textura leve e macia. É a única das 8 linhas com efeito glitter/neon. Fonte: página oficial Acrilex (nome e referência confirmados).',
   array['confirmado_site_oficial']),
  ('1287','Linha "comum" (não Big, não triangular, não retrátil), formato redondo padrão, atóxico, lavável (não mancha as mãos), traço macio, resistente à quebra. Público pré-escolar/escolar.',
   array['confianca_media']),
  ('764','Versão reduzida (6 cores) da linha comum Acrilex, formato redondo padrão, atóxico, composição de ceras + cargas minerais inertes + pigmentos. Público pré-escolar.',
   array['confianca_media']),
  ('4369','Nome comercial "Curton". 68g, formato curto e triangular (3 faces), anatômico, atóxico, não mancha as mãos. Recomendado a partir de 3 anos (contém peças pequenas). O formato triangular ajuda a segurar corretamente e evita rolar na mesa.',
   array['confianca_media']),
  ('39530','Formato curto e triangular, 5,5cm de comprimento, 3 faces de apoio dos dedos, anatômico, atóxico, traço macio. Versão mais curta do conceito triangular (comparar com SKU 2566).',
   array['confianca_media']),
  ('2566','Nome comercial "Big Giz de Cera Triangular". 95g, formato triangular de tamanho maior (versão "grande" do conceito, não a versão curta), 3 faces de apoio dos dedos, anatômico, atóxico.',
   array['confianca_media']),
  ('27856','Mecanismo retrátil por torção — recolhe/avança a cera girando, sem precisar apontar, elimina resíduo de casca quebrada. Formato anatômico, traço macio, atóxico, 12 cores. Único das 8 linhas com mecanismo mecânico em vez de bastão exposto. Fonte: página oficial Acrilex (nome comercial "Giz de Cera Retrátil Twist" confirmado).',
   array['confirmado_site_oficial']),

  -- ===== LÁPIS DE COR =====
  ('71184','Lápis de madeira, formato hexagonal (pegada anatômica, evita deslizar/cair da mesa), mina de 2,9mm. Este SKU é o kit: 12 lápis de cor + 1 lápis grafite HB nº2 + 1 apontador. Fonte: site oficial Compactor.',
   array['confirmado_site_oficial']),
  ('22332','Lápis aquarelável — ao passar pincel molhado por cima, cria efeito aquarela; cores miscíveis entre si, do claro ao escuro. Corpo sextavado, mina resistente e macia, ref. 09652 (12 cores). Fonte: página oficial Acrilex (em inglês) + varejistas concordantes.',
   array['confianca_media']),
  ('19201','Mesma linha aquarelável Acrilex (ver SKU 22332), versão 24 cores, ref. 09654.', array['confianca_media']),
  ('62936','Corpo sextavado, mina de 2,7mm, resina termoplástica não tóxica (não é madeira, é reciclado/resina). Certificado INMETRO. 12 cores. Marca sem site institucional facilmente localizável — confirmado por varejistas concordantes.',
   array['confianca_media']),
  ('39048','Resina plástica reciclada, formato sextavado, mina resistente (boa resistência à quebra), boa apontabilidade. Certificado INMETRO, atóxico. Fonte: site oficial BRW.',
   array['confirmado_site_oficial']),
  ('47037','24 cores tradicionais + 4 cores pastel (28 lápis no total). Formato sextavado, Técnica Sekural (colagem reforçada mina-madeira, mais resistente a quebra). Madeira 100% reflorestada, certificação FSC. Atóxico, certificado INMETRO (Portaria 333/2012). Fonte: loja oficial Faber-Castell.',
   array['confirmado_site_oficial']),
  ('41855','Linha "Caras e Cores" — desenvolvida para celebrar diversidade: cores clássicas + lápis com 6 tons de pele misturáveis entre si, embalados em 3 lápis bicolores (não são 6 lápis avulsos). Formato sextavado (Ecolápis), madeira 100% reflorestada/FSC, atóxico. Descrever ao cliente como "6 tons de pele em formato Caras e Cores", sem afirmar o número exato de lápis físicos. Fonte: site oficial Faber-Castell.',
   array['confirmado_site_oficial']),
  ('41856','Mesma linha Caras e Cores (ver SKU 41855), versão maior (24 cores + tons de pele). Fonte: site oficial Faber-Castell.', array['confirmado_site_oficial']),
  ('4341','Produto DIFERENTE da linha "Caras e Cores" apesar do preço idêntico: kit com 12 cores clássicas + 2 lápis grafite + 1 apontador + 1 borracha, sem tons de pele. Ecolápis sextavado, madeira reflorestada/FSC, atóxico, reciclável. Fonte: loja oficial Faber-Castell.',
   array['confirmado_site_oficial']),
  ('61103','12 cores, corpo triangular ergonômico (175mm de altura, 7,2mm de largura), aquarelável (efeito aquarela ao molhar com o pincel incluso), ponta macia. Vem com apontador e pincel de cerdas macias. Atóxico, certificado INMETRO. Marca sem site institucional de especificação técnica localizado — confirmado por varejistas concordantes.',
   array['confianca_media']),
  ('23145','Lápis de madeira hexagonal, mina 2,9mm, linha Neo Pen, 12 cores. Fonte: site oficial Compactor.', array['confirmado_site_oficial']),
  ('23146','Mesma linha Neo Pen Compactor (ver SKU 23145), versão 24 cores.', array['confirmado_site_oficial']),
  ('28967','Mesma linha Neo Pen Compactor (ver SKU 23145), versão 36 cores.', array['confirmado_site_oficial']),
  ('28968','Mesma linha Neo Pen Compactor (ver SKU 23145), versão 48 cores.', array['confirmado_site_oficial']),
  ('39121','ATENÇÃO — não é lápis de cor: é lápis grafite comum (graduação 2B), com o cabo pintado em cor neon (linha "Ecolápis Grafite Max Neon"). Serve para escrita, não para colorir — a cor é só do cabo, não da mina. Ponta "MAX Resistente" (micropartículas ativas, mais resistência e apagabilidade), Técnica Sekural, madeira reflorestada/FSC, atóxico. A categoria "Lápis" do catálogo já reúne lápis de cor e lápis grafite (outros Ecolápis Grafite estão cadastrados na mesma categoria), então não precisa mudar de categoria — só não deve ser oferecido ao cliente como opção de "lápis de cor". Fonte: site oficial Faber-Castell.',
   array['confirmado_site_oficial']),

  -- ===== LAPISEIRAS E GRAFITES =====
  ('63808','Grafite hi-polymer (100% grafite, sem argila), espessura 2.0mm, graduação 2B, aprox. 8,5cm por unidade, tubo com 6 minas. Marca sem site institucional com ficha técnica própria localizada — confirmado por varejistas concordantes.',
   array['confianca_media']),
  ('69349','Espessura 3.0mm, graduação HB, minas de aprox. 30mm, tubo com 3 minas (venda ao consumidor). Diâmetro maior garante maior resistência à quebra sob pressão; traço equilibrado. Fonte: portal institucional B2B da BRW.',
   array['confianca_media']),
  ('4380','Linha "Grafite Técnico Polymer", espessura 0.5mm, tecnologia MAX resistente (menos quebra, maior maciez e apagabilidade), traço preto intenso. A Faber-Castell vende 0.5mm 2B e 0.5mm HB como dois produtos separados (páginas oficiais distintas) — não foi possível confirmar qual das duas graduações corresponde exatamente a este SKU cadastrado como "2B/HB" combinado; pode ser erro de digitação do ticket ou uma caixa que mistura as duas.',
   array['confirmado_site_oficial','precisa_validacao']),
  ('44810','Ponta fixa em metal 2.0mm, corpo com grip triangular ergonômico, clipe para prender em caderno/fichário, apontador embutido, grafite apontável. Cores em tons pastel sortidos. Fonte: portal institucional B2B da BRW.',
   array['confianca_media']),
  ('25878','Espessura 0.7mm, corpo plástico com clipe de metal, borracha integrada, agulha de limpeza, ponteira com minitubo retrátil, capacidade para 6 minas. Linha histórica/tradicional em escolas. Cores disponíveis: lilás, azul e rosa. Mecânica confirmada no site oficial Compactor; as 3 cores exatas vêm de varejista.',
   array['confirmado_site_oficial']),
  ('71694','Espessura 0.7mm, corpo hexagonal com acabamento metálico, grip emborrachado, mecanismo de avanço automático do grafite (sem necessidade de cliques). Cor preta. Fonte: site oficial Compactor.',
   array['confirmado_site_oficial']),
  ('68801','Espessura 0.7mm. O código de modelo "SK1303" não foi localizado em nenhuma fonte (nem site oficial, nem varejistas). As características descritas na linha genérica "0.7" da Sky Paper (corpo plástico resistente, avanço por clique, borracha integrada com capa protetora) não estão confirmadas especificamente para este modelo — recomenda-se validar o código físico na embalagem antes de publicar características.',
   array['precisa_validacao'])

)
update produtos p
set descricao = v.descricao,
    tags = array_remove(p.tags, 'pendente_pesquisa') || v.tags
from pesquisados v
where p.sku = v.sku;

-- =====================================================================
-- Revalidação de 2 linhas de caderno (Documento 02) — UPDATE, não INSERT
-- =====================================================================

update produtos
set descricao = 'Caderno brochura capa dura, 80 folhas, 1 matéria (inferido), linha Strong com estética camuflada, estilo jovem/masculino. REVALIDADO em 22/09/2026: o site oficial Tilibra confirma a linha "Strong" apenas como caderno ESPIRAL capa dura universitário multimatéria (10 ou 12 matérias, 160 ou 192 folhas) — divergência real de encadernação (espiral × brochura) e quantidade de folhas/matérias em relação ao que foi vendido no ticket (brochura, 80fls, 1 matéria implícita). Pode ser: (a) uma versão brochura/80fls não indexada na navegação principal do site, (b) "Strong" usado como nome de estampa/gôndola sem ser tecnicamente a linha oficial, ou (c) erro no ticket. Mantida confiança BAIXA — a divergência é grande demais (tipo de encadernação e contagem de folhas) para resolver sem comparar o caderno físico na loja. Não repassar detalhe técnico ao cliente antes dessa validação.',
    tags = array['precisa_validacao','confianca_baixa']
where sku = '70317';

update produtos
set descricao = 'Caderno espiral capa dura, 96 folhas, 1 matéria, com separador de matérias e folhas picotadas/pautadas. Papel 56g/m², formato 200x275mm, FSC. REVALIDADO em 22/09/2026: confirmado que a linha "Mais+" é um produto REAL da Tilibra (não apenas nome de gôndola) — encontrada via varejista autorizado (Armarinho São José) a ficha "Caderno Brochura 1/4 Capa Dura Mais+ Tilibra 48 Folhas" (capa dura, folhas pautadas, papel 56g/m², FSC, 140x200mm). PORÉM essa ficha diverge do item cadastrado aqui em 3 pontos: encadernação (brochura × espiral), folhas (48 × 96) e formato (140x200mm × 200x275mm). Não é possível confirmar se são a mesma linha em apresentações diferentes ou dois produtos "Mais+" distintos da Tilibra sem comparar o caderno físico. "Mais+" não aparece como uma das 19 coleções nomeadas na navegação principal do site oficial (é provavelmente uma linha básica/econômica sem identidade visual própria, ao contrário de D+/Strong/Hide etc.). Mantida confiança média, com nova ressalva de divergência de formato.',
    tags = array['confianca_media','precisa_validacao']
where sku = '9029';

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select count(*) from produtos where 'pendente_pesquisa' = any(tags);
-- -- deve ser 0.
-- select count(*) from produtos where tags && array['confirmado_site_oficial','confianca_media','confianca_baixa','precisa_validacao']
--   and sku in ('44745','4387','62827','71782','68799','2102','10077','2007','4088','250');
-- -- deve ser 10 (borrachas/apontadores).
-- select sku, tags from produtos where sku in ('70317','9029');
-- -- Strong deve ter precisa_validacao+confianca_baixa; Mais+ deve ter confianca_media+precisa_validacao.
-- =====================================================================
