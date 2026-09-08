// Estado do fluxo de lista escolar: pergunta a escola, o ano/série do aluno,
// o período (só quando a escola tiver Integral/Regular pra aquele ano) e por
// fim se há alguma observação — e então:
//   - escola conhecida: se já existe o PDF da lista de material pra essa
//     combinação, o bot manda o arquivo direto pelo WhatsApp do cliente (ação
//     ENVIAR_ARQUIVO); de qualquer forma, sempre notifica a Vanessa com o
//     pedido completo (escola, ano, período e observação);
//   - "outra escola" (não está na lista carregada): não há PDF automático pra
//     buscar. Desde 28/08/2026, assim que o cliente manda a lista de
//     material, o bot cria um ORÇAMENTO de verdade (status 'rascunho', ação
//     CRIAR_ORCAMENTO_LISTA_ESCOLAR em actions.js) e dispara o Agente de
//     Orçamento (n8n) pra precificar os itens em segundo plano — sem pedir
//     CPF/CNPJ/razão social (cadastro fiscal continua fazendo sentido só pra
//     Cotação pra Empresa, que emite nota fiscal de verdade — ver
//     cotacaoEmpresa.js) e SEM perguntar forma de entrega/endereço aqui: isso
//     é um orçamento em rascunho, não um pedido fechado, e quem conduz o
//     fechamento de verdade (incluindo entrega/endereço, com a regra dos
//     R$100 pra entrega própria) é o Agente de Vendas, quando o cliente
//     voltar a falar — a conversa é pausada (pausarPosPedido) e o orçamento
//     em rascunho já é reconhecido como "ativo" por orcamento_ativo_cliente,
//     então o webhookController roteia a próxima mensagem do cliente direto
//     pro Agente de Vendas em vez do menu principal (mesmo mecanismo já usado
//     pra pedidos fechados, ver reativacaoBot.garantirBotAtivo). Entre
//     27/08/2026 e 28/08/2026 este caminho só notificava a Vanessa e pedia
//     pro cliente aguardar atendimento humano, sem orçamento nenhum — o dono
//     decidiu que isso deixava a família esperando à toa por algo que o
//     Agente de Orçamento já consegue cotar sozinho. Uma versão intermediária
//     chegou a ser cogitada perguntando retirada/entrega antes de criar o
//     orçamento, mas foi descartada no mesmo dia: essa pergunta só faz
//     sentido na hora de FECHAR o pedido, não na hora de só orçar.
//
// É um módulo com vários estados (em vez de 1) porque o fluxo tem várias
// perguntas em sequência. Por isso exporta `estados: [...]` em vez de um único
// `{ STATE, mensagem, processar }` — a stateMachine sabe registrar os dois formatos.

const fallback = require('./fallback');
const materiaisEscolares = require('../../config/materiaisEscolares');
const { parseOpcaoNumerica } = require('../validadores');
const { primeiroNome, mensagemAguardarAtendimento } = require('../mensagensComuns');

const ESTADO_ESCOLA = 'LISTA_ESCOLAR_ESCOLA';
const ESTADO_ESCOLA_OUTRA_NOME = 'LISTA_ESCOLAR_ESCOLA_OUTRA_NOME';
const ESTADO_ESCOLA_OUTRA_LISTA_MATERIAL = 'LISTA_ESCOLAR_ESCOLA_OUTRA_LISTA_MATERIAL';
const ESTADO_ANO = 'LISTA_ESCOLAR_ANO';
const ESTADO_ANO_OUTRO = 'LISTA_ESCOLAR_ANO_OUTRO';
const ESTADO_PERIODO = 'LISTA_ESCOLAR_PERIODO';
const ESTADO_OBSERVACAO = 'LISTA_ESCOLAR_OBSERVACAO';
// Depois de notificar, volta pro submenu de Vendas (não pro menu principal):
// o cliente não precisa digitar "1" de novo pra pedir outra coisa de vendas.
const ESTADO_SUBMENU_VENDAS = 'SUBMENU_VENDAS';

// Última opção da lista de escolas, sempre depois das escolas carregadas do
// Supabase (ou de ESCOLAS_EXEMPLO em teste local).
const ROTULO_OUTRA_ESCOLA = 'Não encontrei minha escola / outra escola';

