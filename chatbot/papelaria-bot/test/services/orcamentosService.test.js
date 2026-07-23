const { test } = require('node:test');
const assert = require('node:assert/strict');

const { itensDeTexto } = require('../../src/services/orcamentosService');

test('linha com número na frente vira quantidade, tirando só esse prefixo da descrição', () => {
  const itens = itensDeTexto('2 papeis fotograficos de 180g');

  assert.deepEqual(itens, [{ descricao_livre: 'papeis fotograficos de 180g', quantidade: 2 }]);
});

test('número embutido no meio da descrição não é confundido com quantidade', () => {
  const itens = itensDeTexto('2 papeis report de 500 folhas');

  assert.deepEqual(itens, [{ descricao_livre: 'papeis report de 500 folhas', quantidade: 2 }]);
});

test('linha sem número na frente assume quantidade 1', () => {
  const itens = itensDeTexto('caneta');

  assert.deepEqual(itens, [{ descricao_livre: 'caneta', quantidade: 1 }]);
});

test('aceita notação "3x" como quantidade', () => {
  const itens = itensDeTexto('3x lapis de cor');

  assert.deepEqual(itens, [{ descricao_livre: 'lapis de cor', quantidade: 3 }]);
});

test('várias linhas, uma por item, ignorando linhas em branco', () => {
  const itens = itensDeTexto('1 papel report\n\n5 evas\ncaneta');

  assert.deepEqual(itens, [
    { descricao_livre: 'papel report', quantidade: 1 },
    { descricao_livre: 'evas', quantidade: 5 },
    { descricao_livre: 'caneta', quantidade: 1 },
  ]);
});

test('remove marcador de lista ("- ") antes de procurar a quantidade', () => {
  const itens = itensDeTexto('- 1 papel report\n- 2 evas\n- 1 papel fotografico de 180g');

  assert.deepEqual(itens, [
    { descricao_livre: 'papel report', quantidade: 1 },
    { descricao_livre: 'evas', quantidade: 2 },
    { descricao_livre: 'papel fotografico de 180g', quantidade: 1 },
  ]);
});

test('remove marcador de lista ("* ") mesmo sem número na frente', () => {
  const itens = itensDeTexto('* caneta azul');

  assert.deepEqual(itens, [{ descricao_livre: 'caneta azul', quantidade: 1 }]);
});

test('texto vazio ou nulo não gera itens', () => {
  assert.deepEqual(itensDeTexto(''), []);
  assert.deepEqual(itensDeTexto(undefined), []);
});
