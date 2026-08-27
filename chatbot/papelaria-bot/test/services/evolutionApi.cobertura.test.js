const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Complementa evolutionApi.test.js, que cobre a política de retentativa e o
// reconhecimento de eco (o coração do arquivo). Este arquivo cobre o que
// faltava na T4.1 (25-27/08/2026): os caminhos de SUCESSO (nenhum teste
// existente chegava a resolver um fetch com sucesso — todos simulavam falha
// de rede), os quatro-ois-de-erro HTTP (resposta.ok === false) de
// enviarTexto/enviarMedia/baixarMidia, enviarArquivo (leitura de disco) e o
// timeout por AbortError.

process.env.EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:0';
process.env.EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'TESTE';
process.env.EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'chave-de-teste';
process.env.REGISTRO_ECOS_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-evolution-cobertura-')),
  'ecos.json'
);

const evolutionApi = require('../../src/services/evolutionApi');

function respostaOk(corpoJson) {
  return {
    ok: true,
    status: 200,
    json: async () => corpoJson,
    text: async () => JSON.stringify(corpoJson),
  };
}

function respostaErro(status, corpoTexto) {
  return {
    ok: false,
    status,
    text: async () => corpoTexto,
    json: async () => { throw new Error('corpo não é JSON'); },
  };
}

async function comFetch(implementacao, acao) {
  const fetchOriginal = global.fetch;
  global.fetch = implementacao;
  try {
    return await acao();
  } finally {
    global.fetch = fetchOriginal;
  }
}

// --- enviarTexto: caminho de sucesso ---
// Nenhum teste em evolutionApi.test.js chega a resolver um fetch com sucesso
// (todos simulam falha de rede de propósito) — por isso registrarIdEnviadoPeloBot
// e o corpo de sucesso de enviarTexto nunca eram exercitados.

test('enviarTexto com sucesso devolve o corpo da resposta e registra o id do eco', async () => {
  const resultado = await comFetch(
    async () => respostaOk({ key: { id: 'msg-sucesso-1' } }),
    () => evolutionApi.enviarTexto('5527999999999', 'Pedido confirmado!')
  );

  assert.equal(resultado.key.id, 'msg-sucesso-1');
  // O id retornado fica disponível pro filtro de eco (registrarIdEnviadoPeloBot).
  assert.equal(evolutionApi.foiEnviadaPeloBot('msg-sucesso-1', '5527999999999', 'Pedido confirmado!'), true);
});

test('enviarTexto com status de erro HTTP lança, sem retentar (não é falha de rede)', async () => {
  let chamadas = 0;
  await comFetch(
    async () => { chamadas += 1; return respostaErro(400, 'number inválido'); },
    () => assert.rejects(
      () => evolutionApi.enviarTexto('numero-invalido', 'oi'),
      /Evolution API retornou status 400/
    )
  );

  assert.equal(chamadas, 1, 'erro HTTP não é erro de rede: não deve retentar');
});

// --- enviarArquivo / enviarMedia ---

test('enviarArquivo lê o arquivo do disco e manda como base64 (sucesso)', async () => {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'arquivo-evolution-'));
  const caminho = path.join(diretorio, 'lista-1-ano.pdf');
  fs.writeFileSync(caminho, 'conteudo-fake-do-pdf');

  const resultado = await comFetch(
    async () => respostaOk({ key: { id: 'msg-arquivo-1' } }),
    () => evolutionApi.enviarArquivo('5527999999999', caminho, 'Lista do 1º ano')
  );

  assert.equal(resultado.key.id, 'msg-arquivo-1');
});

test('enviarArquivo com caminho inexistente lança erro de leitura, sem tentar a rede', async () => {
  let chamouFetch = false;
  await comFetch(
    async () => { chamouFetch = true; return respostaOk({}); },
    () => assert.rejects(
      () => evolutionApi.enviarArquivo('5527999999999', '/caminho/que/nao/existe.pdf', 'legenda'),
      /Não foi possível ler o arquivo/
    )
  );

  assert.equal(chamouFetch, false, 'sem arquivo não há o que enviar — nem deveria chamar a Evolution API');
});

test('enviarDocumentoBase64 manda o conteúdo já em base64 direto (sem tocar disco)', async () => {
  const resultado = await comFetch(
    async () => respostaOk({ key: { id: 'msg-doc-1' } }),
    () => evolutionApi.enviarDocumentoBase64('5527999999999', 'YmFzZTY0', 'nota.pdf', 'Segue a nota')
  );

  assert.equal(resultado.key.id, 'msg-doc-1');
});

test('enviarMedia (via enviarDocumentoBase64) com status de erro HTTP lança', async () => {
  await comFetch(
    async () => respostaErro(500, 'falha interna'),
    () => assert.rejects(
      () => evolutionApi.enviarDocumentoBase64('5527999999999', 'YmFzZTY0', 'nota.pdf', 'Segue a nota'),
      /Evolution API retornou status 500 ao enviar arquivo/
    )
  );
});

// --- baixarMidia ---

test('baixarMidia devolve o base64 da mídia recebida (sucesso)', async () => {
  const mensagemBruta = { key: { id: 'msg-recebida-1' }, message: { documentMessage: {} } };

  const resultado = await comFetch(
    async () => respostaOk({ base64: 'ZG9jdW1lbnRv' }),
    () => evolutionApi.baixarMidia(mensagemBruta)
  );

  assert.equal(resultado.base64, 'ZG9jdW1lbnRv');
});

test('baixarMidia com status de erro HTTP lança', async () => {
  await comFetch(
    async () => respostaErro(404, 'mídia não encontrada'),
    () => assert.rejects(
      () => evolutionApi.baixarMidia({ key: { id: 'x' } }),
      /Evolution API retornou status 404 ao baixar mídia/
    )
  );
});

// --- timeout (AbortError) ---
//
// O timeout de 15s (EVOLUTION_API_TIMEOUT_MS) dispara um AbortController de
// verdade — rápido demais pra esperar na suíte, então simulamos diretamente o
// erro que o fetch geraria ao ser abortado (mesmo efeito observável do lado
// de fetchComRetentativa: erro com name === 'AbortError', sem `cause`/`syscall`,
// que por isso cai na política "ambígua" de no máximo 2 tentativas).

test('timeout (AbortError) é tratado como falha ambígua: no máximo 2 tentativas', async () => {
  let chamadas = 0;
  await comFetch(
    async () => { chamadas += 1; const erro = new Error('The operation was aborted'); erro.name = 'AbortError'; throw erro; },
    () => assert.rejects(() => evolutionApi.enviarTexto('5527999999999', 'oi'))
  );

  assert.equal(chamadas, 2);
});
