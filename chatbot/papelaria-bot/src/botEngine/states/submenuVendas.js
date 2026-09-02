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

  // Bug real de teste (01/09): depois de ver a lista escolar, uma cliente
  // escreveu "Obrigado" aqui e caiu no fallback "Opção inválida". O dono
  // rejeitou explicitamente resolver isso ampliando a lista de saudações
  // (SAUDACOES, em menuEngine.js) — qualquer lista fixa de palavras-chave é
  // frágil, sempre existe uma variação nova que ela não prevê. A solução
  // estrutural: texto sem nenhum dígito (não é tentativa de digitar um
  // número de opção) cai na opção "Material escolar" — não porque o assunto
  // seja necessariamente material escolar, mas porque isso rotea pro Agente
  // de Vendas com o TEXTO ORIGINAL do cliente como intenção (ver menuEngine),
  // e é o próprio LLM quem decide o que responder a um agradecimento, uma
  // despedida ou uma pergunta livre de verdade — não uma lista de
  // palavras-chave determinística daqui. Ver `pareceTentativaNumerica` em
  // menuEngine.js para o detalhe completo da heurística.
  textoLivreVaiPara: '2',

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
    // direto pra Vanessa, sem passar pelo Agente de Vendas. O rótulo era só
    // "Atendimento", que soava como "tirar qualquer dúvida": em 10/08 uma
    // cliente escolheu essa opção pra perguntar se tinha papel crepom, algo que
    // as opções 2 a 5 respondem na hora. Deixar explícito que aqui entra na
    // fila humana empurra a pergunta de produto pro caminho que é instantâneo.
    // `pausarBot`: escolher esta opção tira o atendimento automático de cena até
    // a Vanessa (ou quem pegar) responder. Antes, o bot avisava "já vamos te
    // atender" e continuava no ar — a próxima mensagem do cliente levava o menu
    // de volta, por cima de quem já tinha sido chamado. Note a incoerência que
    // isso criava: digitar a PALAVRA "atendente" pausava o bot (comando global
    // de escalação), mas escolher a OPÇÃO escrita "Falar com um atendente" não.
    6: {
      rotulo: 'Falar com um atendente (pode ter espera)',
      tipo: 'notificar',
      alvo: 'vendas',
      intencao: 'atendimento',
      pausarBot: true,
    },
    7: {
      rotulo: 'Cotação pra empresa',
      tipo: 'estado',
      estado: 'COTACAO_EMPRESA_LISTA',
      limparCampos: CAMPOS_DE_UMA_COTACAO_ANTERIOR,
    },
  },
});
