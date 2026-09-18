// verifyAdmin é o gate de tudo debaixo de /admin/* (painel dono-only) — mesmo
// esqueleto de verifyOperador.js, mais a checagem de papel==='admin' e o
// fallback de token via querystring (necessário pro EventSource do
// /admin/logs/stream, que não consegue mandar header Authorization).
//
// Mesmo padrão de dublê via require.cache do resto do projeto (ver
// test/dashboard/operadorAuthController.test.js).

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
  operadorPorId: new Map(), // id -> linha
  getUserImpl: null,
};

function resetarEstado() {
  estado.operadorPorId.clear();
  estado.getUserImpl = async () => ({ data: null, error: new Error('não configurado') });
}
resetarEstado();

require.cache[caminhoSupabase] = {
  id: caminhoSupabase,
  filename: caminhoSupabase,
  loaded: true,
  exports: {
    auth: {
      getUser: (...args) => estado.getUserImpl(...args),
    },
    from: (tabela) => {
      if (tabela !== 'operadores') throw new Error(`tabela inesperada no mock: ${tabela}`);
      return {
        select: () => ({
          eq: (coluna, valor) => ({
            maybeSingle: async () => {
              if (coluna !== 'id') throw new Error(`coluna inesperada no mock: ${coluna}`);
              return { data: estado.operadorPorId.get(valor) || null, error: null };
            },
          }),
        }),
      };
    },
  },
};

const verifyAdmin = require('../../src/middlewares/verifyAdmin');

function criarReq({ authorization, query = {} } = {}) {
  return {
    get: (nomeHeader) => (nomeHeader.toLowerCase() === 'authorization' ? authorization : undefined),
    query,
  };
}

function criarRes() {
  const res = {};
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (corpo) => { res.body = corpo; return res; };
  return res;
}

function criarNext() {
  const chamadas = [];
  const next = (...args) => chamadas.push(args);
  next.chamadas = chamadas;
  return next;
}

test('sem token (nem header nem querystring) devolve 401', async () => {
  resetarEstado();
  const req = criarReq();
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.equal(next.chamadas.length, 0);
});

test('auth.getUser devolvendo erro devolve 401', async () => {
  resetarEstado();
  estado.getUserImpl = async () => ({ data: null, error: new Error('jwt expirado') });

  const req = criarReq({ authorization: 'Bearer token-invalido' });
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.equal(next.chamadas.length, 0);
});

test('auth.getUser sem usuário (data.user ausente) devolve 401', async () => {
  resetarEstado();
  estado.getUserImpl = async () => ({ data: { user: null }, error: null });

  const req = criarReq({ authorization: 'Bearer token-sem-usuario' });
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(res.statusCode, 401);
});

test('sem linha correspondente em operadores devolve 403', async () => {
  resetarEstado();
  estado.getUserImpl = async () => ({ data: { user: { id: 'auth-sem-operador' } }, error: null });

  const req = criarReq({ authorization: 'Bearer token-valido' });
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(res.statusCode, 403);
  assert.equal(next.chamadas.length, 0);
});

test('operador inativo devolve 403 mesmo com papel admin', async () => {
  resetarEstado();
  estado.operadorPorId.set('op-inativo', {
    id: 'op-inativo', nome: 'Dono', ativo: false, papel: 'admin',
  });
  estado.getUserImpl = async () => ({ data: { user: { id: 'op-inativo' } }, error: null });

  const req = criarReq({ authorization: 'Bearer token-valido' });
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(res.statusCode, 403);
});

test('operador ativo mas papel "operador" (não admin) devolve 403', async () => {
  resetarEstado();
  estado.operadorPorId.set('op-comum', {
    id: 'op-comum', nome: 'Ana', ativo: true, papel: 'operador',
  });
  estado.getUserImpl = async () => ({ data: { user: { id: 'op-comum' } }, error: null });

  const req = criarReq({ authorization: 'Bearer token-valido' });
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.erro, 'Acesso restrito ao administrador.');
});

test('operador ativo com papel "admin" chama next() e popula req.operador', async () => {
  resetarEstado();
  estado.operadorPorId.set('op-admin', {
    id: 'op-admin', nome: 'Dono', ativo: true, papel: 'admin',
  });
  estado.getUserImpl = async () => ({ data: { user: { id: 'op-admin' } }, error: null });

  const req = criarReq({ authorization: 'Bearer token-valido' });
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(next.chamadas.length, 1);
  assert.equal(res.statusCode, undefined);
  assert.deepEqual(req.operador, {
    id: 'op-admin', nome: 'Dono', ativo: true, papel: 'admin',
  });
});

// --- fallback ?token= (EventSource não manda header Authorization) ---

test('sem header Authorization, aceita o token pela querystring (?token=)', async () => {
  resetarEstado();
  estado.operadorPorId.set('op-admin', {
    id: 'op-admin', nome: 'Dono', ativo: true, papel: 'admin',
  });
  let tokenRecebido = null;
  estado.getUserImpl = async (token) => {
    tokenRecebido = token;
    return { data: { user: { id: 'op-admin' } }, error: null };
  };

  const req = criarReq({ query: { token: 'token-da-query' } });
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(tokenRecebido, 'token-da-query');
  assert.equal(next.chamadas.length, 1);
});

test('header Authorization tem prioridade sobre a querystring quando os dois vêm preenchidos', async () => {
  resetarEstado();
  estado.operadorPorId.set('op-admin', {
    id: 'op-admin', nome: 'Dono', ativo: true, papel: 'admin',
  });
  let tokenRecebido = null;
  estado.getUserImpl = async (token) => {
    tokenRecebido = token;
    return { data: { user: { id: 'op-admin' } }, error: null };
  };

  const req = criarReq({ authorization: 'Bearer token-do-header', query: { token: 'token-da-query' } });
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(tokenRecebido, 'token-do-header');
});

test('erro inesperado (lançado antes de qualquer resposta) devolve 500', async () => {
  resetarEstado();
  estado.getUserImpl = async () => { throw new Error('Supabase fora do ar'); };

  const req = criarReq({ authorization: 'Bearer token-qualquer' });
  const res = criarRes();
  const next = criarNext();

  await verifyAdmin(req, res, next);

  assert.equal(res.statusCode, 500);
});
