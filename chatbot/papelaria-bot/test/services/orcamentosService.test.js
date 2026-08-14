const { test } = require('node:test');
const assert = require('node:assert/strict');

// Substitui o cliente do Supabase por um dublê ANTES de carregar o service, pra
// conseguir inspecionar os parâmetros que vão pra RPC sem tocar no banco (e sem
// depender de variáveis de ambiente). `node --test` roda cada arquivo num
// processo próprio, então isso não vaza pros outros testes.
const caminhoSupabase = require.resolve('../../src/services/supabaseClient');
const chamadasRpc = [];

require.cache[caminhoSupabase] = {
  id: caminhoSupabase,
  filename: caminhoSupabase,
  loaded: true,
  exports: {
    rpc: async (funcao, parametros) => {
      chamadasRpc.push({ funcao, parametros });
      return { data: { id: 'orc-1', protocolo: 'ORC-0001' }, error: null };
    },
  },
};

const { itensDeTexto, criarOrcamentoComItens } = require('../../src/services/orcamentosService');

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

// Regressão do bug de 08/08/2026: `p_itens` ia como JSON.stringify(...), então
// o Postgres recebia um jsonb escalar (string) em vez de array e a função
// quebrava em jsonb_array_length com "cannot get array length of a scalar"
// (22023). O fluxo inteiro andava e só falhava no fim, com o cliente já tendo
// digitado tudo. O tipo do parâmetro é o que o teste protege.
test('p_itens vai pra RPC como array de objetos, nunca como string JSON', async () => {
  chamadasRpc.length = 0;

  await criarOrcamentoComItens({
    clienteId: 'cli-1',
    conversaId: 'conv-1',
    tipo: 'lista_escolar',
    escolaId: null,
    itensTexto: '- 2 papel report\n- caneta bic',
    observacoes: 'sem observação',
  });

  assert.equal(chamadasRpc.length, 1);
  const { funcao, parametros } = chamadasRpc[0];

  assert.equal(funcao, 'criar_orcamento_com_itens_tx');
  assert.ok(Array.isArray(parametros.p_itens), 'p_itens precisa ser array');
  assert.deepEqual(parametros.p_itens, [
    { produto_id: null, descricao_livre: 'papel report', quantidade: 2, valor_unitario: null },
    { produto_id: null, descricao_livre: 'caneta bic', quantidade: 1, valor_unitario: null },
  ]);
});

test('escola/conversa ausentes viram null em vez de undefined na RPC', async () => {
  chamadasRpc.length = 0;

  await criarOrcamentoComItens({
    clienteId: 'cli-1', tipo: 'empresa', itensTexto: 'caneta',
  });

  const { parametros } = chamadasRpc[0];
  assert.equal(parametros.p_conversa_id, null);
  assert.equal(parametros.p_escola_id, null);
  assert.equal(parametros.p_observacoes, null);
});
