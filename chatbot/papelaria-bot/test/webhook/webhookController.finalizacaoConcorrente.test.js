// TRB-2026-0020: a trava de dupla-finalização (`conversasEmFinalizacao`, ver
// webhookController.js) nunca foi exercitada por um teste de verdade — os
// testes existentes dublam `botEngine/actions` inteiro e nunca fazem duas
// chamadas concorrentes com uma ação FINALIZAR_CADASTRO_E_PEDIDO pendente, então
// a cobertura de LINHA (o `if`/`add`/`delete` roda em outros testes) escondia
// que o bloco de concorrência em si nunca foi provado.
//
// Mesmo padrão de dublê por require.cache dos outros testes de webhook —
// nenhuma chamada real sai do processo. Diferente de webhookController.rotas
// e .concorrencia, este arquivo dubla `botEngine/stateMachine` inteiro (dublê
// PRÓPRIO deste arquivo, não usado em nenhum outro teste): o que se quer
// provar aqui é só o comportamento do LOCK em torno de
// `actions.executarAcoes`, então a stateMachine real (com seus muitos passos
// de cadastro fiscal) só adicionaria ruído — o que importa é que o resultado
// de `processarMensagem` inclua a ação `FINALIZAR_CADASTRO_E_PEDIDO`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

process.env.EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:0';
process.env.EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'TESTE';
process.env.EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'chave-de-teste';
process.env.WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN || 'token-de-teste';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:0';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'chave-de-teste';
process.env.PHONE_CHEFE = process.env.PHONE_CHEFE || '5527000000001';
process.env.PHONE_COMPRAS = process.env.PHONE_COMPRAS || '5527000000002';
process.env.PHONE_SERVICOS = process.env.PHONE_SERVICOS || '5527000000003';
process.env.PHONE_VANESSA = process.env.PHONE_VANESSA || '5527000000004';
process.env.REGISTRO_ECOS_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-webhook-finalizacao-')),
  'ecos.json'
);

// --- estado observável dos dublês, remontado a cada teste ---
const enviadas = [];
const estadosAtualizados = [];
let conversaAtual;
let chamadasExecutarAcoes;
// { promise } armada pela PRÓXIMA chamada a actions.executarAcoes — só ela
// trava; sem trava armada, executarAcoes resolve na hora (mesmo critério do
// dublê de n8nClient em webhookController.concorrencia.test.js).
let travaArmada;
let avisarEntrou; // resolve da promise que sinaliza "executarAcoes começou e o lock já está de pé"

function dubla(caminhoRelativo, exports) {
  const caminho = require.resolve(caminhoRelativo);
  require.cache[caminho] = {
    id: caminho, filename: caminho, loaded: true, exports,
  };
}

dubla('../../src/services/clientesService', {
  upsertCliente: async (telefone) => ({ id: 'cliente-1', telefone, nome: 'Bruna' }),
  clienteTemCadastroCompleto: async () => false,
});
dubla('../../src/services/conversasService', {
  buscarOuCriarConversa: async () => conversaAtual,
  atualizarEstadoConversa: async (conversaId, estado, dados, mensagemId) => {
    estadosAtualizados.push({
      conversaId, estado, dados, mensagemId,
    });
  },
  pausarPosPedido: async () => {},
});
dubla('../../src/services/mensagensService', {
  registrarMensagem: async () => ({ id: 'msg-1' }),
});
dubla('../../src/services/evolutionApi', {
  enviarTexto: async (telefone, texto) => { enviadas.push({ telefone, texto }); return {}; },
  enviarDocumentoBase64: async () => ({}),
  baixarMidia: async () => ({ base64: 'x' }),
  foiEnviadaPeloBot: () => false,
  enviarPresenca: async () => {},
  manterDigitando: () => () => {},
});
dubla('../../src/middlewares/reativacaoBot', {
  garantirBotAtivo: async () => ({ podeResponder: true, viaGatilhoPedido: false }),
  pausarBot: async () => {},
});
dubla('../../src/services/escolasService', { listarEscolasAtivas: async () => [] });
dubla('../../src/services/pedidosService', {
  pedidoAtivoCliente: async () => null,
  orcamentoAtivoCliente: async () => null,
});
dubla('../../src/services/orcamentosService', { buscarOrcamentoPorId: async () => null });
dubla('../../src/services/arquivosClienteService', { salvarPdfRecebido: async () => ({ url: null }) });
dubla('../../src/services/escalonamentoService', { verificarEscalonamento: async () => {} });
dubla('../../src/integracoes/n8nClient', {
  consultarAgenteVendas: async () => ({ resposta: 'não deveria ser chamado neste arquivo' }),
  notificarAgenteOrcamento: async () => null,
});

// Dublê PRÓPRIO deste arquivo (ver comentário do topo): sempre devolve uma
// ação FINALIZAR_CADASTRO_E_PEDIDO, independente do texto recebido — o alvo do
// teste é o lock em volta dela, não o caminho do cadastro fiscal em si.
dubla('../../src/botEngine/stateMachine', {
  processarMensagem: () => ({
    sessao: { estado: 'MENU_PRINCIPAL', dados: {} },
    resposta: 'Perfeito! Já estou confirmando seu pedido...',
    acoes: [{
      tipo: 'FINALIZAR_CADASTRO_E_PEDIDO',
      dados: {
        origemOrcamento: { tipo: 'venda_geral', itensTexto: '1x caderno universitário' },
        cadastroFiscal: null,
      },
    }],
  }),
  estadoInicial: () => ({ estado: 'MENU_PRINCIPAL', dados: {} }),
});