// Usada apenas quando sessao.dados.escolas ainda não foi carregado (ex.: teste
// via `npm run chat`, sem Supabase). Em produção o webhookController injeta a
// lista real (escolasService.listarEscolasAtivas(), ordenada por nome) em
// sessao.dados.escolas antes de renderizar esta mensagem.
//
// O catálogo vem de escolas.json, gerado junto com o mapeamento de materiais
// por scripts/importarListasEscolares.js — assim a lista offline não sai de
// sincronia com os PDFs importados. Nem toda escola daqui tem lista cadastrada:
// as que não têm caem no fallback de notificar a Vanessa, que é o comportamento
// esperado (ver src/config/materiaisEscolares.js).
const ESCOLAS_EXEMPLO = require('../../config/escolas.json');

const ROTULO_OUTRO_ANO = 'Não encontrei a turma do meu filho';

// Lista genérica de séries, usada só quando não dá pra montar o menu a partir do
// material da escola: na rota "outra escola" e em escolas sem nenhuma lista
// cadastrada. Quando a escola tem catálogo, o menu vem dele (ver opcoesDeAno).
const ANOS_DISPONIVEIS = [
  'Maternal',
  'Jardim',
  '1º ano - Fundamental',
  '2º ano - Fundamental',
  '3º ano - Fundamental',
  '4º ano - Fundamental',
  '5º ano - Fundamental',
  '6º ano - Fundamental',
  '7º ano - Fundamental',
  '8º ano - Fundamental',
  '9º ano - Fundamental',
  '1º ano - Ensino Médio',
  '2º ano - Ensino Médio',
  '3º ano - Ensino Médio',
];

const OPCOES_PERIODO = { 1: 'Integral', 2: 'Regular' };

function listaDeEscolas(sessao) {
  return sessao?.dados?.escolas?.length ? sessao.dados.escolas : ESCOLAS_EXEMPLO;
}

function numerarOpcoes(itens) {
  return itens.map((item, indice) => `${indice + 1}. ${item}`).join('\n');
}

// --- Passo 1: qual a escola ---

function mensagemEscola(sessao) {
  const nomes = listaDeEscolas(sessao).map((escola) => escola.nome);
  return `Qual a escola?\n\n${numerarOpcoes([...nomes, ROTULO_OUTRA_ESCOLA])}`;
}

function processarEscola(textoRecebido, sessao) {
  const escolas = listaDeEscolas(sessao);
  const indice = parseOpcaoNumerica(textoRecebido, escolas.length + 1);

  if (indice === null) {
    return { estado: ESTADO_ESCOLA, resposta: fallback.mensagemOpcaoInvalida(mensagemEscola(sessao)) };
  }

  if (indice === escolas.length) {
    return { estado: ESTADO_ESCOLA_OUTRA_NOME, dados: sessao.dados };
  }

  return {
    estado: ESTADO_ANO,
    dados: { ...sessao.dados, escolaSelecionada: escolas[indice] },
  };
}

// --- Passo 1b (condicional): nome da escola, quando não está na lista ---

function mensagemEscolaOutraNome() {
  return 'Qual o nome da escola?';
}

function processarEscolaOutraNome(textoRecebido, sessao) {
  const nomeEscola = textoRecebido.trim();

  if (!nomeEscola) {
    return { estado: ESTADO_ESCOLA_OUTRA_NOME, resposta: fallback.mensagemOpcaoInvalida(mensagemEscolaOutraNome()) };
  }

  return { estado: ESTADO_ANO, dados: { ...sessao.dados, escolaOutraNome: nomeEscola } };
}

// --- Passo 2: qual o ano/série ---

