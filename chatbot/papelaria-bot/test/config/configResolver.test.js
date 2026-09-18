// configResolver é a fonte de verdade das configs editáveis pelo painel
// admin (configuracoes_bot) — cache com TTL de 60s, fallback pro default da
// allowlist quando o Supabase falha, e single-flight pra cache-miss
// concorrente não disparar duas consultas. Mesmo padrão de dublê via
// require.cache do resto do projeto.

const { test, beforeEach } = require('node:test');
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
  chamadasSelect: 0,
  // Função (chaves) => Promise<{ data, error }> — controlável por teste, pra
  // simular latência real e exercitar o single-flight.
  implementacaoSelect: null,
};

function respostaPadrao() {
  return {
    data: [
      { chave: 'reactivation_timeout_minutos', valor: 90 },
      { chave: 'telefone_vendas', valor: '552799@g.us' },
      { chave: 'agente_vendas_timeout_ms', valor: 40000 },
      { chave: 'agente_vendas_habilitado', valor: false },
    ],
    error: null,
  };
}

function resetarEstado() {
  estado.chamadasSelect = 0;
  estado.implementacaoSelect = async () => respostaPadrao();
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
        select: () => ({
          in: (coluna, chaves) => {
            estado.chamadasSelect += 1;
            if (coluna !== 'chave') throw new Error(`coluna inesperada no mock: ${coluna}`);
            return estado.implementacaoSelect(chaves);
          },
        }),
      };
    },
  },
};

const configResolver = require('../../src/config/configResolver');

beforeEach(() => {
  resetarEstado();
  configResolver.invalidar('reactivation_timeout_minutos'); // qualquer chave invalida o cache inteiro
});

test('obter lança pra chave fora da allowlist (erro de programador, falha rápido)', async () => {
  await assert.rejects(
    () => configResolver.obter('chave_que_nao_existe'),
    /não está na allowlist/
  );
});

test('obter devolve o valor coagido pro tipo da chave (numero/telefone/booleano)', async () => {
  assert.equal(await configResolver.obter('reactivation_timeout_minutos'), 90);
  assert.equal(await configResolver.obter('telefone_vendas'), '552799@g.us');
  assert.equal(await configResolver.obter('agente_vendas_timeout_ms'), 40000);
  assert.equal(await configResolver.obter('agente_vendas_habilitado'), false);
});

test('cache hit não re-consulta o Supabase dentro do TTL', async () => {
  await configResolver.obter('reactivation_timeout_minutos');
  assert.equal(estado.chamadasSelect, 1);

  await configResolver.obter('reactivation_timeout_minutos');
  await configResolver.obter('telefone_vendas');
  assert.equal(estado.chamadasSelect, 1, 'chamadas seguintes dentro do TTL não devem bater no Supabase de novo');
});

test('fallback pro default da allowlist quando a query falha', async () => {
  estado.implementacaoSelect = async () => ({ data: null, error: new Error('Supabase fora do ar') });

  assert.equal(await configResolver.obter('reactivation_timeout_minutos'), 120);
  assert.equal(await configResolver.obter('agente_vendas_timeout_ms'), 55000);
  assert.equal(await configResolver.obter('agente_vendas_habilitado'), true);
  assert.equal(await configResolver.obter('telefone_vendas'), null);
});

test('fallback pro default da allowlist quando a query lança (exceção, não só error no retorno)', async () => {
  estado.implementacaoSelect = async () => { throw new Error('timeout de rede'); };

  assert.equal(await configResolver.obter('reactivation_timeout_minutos'), 120);
});

test('linha ausente no resultado (chave nunca seedada) cai pro default, sem quebrar as demais', async () => {
  estado.implementacaoSelect = async () => ({
    data: [{ chave: 'reactivation_timeout_minutos', valor: 200 }],
    error: null,
  });

  assert.equal(await configResolver.obter('reactivation_timeout_minutos'), 200);
  assert.equal(await configResolver.obter('telefone_vendas'), null);
});

test('obterTodos devolve todas as chaves da allowlist com valor + metadados', async () => {
  const itens = await configResolver.obterTodos();

  assert.equal(itens.length, Object.keys(configResolver.ALLOWLIST).length);
  const porChave = new Map(itens.map((item) => [item.chave, item]));

  const timeout = porChave.get('agente_vendas_timeout_ms');
  assert.equal(timeout.valor, 40000);
  assert.equal(timeout.tipo, 'numero');
  assert.equal(timeout.minimo, 20000);
  assert.equal(timeout.maximo, 120000);
  assert.equal(timeout.categoria, 'timeouts');
});

test('single-flight: duas leituras concorrentes durante um cache-miss disparam UMA única consulta', async () => {
  let liberar;
  const travada = new Promise((resolve) => { liberar = resolve; });
  estado.implementacaoSelect = async () => {
    await travada;
    return respostaPadrao();
  };

  const chamada1 = configResolver.obter('reactivation_timeout_minutos');
  const chamada2 = configResolver.obter('telefone_vendas');

  // As duas ainda estão penduradas na mesma consulta em voo.
  assert.equal(estado.chamadasSelect, 1, 'a segunda chamada concorrente não deveria disparar uma 2ª consulta');

  liberar();
  const [resultado1, resultado2] = await Promise.all([chamada1, chamada2]);

  assert.equal(resultado1, 90);
  assert.equal(resultado2, '552799@g.us');
  assert.equal(estado.chamadasSelect, 1);
});

test('invalidar limpa o cache imediatamente, sem esperar o TTL', async () => {
  await configResolver.obter('reactivation_timeout_minutos');
  assert.equal(estado.chamadasSelect, 1);

  estado.implementacaoSelect = async () => ({
    data: [{ chave: 'reactivation_timeout_minutos', valor: 5 }],
    error: null,
  });
  configResolver.invalidar('reactivation_timeout_minutos');

  assert.equal(await configResolver.obter('reactivation_timeout_minutos'), 5);
  assert.equal(estado.chamadasSelect, 2);
});

test('invalidar lança pra chave fora da allowlist', () => {
  assert.throws(() => configResolver.invalidar('chave_invalida'), /não está na allowlist/);
});
