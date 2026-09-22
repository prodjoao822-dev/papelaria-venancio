-- =====================================================================
-- VENÂNCIO — TAREFA 21/09/2026, resolução de pendências (22/09/2026)
-- =====================================================================
-- Pesquisa adicional, mais direcionada, sobre os 13 itens que ficaram
-- com `precisa_validacao` na segunda rodada. Resultado: 8 resolvidos
-- (evidência concreta encontrada), 5 continuam em aberto (pesquisa
-- reforçou a dúvida original, mas não decidiu — genuinamente precisam
-- de checagem física na loja). Detalhe completo no Documento 08
-- (seção atualizada) da base de conhecimento.
-- =====================================================================

-- ===== RESOLVIDOS =====

update produtos set
  descricao = 'Canetinha hidrográfica lavável e atóxica, linha "Colors/Hidrocor" tradicional (12 cores avulsas) — NÃO é a linha Bicolor. Resolvido por preço: R$16,99 cadastrado fica entre o mesmo produto na Amazon (R$14,99) e na Kalunga (R$17,20); a linha Bicolor da Faber-Castell só existe como "12 canetas = 24 cores", não como "12 cores" isolado. Fonte: faber-castell.com.br/products/CanetinhaHidrografica12Cores/550912 + varejistas concordantes por preço.',
  tags = array['confirmado_site_oficial']
where sku = '4376';

update produtos set
  descricao = 'Canetinha hidrográfica lavável e atóxica, linha "Colors/Hidrocor" tradicional (24 cores avulsas) — NÃO é a linha Bicolor ("2 cores em 1"). Resolvido por preço: R$34,99 cadastrado está muito mais próximo do Colors 24 Cores da Kalunga (R$35,50) do que da Bicolor 24 cores/12 canetas (R$29,60-52,60 conforme loja). Fonte: kalunga.com.br (Colors 24 Cores prod/191077).',
  tags = array['confianca_media']
where sku = '1810';

update produtos set
  descricao = 'Página oficial própria confirmada: "Esferográficas Economic" da Compactor (compactor.com.br/esferograficas-economic/), foco em custo-benefício, corpo sextavado transparente, disponível em 0.7mm (fina) e 1.0mm (média). Esta é a versão fina 0.7mm, cor azul, confirmada por nome idêntico em varejista. Fonte: site oficial Compactor.',
  tags = array['confirmado_site_oficial']
where sku = '69975';

update produtos set
  descricao = 'Mesma linha Compactor Economic Fina 0.7mm (ver SKU 69975), cor vermelha. Fonte: site oficial Compactor.',
  tags = array['confirmado_site_oficial']
where sku = '69977';

update produtos set
  descricao = 'Ponta chanfrada (traço 1-4mm), corpo em perfil "D", tampa reversível para destros/canhotos, tinta resistente a UV. Cor azul confirmada como produto real da linha Destaq (existe em variante pastel e em variante neon, ambas vendidas por varejistas de peso como "Destaq Azul") — a pesquisa anterior tinha pego uma lista de cores oficiais incompleta. Não é possível confirmar por esta pesquisa se o SKU cadastrado é a versão pastel ou a neon especificamente. Fonte: site oficial Compactor (mecânica) + Magazine Luiza/varejistas (confirmação da cor azul).',
  tags = array['confirmado_site_oficial']
where sku = '25886';

update produtos set
  descricao = 'Nome comercial completo "Lumi Color 200-SL". Ponta chanfrada de poliéster 4.0mm, tinta fluorescente de alta intensidade, traçado duplo (fino/grosso), não recarregável. Cor violeta confirmada como cor oficial da linha (página oficial pilotpen.com.br/produtos/758/ e múltiplos varejistas vendem "Lumi Color 200-SL Violeta") — a lista de cores da pesquisa anterior estava incompleta. Fonte: site oficial Pilot.',
  tags = array['confirmado_site_oficial']
where sku = '15561';

update produtos set
  descricao = 'Caderno brochura capa dura, 80 folhas, 1 matéria, papel offset 56g/m², estampa camuflada (verde, azul ou laranja). RESOLVIDO em 22/09/2026: o produto físico vendido no ticket como "Strong" corresponde à linha oficial da Tilibra chamada "Hide" (Caderno Brochura Hide Camuflado) — mesma encadernação, mesma contagem de folhas, mesmo papel, mesma estética camuflada. "Strong" (nome usado no ticket/loja) provavelmente é um apelido interno ou termo de gôndola para "estampa camuflada resistente"; o nome comercial real de fabricante é "Hide". "Strong" como linha oficial da Tilibra existe só em versão espiral multimatéria (produto diferente, já documentado antes). Fonte: casajoka.com.br (Caderno Brochura Hide Camuflado Verde 80 Folhas Tilibra) — correspondência física exata de características.',
  tags = array['confirmado_site_oficial']
where sku = '70317';