// Opções do "Qual o ano?", na ordem em que o cliente vê.
//
// Quando a escola tem material cadastrado, o menu mostra só as turmas DELA, com
// o nome que ELA usa — "Grupo 4", "Infantil 3", "Nível 2", "Creche 1". Isso
// resolve dois problemas de uma vez: (1) Educação Infantil, onde cada escola tem
// um sistema de nomes e não existe conversão confiável pra "Maternal"/"Jardim";
// (2) opção morta, tipo oferecer Ensino Médio pra escola que vai até o 9º ano.
// A última opção é a saída pra quem não se encontrar na lista.
//
// Sem catálogo (rota "outra escola", ou escola sem nenhuma lista) cai na lista
// genérica — aí não faz sentido oferecer "não encontrei", porque nenhuma das
// opções leva a um PDF mesmo.
function opcoesDeAno(sessao) {
  const nomeEscola = sessao?.dados?.escolaSelecionada?.nome;
  const doCatalogo = nomeEscola ? materiaisEscolares.listarAnos(nomeEscola) : [];
  return doCatalogo.length > 0 ? [...doCatalogo, ROTULO_OUTRO_ANO] : ANOS_DISPONIVEIS;
}

function mensagemAno(sessao) {
  return `Qual o ano?\n\n${numerarOpcoes(opcoesDeAno(sessao))}`;
}

function processarAno(textoRecebido, sessao) {
  const opcoes = opcoesDeAno(sessao);
  const indice = parseOpcaoNumerica(textoRecebido, opcoes.length);

  if (indice === null) {
    return { estado: ESTADO_ANO, resposta: fallback.mensagemOpcaoInvalida(mensagemAno(sessao)) };
  }

  const anoEscolhido = opcoes[indice];

  // "Não encontrei a turma": em vez de registrar esse rótulo como se fosse a
  // série do aluno, pede o nome da turma — é o que a Vanessa precisa saber pra
  // atender, e é também o sinal de que falta lista pra essa turma na origem.
  if (anoEscolhido === ROTULO_OUTRO_ANO) {
    return { estado: ESTADO_ANO_OUTRO, dados: sessao.dados };
  }

  const dados = { ...sessao.dados, anoSelecionado: anoEscolhido };
  const nomeEscola = sessao.dados.escolaSelecionada?.nome;

  // "Outra escola": não há PDF automático pra buscar, então (diferente da
  // rota de escola conhecida) o bot precisa pedir a lista de material em si
  // — é o dado principal que o Agente de Orçamento usa pra cotar.
  if (!nomeEscola) {
    return { estado: ESTADO_ESCOLA_OUTRA_LISTA_MATERIAL, dados };
  }

  // Só pergunta o período (Integral/Regular) quando a escola realmente tiver
  // as duas versões cadastradas pra essa turma (hoje, só a Linus Pauling: Grupo
  // 2 a 5 e 1º ao 5º ano). Pra todas as outras combinações, pula direto pra
  // observação.
  const precisaPerguntarPeriodo = materiaisEscolares.temVariacaoDePeriodo(nomeEscola, anoEscolhido);

  return { estado: precisaPerguntarPeriodo ? ESTADO_PERIODO : ESTADO_OBSERVACAO, dados };
}

// --- Passo 2b (condicional): turma que não está no menu da escola ---

function mensagemAnoOutro() {
  return 'Qual a turma ou o ano do seu filho? Pode escrever do jeito que a escola chama.';
}

function processarAnoOutro(textoRecebido, sessao) {
  const ano = textoRecebido.trim();

  if (!ano) {
    return { estado: ESTADO_ANO_OUTRO, resposta: fallback.mensagemOpcaoInvalida(mensagemAnoOutro()) };
  }

  // Vai direto pra observação: se a turma não está no menu da escola, também não
  // há PDF pra ela — `buscarMaterial` devolve null e o fluxo notifica a Vanessa.
  return { estado: ESTADO_OBSERVACAO, dados: { ...sessao.dados, anoSelecionado: ano } };
}

// --- Passo 2b (condicional, "outra escola"): lista de material em texto ---
//
// Só texto por enquanto: o parser do webhook (payloadParser.js) só extrai
// `conversation`/`extendedTextMessage` — mensagens de foto/documento chegam
// sem texto reconhecível e são descartadas antes de chegar aqui (ver
// webhookController.js). Pedir "foto ou PDF" prometeria algo que o bot ainda
// não consegue receber.

function mensagemOutraListaMaterial() {
  return 'Me manda a lista de material (nomes dos itens), pode escrever tudo numa mensagem só, um item por linha.';
}

