// adminConfigController é a única porta de escrita de configuracoes_bot —
// aqui é onde a allowlist (chave desconhecida => 400) e os limites de cada
// tipo (ex.: piso de 20000ms do agente_vendas_timeout_ms) são de fato
// aplicados. Mesmo padrão de dublê via require.cache do resto do projeto.

const { test } = require('node:test');
const assert = require('node:assert/strict');

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

const caminhoSupabase = require.resolve('../../src/services/supabaseClient');

const estado = {
  upsertsRecebidos: [],
  erroUpsert: null,
};

function resetarEstado() {
  estado.upsertsRecebidos = [];
  estado.erroUpsert = null;
}
resetarEstado();

require.cache[caminhoSupabase] = {
  id: caminhoSupabase,
  filename: caminhoSupabase,
  loaded: true,
  exports: {
    from: (tabela) => {
      if (tabela !== 'configuracoes_bot') throw new Error(`tabela inesperada no mock: ${tabela}`);
      return {
        upsert: (payload, opcoes) => {
          estado.upsertsRecebidos.push({ payload, opcoes });
          return Promise.resolve({ data: estado.erroUpsert ? null : [payload], error: estado.erroUpsert });
        },
        // Usado só pelo teste de `listar` (via configResolver.obterTodos) —
        // devolve lista vazia, o suficiente pra exercitar o fallback de
        // default da allowlist sem duplicar o dublê de configResolver.test.js.
        select: () => ({
          in: async () => ({ data: [], error: null }),
        }),
      };
    },
  },
};

const configResolver = require('../../src/config/configResolver');
const { atualizar, listar } = require('../../src/admin/adminConfigController');

function criarRes() {
  const res = {};
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (corpo) => { res.body = corpo; return res; };
  return res;
}

const OPERADOR_ADMIN = { id: 'admin-1', nome: 'Dono', ativo: true, papel: 'admin' };

test('atualizar: 400 quando a chave não está na allowlist', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({ params: { chave: 'chave_inventada' }, body: { valor: 123 }, operador: OPERADOR_ADMIN }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.equal(estado.upsertsRecebidos.length, 0, 'não deve nem tentar escrever no banco');
});

test('atualizar: 400 quando agente_vendas_timeout_ms vem abaixo do piso de segurança (20000ms)', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({
    params: { chave: 'agente_vendas_timeout_ms' },
    body: { valor: 15000 },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.erro, /mínimo/);
  assert.equal(estado.upsertsRecebidos.length, 0);
});

test('atualizar: 400 quando agente_vendas_timeout_ms vem acima do teto (120000ms)', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({
    params: { chave: 'agente_vendas_timeout_ms' },
    body: { valor: 200000 },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.erro, /máximo/);
});

test('atualizar: aceita agente_vendas_timeout_ms exatamente no piso (20000ms)', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({
    params: { chave: 'agente_vendas_timeout_ms' },
    body: { valor: 20000 },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(estado.upsertsRecebidos.length, 1);
  assert.equal(estado.upsertsRecebidos[0].payload.valor, 20000);
});

test('atualizar: 400 quando telefone_vendas não é dígitos nem JID de grupo/contato', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({
    params: { chave: 'telefone_vendas' },
    body: { valor: 'não é um telefone' },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(estado.upsertsRecebidos.length, 0);
});

test('atualizar: 400 quando telefone_vendas é dígitos demais/de menos', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({
    params: { chave: 'telefone_vendas' },
    body: { valor: '123' },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 400);
});

test('atualizar: aceita telefone_vendas como JID de grupo do WhatsApp (@g.us)', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({
    params: { chave: 'telefone_vendas' },
    body: { valor: '552799988877@g.us' },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(estado.upsertsRecebidos[0].payload.valor, '552799988877@g.us');
});

test('atualizar: aceita telefone_vendas como dígitos simples (10 a 15 dígitos)', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({
    params: { chave: 'telefone_vendas' },
    body: { valor: '5527999998888' },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 200);
});

test('atualizar: 400 quando agente_vendas_habilitado não é estritamente true/false', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({
    params: { chave: 'agente_vendas_habilitado' },
    body: { valor: 'true' },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 400);
});

test('atualizar: aceita uma atualização válida e grava atualizado_por a partir de req.operador.id', async () => {
  resetarEstado();
  const res = criarRes();

  await atualizar({
    params: { chave: 'reactivation_timeout_minutos' },
    body: { valor: 90 },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(estado.upsertsRecebidos.length, 1);
  assert.equal(estado.upsertsRecebidos[0].payload.chave, 'reactivation_timeout_minutos');
  assert.equal(estado.upsertsRecebidos[0].payload.valor, 90);
  assert.equal(estado.upsertsRecebidos[0].payload.atualizado_por, 'admin-1');
  assert.deepEqual(estado.upsertsRecebidos[0].opcoes, { onConflict: 'chave' });
});

test('atualizar: 500 quando o upsert falha no Supabase', async () => {
  resetarEstado();
  estado.erroUpsert = new Error('Supabase fora do ar');
  const res = criarRes();

  await atualizar({
    params: { chave: 'reactivation_timeout_minutos' },
    body: { valor: 90 },
    operador: OPERADOR_ADMIN,
  }, res);

  assert.equal(res.statusCode, 500);
});

test('atualizar: invalida o cache de configResolver depois de salvar com sucesso', async () => {
  resetarEstado();
  let chaveInvalidada = null;
  const invalidarOriginal = configResolver.invalidar;
  configResolver.invalidar = (chave) => { chaveInvalidada = chave; };

  try {
    const res = criarRes();
    await atualizar({
      params: { chave: 'reactivation_timeout_minutos' },
      body: { valor: 90 },
      operador: OPERADOR_ADMIN,
    }, res);
    assert.equal(chaveInvalidada, 'reactivation_timeout_minutos');
  } finally {
    configResolver.invalidar = invalidarOriginal;
  }
});

test('listar: devolve { ok: true, itens } com todas as chaves da allowlist', async () => {
  const res = criarRes();
  await listar({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.itens.length, Object.keys(configResolver.ALLOWLIST).length);
});
