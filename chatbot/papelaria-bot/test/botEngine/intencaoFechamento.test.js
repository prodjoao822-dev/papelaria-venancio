const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mencionaFecharOuPagar } = require('../../src/botEngine/intencaoFechamento');

test('reconhece a frase real que motivou este detector', () => {
  assert.equal(mencionaFecharOuPagar('Vou querer fechar, posso pagar por aqui'), true);
});

test('é insensível a maiúsculas/minúsculas', () => {
  assert.equal(mencionaFecharOuPagar('FECHAR meu pedido'), true);
  assert.equal(mencionaFecharOuPagar('Como faço pra PAGAR?'), true);
});

test('reconhece "pagamento" e "finalizar" isoladamente', () => {
  assert.equal(mencionaFecharOuPagar('qual a forma de pagamento?'), true);
  assert.equal(mencionaFecharOuPagar('quero finalizar minha compra'), true);
});

test('não reconhece variações flexionadas (borda de palavra)', () => {
  assert.equal(mencionaFecharOuPagar('as lojas fecharam mais cedo hoje'), false);
});

test('não reconhece frases sem nenhuma palavra-gatilho', () => {
  assert.equal(mencionaFecharOuPagar('quero saber o preço do papel report'), false);
});

test('texto vazio ou nulo não gera falso positivo', () => {
  assert.equal(mencionaFecharOuPagar(''), false);
  assert.equal(mencionaFecharOuPagar(undefined), false);
});
