// TRB-2026-0020: `receberCallbackAgenteOrcamento` (rota POST
// /webhook/agente-orcamento, ver webhookController.js) nunca teve nenhum
// teste — a auditoria de 15/09/2026 achou zero cobertura de verdade, apesar da
// função existir desde a Fase de integração do Agente de Orçamento. Mesmo
// padrão de dublê por require.cache dos outros testes de webhook: nenhuma
// chamada real sai do processo.

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
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-webhook-callback-orcamento-')),
  'ecos.json'
);

// --- estado observável dos dublês, remontado a cada teste ---
const mensagensRegistradas = [];
let orcamentoEncontrado; // objeto | null, ou uma função que lança (falha do Supabase)

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
  buscarOuCriarConversa: async () => ({}),
  atualizarEstadoConversa: async () => {},
  pausarPosPedido: async () => {},
});
dubla('../../src/services/mensagensService', {
  registrarMensagem: async (conversaId, remetente, conteudo) => {
    mensagensRegistradas.push({ conversaId, remetente, conteudo });
    return { id: 'msg-1' };
  },
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
dubla('../../src/services/orcamentosService', {
  buscarOrcamentoPorId: async (id) => {
    if (typeof orcamentoEncontrado === 'function') return orcamentoEncontrado(id);
    return orcamentoEncontrado;
  },
});
dubla('../../src/services/arquivosClienteService', { salvarPdfRecebido: async () => ({ url: null }) });
dubla('../../src/botEngine/actions', { executarAcoes: async () => {} });
dubla('../../src/services/escalonamentoService', { verificarEscalonamento: async () => {} });
dubla('../../src/integracoes/n8nClient', {
  consultarAgenteVendas: async () => null,
  notificarAgenteOrcamento: async () => null,
});

const { receberCallbackAgenteOrcamento } = require('../../src/webhook/webhookController');

function reset() {
  mensagensRegistradas.length = 0;
  orcamentoEncontrado = null;
}

function respostaFalsa() {
  const resposta = { statusCode: null, corpo: null };
  resposta.status = (codigo) => { resposta.statusCode = codigo; return resposta; };
  resposta.json = (corpo) => { resposta.corpo = corpo; return resposta; };
  return resposta;
}

test('callback do Agente de Orçamento: payload sem orcamento_id/status retorna 400', async () => {
  reset();

  const semNada = respostaFalsa();
  await receberCallbackAgenteOrcamento({ body: {} }, semNada);
  assert.equal(semNada.statusCode, 400);
  assert.match(semNada.corpo.erro, /orcamento_id e status são obrigatórios/);

  const semStatus = respostaFalsa();
  await receberCallbackAgenteOrcamento({ body: { orcamento_id: 'orc-1' } }, semStatus);
  assert.equal(semStatus.statusCode, 400);

  const semOrcamentoId = respostaFalsa();
  await receberCallbackAgenteOrcamento({ body: { status: 'enviado' } }, semOrcamentoId);
  assert.equal(semOrcamentoId.statusCode, 400);

  assert.equal(mensagensRegistradas.length, 0, 'payload inválido não pode chegar a registrar nada no histórico');
});

test('callback do Agente de Orçamento: orçamento inexistente retorna 404', async () => {
  reset();
  orcamentoEncontrado = null;

  const resposta = respostaFalsa();
  await receberCallbackAgenteOrcamento(
    { body: { orcamento_id: 'orc-inexistente', status: 'enviado', aceito: false } },
    resposta
  );

  assert.equal(resposta.statusCode, 404);
  assert.match(resposta.corpo.erro, /não encontrado/i);
  assert.equal(mensagensRegistradas.length, 0);
});

test('callback do Agente de Orçamento: sucesso registra a mensagem de auditoria e retorna 200', async () => {
  reset();
  orcamentoEncontrado = { id: 'orc-1', conversa_id: 'conversa-77' };

  const resposta = respostaFalsa();
  await receberCallbackAgenteOrcamento(
    { body: { orcamento_id: 'orc-1', status: 'enviado', aceito: true } },
    resposta
  );

  assert.equal(resposta.statusCode, 200);
  assert.deepEqual(resposta.corpo, { ok: true });
  assert.equal(mensagensRegistradas.length, 1);
  assert.equal(mensagensRegistradas[0].conversaId, 'conversa-77');
  assert.equal(mensagensRegistradas[0].remetente, 'bot');
  assert.match(mensagensRegistradas[0].conteudo, /status="enviado"/);
  assert.match(mensagensRegistradas[0].conteudo, /aceito=true/);
});

test('callback do Agente de Orçamento: aceito ausente/falsy no payload vira "aceito=false" na mensagem registrada', async () => {
  reset();
  orcamentoEncontrado = { id: 'orc-2', conversa_id: 'conversa-88' };

  const resposta = respostaFalsa();
  await receberCallbackAgenteOrcamento(
    { body: { orcamento_id: 'orc-2', status: 'rascunho' } },
    resposta
  );

  assert.equal(resposta.statusCode, 200);
  assert.match(mensagensRegistradas[0].conteudo, /aceito=false/);
});

test('callback do Agente de Orçamento: falha do Supabase ao buscar o orçamento retorna 500', async () => {
  reset();
  orcamentoEncontrado = () => { throw new Error('Supabase fora do ar'); };

  const resposta = respostaFalsa();
  await receberCallbackAgenteOrcamento(
    { body: { orcamento_id: 'orc-1', status: 'enviado' } },
    resposta
  );

  assert.equal(resposta.statusCode, 500);
  assert.match(resposta.corpo.erro, /Falha ao processar o callback/);
  assert.equal(mensagensRegistradas.length, 0);
});

test('callback do Agente de Orçamento: falha do Supabase ao registrar a mensagem também retorna 500', async () => {
  reset();
  orcamentoEncontrado = { id: 'orc-3', conversa_id: 'conversa-99' };
  const mensagensService = require('../../src/services/mensagensService');
  const original = mensagensService.registrarMensagem;
  mensagensService.registrarMensagem = async () => { throw new Error('Supabase fora do ar'); };

  try {
    const resposta = respostaFalsa();
    await receberCallbackAgenteOrcamento(
      { body: { orcamento_id: 'orc-3', status: 'enviado', aceito: true } },
      resposta
    );

    assert.equal(resposta.statusCode, 500);
  } finally {
    mensagensService.registrarMensagem = original;
  }
});