// Dublê PRÓPRIO: ao contrário de rotas.test.js/concorrencia.test.js (que
// resolvem na hora), aqui `executarAcoes` precisa poder ficar pendurada — é
// assim que se reproduz de verdade "a primeira mensagem ainda está
// processando" quando a segunda chega.
dubla('../../src/botEngine/actions', {
  executarAcoes: async () => {
    chamadasExecutarAcoes += 1;

    if (travaArmada) {
      const trava = travaArmada;
      travaArmada = null; // só esta chamada trava; a próxima resolve/rejeita na hora
      if (avisarEntrou) {
        const avisar = avisarEntrou;
        avisarEntrou = null;
        avisar();
      }
      await trava.promise; // pode resolver (sucesso) ou rejeitar (falha simulada)
    }
  },
});

const { receberWebhook } = require('../../src/webhook/webhookController');

function reset({ estado = 'CADASTRO_FISCAL_CONFIRMACAO' } = {}) {
  enviadas.length = 0;
  estadosAtualizados.length = 0;
  chamadasExecutarAcoes = 0;
  travaArmada = null;
  avisarEntrou = null;
  conversaAtual = {
    id: 'conversa-1',
    estado_atual: estado,
    dados: {},
    bot_ativo: true,
    pausado_pos_pedido: false,
    ultima_interacao_em: new Date().toISOString(),
    ultima_mensagem_id: null,
  };
}

function respostaFalsa() {
  const resposta = { statusCode: null, corpo: null };
  resposta.status = (codigo) => { resposta.statusCode = codigo; return resposta; };
  resposta.json = (corpo) => { resposta.corpo = corpo; return resposta; };
  return resposta;
}

function webhookDeTexto(texto, id) {
  return {
    body: {
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '5527997400510@s.whatsapp.net', fromMe: false, id },
        pushName: 'Bruna',
        message: { conversation: texto },
      },
    },
  };
}

// Abre uma janela: dispara `receberWebhook` e só devolve o controle quando
// `executarAcoes` já entrou (ou seja, o lock `conversasEmFinalizacao` já está
// de pé) — evita qualquer corrida artificial entre o teste e a promise em voo.
function abrirJanelaFinalizacao() {
  let liberar;
  let rejeitar;
  const promise = new Promise((resolve, reject) => { liberar = resolve; rejeitar = reject; });
  travaArmada = { promise };
  const entrou = new Promise((resolve) => { avisarEntrou = resolve; });
  return {
    entrou, liberar, rejeitar,
  };
}

test('dupla finalização concorrente: a segunda mensagem recebe o aviso de espera e NÃO chama executarAcoes de novo', async () => {
  reset();
  const janela = abrirJanelaFinalizacao();

  const primeira = receberWebhook(webhookDeTexto('sim', 'MSG-1'), respostaFalsa());
  await janela.entrou; // a primeira já está dentro do lock, pendurada em executarAcoes

  const respostaSegunda = respostaFalsa();
  await receberWebhook(webhookDeTexto('sim', 'MSG-2'), respostaSegunda);

  assert.equal(chamadasExecutarAcoes, 1, 'a segunda mensagem não pode disparar um segundo fechamento');
  assert.equal(respostaSegunda.statusCode, 200);
  assert.match(
    enviadas[enviadas.length - 1].texto,
    /aguarde um momento/i,
    'a segunda mensagem precisa receber o aviso de "aguarde", não uma segunda confirmação de pedido'
  );

  janela.liberar();
  await primeira;

  // Depois de liberada, a primeira mensagem só executa a ação UMA vez — a
  // segunda mensagem nunca chegou a rodar a sua própria via de executarAcoes.
  assert.equal(chamadasExecutarAcoes, 1);
});

test('o lock é liberado no finally mesmo quando executarAcoes lança uma exceção — a próxima mensagem não fica travada pra sempre', async () => {
  reset();
  const janela = abrirJanelaFinalizacao();

  const respostaPrimeira = respostaFalsa();
  const primeira = receberWebhook(webhookDeTexto('sim', 'MSG-1'), respostaPrimeira);
  await janela.entrou;

  janela.rejeitar(new Error('Supabase fora do ar ao criar/aceitar o orçamento'));
  await primeira;

  // A falha propaga até o catch geral de receberWebhook (nenhum código deste
  // arquivo engole a exceção) — o cliente daquela mensagem recebe 500, mas o
  // que este teste precisa provar é que o `finally` da trava rodou mesmo assim.
  assert.equal(respostaPrimeira.statusCode, 500);

  const respostaSegunda = respostaFalsa();
  await receberWebhook(webhookDeTexto('sim', 'MSG-2'), respostaSegunda);

  assert.equal(
    chamadasExecutarAcoes,
    2,
    'a segunda tentativa precisa conseguir rodar — se o lock tivesse ficado preso, executarAcoes nunca seria chamada de novo'
  );
  assert.equal(respostaSegunda.statusCode, 200);
  assert.doesNotMatch(
    enviadas[enviadas.length - 1]?.texto || '',
    /aguarde um momento/i,
    'não pode ser tratada como concorrente: o lock da tentativa anterior já foi liberado'
  );
});
