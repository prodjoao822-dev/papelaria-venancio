// Motor da máquina de estados do bot: decide a transição de estado com base na mensagem recebida.
// Função pura: não faz I/O (sem WhatsApp, sem banco). Recebe sessão + texto, devolve nova sessão + resposta + ações.

const menuPrincipal = require('./states/menuPrincipal');
const submenuVendas = require('./states/submenuVendas');
const listaEscolar = require('./states/listaEscolar');
const cotacaoEmpresa = require('./states/cotacaoEmpresa');
const cadastroFiscal = require('./states/cadastroFiscal');
const agenteVendasAtivo = require('./states/agenteVendasAtivo');
const fallback = require('./states/fallback');
const comandosGlobais = require('./comandosGlobais');

const ESTADOS = {};

function registrarEstado(definicaoEstado) {
  ESTADOS[definicaoEstado.STATE] = definicaoEstado;
}

// Cada módulo de estado exporta ou um único { STATE, mensagem, processar }
// (a maioria dos casos) ou, quando o fluxo tem mais de uma pergunta em
// sequência (ex.: listaEscolar.js), um array `estados: [...]` com vários.
[menuPrincipal, submenuVendas, listaEscolar, cotacaoEmpresa, cadastroFiscal, agenteVendasAtivo, fallback].forEach((modulo) => {
  if (typeof modulo.STATE === 'string') {
    registrarEstado(modulo);
  } else if (Array.isArray(modulo.estados)) {
    modulo.estados.forEach(registrarEstado);
  }
});

function estadoInicial() {
  const pronto = typeof menuPrincipal.STATE === 'string'
    && typeof menuPrincipal.mensagem === 'function'
    && typeof menuPrincipal.processar === 'function';

  if (!pronto) {
    throw new Error(
      'menuPrincipal.js ainda não exporta STATE, mensagem() e processar(). Termine esse arquivo primeiro.'
    );
  }

  return { estado: menuPrincipal.STATE, dados: {} };
}

// Renderiza a mensagem de um estado (ou o aviso de "não implementado"),
// sempre passando { estado, dados, ...contexto } no formato que os módulos de
// estado já esperam receber. `contexto` carrega dados só de leitura que não
// fazem parte do fluxo persistido (hoje, só `nomeCliente`, usado para
// personalizar saudações) — por isso não entra em `dados`/Supabase.
function montarResposta(estado, dados, contexto = {}) {
  const definicaoEstado = ESTADOS[estado];
  if (definicaoEstado && typeof definicaoEstado.mensagem === 'function') {
    return definicaoEstado.mensagem({ estado, dados, ...contexto });
  }
  return `[estado "${estado}" ainda não foi implementado]`;
}

// Trata os comandos globais (menu/voltar/reiniciar/ajuda), que funcionam a
// partir de qualquer estado. Retorna null quando o texto não é um comando
// global, para o chamador seguir com o processamento normal do estado atual.
function processarComandoGlobal(comando, sessao, contexto) {
  if (comando === 'AJUDA') {
    const mensagemEstadoAtual = montarResposta(sessao.estado, sessao.dados, contexto);
    return {
      sessao,
      resposta: `${comandosGlobais.MENSAGEM_AJUDA}\n\n${mensagemEstadoAtual}`,
      acoes: [],
    };
  }

  if (comando === 'MENU' || comando === 'REINICIAR') {
    const novaSessao = { estado: comandosGlobais.ESTADO_MENU_PRINCIPAL, dados: {} };
    return { sessao: novaSessao, resposta: montarResposta(novaSessao.estado, novaSessao.dados, contexto), acoes: [] };
  }

  if (comando === 'ESCALACAO') {
    return {
      sessao,
      resposta: 'Entendido! Já avisei um atendente humano, ele(a) já te retorna por aqui.',
      acoes: [{
        tipo: 'NOTIFICAR_HUMANO',
        alvo: 'lideranca',
        dados: { intencao: `Cliente pediu atendente / registrou reclamação (estado: ${sessao.estado})` },
      }],
    };
  }

  if (comando === 'VOLTAR') {
    const pilha = sessao.dados?.historicoEstados || [];
    const destino = pilha.length > 0 ? pilha[pilha.length - 1] : comandosGlobais.ESTADO_MENU_PRINCIPAL;

    // Desempilha o passo que acabou de ser usado, pra uma segunda tentativa de
    // "#" continuar voltando (e não ficar presa sempre no mesmo lugar).
    const pilhaRestante = pilha.slice(0, -1);
    const { historicoEstados: _descartado, ...dadosSemHistorico } = sessao.dados || {};
    const dados = pilhaRestante.length > 0
      ? { ...dadosSemHistorico, historicoEstados: pilhaRestante }
      : dadosSemHistorico;

    const novaSessao = { estado: destino, dados };
    return { sessao: novaSessao, resposta: montarResposta(destino, dados, contexto), acoes: [] };
  }

  return null;
}

function processarMensagem(sessao, textoRecebido, contexto = {}) {
  const estadoAtual = ESTADOS[sessao.estado];
  const comando = comandosGlobais.identificarComando(textoRecebido);

  // ESCALACAO ("atendente"/"reclamação") é a única exceção que funciona mesmo
  // em estados de texto livre — precisa interromper qualquer fluxo, inclusive
  // no meio de uma observação (ver comandosGlobais.js).
  if (comando === 'ESCALACAO') {
    return processarComandoGlobal(comando, sessao, contexto);
  }

  // Estados que capturam texto livre de verdade (ex.: observação da lista
  // escolar) ficam de fora da interceptação dos demais comandos globais.
  if (!estadoAtual?.aceitaTextoLivre) {
    const resultadoComandoGlobal = comando && processarComandoGlobal(comando, sessao, contexto);
    if (resultadoComandoGlobal) {
      return resultadoComandoGlobal;
    }
  }

  if (!estadoAtual || typeof estadoAtual.processar !== 'function') {
    return {
      sessao,
      resposta: `[estado "${sessao.estado}" ainda não foi implementado]`,
      acoes: [],
    };
  }

  const resultado = estadoAtual.processar(textoRecebido, sessao, contexto);
  const dadosResultado = resultado.dados || sessao.dados;

  // Só empilha um passo de histórico quando o estado realmente mudou (ex.:
  // opção inválida mantém o cliente no mesmo estado e não deve virar um passo
  // navegável com "#"). A pilha completa (não só um nível) permite voltar
  // vários passos em fluxos multi-pergunta como a lista escolar.
  const dadosComHistorico = resultado.estado !== sessao.estado
    ? { ...dadosResultado, historicoEstados: [...(sessao.dados?.historicoEstados || []), sessao.estado] }
    : dadosResultado;

  const novaSessao = {
    estado: resultado.estado,
    dados: dadosComHistorico,
  };

  const resposta = resultado.resposta !== undefined
    ? resultado.resposta
    : montarResposta(resultado.estado, novaSessao.dados, contexto);

  return { sessao: novaSessao, resposta, acoes: resultado.acoes || [] };
}

module.exports = { estadoInicial, processarMensagem };
