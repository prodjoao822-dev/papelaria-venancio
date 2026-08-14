const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// O módulo lê variáveis de ambiente na carga; valores de fachada bastam, porque
// nenhum teste aqui chega a fazer requisição de verdade.
process.env.EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:0';
process.env.EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'TESTE';
process.env.EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'chave-de-teste';

// `enviarTexto` registra o conteúdo enviado no registro de ecos ANTES do fetch,
// então estes testes gravavam telefones e textos de mentira no cache real do bot
// (.cache/ecos-do-bot.json), que é lido de verdade no boot em produção. Aponta
// pra um arquivo descartável antes de carregar o módulo.
process.env.REGISTRO_ECOS_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-evolution-')),
  'ecos.json'
);

const evolutionApi = require('../../src/services/evolutionApi');

function erroDeRede(code, syscall) {
  const erro = new TypeError('fetch failed');
  erro.cause = Object.assign(new Error(`${syscall} ${code}`), { code, syscall });
  return erro;
}

// Roda `acao` com o fetch global trocado por um que sempre falha com o erro
// dado, contando quantas vezes foi chamado.
async function comFetchFalhando(code, syscall, acao) {
  const fetchOriginal = global.fetch;
  let tentativas = 0;
  global.fetch = async () => { tentativas += 1; throw erroDeRede(code, syscall); };

  try {
    await acao();
  } finally {
    global.fetch = fetchOriginal;
  }

  return tentativas;
}

// --- política de retentativa ---
//
// Bug de 08/08/2026: o bot mandou "Qual o ano?" e o ECONNRESET de LEITURA
// (mensagem entregue, resposta perdida) fez o retry reenviar duas vezes — o
// cliente viu a mesma pergunta três vezes no WhatsApp.

test('ECONNRESET na leitura da resposta não é reenviado (a mensagem já saiu)', async () => {
  const tentativas = await comFetchFalhando('ECONNRESET', 'read', () => (
    evolutionApi.enviarTexto('5527999999999', 'Qual o ano?')
  ));

  assert.equal(tentativas, 1, 'não pode reenviar: duplicaria a mensagem pro cliente');
});

test('erro de conexão (nunca saiu) é reenviado até o limite', async () => {
  const tentativas = await comFetchFalhando('ECONNREFUSED', 'connect', () => (
    assert.rejects(() => evolutionApi.enviarTexto('5527999999999', 'oi'))
  ));

  assert.equal(tentativas, 3);
});

test('erro ambíguo tenta no máximo duas vezes', async () => {
  const tentativas = await comFetchFalhando('EPIPE', 'write', () => (
    assert.rejects(() => evolutionApi.enviarTexto('5527999999999', 'oi'))
  ));

  assert.equal(tentativas, 2);
});

// --- resposta perdida não é falha de envio ---
//
// Tratar como falha fazia o webhookController devolver 500 pra Evolution API,
// que reentregava o webhook: inútil quando o estado já estava persistido (o
// dedup descarta) e caro quando não estava, porque refazia a consulta ao Agente
// de Vendas — resposta duplicada e custo de LLM à toa.

test('resposta perdida não vira erro: enviarTexto resolve com null', async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => { throw erroDeRede('ECONNRESET', 'read'); };

  try {
    assert.equal(await evolutionApi.enviarTexto('5527999999999', 'oi'), null);
  } finally {
    global.fetch = fetchOriginal;
  }
});

test('falha real de envio continua lançando', async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => { throw erroDeRede('ECONNREFUSED', 'connect'); };

  try {
    await assert.rejects(() => evolutionApi.enviarTexto('5527999999999', 'oi'));
  } finally {
    global.fetch = fetchOriginal;
  }
});

// --- reconhecimento do eco ---
//
// Sem a resposta, o id da mensagem se perde, o eco volta como `fromMe`
// desconhecido e o bot processava a própria pergunta como se fosse a resposta
// do cliente — num passo de texto livre isso avançava a conversa sozinho e
// corrompia o pedido.

test('eco é reconhecido pelo conteúdo mesmo quando o envio perdeu a resposta', async () => {
  const texto = 'Me manda a lista de material (nomes dos itens).';
  await comFetchFalhando('ECONNRESET', 'read', () => (
    evolutionApi.enviarTexto('5527998489094', texto)
  ));

  assert.equal(
    evolutionApi.foiEnviadaPeloBot('id-que-nunca-recebemos', '5527998489094', texto),
    true
  );
});

test('cada envio gasta só um eco: a segunda cópia do mesmo texto ainda é reconhecida', async () => {
  const texto = 'Qual o ano?';
  await comFetchFalhando('ECONNRESET', 'read', async () => {
    await evolutionApi.enviarTexto('5527998489094', texto);
    await evolutionApi.enviarTexto('5527998489094', texto);
  });

  assert.equal(evolutionApi.foiEnviadaPeloBot(null, '5527998489094', texto), true);
  assert.equal(evolutionApi.foiEnviadaPeloBot(null, '5527998489094', texto), true);
  // Terceiro eco não tem envio correspondente: é fala de humano, não pode ser filtrado.
  assert.equal(evolutionApi.foiEnviadaPeloBot(null, '5527998489094', texto), false);
});

test('mensagem digitada por um humano na loja não é confundida com eco do bot', () => {
  assert.equal(
    evolutionApi.foiEnviadaPeloBot('id-humano', '5527998489094', 'oi, aqui é a Vanessa'),
    false
  );
});

test('telefone com formatação diferente ainda casa o eco', async () => {
  await comFetchFalhando('ECONNRESET', 'read', () => (
    evolutionApi.enviarTexto('+55 (27) 99848-9094', 'Prontinho!')
  ));

  assert.equal(evolutionApi.foiEnviadaPeloBot(null, '5527998489094', 'Prontinho!'), true);
});
