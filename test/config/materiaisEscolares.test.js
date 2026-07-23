const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const materiaisEscolares = require('../../src/config/materiaisEscolares');

test('só a Linus Pauling (1º ao 5º ano) exige pergunta de período', () => {
  assert.equal(materiaisEscolares.temVariacaoDePeriodo('Linus Pauling', '1º ano - Fundamental'), true);
  assert.equal(materiaisEscolares.temVariacaoDePeriodo('Linus Pauling', '6º ano - Fundamental'), false);
  assert.equal(materiaisEscolares.temVariacaoDePeriodo('CEC', '1º ano - Fundamental'), false);
  assert.equal(materiaisEscolares.temVariacaoDePeriodo(undefined, undefined), false);
});

test('encontra o PDF de uma escola sem variação de período', () => {
  const material = materiaisEscolares.buscarMaterial('CEC', '1º ano - Fundamental');

  assert.equal(material.nomeArquivo, '1-ano-fundamental.pdf');
  assert.equal(path.basename(material.caminhoAbsoluto), '1-ano-fundamental.pdf');
});

test('escolas que agrupam vários anos numa lista só apontam pro mesmo arquivo', () => {
  const material6 = materiaisEscolares.buscarMaterial('CEC', '6º ano - Fundamental');
  const material7 = materiaisEscolares.buscarMaterial('CEC', '7º ano - Fundamental');

  assert.equal(material6.nomeArquivo, '6-a-8-ano-fundamental.pdf');
  assert.equal(material7.nomeArquivo, '6-a-8-ano-fundamental.pdf');
});

test('escolhe o arquivo certo por período quando a escola tem variação', () => {
  const integral = materiaisEscolares.buscarMaterial('Linus Pauling', '1º ano - Fundamental', 'Integral');
  const regular = materiaisEscolares.buscarMaterial('Linus Pauling', '1º ano - Fundamental', 'Regular');

  assert.equal(integral.nomeArquivo, '1-ano-fundamental-integral.pdf');
  assert.equal(regular.nomeArquivo, '1-ano-fundamental-regular.pdf');
});

test('retorna null quando a escola+ano não tem material cadastrado', () => {
  assert.equal(materiaisEscolares.buscarMaterial('Mundo Livre', '4º ano - Fundamental'), null);
  assert.equal(materiaisEscolares.buscarMaterial('Escola Inexistente', '1º ano - Fundamental'), null);
});