// Guarda estrutural (não é lista de palavras-chave, é forma): uma lista de
// material de verdade tem mais de um item, então tem quebra de linha,
// vírgula/ponto-e-vírgula separando itens, ou pelo menos duas palavras. Uma
// resposta de 1 palavra só ("ok", "sim", "beleza", "obrigado"...) não tem essa
// forma — e é exatamente o que um cliente digita reflexivamente depois de
// mandar um PDF nesse passo (o bot ainda não sabe ler PDF aqui, ver comentário
// acima; sem esta guarda essa palavra virava, ela sozinha, o item do orçamento
// inteiro — caso real do teste de 08/09/2026, item "ok" no orçamento ORC-2026-0267).
function pareceListaDeMaterial(texto) {
  const temSeparadorDeItens = /[\n,;]/.test(texto);
  const quantidadeDePalavras = texto.trim().split(/\s+/).filter(Boolean).length;
  return temSeparadorDeItens || quantidadeDePalavras > 1;
}

function processarOutraListaMaterial(textoRecebido, sessao) {
  const listaMaterial = textoRecebido.trim();

  if (!listaMaterial || !pareceListaDeMaterial(listaMaterial)) {
    return {
      estado: ESTADO_ESCOLA_OUTRA_LISTA_MATERIAL,
      resposta: fallback.mensagemOpcaoInvalida(mensagemOutraListaMaterial()),
    };
  }

  return {
    estado: ESTADO_OBSERVACAO,
    dados: { ...sessao.dados, listaMaterialOutraEscola: listaMaterial },
  };
}

// --- Passo 2.5 (condicional): qual o período ---

function mensagemPeriodo() {
  return 'Qual o período?\n\n1. Integral\n2. Regular';
}

function processarPeriodo(textoRecebido, sessao) {
  const periodoEscolhido = OPCOES_PERIODO[textoRecebido.trim()];

  if (!periodoEscolhido) {
    return { estado: ESTADO_PERIODO, resposta: fallback.mensagemOpcaoInvalida(mensagemPeriodo()) };
  }

  return {
    estado: ESTADO_OBSERVACAO,
    dados: { ...sessao.dados, periodoSelecionado: periodoEscolhido },
  };
}

// --- Passo 3: observação e encerramento ---

function mensagemObservacao() {
  return 'Você tem alguma observação a fazer?';
}

// O anexo é anunciado pelo que ele realmente é: na maioria das turmas o bot
// manda o orçamento (cotação com preço), mas onde a escola não tem orçamento na
// origem vai a lista crua, sem valor. Chamar as duas coisas de "orçamento" faria
// o cliente voltar perguntando o preço que não está lá.
function montarMensagemComMaterial(escola, ano, periodo, nomeCliente, ehOrcamento) {
  const sufixoPeriodo = periodo ? ` (Período ${periodo})` : '';
  const nome = primeiroNome(nomeCliente);
  const abertura = nome ? `Prontinho, ${nome}! ` : 'Prontinho! ';
  const oQueSegue = ehOrcamento ? 'o orçamento do material' : 'a lista de material';
  return `${abertura}Aqui está ${oQueSegue} de ${escola} - ${ano}${sufixoPeriodo}. `
    + 'Se precisar de mais alguma coisa, é só chamar por aqui.';
}

