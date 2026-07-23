// Mapeia escola + ano (e, quando existir, período) para o arquivo PDF da lista
// de material correspondente, guardados em `materiais/<escola>/<arquivo>.pdf`
// na raiz do projeto.
//
// Por que isso é um "config" e não uma tabela do Supabase ainda:
// já existe uma tabela pensada pra isso (`materiais_lista_escolar`, ver
// supabase/schema.sql), mas ela guarda uma URL (`pdf_url`) — útil quando os
// PDFs estiverem hospedados (ex.: Supabase Storage). Por enquanto os PDFs só
// existem localmente neste projeto (fase de teste com 4 escolas), então o
// mapeamento fica aqui, apontando pra arquivos em disco. Quando os PDFs forem
// hospedados de verdade, este arquivo é o único lugar que precisa mudar: as
// funções abaixo (`temVariacaoDePeriodo` e `buscarMaterial`) podem passar a
// consultar a tabela em vez do objeto MATERIAIS, sem tocar em listaEscolar.js.
//
// Cobertura parcial é esperada e normal nesta fase de teste: só 4 escolas
// (CEC, Múltipla, Linus Pauling, Mundo Livre) têm PDFs cadastrados, e mesmo
// essas não cobrem todos os anos (ex.: Mundo Livre só tem a lista do 3º ano
// fundamental pronta). Quando não há PDF cadastrado, `buscarMaterial` retorna
// `null` e o fluxo de lista escolar cai no caminho de sempre: notifica a
// Vanessa com escola/ano/observação pra ela atender manualmente.

const path = require('node:path');

// Raiz onde os PDFs ficam guardados (dois níveis acima de src/config/).
const PASTA_MATERIAIS = path.join(__dirname, '..', '..', 'materiais');

