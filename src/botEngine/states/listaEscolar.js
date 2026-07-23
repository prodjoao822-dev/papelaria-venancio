// Estado do fluxo de lista escolar: pergunta a escola, o ano/série do aluno,
// o período (só quando a escola tiver Integral/Regular pra aquele ano) e por
// fim se há alguma observação — e então:
//   - escola conhecida: se já existe o PDF da lista de material pra essa
//     combinação, o bot manda o arquivo direto pelo WhatsApp do cliente (ação
//     ENVIAR_ARQUIVO); de qualquer forma, sempre notifica a Vanessa com o
//     pedido completo (escola, ano, período e observação);
//   - "outra escola" (não está na lista carregada): não há PDF automático pra
//     buscar, então em vez de só notificar, o fluxo segue pro cadastro fiscal
//     (cadastroFiscal.js) e cria um orçamento formal, igual à cotação pra
//     empresa.
//
// É um módulo com vários estados (em vez de 1) porque o fluxo tem várias
// perguntas em sequência. Por isso exporta `estados: [...]` em vez de um único
// `{ STATE, mensagem, processar }` — a stateMachine sabe registrar os dois formatos.

const fallback = require('./fallback');
const cadastroFiscal = require('./cadastroFiscal');
const materiaisEscolares = require('../../config/materiaisEscolares');
const { parseOpcaoNumerica } = require('../validadores');
const { primeiroNome, mensagemAguardarAtendimento } = require('../mensagensComuns');

const ESTADO_ESCOLA = 'LISTA_ESCOLAR_ESCOLA';
const ESTADO_ESCOLA_OUTRA_NOME = 'LISTA_ESCOLAR_ESCOLA_OUTRA_NOME';
const ESTADO_ESCOLA_OUTRA_LISTA_MATERIAL = 'LISTA_ESCOLAR_ESCOLA_OUTRA_LISTA_MATERIAL';
const ESTADO_ANO = 'LISTA_ESCOLAR_ANO';
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
// Os nomes aqui precisam bater exatamente com as chaves usadas em
// src/config/materiaisEscolares.js — são as 4 escolas de teste que já têm
// PDF de lista de material cadastrado.
const ESCOLAS_EXEMPLO = [
  { id: 'cec', nome: 'CEC' },
  { id: 'multipla', nome: 'Múltipla' },
  { id: 'linus-pauling', nome: 'Linus Pauling' },
  { id: 'mundo-livre', nome: 'Mundo Livre' },
];

// Lista de séries confirmada com o dono do projeto.
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

function mensagemAno() {
  return `Qual o ano?\n\n${numerarOpcoes(ANOS_DISPONIVEIS)}`;
}

function processarAno(textoRecebido, sessao) {
  const indice = parseOpcaoNumerica(textoRecebido, ANOS_DISPONIVEIS.length);

  if (indice === null) {
    return { estado: ESTADO_ANO, resposta: fallback.mensagemOpcaoInvalida(mensagemAno()) };
  }

  const anoEscolhido = ANOS_DISPONIVEIS[indice];
  const dados = { ...sessao.dados, anoSelecionado: anoEscolhido };
  const nomeEscola = sessao.dados.escolaSelecionada?.nome;

  // "Outra escola": não há PDF automático pra buscar, então (diferente da
  // rota de escola conhecida) o bot precisa pedir a lista de material em si
  // — é o dado principal que o Agente de Orçamento usa pra cotar.
  if (!nomeEscola) {
    return { estado: ESTADO_ESCOLA_OUTRA_LISTA_MATERIAL, dados };
  }

  // Só pergunta o período (Integral/Regular) quando a escola realmente tiver
  // as duas versões cadastradas pra esse ano (hoje, só a Linus Pauling do 1º
  // ao 5º ano). Pra todas as outras combinações, pula direto pra observação.
  const precisaPerguntarPeriodo = materiaisEscolares.temVariacaoDePeriodo(nomeEscola, anoEscolhido);

  return { estado: precisaPerguntarPeriodo ? ESTADO_PERIODO : ESTADO_OBSERVACAO, dados };
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

function processarOutraListaMaterial(textoRecebido, sessao) {
  const listaMaterial = textoRecebido.trim();

  if (!listaMaterial) {
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

function montarMensagemComMaterial(escola, ano, periodo, nomeCliente) {
  const sufixoPeriodo = periodo ? ` (Período ${periodo})` : '';
  const nome = primeiroNome(nomeCliente);
  const abertura = nome ? `Prontinho, ${nome}! ` : 'Prontinho! ';
  return `${abertura}Aqui está a lista de material de ${escola} - ${ano}${sufixoPeriodo}. `
    + 'Se precisar de mais alguma coisa, é só chamar por aqui.';
}

function processarObservacao(textoRecebido, sessao, contexto = {}) {
  const observacao = textoRecebido.trim();
  const {
    escolaSelecionada, escolaOutraNome, anoSelecionado, periodoSelecionado, listaMaterialOutraEscola,
  } = sessao.dados;
  const dados = { ...sessao.dados, observacao };

  // "Outra escola" (não está na lista carregada): não há PDF automático pra
  // buscar aqui — em vez de só notificar, cria orçamento formal e segue pro
  // cadastro fiscal, igual à cotação pra empresa. `itensTexto` usa a lista de
  // material real coletada em ESTADO_ESCOLA_OUTRA_LISTA_MATERIAL, com a
  // escola/ano como cabeçalho pra dar contexto pro Agente de Orçamento.
  if (!escolaSelecionada) {
    const origemOrcamento = {
      tipo: 'lista_escolar',
      escolaId: null,
      itensTexto: `Escola: ${escolaOutraNome} (${anoSelecionado})\n${listaMaterialOutraEscola}`,
      observacoes: observacao,
    };

    if (contexto.cadastroCompleto) {
      return {
        estado: ESTADO_SUBMENU_VENDAS,
        dados,
        resposta: cadastroFiscal.MENSAGEM_CONFIRMANDO_PEDIDO,
        acoes: [cadastroFiscal.montarAcaoFechamento(origemOrcamento, null)],
      };
    }

    return { estado: cadastroFiscal.ESTADO_ATALHO, dados: { ...dados, origemOrcamento } };
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
    },
  }];

  let resposta = mensagemAguardarAtendimento(contexto.nomeCliente);

  if (material) {
    acoes.push({
      tipo: 'ENVIAR_ARQUIVO',
      dados: { caminhoArquivo: material.caminhoAbsoluto, nomeArquivo: material.nomeArquivo },
    });
    resposta = montarMensagemComMaterial(nomeEscola, anoSelecionado, periodoSelecionado, contexto.nomeCliente);
  }

  return {
    estado: ESTADO_SUBMENU_VENDAS,
    dados,
    resposta,
    acoes,
  };
}

module.exports = {
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
