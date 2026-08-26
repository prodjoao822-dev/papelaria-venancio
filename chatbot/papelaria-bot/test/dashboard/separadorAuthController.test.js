const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mesmo padrão de clientesService.test.js: dublê do cliente do Supabase
// antes de carregar o controller, pra controlar exatamente o que o "banco"
// e o "Supabase Auth" respondem em cada cenário sem precisar de rede.
const caminhoSupabase = require.resolve('../../src/services/supabaseClient');

const estado = {
  funcionarios: new Map(), // id -> linha
  porCodigo: new Map(), // codigo_funcionario -> id
  updatesRecebidos: [],
  signInWithPasswordImpl: null,
  adminCreateUserImpl: null,
  adminUpdateUserByIdImpl: null,
  adminListUsersImpl: null,
};

function resetarEstado() {
  estado.funcionarios.clear();
  estado.porCodigo.clear();
  estado.updatesRecebidos = [];
  estado.signInWithPasswordImpl = async () => ({ data: null, error: new Error('não configurado') });
  estado.adminCreateUserImpl = async () => ({ data: null, error: new Error('não configurado') });
  estado.adminUpdateUserByIdImpl = async () => ({ data: null, error: new Error('não configurado') });
  estado.adminListUsersImpl = async () => ({ data: { users: [] }, error: null });
}
resetarEstado();

require.cache[caminhoSupabase] = {
  id: caminhoSupabase,
  filename: caminhoSupabase,
  loaded: true,
  exports: {
    from: (tabela) => {
      if (tabela !== 'funcionarios') throw new Error(`tabela inesperada no mock: ${tabela}`);
      return {
        select: () => ({
          eq: (coluna, valor) => ({
            maybeSingle: async () => {
              let linha = null;
              if (coluna === 'codigo_funcionario') {
                const id = estado.porCodigo.get(valor);
                linha = id ? estado.funcionarios.get(id) : null;
              } else if (coluna === 'id') {
                linha = estado.funcionarios.get(valor) || null;
              }
              return { data: linha, error: null };
            },
          }),
        }),
        update: (payload) => ({
          eq: async (coluna, valor) => {
            estado.updatesRecebidos.push({ payload, coluna, valor });
            if (coluna === 'id' && estado.funcionarios.has(valor)) {
              Object.assign(estado.funcionarios.get(valor), payload);
            }
            return { data: null, error: null };
          },
        }),
      };
    },
    auth: {
      signInWithPassword: (...args) => estado.signInWithPasswordImpl(...args),
      admin: {
        createUser: (...args) => estado.adminCreateUserImpl(...args),
        updateUserById: (...args) => estado.adminUpdateUserByIdImpl(...args),
        listUsers: (...args) => estado.adminListUsersImpl(...args),
      },
    },
  },
};

const { login, resetPin } = require('../../src/dashboard/separadorAuthController');

function criarRes() {
  const res = {};
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (corpo) => { res.body = corpo; return res; };
  return res;
}

function inserirFuncionario(linha) {
  estado.funcionarios.set(linha.id, { ...linha });
  if (linha.codigo_funcionario) estado.porCodigo.set(linha.codigo_funcionario, linha.id);
}

// --- login ---

