const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseOpcaoNumerica } = require('../../src/botEngine/validadores');

test('aceita a primeira e a última opção do intervalo', () => {
  assert.equal(parseOpcaoNumerica('1', 4), 0);
  assert.equal(parseOpcaoNumerica('4', 4), 3);
});

test('rejeita opção fora do intervalo (maior ou igual a zero)', () => {
  assert.equal(parseOpcaoNumerica('5', 4), null);
  assert.equal(parseOpcaoNumerica('0', 4), null);
  assert.equal(parseOpcaoNumerica('-1', 4), null);
});

test('rejeita texto que não é um número inteiro', () => {
  assert.equal(parseOpcaoNumerica('abc', 4), null);
  assert.equal(parseOpcaoNumerica('2.5', 4), null);
  assert.equal(parseOpcaoNumerica('', 4), null);
});

test('ignora espaços em volta do texto recebido', () => {
  assert.equal(parseOpcaoNumerica('  2  ', 4), 1);
});
