const { test } = require('node:test');
const assert = require('node:assert/strict');

// Complementa n8nClient.test.js, que cobre a recuperação via Supabase quando a
// conexão cai depois de a requisição chegar no n8n (o cenário mais delicado).
// Este arquivo cobre o que faltava na T4.1 (25-27/08/2026):
//   - notificarAgenteOrcamento inteira (nenhum teste existente chamava essa
//     função — só consultarAgenteVendas era exercitada);
//   - os ramos de consultarAgenteVendas que não envolvem recuperação: URL não
//     configurada, timeout (AbortError), status HTTP de erro, corpo
//     não-parseável, contrato de resposta inválido e o caminho de sucesso.

process.env.N8N_VENDAS_WEBHOOK_URL = 'http://localhost:0/webhook/venancio/agente-vendas';
process.env.AGENTE_VENDAS_TIMEOUT_MS = '6000';

// Dublê do mensagensService — só entra em jogo nos ramos de recuperação
// (corpo não-parseável apesar de resposta.ok). Devolve a resposta configurada
// já na primeira leitura, pra o teste não depender do intervalo de poll real.
const caminhoMensagens = require.resolve('../../src/services/mensagensService');
let respostaNoBanco = null;

require.cache[caminhoMensagens] = {
  id: caminhoMensagens,
  filename: caminhoMensagens,
  loaded: true,
  exports: {
    buscarUltimaMensagemBotAposInstante: async () => respostaNoBanco,
  },
};

const env = require('../../src/config/env');
const n8nClient = require('../../src/integracoes/n8nClient');

async function comFetch(implementacao, acao) {
  const fetchOriginal = global.fetch;
  global.fetch = implementacao;
  try {
    return await acao();
  } finally {
    global.fetch = fetchOriginal;
  }
}

function respostaOk(corpoJson) {
  return { ok: true, status: 200, json: async () => corpoJson, text: async () => JSON.stringify(corpoJson) };
}

function respostaErro(status, corpoTexto) {
  return { ok: false, status, text: async () => corpoTexto, json: async () => { throw new Error('não é JSON'); } };
}

const payload = { cliente_id: 'cli-1', conversa_id: 'conv-1', telefone: '5527999999999', texto: 'oi' };

// --- notificarAgenteOrcamento ---
// Fire-and-forget: nunca lança, best-effort. Nenhum teste existente chamava
// esta função.

test('notificarAgenteOrcamento sem URL configurada devolve null sem chamar a rede', async () => {
  const urlOriginal = env.N8N_ORCAMENTO_WEBHOOK_URL;
  env.N8N_ORCAMENTO_WEBHOOK_URL = '';
  let chamouFetch = false;

  try {
    const resultado = await comFetch(
      async () => { chamouFetch = true; return respostaOk({}); },
      () => n8nClient.notificarAgenteOrcamento({ orcamento_id: 'orc-1' })
    );
    assert.equal(resultado, null);
    assert.equal(chamouFetch, false);
  } finally {
    env.N8N_ORCAMENTO_WEBHOOK_URL = urlOriginal;
  }
});

test('notificarAgenteOrcamento com sucesso devolve o corpo parseado', async () => {
  const urlOriginal = env.N8N_ORCAMENTO_WEBHOOK_URL;
  env.N8N_ORCAMENTO_WEBHOOK_URL = 'http://localhost:0/webhook/venancio/agente-orcamento';

  try {
    const resultado = await comFetch(
      async () => respostaOk({ recebido: true }),
      () => n8nClient.notificarAgenteOrcamento({ orcamento_id: 'orc-1' })
    );
    assert.deepEqual(resultado, { recebido: true });
  } finally {
    env.N8N_ORCAMENTO_WEBHOOK_URL = urlOriginal;
  }
});

test('notificarAgenteOrcamento com status de erro HTTP devolve null (best-effort)', async () => {
  const urlOriginal = env.N8N_ORCAMENTO_WEBHOOK_URL;
  env.N8N_ORCAMENTO_WEBHOOK_URL = 'http://localhost:0/webhook/venancio/agente-orcamento';

  try {
    const resultado = await comFetch(
      async () => respostaErro(500, 'falha interna'),
      () => n8nClient.notificarAgenteOrcamento({ orcamento_id: 'orc-1' })
    );
    assert.equal(resultado, null);
  } finally {
    env.N8N_ORCAMENTO_WEBHOOK_URL = urlOriginal;
  }
});

test('notificarAgenteOrcamento com timeout (AbortError) devolve null sem lançar', async () => {
  const urlOriginal = env.N8N_ORCAMENTO_WEBHOOK_URL;
  env.N8N_ORCAMENTO_WEBHOOK_URL = 'http://localhost:0/webhook/venancio/agente-orcamento';

  try {
    const resultado = await comFetch(
      async () => { const erro = new Error('abortado'); erro.name = 'AbortError'; throw erro; },
      () => n8nClient.notificarAgenteOrcamento({ orcamento_id: 'orc-1' })
    );
    assert.equal(resultado, null);
  } finally {
    env.N8N_ORCAMENTO_WEBHOOK_URL = urlOriginal;
  }
});