function processarObservacao(textoRecebido, sessao, contexto = {}) {
  const observacao = textoRecebido.trim();
  const {
    escolaSelecionada, escolaOutraNome, anoSelecionado, periodoSelecionado, listaMaterialOutraEscola,
  } = sessao.dados;
  const dados = { ...sessao.dados, observacao };

  // "Outra escola" (não está na lista carregada): não há PDF nem preço
  // automático pra buscar. Desde 28/08/2026 cria direto um orçamento em
  // rascunho (ação CRIAR_ORCAMENTO_LISTA_ESCOLAR, ver actions.js) e dispara o
  // Agente de Orçamento em segundo plano — sem cadastro fiscal e sem
  // perguntar entrega/endereço aqui (ver comentário no topo do arquivo). O
  // header "Escola: ... (ano)" como PRIMEIRA linha de itensTexto não é
  // estético: é o contrato com o node "É Cabeçalho de Escola?" do workflow
  // n8n "Agente Orçamento", que pula essa linha na hora de precificar — não
  // mude esse prefixo sem checar o workflow.
  if (!escolaSelecionada) {
    const origemOrcamento = {
      tipo: 'lista_escolar',
      escolaId: null,
      itensTexto: `Escola: ${escolaOutraNome} (${anoSelecionado})\n${listaMaterialOutraEscola}`,
      observacoes: observacao,
    };
    const nome = primeiroNome(contexto.nomeCliente);
    const abertura = nome ? `${nome}, r` : 'R';

    return {
      estado: ESTADO_SUBMENU_VENDAS,
      dados,
      resposta: `${abertura}ecebemos sua lista de material! Vamos calcular os preços e te avisamos `
        + 'por aqui assim que estiver pronto.',
      acoes: [{ tipo: 'CRIAR_ORCAMENTO_LISTA_ESCOLAR', dados: { origemOrcamento } }],
    };
  }

  const nomeEscola = escolaSelecionada.nome;
  const material = materiaisEscolares.buscarMaterial(nomeEscola, anoSelecionado, periodoSelecionado);

  // A Vanessa é sempre notificada (com ou sem PDF encontrado) para acompanhar
  // a demanda e poder ajudar caso o cliente tenha alguma observação.
  const acoes = [{
    tipo: 'NOTIFICAR_HUMANO',
    alvo: 'vendas',
    dados: {
      intencao: 'lista escolar',
      escola: nomeEscola,
      ano: anoSelecionado,
      periodo: periodoSelecionado,
      observacao,
      materialEnviadoAutomaticamente: Boolean(material),
      // Sinaliza pra Vanessa que essa turma foi atendida com a lista da escola
      // em vez do orçamento — é onde ela pode precisar cotar na mão.
      enviadoSemOrcamento: Boolean(material) && !material.ehOrcamento,
    },
  }];

  let resposta = mensagemAguardarAtendimento(contexto.nomeCliente);

  if (material) {
    acoes.push({
      tipo: 'ENVIAR_ARQUIVO',
      dados: { caminhoArquivo: material.caminhoAbsoluto, nomeArquivo: material.nomeArquivo },
    });
    resposta = montarMensagemComMaterial(
      nomeEscola, anoSelecionado, periodoSelecionado, contexto.nomeCliente, material.ehOrcamento,
    );
  }

  return {
    estado: ESTADO_SUBMENU_VENDAS,
    dados,
    resposta,
    acoes,
  };
}

module.exports = {
  // Exportado à parte (fora de `estados`) pra webhookController.js poder
  // reconhecer esse estado específico e customizar a mensagem de PDF recebido
  // (ver receberDocumentoPdf) sem duplicar a string literal.
  ESTADO_ESCOLA_OUTRA_LISTA_MATERIAL,
  estados: [
    { STATE: ESTADO_ESCOLA, mensagem: mensagemEscola, processar: processarEscola },
    {
      STATE: ESTADO_ESCOLA_OUTRA_NOME,
      mensagem: mensagemEscolaOutraNome,
      processar: processarEscolaOutraNome,
      aceitaTextoLivre: true,
    },
    { STATE: ESTADO_ANO, mensagem: mensagemAno, processar: processarAno },
    {
      STATE: ESTADO_ANO_OUTRO,
      mensagem: mensagemAnoOutro,
      processar: processarAnoOutro,
      aceitaTextoLivre: true,
    },
    {
      STATE: ESTADO_ESCOLA_OUTRA_LISTA_MATERIAL,
      mensagem: mensagemOutraListaMaterial,
      processar: processarOutraListaMaterial,
      aceitaTextoLivre: true,
    },
    { STATE: ESTADO_PERIODO, mensagem: mensagemPeriodo, processar: processarPeriodo },
    {
      STATE: ESTADO_OBSERVACAO,
      mensagem: mensagemObservacao,
      processar: processarObservacao,
      // Texto livre de verdade: um cliente pode digitar "menu", "0" etc. como
      // observação real, então este passo fica fora da interceptação de
      // comandos globais da stateMachine (ver comandosGlobais.js).
      aceitaTextoLivre: true,
    },
  ],
};