// Observação sobre Educação Infantil: CEC, Múltipla e Linus Pauling organizam
// as turmas de Educação Infantil em "grupos" por idade (ex.: Grupo 3, 4, 5),
// enquanto o menu do bot usa "Maternal" e "Jardim". Como não há uma regra
// clara e confirmada de conversão entre um sistema e o outro, essas séries
// ficam de propósito fora do mapeamento abaixo — ou seja, "Maternal" e
// "Jardim" sempre caem no fallback (notifica a Vanessa) até essa conversão
// ser confirmada com o dono do projeto.
const MATERIAIS = {
  CEC: {
    semPeriodo: {
      '1º ano - Fundamental': 'cec/1-ano-fundamental.pdf',
      '2º ano - Fundamental': 'cec/2-ano-fundamental.pdf',
      '3º ano - Fundamental': 'cec/3-ano-fundamental.pdf',
      '4º ano - Fundamental': 'cec/4-ano-fundamental.pdf',
      '5º ano - Fundamental': 'cec/5-ano-fundamental.pdf',
      // CEC junta 6º ao 8º ano numa lista só.
      '6º ano - Fundamental': 'cec/6-a-8-ano-fundamental.pdf',
      '7º ano - Fundamental': 'cec/6-a-8-ano-fundamental.pdf',
      '8º ano - Fundamental': 'cec/6-a-8-ano-fundamental.pdf',
      '9º ano - Fundamental': 'cec/9-ano-fundamental.pdf',
      // CEC junta as 3 séries do Ensino Médio numa lista só.
      '1º ano - Ensino Médio': 'cec/1-a-3-serie-medio.pdf',
      '2º ano - Ensino Médio': 'cec/1-a-3-serie-medio.pdf',
      '3º ano - Ensino Médio': 'cec/1-a-3-serie-medio.pdf',
    },
  },

  Múltipla: {
    semPeriodo: {
      '1º ano - Fundamental': 'multipla/1-ano-fundamental.pdf',
      '2º ano - Fundamental': 'multipla/2-ano-fundamental.pdf',
      '3º ano - Fundamental': 'multipla/3-ano-fundamental.pdf',
      '4º ano - Fundamental': 'multipla/4-ano-fundamental.pdf',
      '5º ano - Fundamental': 'multipla/5-ano-fundamental.pdf',
      '6º ano - Fundamental': 'multipla/6-ano-fundamental.pdf',
      // Múltipla junta 7º e 8º ano numa lista só.
      '7º ano - Fundamental': 'multipla/7-a-8-ano-fundamental.pdf',
      '8º ano - Fundamental': 'multipla/7-a-8-ano-fundamental.pdf',
      '9º ano - Fundamental': 'multipla/9-ano-fundamental.pdf',
      // Múltipla junta 1ª e 2ª série do Médio, mas a 3ª série tem lista própria.
      '1º ano - Ensino Médio': 'multipla/1-a-2-serie-medio.pdf',
      '2º ano - Ensino Médio': 'multipla/1-a-2-serie-medio.pdf',
      '3º ano - Ensino Médio': 'multipla/3-serie-medio.pdf',
    },
  },

  'Linus Pauling': {
    // Do 1º ao 5º ano, a Linus Pauling tem lista diferente pra Período
    // Integral e Período Regular — por isso essas séries entram em
    // `comPeriodo`, e o fluxo do bot pergunta o período antes de buscar o PDF.
    comPeriodo: {
      '1º ano - Fundamental': {
        integral: 'linus-pauling/1-ano-fundamental-integral.pdf',
        regular: 'linus-pauling/1-ano-fundamental-regular.pdf',
      },
      '2º ano - Fundamental': {
        integral: 'linus-pauling/2-ano-fundamental-integral.pdf',
        regular: 'linus-pauling/2-ano-fundamental-regular.pdf',
      },
      '3º ano - Fundamental': {
        integral: 'linus-pauling/3-ano-fundamental-integral.pdf',
        regular: 'linus-pauling/3-ano-fundamental-regular.pdf',
      },
      '4º ano - Fundamental': {
        integral: 'linus-pauling/4-ano-fundamental-integral.pdf',
        regular: 'linus-pauling/4-ano-fundamental-regular.pdf',
      },
      '5º ano - Fundamental': {
        integral: 'linus-pauling/5-ano-fundamental-integral.pdf',
        regular: 'linus-pauling/5-ano-fundamental-regular.pdf',
      },
    },
    semPeriodo: {
      // Do 6º ao 9º ano e no Ensino Médio não há distinção de período: uma lista só.
      '6º ano - Fundamental': 'linus-pauling/6-a-9-ano-fundamental.pdf',
      '7º ano - Fundamental': 'linus-pauling/6-a-9-ano-fundamental.pdf',
      '8º ano - Fundamental': 'linus-pauling/6-a-9-ano-fundamental.pdf',
      '9º ano - Fundamental': 'linus-pauling/6-a-9-ano-fundamental.pdf',
      '1º ano - Ensino Médio': 'linus-pauling/1-a-3-serie-medio.pdf',
      '2º ano - Ensino Médio': 'linus-pauling/1-a-3-serie-medio.pdf',
      '3º ano - Ensino Médio': 'linus-pauling/1-a-3-serie-medio.pdf',
    },
  },

  'Mundo Livre': {
    // Escola de teste com cobertura propositalmente incompleta: só o 3º ano
    // fundamental tem lista cadastrada. Qualquer outro ano cai no fallback.
    semPeriodo: {
      '3º ano - Fundamental': 'mundo-livre/3-ano-fundamental.pdf',
    },
  },
};

// Diz se aquela escola+ano tem variação de período (Integral/Regular). Usado
// pelo estado LISTA_ESCOLAR_ANO pra decidir se pergunta o período ou pula
// direto pra observação.
function temVariacaoDePeriodo(nomeEscola, ano) {
  return Boolean(MATERIAIS[nomeEscola]?.comPeriodo?.[ano]);
}

// Retorna { caminhoAbsoluto, nomeArquivo } do PDF correspondente, ou `null`
// se ainda não há material cadastrado pra essa combinação de escola+ano(+período).
function buscarMaterial(nomeEscola, ano, periodo) {
  const configEscola = MATERIAIS[nomeEscola];
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
  };
}

module.exports = { temVariacaoDePeriodo, buscarMaterial };
