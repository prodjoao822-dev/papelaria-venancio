// TRB-2026-0005 (12/09/2026): investigação de respostas duplicadas ao cliente
// (ex.: "Opção inválida" mandada duas vezes seguidas, casos reais de 13/08 e
// 11/09). A releitura de webhookController.js/menuEngine.js/stateMachine.js
// não achou nenhum caminho de código que chame `evolutionApi.enviarTexto` duas
// vezes pro mesmo resultado de `processarMensagem` — o suspeito que sobra é a
// Evolution API entregando o MESMO evento de mensagem duas vezes com um
// `mensagemId` DIFERENTE a cada entrega, o que passa batido pelo dedup por id
// já existente (`conversa.ultima_mensagem_id`).
//
// Este teste cobre só o que foi de fato adicionado: um log de diagnóstico, por
// mensagem processada no caminho de menu, cruzando `mensagemId` com a resposta
// enviada. Não é uma correção de comportamento (nenhum envio é suprimido) — é
// a evidência que faltava pra confirmar (ou descartar) a hipótese da próxima
// vez que o padrão se repetir em produção.

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
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-webhook-diagnostico-')),
  'ecos.json'
);

const logsDeInfo = [];
let conversaAtual;

function dubla(caminhoRelativo, exports) {
  const caminho = require.resolve(caminhoRelativo);
  require.cache[caminho] = {
    id: caminho, filename: caminho, loaded: true, exports,
  };
}

dubla('../../src/utils/logger', {
  info: (mensagem, dados) => logsDeInfo.push({ mensagem, dados }),
  aviso: () => {},
  erro: () => {},
});
dubla('../../src/services/clientesService', {
  upsertCliente: async (telefone) => ({ id: 'cliente-1', telefone, nome: 'Bruna' }),
  clienteTemCadastroCompleto: async () => false,
});
dubla('../../src/services/conversasService', {
  buscarOuCriarConversa: async () => conversaAtual,
  atualizarEstadoConversa: async () => {},
  pausarPosPedido: async () => {},
});
dubla('../../src/services/mensagensService', {
  registrarMensagem: async () => ({ id: 'msg-1' }),
});
dubla('../../src/services/evolutionApi', {
  enviarTexto: async () => ({}),
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
dubla('../../src/botEngine/actions', { executarAcoes: async () => {} });
dubla('../../src/services/escalonamentoService', { verificarEscalonamento: async () => {} });
dubla('../../src/integracoes/n8nClient', {
  consultarAgenteVendas: async () => ({ resposta: 'não deveria ser chamado neste teste' }),
  notificarAgenteOrcamento: async () => null,
});

const { receberWebhook } = require('../../src/webhook/webhookController');

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

function reset() {
  logsDeInfo.length = 0;
  conversaAtual = {
    id: 'conversa-1',
    estado_atual: 'MENU_PRINCIPAL',
    dados: { menuApresentado: true },
    bot_ativo: true,
    pausado_pos_pedido: false,
    ultima_interacao_em: new Date().toISOString(),
    ultima_mensagem_id: null,
  };
}

test('log de diagnóstico registra mensagemId + resposta a cada mensagem de menu processada', async () => {
  reset();

  await receberWebhook(webhookDeTexto('9', 'MSG-ABC-123'), respostaFalsa());

  const logDeResposta = logsDeInfo.find((l) => /Resposta de menu enviada/.test(l.mensagem));
  assert.ok(logDeResposta, `esperava um log de resposta de menu; logs recebidos: ${JSON.stringify(logsDeInfo)}`);
  assert.equal(logDeResposta.dados.mensagemId, 'MSG-ABC-123');
  assert.match(logDeResposta.mensagem, /inválida/i, 'opção "9" não existe no menu principal, deveria cair no fallback');
});

test('duas entregas de webhook com mensagemId DIFERENTE para o mesmo texto geram dois logs com ids distintos', async () => {
  // Reproduz por código o que não dá pra simular de verdade (a Evolution API
  // reentregando o mesmo evento com um id novo a cada cópia): duas chamadas
  // separadas a receberWebhook, mesmo texto, mesmo telefone, ids diferentes —
  // é exatamente o padrão que os dois logs abaixo precisam deixar rastreável.
  reset();

  await receberWebhook(webhookDeTexto('9', 'ID-UM'), respostaFalsa());
  await receberWebhook(webhookDeTexto('9', 'ID-DOIS'), respostaFalsa());

  const logsDeResposta = logsDeInfo.filter((l) => /Resposta de menu enviada/.test(l.mensagem));
  assert.equal(logsDeResposta.length, 2);
  assert.deepEqual(logsDeResposta.map((l) => l.dados.mensagemId), ['ID-UM', 'ID-DOIS']);
  assert.equal(
    logsDeResposta[0].mensagem,
    logsDeResposta[1].mensagem,
    'com o texto e telefone idênticos, a resposta logada também é idêntica — só o mensagemId muda'
  );
});
