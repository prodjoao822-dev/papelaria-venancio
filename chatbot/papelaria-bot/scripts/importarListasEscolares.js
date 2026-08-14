#!/usr/bin/env node
// Importa o material escolar da pasta de origem (o dump do Drive
// "ORÇAMENTOS <ano>") para `materiais/<slug-escola>/`, com nomes normalizados,
// e gera o mapeamento `src/config/materiais.json` que o bot consome em runtime.
//
// O que o bot manda pro cliente é o ORÇAMENTO (a cotação com preço). A lista
// crua da escola (pasta `LISTAS`) só é usada nas turmas que não têm orçamento —
// melhor mandar a lista do que não mandar nada. A escolha é feita turma a turma
// e nunca mistura as duas origens dentro da mesma turma (ver processarEscola).
//
// Por que um script e não um mapeamento escrito à mão:
// os nomes dos arquivos de origem são inconsistentes entre escolas (e às vezes
// dentro da mesma escola) — "CEC 2026_6°AO8°ANO.pdf", "INTEGRA 2026- 6° AO 9°
// ANO.pdf", "SESI 2026 - 6º AO 9º ANO EF.pdf" significam a mesma coisa. Escrever
// 15 escolas × 14 séries na mão seria um mapeamento gigante, difícil de revisar
// e impossível de refazer quando as listas do ano seguinte chegarem. Aqui a
// estrutura é permanente e os dados são substituíveis: no ano que vem, apontar
// --origem pra pasta nova e rodar de novo.
//
// Uso:
//   node scripts/importarListasEscolares.js --origem "<pasta>"            (dry-run)
//   node scripts/importarListasEscolares.js --origem "<pasta>" --aplicar  (copia)

const fs = require('node:fs');
const path = require('node:path');

