const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.N8N_VENDAS_WEBHOOK_URL = 'http://localhost:0/webhook/venancio/agente-vendas';
process.env.AGENTE_VENDAS_TIMEOUT_MS = '6000';

// Dublê do mensagensService: é dele que a recuperação lê a resposta que o n8n
// gravou. Trocado antes de carregar o n8nClient, pra não tocar no Supabase.
const caminhoMensagens = require.resolve('../../src/services/mensagensService');
let respostaNoBanco = null;
let consultasAoBanco = 0;

require.cache[caminhoMensagens] = {
  id: caminhoMensagens,
  filename: caminhoMensagens,
  loaded: true,
  exports: {
    buscarUltimaMensagemBotAposInstante: async () => {
      consultasAoBanco += 1;
      return respostaNoBanco;
    },
  },
};

const n8nClient = require('../../src/integracoes/n8nClient');

function erroDeLeitura() {
  const erro = new TypeError('fetch failed');
  erro.cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', syscall: 'read' });
  return erro;
}

function erroDeConexao() {
  const erro = new TypeError('fetch failed');
  erro.cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED', syscall: 'connect' });
  return erro;
}

const payload = { cliente_id: 'cli-1', conversa_id: 'conv-1', telefone: '5527999999999', texto: 'oi' };

// Em 08/08/2026 a conexão caiu 287ms depois do envio; o bot desistiu e ainda
// disparou uma segunda tentativa. O n8n registrou DUAS execuções (11437 e
// 11438), as duas concluídas com sucesso, enquanto o cliente ficava sem
// resposta e a conversa era pausada à toa.
test('conexão perdida após o envio não reenvia — busca a resposta que o n8n gravou', async () => {
  const fetchOriginal = global.fetch;
  let envios = 0;
  global.fetch = async () => { envios += 1; throw erroDeLeitura(); };
  respostaNoBanco = { conteudo: 'Claro, posso te ajudar com isso!' };
  consultasAoBanco = 0;

  try {
    const resultado = await n8nClient.consultarAgenteVendas(payload);

    assert.equal(envios, 1, 'reenviar criaria uma segunda execução concorrente no n8n');
    assert.equal(resultado.resposta, 'Claro, posso te ajudar com isso!');
    assert.equal(resultado.recuperadoViaSupabase, true);
  } finally {
    global.fetch = fetchOriginal;
  }
});

test('a recuperação insiste enquanto a execução do n8n ainda não gravou', async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => { throw erroDeLeitura(); };
  consultasAoBanco = 0;
  respostaNoBanco = null;

  // Só aparece na terceira leitura, como se o agente tivesse levado ~3s.
  const mensagensService = require('../../src/services/mensagensService');
  const buscaOriginal = mensagensService.buscarUltimaMensagemBotAposInstante;
  mensagensService.buscarUltimaMensagemBotAposInstante = async () => {
    consultasAoBanco += 1;
    return consultasAoBanco >= 3 ? { conteudo: 'Resposta que demorou' } : null;
  };

  try {
    const resultado = await n8nClient.consultarAgenteVendas(payload);

    assert.equal(resultado.resposta, 'Resposta que demorou');
    assert.ok(consultasAoBanco >= 3, 'precisa insistir além da primeira leitura');
  } finally {
    global.fetch = fetchOriginal;
    mensagensService.buscarUltimaMensagemBotAposInstante = buscaOriginal;
  }
});

// A requisição nunca chegou: aqui reenviar é seguro e desejável (não há
// execução no n8n pra duplicar).
test('falha de conexão (nunca chegou no n8n) mantém a retentativa e falha limpo', async () => {
  const fetchOriginal = global.fetch;
  let envios = 0;
  global.fetch = async () => { envios += 1; throw erroDeConexao(); };
  respostaNoBanco = null;

  try {
    const resultado = await n8nClient.consultarAgenteVendas(payload);

    assert.equal(envios, 2, 'as duas tentativas de rede continuam valendo');
    assert.equal(resultado, null, 'sem resposta, quem chama aciona a rede de segurança');
  } finally {
    global.fetch = fetchOriginal;
  }
});

test('resposta em branco no banco não passa como sucesso', async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => { throw erroDeLeitura(); };
  respostaNoBanco = { conteudo: '   ' };

  try {
    assert.equal(await n8nClient.consultarAgenteVendas(payload), null);
  } finally {
    global.fetch = fetchOriginal;
  }
});