test('login rejeita codigo_funcionario ausente', async () => {
  resetarEstado();
  const res = criarRes();
  await login({ body: { pin: '123456' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
});

test('login rejeita PIN que não tem 6 dígitos', async () => {
  resetarEstado();
  const res = criarRes();
  await login({ body: { codigo_funcionario: 'sep1', pin: '123' } }, res);
  assert.equal(res.statusCode, 400);
});

test('login devolve a mesma resposta genérica quando o código não existe', async () => {
  resetarEstado();
  const res = criarRes();
  await login({ body: { codigo_funcionario: 'inexistente', pin: '123456' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.erro, 'Código ou PIN inválido.');
});

test('login rejeita funcionário sem nenhum papel operacional mesmo com código certo', async () => {
  resetarEstado();
  inserirFuncionario({
    id: 'f1', codigo_funcionario: 'sep1', ativo: true, papeis: ['vendas'],
    auth_user_id: 'auth-1', pin_tentativas_falhas: 0, pin_bloqueado_ate: null,
  });
  const res = criarRes();
  await login({ body: { codigo_funcionario: 'sep1', pin: '123456' } }, res);
  assert.equal(res.statusCode, 401);
});

test('login aceita funcionário com papel de entrega (sem separacao)', async () => {
  resetarEstado();
  inserirFuncionario({
    id: 'f1', codigo_funcionario: 'ent1', nome: 'Beto', ativo: true, papeis: ['entrega'],
    auth_user_id: 'auth-1', pin_tentativas_falhas: 0, pin_bloqueado_ate: null,
  });
  estado.signInWithPasswordImpl = async () => ({
    data: { session: { access_token: 'tok-a', refresh_token: 'tok-r' } }, error: null,
  });

  const res = criarRes();
  await login({ body: { codigo_funcionario: 'ent1', pin: '123456' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.funcionario.papeis, ['entrega']);
});

test('login rejeita quando a conta está bloqueada por tentativas', async () => {
  resetarEstado();
  inserirFuncionario({
    id: 'f1', codigo_funcionario: 'sep1', ativo: true, papeis: ['separacao'],
    auth_user_id: 'auth-1', pin_tentativas_falhas: 0,
    pin_bloqueado_ate: new Date(Date.now() + 60_000).toISOString(),
  });
  const res = criarRes();
  await login({ body: { codigo_funcionario: 'sep1', pin: '123456' } }, res);
  assert.equal(res.statusCode, 429);
});

test('login incrementa pin_tentativas_falhas quando o PIN está errado', async () => {
  resetarEstado();
  inserirFuncionario({
    id: 'f1', codigo_funcionario: 'sep1', ativo: true, papeis: ['separacao'],
    auth_user_id: 'auth-1', pin_tentativas_falhas: 2, pin_bloqueado_ate: null,
  });
  estado.signInWithPasswordImpl = async () => ({ data: null, error: new Error('Invalid login credentials') });

  const res = criarRes();
  await login({ body: { codigo_funcionario: 'sep1', pin: '000000' } }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(estado.funcionarios.get('f1').pin_tentativas_falhas, 3);
});

test('login bloqueia a conta ao atingir o teto de tentativas', async () => {
  resetarEstado();
  inserirFuncionario({
    id: 'f1', codigo_funcionario: 'sep1', ativo: true, papeis: ['separacao'],
    auth_user_id: 'auth-1', pin_tentativas_falhas: 4, pin_bloqueado_ate: null,
  });
  estado.signInWithPasswordImpl = async () => ({ data: null, error: new Error('Invalid login credentials') });

  const res = criarRes();
  await login({ body: { codigo_funcionario: 'sep1', pin: '000000' } }, res);

  const linha = estado.funcionarios.get('f1');
  assert.equal(linha.pin_tentativas_falhas, 0);
  assert.ok(new Date(linha.pin_bloqueado_ate) > new Date());
});

test('login bem-sucedido reseta tentativas e devolve sessão + funcionário', async () => {
  resetarEstado();
  inserirFuncionario({
    id: 'f1', codigo_funcionario: 'sep1', nome: 'Ana', ativo: true, papeis: ['separacao'],
    auth_user_id: 'auth-1', pin_tentativas_falhas: 3, pin_bloqueado_ate: null,
  });
  estado.signInWithPasswordImpl = async ({ email, password }) => {
    assert.equal(email, 'sep1@venancio.internal');
    assert.equal(password, '123456');
    return { data: { session: { access_token: 'tok-a', refresh_token: 'tok-r' } }, error: null };
  };

  const res = criarRes();
  await login({ body: { codigo_funcionario: 'sep1', pin: '123456' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.funcionario.nome, 'Ana');
  assert.equal(res.body.sessao.access_token, 'tok-a');
  assert.equal(estado.funcionarios.get('f1').pin_tentativas_falhas, 0);
});

// --- resetPin ---

test('resetPin exige operador admin', async () => {
  resetarEstado();
  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '123456' },
    operador: { id: 'op1', papel: 'operador' },
  }, res);
  assert.equal(res.statusCode, 403);
});

test('resetPin rejeita funcionarioId que não é UUID', async () => {
  resetarEstado();
  const res = criarRes();
  await resetPin({
    params: { funcionarioId: 'nao-uuid' },
    body: { pin: '123456' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);
  assert.equal(res.statusCode, 400);
});

test('resetPin retorna 404 quando o funcionário não existe', async () => {
  resetarEstado();
  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '123456' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);
  assert.equal(res.statusCode, 404);
});

test('resetPin exige codigo_funcionario definido antes de provisionar login', async () => {
  resetarEstado();
  inserirFuncionario({ id: '11111111-1111-1111-1111-111111111111', codigo_funcionario: null, auth_user_id: null });
  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '123456' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);
  assert.equal(res.statusCode, 422);
});

test('resetPin provisiona o primeiro login (cria usuário e vincula auth_user_id)', async () => {
  resetarEstado();
  inserirFuncionario({
    id: '11111111-1111-1111-1111-111111111111', codigo_funcionario: 'sep2', auth_user_id: null,
  });
  let chamadaCreate = null;
  estado.adminCreateUserImpl = async (args) => {
    chamadaCreate = args;
    return { data: { user: { id: 'auth-novo' } }, error: null };
  };

  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '654321' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(chamadaCreate.email, 'sep2@venancio.internal');
  assert.equal(chamadaCreate.password, '654321');
  assert.equal(estado.funcionarios.get('11111111-1111-1111-1111-111111111111').auth_user_id, 'auth-novo');
});

test('resetPin troca a senha quando o funcionário já tem login', async () => {
  resetarEstado();
  inserirFuncionario({
    id: '11111111-1111-1111-1111-111111111111', codigo_funcionario: 'sep3', auth_user_id: 'auth-existente',
  });
  let chamadaUpdate = null;
  estado.adminUpdateUserByIdImpl = async (authUserId, args) => {
    chamadaUpdate = { authUserId, ...args };
    return { data: {}, error: null };
  };

  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '111222' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(chamadaUpdate.authUserId, 'auth-existente');
  assert.equal(chamadaUpdate.password, '111222');
});

test('resetPin reaproveita usuário órfão quando createUser falha com email_exists (code)', async () => {
  resetarEstado();
  inserirFuncionario({
    id: '11111111-1111-1111-1111-111111111111', codigo_funcionario: 'sep5', auth_user_id: null,
  });

  const erroEmailExiste = Object.assign(new Error('A user with this email address has already been registered'), {
    code: 'email_exists',
  });
  estado.adminCreateUserImpl = async () => ({ data: null, error: erroEmailExiste });
  estado.adminListUsersImpl = async ({ page }) => {
    if (page !== 1) return { data: { users: [] }, error: null };
    return {
      data: { users: [{ id: 'auth-orfao', email: 'sep5@venancio.internal' }] },
      error: null,
    };
  };
  let chamadaUpdate = null;
  estado.adminUpdateUserByIdImpl = async (authUserId, args) => {
    chamadaUpdate = { authUserId, ...args };
    return { data: {}, error: null };
  };

  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '999888' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(chamadaUpdate.authUserId, 'auth-orfao');
  assert.equal(chamadaUpdate.password, '999888');
  assert.equal(estado.funcionarios.get('11111111-1111-1111-1111-111111111111').auth_user_id, 'auth-orfao');
});

test('resetPin reaproveita usuário órfão quando createUser falha só com mensagem (sem code)', async () => {
  resetarEstado();
  inserirFuncionario({
    id: '11111111-1111-1111-1111-111111111111', codigo_funcionario: 'sep6', auth_user_id: null,
  });

  estado.adminCreateUserImpl = async () => ({
    data: null,
    error: new Error('Email address already exists'),
  });
  estado.adminListUsersImpl = async () => ({
    data: { users: [{ id: 'auth-orfao-2', email: 'sep6@venancio.internal' }] },
    error: null,
  });
  estado.adminUpdateUserByIdImpl = async () => ({ data: {}, error: null });

  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '777666' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(estado.funcionarios.get('11111111-1111-1111-1111-111111111111').auth_user_id, 'auth-orfao-2');
});

test('resetPin devolve 502 se o e-mail existe mas a listagem não encontra o usuário órfão', async () => {
  resetarEstado();
  inserirFuncionario({
    id: '11111111-1111-1111-1111-111111111111', codigo_funcionario: 'sep7', auth_user_id: null,
  });

  estado.adminCreateUserImpl = async () => ({
    data: null,
    error: Object.assign(new Error('email exists'), { code: 'email_exists' }),
  });
  estado.adminListUsersImpl = async () => ({ data: { users: [] }, error: null });

  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '555444' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);

  assert.equal(res.statusCode, 502);
  assert.equal(estado.funcionarios.get('11111111-1111-1111-1111-111111111111').auth_user_id, null);
});

test('resetPin devolve 502 quando createUser falha por outro motivo (não email duplicado)', async () => {
  resetarEstado();
  inserirFuncionario({
    id: '11111111-1111-1111-1111-111111111111', codigo_funcionario: 'sep8', auth_user_id: null,
  });

  estado.adminCreateUserImpl = async () => ({ data: null, error: new Error('serviço indisponível') });

  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '222333' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);

  assert.equal(res.statusCode, 502);
});

test('resetPin devolve 502 quando o Supabase Auth falha', async () => {
  resetarEstado();
  inserirFuncionario({
    id: '11111111-1111-1111-1111-111111111111', codigo_funcionario: 'sep4', auth_user_id: 'auth-existente',
  });
  estado.adminUpdateUserByIdImpl = async () => ({ data: null, error: new Error('falhou') });

  const res = criarRes();
  await resetPin({
    params: { funcionarioId: '11111111-1111-1111-1111-111111111111' },
    body: { pin: '333444' },
    operador: { id: 'op1', papel: 'admin' },
  }, res);

  assert.equal(res.statusCode, 502);
});
