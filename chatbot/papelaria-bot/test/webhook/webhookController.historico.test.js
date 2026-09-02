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
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-webhook-')),
  'ecos.json'
);

// Estado observável dos dublês, remontado a cada teste.
const historico = [];
const enviadas = [];
const pausas = [];
let conversaAtual;
let podeResponder;

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
  atualizarEstadoConversa: async () => {},
});
dubla('../../src/services/mensagensService', {
  registrarMensagem: async (conversaId, remetente, conteudo) => {
    historico.push({ remetente, conteudo });
    return { id: 'msg-1' };
  },
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
  garantirBotAtivo: async () => ({ podeResponder, viaGatilhoPedido: false }),
  pausarBot: async (conversaId, motivo) => { pausas.push({ conversaId, motivo }); },
});
dubla('../../src/services/escolasService', { listarEscolasAtivas: async () => [] });
dubla('../../src/services/pedidosService', {
  pedidoAtivoCliente: async () => null,
  orcamentoAtivoCliente: async () => null,
});
dubla('../../src/services/orcamentosService', { buscarOrcamentoPorId: async () => null });
dubla('../../src/services/arquivosClienteService', { salvarPdfRecebido: async () => ({ url: null }) });
dubla('../../src/botEngine/actions', { executarAcoes: async () => {} });
dubla('../../src/integracoes/n8nClient', { consultarAgenteVendas: async () => null });

const { receberWebhook } = require('../../src/webhook/webhookController');

function reset({ estado = 'MENU_PRINCIPAL', botAtivo = true } = {}) {
  historico.length = 0;
  enviadas.length = 0;
  pausas.length = 0;
  podeResponder = botAtivo;
  conversaAtual = {
    id: 'conversa-1',
    estado_atual: estado,
    dados: {},
    bot_ativo: botAtivo,
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

function webhookDeTexto(texto, id = 'MSG-1') {
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

const remetentes = () => historico.map((m) => m.remetente);

// --- a correção de 13/08 ---
//
// O early-return de bot pausado dizia em comentário "só registra a mensagem",
// mas não registrava nada. Somado ao fato de o fluxo de menu também não gravar,
// a tela de Atendimento ficava vazia justamente nas conversas em que um humano
// precisava entender o que o cliente tinha pedido.

test('mensagem que chega com o bot pausado entra no histórico', async () => {
  reset({ botAtivo: false });

  await receberWebhook(webhookDeTexto('alguém pode me ajudar?'), respostaFalsa());

  assert.deepEqual(historico, [{ remetente: 'cliente', conteudo: 'alguém pode me ajudar?' }]);
});

test('com o bot pausado, nada é enviado ao cliente (só registra)', async () => {
  reset({ botAtivo: false });

  await receberWebhook(webhookDeTexto('oi?'), respostaFalsa());

  assert.deepEqual(enviadas, [], 'o humano está atendendo; o bot não pode falar por cima');
});

test('navegação por menu grava os dois lados da conversa', async () => {
  reset();

  await receberWebhook(webhookDeTexto('1'), respostaFalsa());

  assert.deepEqual(remetentes(), ['cliente', 'bot']);
  assert.equal(historico[0].conteudo, '1');
  assert.ok(historico[1].conteudo.length > 0);
});

test('o que foi gravado como "bot" é exatamente o que foi enviado ao cliente', async () => {
  reset();

  await receberWebhook(webhookDeTexto('1'), respostaFalsa());

  const registradoComoBot = historico.find((m) => m.remetente === 'bot').conteudo;
  assert.equal(enviadas.length, 1);
  assert.equal(registradoComoBot, enviadas[0].texto);
});

// O n8n grava por conta própria as conversas que passam pelo Agente de Vendas
// (nós "Supabase · Grava Resposta"). Se o controller gravasse também, o
// histórico sairia duplicado na tela do operador.
test('mensagem entregue ao Agente de Vendas não é gravada aqui', async () => {
  reset({ estado: 'AGENTE_VENDAS_ATIVO' });

  await receberWebhook(webhookDeTexto('tem papel report?'), respostaFalsa());

  assert.deepEqual(historico, [], 'gravar aqui duplicaria o que o n8n já grava');
});

test('webhook duplicado não gera histórico repetido', async () => {
  reset();
  conversaAtual.ultima_mensagem_id = 'MSG-REPETIDA';

  await receberWebhook(webhookDeTexto('1', 'MSG-REPETIDA'), respostaFalsa());

  assert.deepEqual(historico, []);
});

test('falha ao gravar o histórico não impede a resposta ao cliente', async () => {
  reset();
  const mensagensService = require('../../src/services/mensagensService');
  const original = mensagensService.registrarMensagem;
  mensagensService.registrarMensagem = async () => { throw new Error('Supabase fora do ar'); };

  try {
    const resposta = respostaFalsa();
    await receberWebhook(webhookDeTexto('1'), resposta);

    assert.equal(resposta.statusCode, 200, 'histórico é auditoria, não pode derrubar o webhook');
    assert.equal(enviadas.length, 1, 'o cliente precisa receber a resposta mesmo assim');
  } finally {
    mensagensService.registrarMensagem = original;
  }
});

// --- correção de 13/08: "Falar com um atendente" precisa calar o bot ---

test('escolher "falar com um atendente" pausa o atendimento automático', async () => {
  reset({ estado: 'SUBMENU_VENDAS' });

  await receberWebhook(webhookDeTexto('6'), respostaFalsa());

  assert.equal(pausas.length, 1);
  assert.equal(pausas[0].conversaId, 'conversa-1');
  assert.match(pausas[0].motivo, /atendente/i);
});

test('o cliente ainda recebe a confirmação de que será atendido', async () => {
  reset({ estado: 'SUBMENU_VENDAS' });

  await receberWebhook(webhookDeTexto('6'), respostaFalsa());

  assert.equal(enviadas.length, 1);
  assert.match(enviadas[0].texto, /já vamos te atender/);
});

// A pausa é o ponto todo: sem ela, a mensagem seguinte trazia o menu de volta
// por cima da atendente que já tinha sido chamada.
test('depois de pedir atendente, a próxima mensagem não recebe o menu', async () => {
  reset({ estado: 'SUBMENU_VENDAS' });
  await receberWebhook(webhookDeTexto('6', 'MSG-1'), respostaFalsa());

  // Estado do mundo depois da pausa: é o que garantirBotAtivo passaria a devolver.
  podeResponder = false;
  enviadas.length = 0;
  await receberWebhook(webhookDeTexto('Oi', 'MSG-2'), respostaFalsa());

  assert.deepEqual(enviadas, [], 'quem responde agora é a atendente, não o bot');
});

test('opções de menu que não pedem atendente não pausam nada', async () => {
  reset({ estado: 'SUBMENU_VENDAS' });

  await receberWebhook(webhookDeTexto('1'), respostaFalsa());

  assert.deepEqual(pausas, []);
});
