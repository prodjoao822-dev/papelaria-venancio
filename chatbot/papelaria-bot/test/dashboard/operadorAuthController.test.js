const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mesmo padrão de separadorAuthController.test.js: dublê do cliente do
// Supabase antes de carregar o controller. Diferença estrutural em relação
// ao teste do Separador: `operadores` não tem `auth_user_id` -- o id da
// linha É o id do usuário Auth desde a criação (insert, não update).
const caminhoSupabase = require.resolve('../../src/services/supabaseClient');

const estado = {
  operadores: new Map(), // id -> linha
  porCodigo: new Map(), // codigo -> id
  updatesRecebidos: [],
  usuariosDeletados: [],
  signInWithPasswordImpl: null,
  adminCreateUserImpl: null,
  adminUpdateUserByIdImpl: null,
  adminDeleteUserImpl: null,
};

function resetarEstado() {
  estado.operadores.clear();
  estado.porCodigo.clear();
  estado.updatesRecebidos = [];
  estado.usuariosDeletados = [];
  estado.signInWithPasswordImpl = async () => ({ data: null, error: new Error('não configurado') });
  estado.adminCreateUserImpl = async () => ({ data: null, error: new Error('não configurado') });
  estado.adminUpdateUserByIdImpl = async () => ({ data: null, error: new Error('não configurado') });
  estado.adminDeleteUserImpl = async () => ({ data: null, error: null });
}
resetarEstado();

require.cache[caminhoSupabase] = {
  id: caminhoSupabase,
  filename: caminhoSupabase,
  loaded: true,
  exports: {
    from: (tabela) => {
      if (tabela !== 'operadores') throw new Error(`tabela inesperada no mock: ${tabela}`);
      return {
        select: () => ({
          eq: (coluna, valor) => ({
            maybeSingle: async () => {
              let linha = null;
              if (coluna === 'codigo') {
                const id = estado.porCodigo.get(valor);
                linha = id ? estado.operadores.get(id) : null;
              } else if (coluna === 'id') {
                linha = estado.operadores.get(valor) || null;
              }
              return { data: linha, error: null };
            },
          }),
        }),
        update: (payload) => ({
          eq: async (coluna, valor) => {
            estado.updatesRecebidos.push({ payload, coluna, valor });
            if (coluna === 'id' && estado.operadores.has(valor)) {
              Object.assign(estado.operadores.get(valor), payload);
            }
            return { data: null, error: null };
          },
        }),
        insert: (payload) => ({
          select: () => ({
            single: async () => {
              if (estado.porCodigo.has(payload.codigo)) {
                return { data: null, error: new Error('duplicate key value violates unique constraint') };
              }
              estado.operadores.set(payload.id, { ...payload });
              estado.porCodigo.set(payload.codigo, payload.id);
              return { data: { ...payload }, error: null };
            },
          }),
        }),
      };
    },
    auth: {
      signInWithPassword: (...args) => estado.signInWithPasswordImpl(...args),
      admin: {
        createUser: (...args) => estado.adminCreateUserImpl(...args),
        updateUserById: (...args) => estado.adminUpdateUserByIdImpl(...args),
        deleteUser: (...args) => { estado.usuariosDeletados.push(args[0]); return estado.adminDeleteUserImpl(...args); },
      },
    },
  },
};

const { loginComCodigo, criarComCodigo, resetarPin } = require('../../src/dashboard/operadorAuthController');

function criarRes() {
  const res = {};
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (corpo) => { res.body = corpo; return res; };
  return res;
}

function inserirOperador(linha) {
  estado.operadores.set(linha.id, { ...linha });
  if (linha.codigo) estado.porCodigo.set(linha.codigo, linha.id);
}

// --- loginComCodigo ---

test('loginComCodigo rejeita codigo que não tem 4 dígitos', async () => {
  resetarEstado();
  const res = criarRes();
  await loginComCodigo({ body: { codigo: '12', pin: '123456' } }, res);
  assert.equal(res.statusCode, 400);
});

test('loginComCodigo rejeita PIN que não tem 6 dígitos', async () => {
  resetarEstado();
  const res = criarRes();
  await loginComCodigo({ body: { codigo: '1234', pin: '123' } }, res);
  assert.equal(res.statusCode, 400);
});

