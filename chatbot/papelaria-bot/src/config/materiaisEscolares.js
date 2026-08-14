// Mapeia escola + ano (e, quando existir, período) para o arquivo PDF da lista
// de material correspondente, guardados em `materiais/<slug-escola>/`.
//
// O mapeamento em si vive em `materiais.json`, gerado por
// `scripts/importarListasEscolares.js` a partir da pasta de listas do ano. Este
// módulo é só a camada de consulta: estrutura permanente aqui, dados
// substituíveis no JSON. Trocar as listas do ano que vem não exige tocar em
// código — basta rodar o script apontando pra pasta nova.
//
// Por que ainda não é uma tabela do Supabase: já existe uma tabela pensada pra
// isso (`materiais_lista_escolar`, ver supabase/schema.sql), mas ela guarda uma
// URL (`pdf_url`), útil só quando os PDFs estiverem hospedados (ex.: Supabase
// Storage). Enquanto os arquivos moram em disco neste projeto, o JSON cumpre o
// papel. Quando forem hospedados, só as duas funções abaixo mudam.
//
// Cobertura parcial é esperada: nem toda escola tem lista pra toda série.
// Quando não há PDF, `buscarMaterial` retorna `null` e o fluxo de lista escolar
// cai no caminho de sempre: notifica a Vanessa com escola/ano/observação.
//
// Educação Infantil: as escolas nomeiam as turmas cada uma no seu sistema
// ("Grupo 3", "Infantil 4", "Nível 2", "Creche 1", "Pré 1", "Berçário") e não
// existe de-para confiável entre eles — "Grupo 4" é Maternal numa escola e
// Jardim I na outra. Por isso o bot não traduz nada: `listarAnos` devolve as
// turmas com o nome que a própria escola usa, e o menu do WhatsApp mostra
// exatamente isso. A mãe sabe responder "Grupo 4"; ela não saberia converter
// isso pra "Maternal", e nós também não.

const path = require('node:path');

const MATERIAIS = require('./materiais.json');

// Raiz onde os PDFs ficam guardados (dois níveis acima de src/config/).
const PASTA_MATERIAIS = path.join(__dirname, '..', '..', 'materiais');

// O nome da escola chega do cadastro (tabela `escolas`), onde é escrito pra
// leitura humana ("Múltipla", "Colégio Adventista Laranjeiras"), enquanto as
// chaves do JSON são slugs derivados da pasta de origem ("multipla"). Normalizar
// os dois lados evita que uma diferença de acento ou caixa quebre a busca.
function slugificar(nomeEscola) {
  return String(nomeEscola ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function configDaEscola(nomeEscola) {
  const slug = slugificar(nomeEscola);
  return slug ? MATERIAIS[slug] ?? null : null;
}

// Turmas/séries que ESTA escola oferece, na ordem escolar (Educação Infantil,
// depois Fundamental, depois Médio) e com o vocabulário da própria escola.
// Devolve [] quando não há material cadastrado — aí o fluxo mostra a lista
// genérica de anos em vez de um menu vazio.
function listarAnos(nomeEscola) {
  return configDaEscola(nomeEscola)?.menu ?? [];
}

// Diz se aquela escola+ano tem variação de período (Integral/Regular). Usado
// pelo estado LISTA_ESCOLAR_ANO pra decidir se pergunta o período ou pula
// direto pra observação.
function temVariacaoDePeriodo(nomeEscola, ano) {
  return Boolean(configDaEscola(nomeEscola)?.comPeriodo?.[ano]);
}

// Retorna { caminhoAbsoluto, nomeArquivo, ehOrcamento } do PDF correspondente,
// ou `null` se ainda não há material cadastrado pra essa combinação de
// escola+ano(+período).
//
// `ehOrcamento` diz se o arquivo é a cotação com preço (o caso normal) ou a
// lista crua da escola, usada nas turmas que não têm orçamento na origem. Quem
// chama usa isso pra anunciar o anexo pelo nome certo: prometer "orçamento" e
// mandar uma lista sem valor nenhum faz o cliente voltar perguntando o preço.
function buscarMaterial(nomeEscola, ano, periodo) {
  const configEscola = configDaEscola(nomeEscola);
  if (!configEscola) return null;

  let caminhoRelativo;

  if (configEscola.comPeriodo?.[ano]) {
    const chavePeriodo = periodo === 'Integral' ? 'integral' : 'regular';
    caminhoRelativo = configEscola.comPeriodo[ano][chavePeriodo];
  } else {
    caminhoRelativo = configEscola.semPeriodo?.[ano];
  }

  if (!caminhoRelativo) return null;

  return {
    caminhoAbsoluto: path.join(PASTA_MATERIAIS, caminhoRelativo),
    nomeArquivo: path.basename(caminhoRelativo),
    ehOrcamento: !configEscola.semOrcamento?.includes(caminhoRelativo),
  };
}

module.exports = { listarAnos, temVariacaoDePeriodo, buscarMaterial };