test('notificarAgenteOrcamento com falha de rede genérica devolve null sem lançar', async () => {
  const urlOriginal = env.N8N_ORCAMENTO_WEBHOOK_URL;
  env.N8N_ORCAMENTO_WEBHOOK_URL = 'http://localhost:0/webhook/venancio/agente-orcamento';

  try {
    const resultado = await comFetch(
      async () => { throw new Error('ENOTFOUND'); },
      () => n8nClient.notificarAgenteOrcamento({ orcamento_id: 'orc-1' })
    );
    assert.equal(resultado, null);
  } finally {
    env.N8N_ORCAMENTO_WEBHOOK_URL = urlOriginal;
  }
});

test('notificarAgenteOrcamento com corpo de resposta não-parseável devolve null', async () => {
  const urlOriginal = env.N8N_ORCAMENTO_WEBHOOK_URL;
  env.N8N_ORCAMENTO_WEBHOOK_URL = 'http://localhost:0/webhook/venancio/agente-orcamento';

  try {
    const resultado = await comFetch(
      async () => ({ ok: true, status: 200, json: async () => { throw new Error('corpo vazio'); } }),
      () => n8nClient.notificarAgenteOrcamento({ orcamento_id: 'orc-1' })
    );
    assert.equal(resultado, null);
  } finally {
    env.N8N_ORCAMENTO_WEBHOOK_URL = urlOriginal;
  }
});

// --- consultarAgenteVendas: ramos sem recuperação via Supabase ---

test('consultarAgenteVendas sem URL configurada devolve null sem chamar a rede', async () => {
  const urlOriginal = env.N8N_VENDAS_WEBHOOK_URL;
  env.N8N_VENDAS_WEBHOOK_URL = '';
  let chamouFetch = false;

  try {
    const resultado = await comFetch(
      async () => { chamouFetch = true; return respostaOk({ resposta: 'oi' }); },
      () => n8nClient.consultarAgenteVendas(payload)
    );
    assert.equal(resultado, null);
    assert.equal(chamouFetch, false);
  } finally {
    env.N8N_VENDAS_WEBHOOK_URL = urlOriginal;
  }
});

test('timeout (AbortError) na consulta ao Agente de Vendas não retenta (evita execução concorrente no n8n)', async () => {
  let chamadas = 0;
  const resultado = await comFetch(
    async () => { chamadas += 1; const erro = new Error('abortado'); erro.name = 'AbortError'; throw erro; },
    () => n8nClient.consultarAgenteVendas(payload)
  );

  assert.equal(resultado, null);
  assert.equal(chamadas, 1, 'timeout nunca retenta: reenviar criaria uma 2ª execução concorrente no n8n');
});

test('status de erro HTTP do Agente de Vendas devolve null', async () => {
  const resultado = await comFetch(
    async () => respostaErro(500, 'erro interno do n8n'),
    () => n8nClient.consultarAgenteVendas(payload)
  );

  assert.equal(resultado, null);
});

test('corpo não-parseável apesar de resposta.ok tenta recuperar via Supabase', async () => {
  respostaNoBanco = { conteudo: 'Resposta recuperada do banco' };

  const resultado = await comFetch(
    async () => ({ ok: true, status: 200, json: async () => { throw new Error('corpo vazio'); } }),
    () => n8nClient.consultarAgenteVendas(payload)
  );

  assert.equal(resultado.resposta, 'Resposta recuperada do banco');
  assert.equal(resultado.recuperadoViaSupabase, true);
});

test('contrato de resposta inválido (sem campo "resposta" string) devolve null, sem tentar recuperar', async () => {
  const resultado = await comFetch(
    async () => respostaOk({ encerrar_atendimento_ia: true }),
    () => n8nClient.consultarAgenteVendas(payload)
  );

  assert.equal(resultado, null);
});

test('resposta de sucesso completa repassa todos os campos do contrato', async () => {
  const resultado = await comFetch(
    async () => respostaOk({
      resposta: 'Posso te ajudar com isso!',
      encerrar_atendimento_ia: true,
      acionar_humano: true,
      motivo: 'cliente pediu pra pagar agora',
      _debug_tempo_agente_ms: 4321,
    }),
    () => n8nClient.consultarAgenteVendas(payload)
  );

  assert.deepEqual(resultado, {
    resposta: 'Posso te ajudar com isso!',
    encerrar_atendimento_ia: true,
    acionarHumano: true,
    motivo: 'cliente pediu pra pagar agora',
    tempoAgenteN8nMs: 4321,
  });
});

test('resposta de sucesso sem os campos opcionais usa os defaults do contrato', async () => {
  const resultado = await comFetch(
    async () => respostaOk({ resposta: 'oi' }),
    () => n8nClient.consultarAgenteVendas(payload)
  );

  assert.deepEqual(resultado, {
    resposta: 'oi',
    encerrar_atendimento_ia: false,
    acionarHumano: false,
    motivo: null,
    tempoAgenteN8nMs: null,
  });
});