const ANOS_FUNDAMENTAL = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${n}º ano - Fundamental`);
const ANOS_MEDIO = [1, 2, 3].map((n) => `${n}º ano - Ensino Médio`);

// Educação Infantil: cada escola nomeia as turmas no seu próprio sistema
// (Grupo 3, Infantil 4, Nível 2, Creche 1, Pré 1, Berçário...) e não existe
// de-para confiável entre eles — "Grupo 4" é Maternal numa escola e Jardim I na
// outra. Em vez de adivinhar a conversão, o bot passou a mostrar pro cliente as
// turmas com o nome que a própria escola usa (ver `menu` em materiais.json): a
// mãe sabe responder "Grupo 4", não sabe traduzir isso pra "Maternal".
//
// `ordem` só serve pra listar do menor pro maior no menu do WhatsApp; não é
// equivalência entre sistemas. Berçário não tem número.
const SISTEMAS_INFANTIL = [
  { chave: 'BER[CÇ]ARIO', rotulo: 'Berçário', ordem: 0, semNumero: true },
  { chave: 'CRECHE', rotulo: 'Creche', ordem: 1 },
  { chave: 'GRUPO', rotulo: 'Grupo', ordem: 2 },
  { chave: 'N[IÍ]VEL', rotulo: 'Nível', ordem: 3 },
  { chave: 'INFAN?TIL', rotulo: 'Infantil', ordem: 4 }, // "INFATIL" é typo recorrente na origem
  { chave: 'M[AE]TERNAL', rotulo: 'Maternal', ordem: 5 },
  { chave: 'JARDIM', rotulo: 'Jardim', ordem: 6 },
  { chave: 'PR[EÉ]', rotulo: 'Pré', ordem: 7 },
];

// "EDUCAÇÃO INFANTIL" sem número: uma lista única pra toda a Educação Infantil
// (hoje só o Balão Mágico, na versão integral). Vira uma opção própria do menu.
const REGEX_INFANTIL_GENERICO = /EDUCA[CÇ]AO\s*INFANTIL/;

// Arquivos que não são lista/orçamento de série nenhuma.
// LIVROS entra aqui porque orçamento de livro didático é outro produto: sem
// isso, "ORÇAMENTO_CEC_LIVROS_3°ANO" disputaria o 3º ano com o orçamento de
// material e o cliente poderia receber só a cotação dos livros.
const MARCADORES_IGNORAR = /SEQU[EÊ]NCIAS?|HOR[AÁ]RIO\s*ESTENDIDO|CONTRATURNO|PLACAS|\bLIVROS?\b/i;

// Pastas da origem que não são escola (ex.: "Daniel" guarda placas de mochila).
// Sem isso elas entrariam no menu do WhatsApp como se fossem uma opção válida.
const PASTAS_NAO_ESCOLA = new Set(['daniel']);

function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

function slugificar(nome) {
  return normalizarTexto(nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// As pastas de origem vêm em CAIXA ALTA e sem acento consistente ("MULTIPLA"),
// mas o menu do WhatsApp mostra o nome pro cliente ("Múltipla"). Siglas e
// grafias que o title-case automático erraria ficam nesta tabela; o resto é
// derivado, pra não precisar editar código a cada escola nova.
const NOMES_EXIBICAO = {
  apice: 'Ápice',
  cec: 'CEC',
  'colegio-adventista-laranjeiras': 'Colégio Adventista Laranjeiras',
  dinamico: 'Dinâmico',
  ebc: 'EBC',
  multipla: 'Múltipla',
  'salesiano-jc': 'Salesiano JC',
  sesi: 'SESI',
};

const PALAVRAS_MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function nomeExibicao(nomePasta, slug) {
  if (NOMES_EXIBICAO[slug]) return NOMES_EXIBICAO[slug];

  return nomePasta
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((palavra, indice) => (
      indice > 0 && PALAVRAS_MINUSCULAS.has(palavra)
        ? palavra
        : palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1)
    ))
    .join(' ');
}

// Um arquivo é de Ensino Médio quando o nome diz "série", "EM" ou "ensino
// médio". Isso desambigua "1° ANO" (Fundamental) de "1° ANO_EM" (Médio).
function ehEnsinoMedio(nomeNormalizado) {
  return /S[EÉ]RIE|\bEM\b|_EM|ENSINO\s*MEDIO/i.test(nomeNormalizado);
}

function detectarPeriodo(nomeNormalizado) {
  if (/INTEGRAL/.test(nomeNormalizado)) return 'Integral';
  if (/REGULAR/.test(nomeNormalizado)) return 'Regular';
  return null;
}

// Extrai os números de série citados no nome, respeitando faixas ("6 AO 9"),
// enumerações ("1,2 E 3", "4 E 5") e valores soltos.
function extrairNumeros(trecho) {
  const faixa = trecho.match(/(\d)\s*(?:AO|A|À|Á)\s*(\d)/);
  if (faixa) {
    const inicio = Number(faixa[1]);
    const fim = Number(faixa[2]);
    if (inicio <= fim) {
      return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
    }
  }

  const numeros = [...trecho.matchAll(/(\d)\s*[ºª°]?/g)].map((m) => Number(m[1]));
  return [...new Set(numeros)].filter((n) => n >= 1 && n <= 9);
}

// Turmas de Educação Infantil citadas no nome, no sistema da própria escola.
// Retorna [] quando o arquivo não é de Infantil. Um arquivo pode atender mais de
// uma turma ("GRUPO_03_E_04", "GRUPO1_E_2").
function interpretarInfantil(nomeLimpo) {
  if (REGEX_INFANTIL_GENERICO.test(nomeLimpo)) {
    const periodo = detectarPeriodo(nomeLimpo);
    // O rótulo carrega o período porque este arquivo é a Educação Infantil
    // inteira numa versão só — sem ele o cliente não saberia o que está pedindo.
    return [{ rotulo: `Educação Infantil${periodo ? ` - ${periodo}` : ''}`, ordem: 8, numero: 0 }];
  }

  for (const sistema of SISTEMAS_INFANTIL) {
    const posicao = nomeLimpo.search(new RegExp(sistema.chave));
    if (posicao === -1) continue;

    if (sistema.semNumero) {
      return [{ rotulo: sistema.rotulo, ordem: sistema.ordem, numero: 0 }];
    }

    // Só os números que vêm DEPOIS da palavra-chave: em "IDADE KIDS - GRUPO 1 -
    // SERRA SEDE" o resto do nome não pode contaminar a turma.
    const depois = nomeLimpo.slice(posicao);
    const numeros = [...new Set(
      [...depois.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n >= 1 && n <= 9),
    )];
    if (numeros.length === 0) continue;

    return numeros.map((numero) => ({
      rotulo: `${sistema.rotulo} ${numero}`,
      ordem: sistema.ordem,
      numero,
    }));
  }

  return [];
}

// Devolve as turmas/séries do menu que este arquivo atende, já com a chave de
// ordenação de cada uma, ou [] se o nome não descreve nada mapeável.
//
// A ordenação é [bloco, sistema, número]: Educação Infantil primeiro (da menor
// pra maior turma), depois Fundamental 1º-9º, depois Ensino Médio.
function interpretarSeries(nomeArquivo) {
  const bruto = path.basename(nomeArquivo, path.extname(nomeArquivo));
  // O "_" vira espaço antes de qualquer teste: ele é caractere de palavra, então
  // `\b` não casa ao lado dele e "ORÇAMENTO_LIVROS_CEC_6°ANO" escapava do
  // marcador `\bLIVROS?\b` — o orçamento de livros didáticos vencia o de
  // material (é mais específico, cita uma série só) e o cliente do 6º ano do CEC
  // receberia a cotação dos livros no lugar da lista de material.
  const nome = normalizarTexto(bruto).replace(/_+/g, ' ');

  if (MARCADORES_IGNORAR.test(nome)) return [];

  // Remove ruído que o extrator de números confundiria com número de série:
  // o ano letivo ("2026") e o sufixo de duplicata do Drive ("(1)", "(2)").
  // Sem \b no ano: em "CEC 2026_1°ANO" o "_" é caractere de palavra, então a
  // borda não casa e o "2026" sobreviveria, virando as séries 2 e 6.
  // O marcador ordinal também vira espaço: em "6ºao 9ºANO" ele fica colado no
  // dígito e impediria o reconhecimento da faixa "6 ao 9".
  // O "_" também vira espaço: em "Orçamento_3º_ao_5º_ano" ele fica entre o
  // número e o "ao", e `\s*` não casa com underscore — a faixa não era
  // reconhecida e o 4º ano ficava de fora, com o arquivo cobrindo só 3 e 5.
  const semAnoLetivo = nome
    .replace(/20\d{2}/g, ' ')
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/[ºª°_]/g, ' ');

  // Infantil primeiro: sem isso "GRUPO 5" seria lido como 5º ano do Fundamental.
  const infantil = interpretarInfantil(semAnoLetivo);
  if (infantil.length > 0) {
    return infantil.map((t) => ({ rotulo: t.rotulo, ordenacao: [0, t.ordem, t.numero] }));
  }

  const medio = ehEnsinoMedio(semAnoLetivo);

  // "ENSINO MEDIO" sem número nenhum = as 3 séries.
  if (medio && !/\d/.test(semAnoLetivo.replace(/\bEM\b/g, ''))) {
    return ANOS_MEDIO.map((rotulo, i) => ({ rotulo, ordenacao: [2, i + 1, 0] }));
  }

  // Idem pro Fundamental: "ENSINO FUNDAMENTAL" sem número = 1º ao 9º.
  if (/ENSINO\s*FUNDAMENTAL/.test(semAnoLetivo) && !/\d/.test(semAnoLetivo)) {
    return ANOS_FUNDAMENTAL.map((rotulo, i) => ({ rotulo, ordenacao: [1, i + 1, 0] }));
  }

  // "Anos iniciais" (1º-5º) e "anos finais" (6º-9º) são os nomes oficiais dos
  // dois ciclos do Fundamental — a Integra usa "ANOS_FINAIS" no lugar de "6 ao 9".
  const ciclo = /ANOS\s*INICIAIS/.test(semAnoLetivo) ? [1, 5]
    : /ANOS\s*FINAIS/.test(semAnoLetivo) ? [6, 9]
      : null;
  if (ciclo) {
    const [inicio, fim] = ciclo;
    return ANOS_FUNDAMENTAL
      .slice(inicio - 1, fim)
      .map((rotulo, i) => ({ rotulo, ordenacao: [1, inicio + i, 0] }));
  }

  const numeros = extrairNumeros(semAnoLetivo);
  if (numeros.length === 0) return [];

  const catalogo = medio ? ANOS_MEDIO : ANOS_FUNDAMENTAL;
  const limite = medio ? 3 : 9;
  const bloco = medio ? 2 : 1;

  return numeros
    .filter((n) => n <= limite)
    .map((n) => ({ rotulo: catalogo[n - 1], ordenacao: [bloco, n, 0] }));
}

// Nome de destino estável e legível, derivado das turmas/séries atendidas.
function montarNomeDestino(series, periodo) {
  const sufixo = periodo ? `-${periodo.toLowerCase()}` : '';
  const [primeira] = series;

  // Infantil: o rótulo já é o nome da turma ("Grupo 3"), então o arquivo herda
  // o mesmo vocabulário — "grupo-3.pdf", "grupo-3-4.pdf", "bercario.pdf".
  // Turmas do mesmo arquivo são sempre do mesmo sistema, então basta o prefixo
  // uma vez seguido dos números.
  if (primeira.ordenacao[0] === 0) {
    // O período sai do rótulo antes de virar slug: ele volta no `sufixo`, e sem
    // isso "Educação Infantil - Integral" geraria "...-integral-integral.pdf".
    const sistema = slugificar(
      primeira.rotulo.replace(/\s*-\s*(Integral|Regular)$/, '').replace(/\s*\d+$/, ''),
    );
    const numeros = series.map((s) => s.ordenacao[2]).filter((n) => n > 0);
    return `${[sistema, ...numeros].join('-')}${sufixo}.pdf`;
  }

  const nivel = primeira.rotulo.includes('Médio') ? 'serie-medio' : 'ano-fundamental';

  // Os números vêm da ordenação, não do rótulo: um arquivo pode acabar cobrindo
  // só parte das séries que o nome de origem cita (quando um orçamento mais
  // específico já ficou com as outras), e o nome tem que refletir o que ele
  // realmente atende. Faixa contínua vira "6-a-9"; salteada, "2-5-7".
  const numeros = series.map((s) => s.ordenacao[1]);
  const continuo = numeros.every((n, i) => i === 0 || n === numeros[i - 1] + 1);
  const faixa = numeros.length === 1 ? String(numeros[0])
    : continuo ? `${numeros[0]}-a-${numeros[numeros.length - 1]}`
      : numeros.join('-');

  return `${faixa}-${nivel}${sufixo}.pdf`;
}

// Desempate entre arquivos que atendem a mesma turma. Menor pontuação ganha.
// - "(1)", "(2)", "- Copia": artefatos de download do Drive.
// - "Somente pessoal": lista parcial (só material de uso individual) que convive
//   com a cheia da mesma série — a cheia ganha.
// - "Custo benefício": cotação alternativa, mais barata, que o vendedor oferece
//   sob demanda; a cotação padrão é a que o bot deve mandar sozinho.
function pontuarLimpeza(nomeArquivo) {
  const normalizado = normalizarTexto(nomeArquivo);
  let pontos = 0;
  if (/\(\d+\)/.test(nomeArquivo)) pontos += 2;
  if (/C[oó]pia|Copia/i.test(nomeArquivo)) pontos += 3;
  if (/SOMENTE\s*PESSOAL/.test(normalizado)) pontos += 5;
  if (/CUSTO\s*BENEFICIO/.test(normalizado)) pontos += 5;
  return pontos;
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A origem tem arquivo de escola trocado de pasta: `ORCAMENTO_INTEGRA_*` dentro
// de IDADE KIDS (e o inverso), e um `ORÇAMENTO_MUNDO LIVRE_1°ANO` dentro de
// LINUS PAULING. Mandar pro cliente o orçamento de OUTRA escola é pior do que
// não mandar nada — os itens e os preços são de outro colégio.
//
// A regra: se o nome do arquivo se identifica como de outra escola e NÃO cita a
// escola da pasta, ele é descartado. Arquivo que não cita escola nenhuma (o caso
// comum) passa normalmente.
function montarDetectorDeEscolas(nomesPastas) {
  const padroes = nomesPastas.map((nome) => ({
    slug: slugificar(nome),
    // `\s*` entre as palavras porque a origem escreve tanto "IDADE KIDS" quanto
    // "IDADEKIDS"; `\b` nas pontas pra "INTEGRA" não casar dentro de "INTEGRAL".
    regex: new RegExp(`\\b${normalizarTexto(nome).trim().split(/\s+/).map(escaparRegex).join('\\s*')}\\b`),
  }));

  return function ehDeOutraEscola(nomeArquivo, slugDaPasta) {
    // "_" é caractere de palavra e mataria o `\b` em "ORCAMENTO_IDADEKIDS_1ANO".
    const texto = normalizarTexto(path.basename(nomeArquivo, path.extname(nomeArquivo)))
      .replace(/_+/g, ' ');

    const dono = padroes.find((p) => p.slug === slugDaPasta);
    if (dono?.regex.test(texto)) return false;

    return padroes.some((p) => p.slug !== slugDaPasta && p.regex.test(texto));
  };
}

function coletarPdfs(dir) {
  const encontrados = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...coletarPdfs(completo));
    else if (/\.pdf$/i.test(entrada.name)) encontrados.push(completo);
  }
  return encontrados;
}

// Separa o que é ORÇAMENTO (a cotação com preço, que é o que o bot manda) do que
// é LISTA (a lista crua da escola, usada só onde não há orçamento).
//
// Tudo que não está numa pasta "LISTAS*" conta como orçamento: isso cobre
// `ORÇAMENTOS`, a variante com typo `OPRÇAMENTOS` (Pernalonga) e os PDFs soltos
// na raiz da escola (EBC), sem depender de acertar o nome da subpasta.
function coletarCandidatos(dirEscola) {
  const entradas = fs.readdirSync(dirEscola, { withFileTypes: true });
  const pastas = entradas.filter((e) => e.isDirectory());

  return {
    orcamentos: [
      ...pastas.filter((e) => !/LISTAS/i.test(e.name))
        .flatMap((e) => coletarPdfs(path.join(dirEscola, e.name))),
      ...entradas.filter((e) => e.isFile() && /\.pdf$/i.test(e.name))
        .map((e) => path.join(dirEscola, e.name)),
    ],
    listas: pastas.filter((e) => /LISTAS/i.test(e.name))
      .flatMap((e) => coletarPdfs(path.join(dirEscola, e.name))),
  };
}

// O que o bot manda pro cliente é o ORÇAMENTO (a cotação com preço). A lista
// crua da escola só entra onde não existe orçamento — melhor mandar a lista do
// que não mandar nada.
//
// A disputa é resolvida TURMA A TURMA, não escola a escola: o Salesiano, por
// exemplo, tem orçamento só do 1º, 2º, Infantil 2 e Infantil 3, e lista pro
// resto. E é resolvida de forma que uma mesma turma nunca misture as duas
// origens: se existe orçamento pra ela, a lista não concorre nem no período que
// o orçamento não cobre — senão o cliente do Integral receberia cotação com
// preço e o do Regular receberia lista sem preço, pro mesmo ano.
function processarEscola(dirEscola, ehDeOutraEscola) {
  const nomeEscola = path.basename(dirEscola);
  const slug = slugificar(nomeEscola);
  const { orcamentos, listas } = coletarCandidatos(dirEscola);

  const naoMapeados = [];
  const deOutraEscola = [];
  const candidatos = [];

  for (const [fonte, arquivos] of [['orcamento', orcamentos], ['lista', listas]]) {
    for (const origem of arquivos) {
      const base = path.basename(origem);

      if (ehDeOutraEscola(base, slug)) {
        deOutraEscola.push(base);
        continue;
      }

      const series = interpretarSeries(origem);
      if (series.length === 0) {
        naoMapeados.push(base);
        continue;
      }

      candidatos.push({
        origem, series, fonte, periodo: detectarPeriodo(normalizarTexto(base)),
      });
    }
  }

  // Por turma, quais períodos o orçamento cobre ('' = arquivo sem período).
  const periodosComOrcamento = new Map();
  for (const candidato of candidatos.filter((c) => c.fonte === 'orcamento')) {
    for (const serie of candidato.series) {
      if (!periodosComOrcamento.has(serie.rotulo)) periodosComOrcamento.set(serie.rotulo, new Set());
      periodosComOrcamento.get(serie.rotulo).add(candidato.periodo ?? '');
    }
  }

  // A lista só concorre onde o orçamento não chega. O caso que exige cuidado é o
  // Linus Pauling: o orçamento do 4º ano existe só na versão Regular. Deixar a
  // cotação Regular valer pra turma toda mandaria o documento errado, em
  // silêncio, pro aluno do Integral — então a lista do Integral entra pra
  // completar. O aluno de cada período recebe o material certo do período dele,
  // mesmo que um venha com preço e o outro não.
  function listaPodeConcorrer(rotulo, periodo) {
    const cobertos = periodosComOrcamento.get(rotulo);
    if (!cobertos) return true; // nenhuma cotação pra essa turma
    if (cobertos.has('')) return false; // cotação única já cobre a turma inteira
    if (!periodo) return false; // lista sem período não completa cotação por período
    return !cobertos.has(periodo);
  }

  // Orçamento antes de lista; depois o mais específico (arquivo que cobre menos
  // turmas — "7º ANO" ganha de "6º AO 9º ANO"); por último o nome mais limpo.
  const ordenados = [...candidatos].sort((a, b) => (
    (a.fonte === b.fonte ? 0 : a.fonte === 'orcamento' ? -1 : 1)
    || a.series.length - b.series.length
    || pontuarLimpeza(a.origem) - pontuarLimpeza(b.origem)
  ));

  // Cada turma+período fica com o primeiro candidato elegível que a cobre.
  const donoDaTurma = new Map();
  for (const candidato of ordenados) {
    for (const serie of candidato.series) {
      if (candidato.fonte === 'lista' && !listaPodeConcorrer(serie.rotulo, candidato.periodo)) continue;

      const chave = `${serie.rotulo}|${candidato.periodo ?? ''}`;
      if (!donoDaTurma.has(chave)) donoDaTurma.set(chave, { candidato, serie });
    }
  }

  // Só é copiado o arquivo que ficou dono de alguma turma — o resto é descarte.
  const seriesPorCandidato = new Map();
  for (const { candidato, serie } of donoDaTurma.values()) {
    if (!seriesPorCandidato.has(candidato)) seriesPorCandidato.set(candidato, []);
    seriesPorCandidato.get(candidato).push(serie);
  }

  // destino -> { origem, series, periodo, fonte }
  const escolhidos = new Map();
  for (const [candidato, series] of seriesPorCandidato) {
    series.sort((a, b) => (
      a.ordenacao[0] - b.ordenacao[0] || a.ordenacao[1] - b.ordenacao[1] || a.ordenacao[2] - b.ordenacao[2]
    ));

    let destino = montarNomeDestino(series, candidato.periodo);
    // Dois arquivos diferentes podem gerar o mesmo nome; sem isso um sobrescreve
    // o outro em disco e o mapeamento aponta pro conteúdo errado.
    for (let n = 2; escolhidos.has(destino); n += 1) {
      destino = montarNomeDestino(series, candidato.periodo).replace(/\.pdf$/, `-${n}.pdf`);
    }

    escolhidos.set(destino, {
      origem: candidato.origem, series, periodo: candidato.periodo, fonte: candidato.fonte,
    });
  }

  return {
    nomeEscola,
    slug,
    nomeExibicao: nomeExibicao(nomeEscola, slug),
    escolhidos,
    naoMapeados,
    deOutraEscola,
    totalOrigem: orcamentos.length + listas.length,
  };
}

function montarMapeamento(resultado) {
  const comPeriodo = {};
  const semPeriodo = {};
  // rótulo -> chave de ordenação, pra montar o menu na ordem escolar.
  const ordemDoRotulo = new Map();

  for (const [destino, { series, periodo }] of resultado.escolhidos) {
    const caminho = `${resultado.slug}/${destino}`;
    for (const { rotulo, ordenacao } of series) {
      ordemDoRotulo.set(rotulo, ordenacao);

      if (periodo) {
        comPeriodo[rotulo] = comPeriodo[rotulo] ?? {};
        comPeriodo[rotulo][periodo.toLowerCase()] = caminho;
      } else {
        semPeriodo[rotulo] = caminho;
      }
    }
  }

  // Uma série só entra em `comPeriodo` se tiver as DUAS versões; com só uma, o
  // bot perguntaria o período e depois não teria o arquivo da outra opção.
  const comPeriodoCompleto = {};
  for (const [serie, versoes] of Object.entries(comPeriodo)) {
    if (versoes.integral && versoes.regular) comPeriodoCompleto[serie] = versoes;
    else semPeriodo[serie] = versoes.integral ?? versoes.regular;
  }

  // `menu` é o que o cliente vê no passo "Qual o ano?" — só as turmas que esta
  // escola realmente tem, com o nome que a própria escola usa. É o que dispensa
  // o de-para de Educação Infantil e evita oferecer Ensino Médio pra escola que
  // vai só até o 9º ano.
  const menu = [...ordemDoRotulo.entries()]
    .sort(([, a], [, b]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
    .map(([rotulo]) => rotulo);

  // Arquivos que são a lista crua da escola, sem preço, porque não havia
  // orçamento pra aquela turma. O bot usa isso pra não anunciar como "orçamento"
  // um PDF que não tem valor nenhum — e vice-versa.
  const semOrcamento = [...resultado.escolhidos]
    .filter(([, escolhido]) => escolhido.fonte === 'lista')
    .map(([destino]) => `${resultado.slug}/${destino}`);

  const mapa = { menu };
  if (Object.keys(comPeriodoCompleto).length > 0) mapa.comPeriodo = comPeriodoCompleto;
  if (Object.keys(semPeriodo).length > 0) mapa.semPeriodo = semPeriodo;
  if (semOrcamento.length > 0) mapa.semOrcamento = semOrcamento;
  return mapa;
}

function main() {
  const args = process.argv.slice(2);
  const indiceOrigem = args.indexOf('--origem');
  const aplicar = args.includes('--aplicar');

  if (indiceOrigem === -1 || !args[indiceOrigem + 1]) {
    console.error('Uso: node scripts/importarListasEscolares.js --origem "<pasta>" [--aplicar]');
    process.exit(1);
  }

  const raizOrigem = path.resolve(args[indiceOrigem + 1]);
  if (!fs.existsSync(raizOrigem)) {
    console.error(`Pasta de origem não encontrada: ${raizOrigem}`);
    process.exit(1);
  }

  const destinoMateriais = path.join(__dirname, '..', 'materiais');
  const destinoJson = path.join(__dirname, '..', 'src', 'config', 'materiais.json');
  const destinoEscolas = path.join(__dirname, '..', 'src', 'config', 'escolas.json');

  const dirsEscola = fs.readdirSync(raizOrigem, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(raizOrigem, e.name))
    .sort();

  const mapeamentoFinal = {};
  const escolasSemLista = [];
  const catalogoEscolas = [];
  const turmasPorLista = [];
  let totalCopiados = 0;
  let totalTurmasOrcamento = 0;
  let totalTurmasLista = 0;

  const ehDeOutraEscola = montarDetectorDeEscolas(
    dirsEscola.map((d) => path.basename(d)).filter((n) => !PASTAS_NAO_ESCOLA.has(slugificar(n))),
  );

  console.log(aplicar ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada será copiado) ===\n');

  for (const dirEscola of dirsEscola) {
    if (PASTAS_NAO_ESCOLA.has(slugificar(path.basename(dirEscola)))) continue;
    const resultado = processarEscola(dirEscola, ehDeOutraEscola);

    const mapa = montarMapeamento(resultado);
    const seriesCobertas = new Set([
      ...Object.keys(mapa.semPeriodo ?? {}),
      ...Object.keys(mapa.comPeriodo ?? {}),
    ]);

    // Escola sem lista mapeável continua no catálogo do menu — o cliente
    // precisa poder escolhê-la; o fluxo só cai no fallback de notificar a
    // Vanessa em vez de mandar PDF.
    catalogoEscolas.push({ id: resultado.slug, nome: resultado.nomeExibicao });

    if (resultado.escolhidos.size === 0) {
      escolasSemLista.push(`${resultado.nomeExibicao} (${resultado.totalOrigem} arquivo(s), nenhum mapeável)`);
      continue;
    }

    mapeamentoFinal[resultado.slug] = mapa;

    const daLista = [...resultado.escolhidos.values()]
      .filter((e) => e.fonte === 'lista')
      .flatMap((e) => e.series.map((s) => s.rotulo));
    totalTurmasOrcamento += seriesCobertas.size - daLista.length;
    totalTurmasLista += daLista.length;
    if (daLista.length > 0) turmasPorLista.push(`${resultado.nomeExibicao}: ${daLista.join(', ')}`);

    console.log(`${resultado.nomeExibicao}  →  materiais/${resultado.slug}/`);
    console.log(`   ${resultado.escolhidos.size} arquivo(s), cobrindo ${seriesCobertas.size} turma(s)/série(s)`);
    if (resultado.deOutraEscola.length > 0) {
      console.log(`   DESCARTADOS (arquivo de outra escola): ${resultado.deOutraEscola.join(', ')}`);
    }
    if (resultado.naoMapeados.length > 0) {
      console.log(`   ignorados (avulsos): ${resultado.naoMapeados.join(', ')}`);
    }

    for (const [destino, { origem, fonte }] of [...resultado.escolhidos].sort()) {
      console.log(`      ${destino}  ←  ${path.basename(origem)}${fonte === 'lista' ? '   [LISTA — sem orçamento]' : ''}`);
      if (aplicar) {
        const pastaEscola = path.join(destinoMateriais, resultado.slug);
        fs.mkdirSync(pastaEscola, { recursive: true });
        fs.copyFileSync(origem, path.join(pastaEscola, destino));
        totalCopiados += 1;
      }
    }
    console.log('');
  }

  if (escolasSemLista.length > 0) {
    console.log('--- Sem lista mapeável (caem no fallback: notifica a Vanessa) ---');
    escolasSemLista.forEach((e) => console.log(`   ${e}`));
    console.log('');
  }

  if (turmasPorLista.length > 0) {
    console.log('--- Turmas sem orçamento na origem (vai a LISTA, sem preço) ---');
    turmasPorLista.forEach((t) => console.log(`   ${t}`));
    console.log('');
  }

  console.log(`Turmas atendidas por ORÇAMENTO: ${totalTurmasOrcamento}`);
  console.log(`Turmas atendidas por LISTA (não há orçamento): ${totalTurmasLista}`);
  console.log(`Escolas com material: ${Object.keys(mapeamentoFinal).length}`);
  console.log(`Escolas sem material: ${escolasSemLista.length}`);

  console.log(`Escolas no catálogo do menu: ${catalogoEscolas.length}`);

  if (aplicar) {
    catalogoEscolas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    fs.writeFileSync(destinoJson, `${JSON.stringify(mapeamentoFinal, null, 2)}\n`);
    fs.writeFileSync(destinoEscolas, `${JSON.stringify(catalogoEscolas, null, 2)}\n`);
    console.log(`\n${totalCopiados} PDF(s) copiados.`);
    console.log(`Mapeamento gravado em ${path.relative(process.cwd(), destinoJson)}`);
    console.log(`Catálogo de escolas gravado em ${path.relative(process.cwd(), destinoEscolas)}`);
  } else {
    console.log('\nRode de novo com --aplicar para copiar os arquivos e gravar o mapeamento.');
  }
}

main();
