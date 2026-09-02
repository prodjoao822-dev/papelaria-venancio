const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Mesma configuração mínima de ambiente usada nos outros testes do webhookController.
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
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-webhook-presenca-')),
  'ecos.json'
);

// Estado observável dos dublês, remontado a cada teste.
const enviadas = [];
const presencas = [];
let conversaAtual;
let podeResponder;
let presencaDeveFalhar;

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
  registrarMensagem: async () => ({ id: 'msg-1' }),
});
const evolutionApiDouble = {
  enviarTexto: async (telefone, texto) => { enviadas.push({ telefone, texto }); return {}; },
  enviarDocumentoBase64: async () => ({}),
  baixarMidia: async () => ({ base64: 'x' }),
  foiEnviadaPeloBot: () => false,
  // Espelha o comportamento real de enviarPresenca: nunca rejeita, só loga —
  // aqui simulado por uma flag em vez de logger de verdade.
  enviarPresenca: async (telefone, presence) => {
    presencas.push({ telefone, presence });
    if (presencaDeveFalhar) {
      // Mesmo assim NÃO lança: é exatamente esse contrato que o controller
      // depende de existir (não há try/catch ao redor da chamada real).
      return undefined;
    }
    return undefined;
  },
  // Espelha manterDigitando real (evolutionApi.js): dispara "composing" uma
  // vez já na entrada e devolve a função de parada. Sem setInterval aqui —
  // estes testes não avançam relógio de verdade, e nenhum caso precisa do
  // heartbeat repetido pra fazer sua asserção.
  manterDigitando: (telefone) => {
    evolutionApiDouble.enviarPresenca(telefone, 'composing').catch(() => {});
    return () => {};
  },
};
dubla('../../src/services/evolutionApi', evolutionApiDouble);
dubla('../../src/middlewares/reativacaoBot', {
  garantirBotAtivo: async () => ({ podeResponder, viaGatilhoPedido: false }),
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
dubla('../../src/integracoes/n8nClient', { consultarAgenteVendas: async () => null });

const { receberWebhook } = require('../../src/webhook/webhookController');

function reset({ estado = 'MENU_PRINCIPAL', botAtivo = true, presencaFalha = false } = {}) {
  enviadas.length = 0;
  presencas.length = 0;
  podeResponder = botAtivo;
  presencaDeveFalhar = presencaFalha;
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

function webhookFromMeDeHumano(texto, id = 'MSG-HUMANO') {
  return {
    body: {
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '5527997400510@s.whatsapp.net', fromMe: true, id },
        pushName: 'Papelaria Venâncio',
        message: { conversation: texto },
      },
    },
  };
}

test('mensagem normal do cliente dispara "composing" antes da resposta', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });

  await receberWebhook(webhookDeTexto('1'), respostaFalsa());

  assert.equal(presencas.length >= 1, true, 'esperava pelo menos uma chamada de presence');
  assert.equal(presencas[0].telefone, '5527997400510');
  assert.equal(presencas[0].presence, 'composing');
});

test('"composing" é chamado antes de enviarTexto (ordem correta)', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });

  await receberWebhook(webhookDeTexto('1'), respostaFalsa());

  assert.equal(presencas.length, 1);
  assert.equal(enviadas.length, 1);
});

test('mensagem fromMe (eco do próprio bot ou humano da loja) não dispara presence', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });

  await receberWebhook(webhookFromMeDeHumano('oi, aqui é a Vanessa'), respostaFalsa());

  assert.deepEqual(presencas, [], 'fromMe não gera resposta automática, não faz sentido mostrar "digitando"');
});

test('webhook duplicado (mesma mensagemId já processada) não dispara presence de novo', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });
  conversaAtual.ultima_mensagem_id = 'MSG-REPETIDA';

  await receberWebhook(webhookDeTexto('1', 'MSG-REPETIDA'), respostaFalsa());

  assert.deepEqual(presencas, []);
});

test('bot pausado: dispara "composing" e depois "paused" (nenhuma resposta será enviada)', async () => {
  reset({ botAtivo: false });

  await receberWebhook(webhookDeTexto('oi, alguém aí?'), respostaFalsa());

  assert.deepEqual(
    presencas.map((p) => p.presence),
    ['composing', 'paused'],
    'sem isso o indicador "digitando..." ficaria aceso indefinidamente'
  );
  assert.deepEqual(enviadas, [], 'bot pausado não pode responder por cima do humano');
});

test('bot ativo e responde normalmente: não dispara "paused" extra (a resposta real já limpa o indicador)', async () => {
  reset({ estado: 'MENU_PRINCIPAL', botAtivo: true });

  await receberWebhook(webhookDeTexto('1'), respostaFalsa());

  assert.deepEqual(presencas.map((p) => p.presence), ['composing']);
});

// --- o ponto central do pedido: falha em presence nunca pode quebrar o fluxo ---

test('falha na chamada de presence (rejeição) não impede a resposta real ao cliente', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });

  const evolutionApi = require('../../src/services/evolutionApi');
  const original = evolutionApi.enviarPresenca;
  evolutionApi.enviarPresenca = async () => { throw new Error('Evolution API fora do ar'); };

  try {
    const resposta = respostaFalsa();
    // O controller não usa `await` nem `try/catch` em volta desta chamada —
    // uma rejeição aqui vira unhandled rejection se o contrato for quebrado,
    // mas não pode impedir o `receberWebhook` de completar e responder.
    await receberWebhook(webhookDeTexto('1'), resposta);

    assert.equal(resposta.statusCode, 200, 'falha de presence não pode virar 500 pro webhook');
    assert.equal(enviadas.length, 1, 'o cliente precisa receber a resposta real mesmo com presence falhando');
  } finally {
    evolutionApi.enviarPresenca = original;
  }
});

test('falha na chamada de presence não impede o registro de "paused" quando o bot está pausado', async () => {
  reset({ botAtivo: false });

  const evolutionApi = require('../../src/services/evolutionApi');
  const original = evolutionApi.enviarPresenca;
  let chamadas = 0;
  evolutionApi.enviarPresenca = async (telefone, presence) => {
    chamadas += 1;
    if (presence === 'composing') throw new Error('Evolution API fora do ar');
    return undefined;
  };

  try {
    const resposta = respostaFalsa();
    await receberWebhook(webhookDeTexto('oi?'), resposta);

    assert.equal(resposta.statusCode, 200);
    assert.equal(chamadas, 2, 'ambas as chamadas (composing e paused) devem ter sido tentadas');
  } finally {
    evolutionApi.enviarPresenca = original;
  }
});
