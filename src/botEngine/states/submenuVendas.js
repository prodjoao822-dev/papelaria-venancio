// Estado do submenu de Vendas: opções Lista escolar, Material, Escritório,
// Informática, Brinquedos e Atendimento.
// Menu simples (opção -> próximo estado ou notificação), então é só
// configuração interpretada pelo menuEngine — ver menuEngine.js.

const { criarEstadoDeMenu } = require('../menuEngine');

// Campos descartados ao começar um fluxo de lista escolar do zero: são de uma
// eventual consulta anterior nesta mesma conversa. `escolas` (cache da lista
// vinda do Supabase) não entra aqui de propósito — continua sendo reaproveitada.
// `origemOrcamento`/`cadastroFiscal` também entram aqui: cobrem o caso do
// cliente abandonar o cadastro fiscal no meio e começar uma consulta nova.
const CAMPOS_DE_UMA_CONSULTA_ANTERIOR = [
  'escolaSelecionada', 'escolaOutraNome', 'anoSelecionado', 'periodoSelecionado', 'observacao',
  'listaMaterialOutraEscola', 'origemOrcamento', 'cadastroFiscal',
];

// Idem, para uma eventual cotação pra empresa anterior nesta mesma conversa.
const CAMPOS_DE_UMA_COTACAO_ANTERIOR = ['itensCotacaoEmpresa', 'observacaoCotacaoEmpresa', 'origemOrcamento', 'cadastroFiscal'];

module.exports = criarEstadoDeMenu({
  STATE: 'SUBMENU_VENDAS',

  rodape: 'Digite a opção desejada:',

  opcoes: {
    1: {
      rotulo: 'Lista escolar',
      tipo: 'estado',
      estado: 'LISTA_ESCOLAR_ESCOLA',
      limparCampos: CAMPOS_DE_UMA_CONSULTA_ANTERIOR,
    },
    // Opções de produto (2 a 5) vão pro Agente de Vendas (n8n), não mais
    // direto pra Vanessa: o webhookController faz a chamada síncrona e leva o
    // cliente pro estado de handoff AGENTE_VENDAS_ATIVO (ver B.1/B.2 do prompt
    // de integração de webhooks de agentes).
    2: { rotulo: 'Material escolar', tipo: 'consultarAgente', estado: 'AGENTE_VENDAS_ATIVO', intencao: 'material escolar' },
    3: {
      rotulo: 'Material de escritório',
      tipo: 'consultarAgente',
      estado: 'AGENTE_VENDAS_ATIVO',
      intencao: 'material de escritório',
    },
    4: { rotulo: 'Informática', tipo: 'consultarAgente', estado: 'AGENTE_VENDAS_ATIVO', intencao: 'informática' },
    5: { rotulo: 'Brinquedos', tipo: 'consultarAgente', estado: 'AGENTE_VENDAS_ATIVO', intencao: 'brinquedos' },
    // Pedido explícito de humano (não é pergunta de produto) — continua indo
    // direto pra Vanessa, sem passar pelo Agente de Vendas.
    6: { rotulo: 'Atendimento', tipo: 'notificar', alvo: 'vendas', intencao: 'atendimento' },
    7: {
      rotulo: 'Cotação pra empresa',
      tipo: 'estado',
      estado: 'COTACAO_EMPRESA_LISTA',
      limparCampos: CAMPOS_DE_UMA_COTACAO_ANTERIOR,
    },
  },
});