test('loginComCodigo devolve resposta genérica quando o código não existe', async () => {
  resetarEstado();
  const res = criarRes();
  await loginComCodigo({ body: { codigo: '9999', pin: '123456' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.erro, 'Código ou PIN inválido.');
});

test('loginComCodigo rejeita operador inativo mesmo com código certo', async () => {
  resetarEstado();
  inserirOperador({ id: 'op1', codigo: '1111', nome: 'Ana', ativo: false, papel: 'operador', pin_tentativas_falhas: 0, pin_bloqueado_ate: null });
  const res = criarRes();
  await loginComCodigo({ body: { codigo: '1111', pin: '123456' } }, res);
  assert.equal(res.statusCode, 401);
});

test('loginComCodigo rejeita quando a conta está bloqueada por tentativas', async () => {
  resetarEstado();
  inserirOperador({
    id: 'op1', codigo: '1111', nome: 'Ana', ativo: true, papel: 'operador', pin_tentativas_falhas: 0,
    pin_bloqueado_ate: new Date(Date.now() + 60_000).toISOString(),
  });
  const res = criarRes();
  await loginComCodigo({ body: { codigo: '1111', pin: '123456' } }, res);
  assert.equal(res.statusCode, 429);
});

test('loginComCodigo incrementa pin_tentativas_falhas quando o PIN está errado', async () => {
  resetarEstado();
  inserirOperador({ id: 'op1', codigo: '1111', nome: 'Ana', ativo: true, papel: 'operador', pin_tentativas_falhas: 2, pin_bloqueado_ate: null });
  estado.signInWithPasswordImpl = async () => ({ data: null, error: new Error('Invalid login credentials') });

  const res = criarRes();
  await loginComCodigo({ body: { codigo: '1111', pin: '000000' } }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(estado.operadores.get('op1').pin_tentativas_falhas, 3);
});

test('loginComCodigo bloqueia a conta ao atingir o teto de tentativas', async () => {
  resetarEstado();
  inserirOperador({ id: 'op1', codigo: '1111', nome: 'Ana', ativo: true, papel: 'operador', pin_tentativas_falhas: 4, pin_bloqueado_ate: null });
  estado.signInWithPasswordImpl = async () => ({ data: null, error: new Error('Invalid login credentials') });

  const res = criarRes();
  await loginComCodigo({ body: { codigo: '1111', pin: '000000' } }, res);

  const linha = estado.operadores.get('op1');
  assert.equal(linha.pin_tentativas_falhas, 0);
  assert.ok(new Date(linha.pin_bloqueado_ate) > new Date());
});

test('loginComCodigo bem-sucedido usa o e-mail sintético com prefixo operador- e reseta tentativas', async () => {
  resetarEstado();
  inserirOperador({ id: 'op1', codigo: '1111', nome: 'Ana', ativo: true, papel: 'operador', pin_tentativas_falhas: 3, pin_bloqueado_ate: null });
  estado.signInWithPasswordImpl = async ({ email, password }) => {
    assert.equal(email, 'operador-1111@venancio.internal');
    assert.equal(password, '123456');
    return { data: { session: { access_token: 'tok-a', refresh_token: 'tok-r' } }, error: null };
  };

  const res = criarRes();
  await loginComCodigo({ body: { codigo: '1111', pin: '123456' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.operador.nome, 'Ana');
  assert.equal(res.body.sessao.access_token, 'tok-a');
  assert.equal(estado.operadores.get('op1').pin_tentativas_falhas, 0);
});

// --- criarComCodigo ---

test('criarComCodigo exige operador admin', async () => {
  resetarEstado();
  const res = criarRes();
  await criarComCodigo({ body: { nome: 'Novo', codigo: '2222', pin: '123456' }, operador: { papel: 'operador' } }, res);
  assert.equal(res.statusCode, 403);
});

test('criarComCodigo rejeita nome vazio', async () => {
  resetarEstado();
  const res = criarRes();
  await criarComCodigo({ body: { nome: '  ', codigo: '2222', pin: '123456' }, operador: { papel: 'admin' } }, res);
  assert.equal(res.statusCode, 400);
});

test('criarComCodigo rejeita codigo que não tem 4 dígitos', async () => {
  resetarEstado();
  const res = criarRes();
  await criarComCodigo({ body: { nome: 'Novo', codigo: '22', pin: '123456' }, operador: { papel: 'admin' } }, res);
  assert.equal(res.statusCode, 400);
});

test('criarComCodigo rejeita código já em uso', async () => {
  resetarEstado();
  inserirOperador({ id: 'existente', codigo: '2222', nome: 'Já existe', ativo: true, papel: 'operador' });
  const res = criarRes();
  await criarComCodigo({ body: { nome: 'Novo', codigo: '2222', pin: '123456' }, operador: { papel: 'admin' } }, res);
  assert.equal(res.statusCode, 409);
});

test('criarComCodigo cria o usuário Auth ANTES de inserir em operadores, com o id retornado', async () => {
  resetarEstado();
  let chamadaCreate = null;
  estado.adminCreateUserImpl = async (args) => {
    chamadaCreate = args;
    return { data: { user: { id: 'auth-novo-op' } }, error: null };
  };

  const res = criarRes();
  await criarComCodigo({ body: { nome: 'Beto', codigo: '3333', pin: '654321' }, operador: { papel: 'admin' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(chamadaCreate.email, 'operador-3333@venancio.internal');
  assert.equal(chamadaCreate.password, '654321');
  assert.equal(res.body.operador.id, 'auth-novo-op');
  assert.equal(estado.operadores.get('auth-novo-op').nome, 'Beto');
  assert.equal(estado.operadores.get('auth-novo-op').papel, 'operador');
});

test('criarComCodigo aceita papel admin quando pedido explicitamente', async () => {
  resetarEstado();
  estado.adminCreateUserImpl = async () => ({ data: { user: { id: 'auth-admin-novo' } }, error: null });

  const res = criarRes();
  await criarComCodigo({ body: { nome: 'Carla', codigo: '4444', pin: '111111', papel: 'admin' }, operador: { papel: 'admin' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.operador.papel, 'admin');
});

test('criarComCodigo devolve 502 quando a criação do usuário Auth falha', async () => {
  resetarEstado();
  estado.adminCreateUserImpl = async () => ({ data: null, error: new Error('serviço indisponível') });

  const res = criarRes();
  await criarComCodigo({ body: { nome: 'Dani', codigo: '5555', pin: '222222' }, operador: { papel: 'admin' } }, res);

  assert.equal(res.statusCode, 502);
});

test('criarComCodigo remove o usuário Auth órfão se o insert em operadores falhar (corrida: código ocupado só no insert, não no check inicial)', async () => {
  resetarEstado();
  // `porCodigo` sem entrada correspondente em `operadores` simula outro
  // request concorrente que reservou o código entre o SELECT de
  // unicidade (que não vê nada, `operadores.get()` retorna undefined) e o
  // INSERT em si (que checa `porCodigo.has()` e rejeita) -- o cenário real
  // que a limpeza de usuário órfão existe pra cobrir.
  estado.porCodigo.set('6666', 'outro-processo-concorrente');
  estado.adminCreateUserImpl = async () => ({ data: { user: { id: 'auth-orfao' } }, error: null });

  const res = criarRes();
  await criarComCodigo({ body: { nome: 'Eva', codigo: '6666', pin: '333333' }, operador: { papel: 'admin' } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(estado.usuariosDeletados, ['auth-orfao']);
});

// --- resetarPin ---

test('resetarPin exige operador admin', async () => {
  resetarEstado();
  const res = criarRes();
  await resetarPin({
    params: { operadorId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '123456' },
    operador: { papel: 'operador' },
  }, res);
  assert.equal(res.statusCode, 403);
});

test('resetarPin rejeita operadorId que não é UUID', async () => {
  resetarEstado();
  const res = criarRes();
  await resetarPin({
    params: { operadorId: 'nao-uuid' },
    body: { pin: '123456' },
    operador: { papel: 'admin' },
  }, res);
  assert.equal(res.statusCode, 400);
});

test('resetarPin retorna 404 quando o operador não existe', async () => {
  resetarEstado();
  const res = criarRes();
  await resetarPin({
    params: { operadorId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '123456' },
    operador: { papel: 'admin' },
  }, res);
  assert.equal(res.statusCode, 404);
});

test('resetarPin rejeita operador sem código (usa e-mail/senha)', async () => {
  resetarEstado();
  inserirOperador({ id: '11111111-1111-1111-1111-111111111111', codigo: null, nome: 'Dono', ativo: true, papel: 'admin' });
  const res = criarRes();
  await resetarPin({
    params: { operadorId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '123456' },
    operador: { papel: 'admin' },
  }, res);
  assert.equal(res.statusCode, 422);
});

test('resetarPin troca a senha do operador (id já é o auth_user_id direto)', async () => {
  resetarEstado();
  inserirOperador({ id: '11111111-1111-1111-1111-111111111111', codigo: '7777', nome: 'Fábio', ativo: true, papel: 'operador' });
  let chamadaUpdate = null;
  estado.adminUpdateUserByIdImpl = async (authUserId, args) => {
    chamadaUpdate = { authUserId, ...args };
    return { data: {}, error: null };
  };

  const res = criarRes();
  await resetarPin({
    params: { operadorId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '444555' },
    operador: { papel: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(chamadaUpdate.authUserId, '11111111-1111-1111-1111-111111111111');
  assert.equal(chamadaUpdate.password, '444555');
});

test('resetarPin devolve 502 quando o Supabase Auth falha', async () => {
  resetarEstado();
  inserirOperador({ id: '11111111-1111-1111-1111-111111111111', codigo: '8888', nome: 'Gil', ativo: true, papel: 'operador' });
  estado.adminUpdateUserByIdImpl = async () => ({ data: null, error: new Error('falhou') });

  const res = criarRes();
  await resetarPin({
    params: { operadorId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '666777' },
    operador: { papel: 'admin' },
  }, res);

  assert.equal(res.statusCode, 502);
});