update produtos set
  descricao = 'Caderno espiral capa dura, 96 folhas, 1 matéria, com separador de matérias e folhas picotadas/pautadas. Papel 56g/m², formato 200x275mm, FSC. RESOLVIDO em 22/09/2026: confirmado como produto oficial real — varejista de peso (eFácil, produto p800105) vende exatamente "Caderno Capa Dura Universitário Espiral Mais+ 96 Folhas 1 Matéria Tilibra", batendo 100% com o cadastro (espiral, capa dura, 96fls, 1 matéria). A divergência encontrada na rodada anterior (uma versão brochura 48fls também existe, achada num outro varejista) não é um erro — "Mais+" é uma linha básica da Tilibra vendida em múltiplas apresentações (brochura pequena e espiral universitário), o mesmo padrão já conhecido da linha D+. Fonte: listagem eFácil (produto p800105).',
  tags = array['confirmado_site_oficial']
where sku = '9029';

-- ===== CONTINUAM EM ABERTO (reforçadas com o achado novo, tag mantida) =====

update produtos set
  descricao = 'Mesma linha Trilux (ver SKU 15036). CONTINUA EM ABERTO após pesquisa adicional: existem kits reais "Trilux azul+preta+vermelha" (3 canetas) vendidos por vários varejistas, mas o preço cadastrado (R$1,50) é MENOR que uma Trilux avulsa (R$1,99) — incompatível com um kit de 2-3 canetas, o que enfraquece essa hipótese. Nova hipótese, também não confirmada: pode ser um SKU único que cobre uma caneta vendida em cor sortida (vermelha OU azul, decidida na hora da venda), prática comum de ERP para itens de baixo custo — não uma caneta bicolor. Não descrever como "caneta bicolor" ao cliente sem confirmar o produto físico.',
  tags = array['precisa_validacao']
where sku = '30939';

update produtos set
  descricao = 'Corpo robusto e ponta grossa ("jumbo"), tampa antiasfixiante, composição resina termoplástica + carga à base de água + ponta de fibra de poliéster, atóxica. CONTINUA EM ABERTO após pesquisa adicional: confirmado que a Sky Paper vende "Hidrocor 12 Cores Jumbo" (R$14,99), mas nenhuma fonte encontrada confirma uma versão de 24 cores da marca — outras marcas (Compactor, Maped, Leo e Leo) têm jumbo 24 cores, a Sky Paper aparentemente não. Pode ser um SKU cadastrado com marca trocada, ou um item real da loja que simplesmente não está indexado online. Não afirmar "jumbo 24 cores Sky Paper" como fato ao cliente sem checagem física.',
  tags = array['confianca_baixa','precisa_validacao']
where sku = '70601';

update produtos set
  descricao = 'Apontador com depósito da Faber-Castell. CONTINUA EM ABERTO após pesquisa adicional: consultados os 5 modelos oficiais de apontador com depósito na faixa de R$5,99-7,99 (Pôster, Neon, Triangular Tons Pastel, Tons Pastel, Glitz) — nenhum chamado "Since 1761" ou com esse texto na ficha. Reforça a hipótese original: "Since 1761" é o selo de fundação da marca impresso na embalagem/heritage, não o nome comercial do produto físico. Não repassar característica técnica específica ao cliente sem confirmar o modelo exato na embalagem física.',
  tags = array['precisa_validacao']
where sku = '4387';

update produtos set
  descricao = 'Linha "Grafite Técnico Polymer", espessura 0.5mm, tecnologia MAX resistente. CONTINUA EM ABERTO após pesquisa adicional: confirmado que a Faber-Castell mantém 0.5mm 2B e 0.5mm HB como produtos separados (páginas oficiais distintas) e não foi encontrado nenhum kit oficial combinando as duas graduações num único produto "2B/HB". Provavelmente o ticket registrou só uma das duas graduações e "2B/HB" é imprecisão de digitação — não é possível confirmar qual das duas sem ver a embalagem física.',
  tags = array['confirmado_site_oficial','precisa_validacao']
where sku = '4380';

update produtos set
  descricao = 'Espessura 0.7mm. CONTINUA EM ABERTO após pesquisa adicional: encontrado um código parecido, real, da Sky Paper — "Lapiseira 0.7 Neon Cores SK1310" — mas com preço R$2,25, muito abaixo do R$9,99 cadastrado, o que indica que NÃO é o mesmo produto (código "SK1303" continua sem confirmação em nenhuma fonte). Recomenda-se conferir o código exato impresso na embalagem física antes de publicar qualquer característica deste modelo.',
  tags = array['precisa_validacao']
where sku = '68801';

-- =====================================================================
-- VALIDAÇÃO (rodar depois de aplicar)
-- =====================================================================
-- select count(*) from produtos where 'precisa_validacao' = any(tags);
-- -- deve ser 5 (30939, 70601, 4387, 4380, 68801).
-- select sku, tags from produtos where sku in ('70317','9029');
-- -- ambos devem ter só ['confirmado_site_oficial'], sem confianca_baixa/media/precisa_validacao.
-- =====================================================================
