const { test } = require('node:test');
const assert = require('node:assert/strict');

const { identificarComando } = require('../../src/botEngine/comandosGlobais');

test('reconhece os comandos globais suportados', () => {
  assert.equal(identificarComando('0'), 'MENU');
  assert.equal(identificarComando('menu'), 'MENU');
  assert.equal(identificarComando('#'), 'VOLTAR');
  assert.equal(identificarComando('*'), 'REINICIAR');
  assert.equal(identificarComando('ajuda'), 'AJUDA');
  assert.equal(identificarComando('help'), 'AJUDA');
  assert.equal(identificarComando('atendente'), 'ESCALACAO');
  assert.equal(identificarComando('reclamação'), 'ESCALACAO');
  assert.equal(identificarComando('reclamacao'), 'ESCALACAO');
});

test('normaliza espaços e caixa antes de comparar', () => {
  assert.equal(identificarComando('  MENU  '), 'MENU');
  assert.equal(identificarComando('AJUDA'), 'AJUDA');
});

test('retorna null para texto que não é comando global', () => {
  assert.equal(identificarComando('1'), null);
  assert.equal(identificarComando('oi, tudo bem?'), null);
  assert.equal(identificarComando(''), null);
});
