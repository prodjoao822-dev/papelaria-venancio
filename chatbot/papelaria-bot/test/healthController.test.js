// Teste do health check de infra (TRB-2026-0025, 15/09/2026). Mesmo padrão
// de req/res dublados usado em test/webhook/webhookController.rotas.test.js:
// chama o handler exportado diretamente, sem subir um servidor HTTP real.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { verificarSaude } = require('../src/healthController');

function respostaFalsa() {
  const resposta = { statusCode: null, corpo: null };
  resposta.status = (codigo) => { resposta.statusCode = codigo; return resposta; };
  resposta.json = (corpo) => { resposta.corpo = corpo; return resposta; };
  return resposta;
}

test('GET /health responde 200 com status ok e timestamp ISO, sem checar dependência externa', () => {
  const res = respostaFalsa();

  verificarSaude({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.corpo.status, 'ok');
  assert.equal(typeof res.corpo.timestamp, 'string');
  // Confirma que é um timestamp ISO válido (o mesmo formato de new Date().toISOString()).
  assert.equal(new Date(res.corpo.timestamp).toISOString(), res.corpo.timestamp);
});
