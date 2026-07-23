// Estado do fluxo de "cotação pra empresa" (opção 7 do submenu de Vendas):
// pergunta a lista de itens que a empresa quer cotar e, em seguida, se há
// alguma observação — e então segue pro cadastro fiscal (cadastroFiscal.js),
// que fecha o orçamento e o pedido. Sem catálogo/preço automático: o bot só
// coleta os itens; quem precifica é o Agente de Orçamento no n8n.
//
// Mesmo formato de dois passos em sequência que listaEscolar.js (por isso
// exporta `estados: [...]` em vez de um único `{ STATE, mensagem, processar }`).

const cadastroFiscal = require('./cadastroFiscal');

const ESTADO_LISTA = 'COTACAO_EMPRESA_LISTA';
const ESTADO_OBSERVACAO = 'COTACAO_EMPRESA_OBSERVACAO';

// --- Passo 1: lista de itens ---

function mensagemLista() {
  return 'Perfeito! Me manda a lista de itens que a empresa quer cotar '
    + '(pode escrever tudo numa mensagem só, um item por linha).';
}

function processarLista(textoRecebido, sessao) {
  const itens = textoRecebido.trim();
  return {
    estado: ESTADO_OBSERVACAO,
    dados: { ...sessao.dados, itensCotacaoEmpresa: itens },
  };
}

// --- Passo 2: observação e encerramento ---

function mensagemObservacao() {
  return 'Alguma observação sobre essa cotação (prazo, quantidade, CNPJ da empresa, etc.)?';
}

function processarObservacao(textoRecebido, sessao, contexto = {}) {
  const observacao = textoRecebido.trim();
  const itens = sessao.dados.itensCotacaoEmpresa;
  const dados = { ...sessao.dados, observacaoCotacaoEmpresa: observacao };

  const origemOrcamento = {
    tipo: 'cotacao_empresa',
    escolaId: null,
    itensTexto: itens,
    observacoes: observacao,
  };

  // Cliente recorrente com cadastro fiscal completo (checagem silenciosa feita
  // em webhookController.js): pula o formulário inteiro e fecha o pedido direto.
  if (contexto.cadastroCompleto) {
    return {
      estado: cadastroFiscal.ESTADO_SUBMENU_VENDAS,
      dados,
      resposta: cadastroFiscal.MENSAGEM_CONFIRMANDO_PEDIDO,
      acoes: [cadastroFiscal.montarAcaoFechamento(origemOrcamento, null)],
    };
  }

  return {
    estado: cadastroFiscal.ESTADO_ATALHO,
    dados: { ...dados, origemOrcamento },
  };
}

module.exports = {
  estados: [
    { STATE: ESTADO_LISTA, mensagem: mensagemLista, processar: processarLista, aceitaTextoLivre: true },
    { STATE: ESTADO_OBSERVACAO, mensagem: mensagemObservacao, processar: processarObservacao, aceitaTextoLivre: true },
  ],
};
