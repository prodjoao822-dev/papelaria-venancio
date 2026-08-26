const { test } = require('node:test');
const assert = require('node:assert/strict');

// mediaProcessor.js valida OPENROUTER_API_KEY só pra logar um aviso (não é
// obrigatória em VARIAVEIS_OBRIGATORIAS), mas as demais são obrigatórias em
// config/env.js — sem elas o require já lança na validação de boot.
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
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'chave-openrouter-de-teste';

const mediaProcessor = require('../../src/utils/mediaProcessor');

// Troca o fetch global por um dublê que registra a chamada e responde com o
// que o teste pedir; restaura no final (mesmo padrão de
// test/services/evolutionApi.test.js).
async function comFetchDublado(respostaFalsa, acao) {
  const fetchOriginal = global.fetch;
  const chamadas = [];
  global.fetch = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return typeof respostaFalsa === 'function' ? respostaFalsa(url, opcoes) : respostaFalsa;
  };

  try {
    const resultado = await acao();
    return { resultado, chamadas };
  } finally {
    global.fetch = fetchOriginal;
  }
}

function respostaJson(corpo, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => corpo,
    text: async () => JSON.stringify(corpo),
  };
}

// --- transcreverAudio ---

test('transcreverAudio: chama a URL/model certos e devolve o texto transcrito', async () => {
  const { resultado, chamadas } = await comFetchDublado(
    respostaJson({ text: '  Quero dois cadernos universitários  ' }),
    () => mediaProcessor.transcreverAudio('BASE64FALSO', 'audio/ogg; codecs=opus')
  );

  assert.equal(resultado, 'Quero dois cadernos universitários');
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, 'https://openrouter.ai/api/v1/audio/transcriptions');

  const corpoEnviado = JSON.parse(chamadas[0].opcoes.body);
  assert.equal(corpoEnviado.model, 'openai/whisper-1');
  assert.equal(corpoEnviado.input_audio.data, 'BASE64FALSO');
  assert.equal(corpoEnviado.input_audio.format, 'ogg', 'formato derivado do mimetype (antes do ";")');
  assert.equal(chamadas[0].opcoes.headers.Authorization, 'Bearer chave-openrouter-de-teste');
});

test('transcreverAudio: deriva o formato de mimetypes sem parâmetros extras', async () => {
  const { chamadas } = await comFetchDublado(
    respostaJson({ text: 'oi' }),
    () => mediaProcessor.transcreverAudio('X', 'audio/mpeg')
  );

  const corpoEnviado = JSON.parse(chamadas[0].opcoes.body);
  assert.equal(corpoEnviado.input_audio.format, 'mpeg');
});

test('transcreverAudio: mimetype ausente cai no formato default "ogg"', async () => {
  const { chamadas } = await comFetchDublado(
    respostaJson({ text: 'oi' }),
    () => mediaProcessor.transcreverAudio('X', undefined)
  );

  const corpoEnviado = JSON.parse(chamadas[0].opcoes.body);
  assert.equal(corpoEnviado.input_audio.format, 'ogg');
});

test('transcreverAudio: texto vazio da OpenRouter lança erro (fallback decide o resto)', async () => {
  await comFetchDublado(respostaJson({ text: '   ' }), () => (
    assert.rejects(
      () => mediaProcessor.transcreverAudio('X', 'audio/ogg'),
      /não retornou texto transcrito/
    )
  ));
});

test('transcreverAudio: resposta HTTP de erro lança com o status incluído', async () => {
  await comFetchDublado(
    respostaJson({ erro: 'chave inválida' }, false, 401),
    () => assert.rejects(
      () => mediaProcessor.transcreverAudio('X', 'audio/ogg'),
      /OpenRouter respondeu 401/
    )
  );
});

// --- descreverImagem ---

test('descreverImagem: chama a URL/model certos e devolve a descrição', async () => {
  const { resultado, chamadas } = await comFetchDublado(
    respostaJson({ choices: [{ message: { content: '  Uma mochila azul com detalhes pretos.  ' } }] }),
    () => mediaProcessor.descreverImagem('IMGBASE64', 'image/jpeg', null)
  );

  assert.equal(resultado, 'Uma mochila azul com detalhes pretos.');
  assert.equal(chamadas[0].url, 'https://openrouter.ai/api/v1/chat/completions');

  const corpoEnviado = JSON.parse(chamadas[0].opcoes.body);
  assert.equal(corpoEnviado.model, 'google/gemini-2.5-flash');
  const conteudo = corpoEnviado.messages[0].content;
  assert.equal(conteudo[1].image_url.url, 'data:image/jpeg;base64,IMGBASE64');
  assert.doesNotMatch(conteudo[0].text, /Legenda que o cliente escreveu/);
});

test('descreverImagem: legenda do cliente entra no prompt enviado', async () => {
  const { chamadas } = await comFetchDublado(
    respostaJson({ choices: [{ message: { content: 'Uma régua de 30cm.' } }] }),
    () => mediaProcessor.descreverImagem('IMGBASE64', 'image/png', 'vocês têm essa régua?')
  );

  const corpoEnviado = JSON.parse(chamadas[0].opcoes.body);
  assert.match(corpoEnviado.messages[0].content[0].text, /vocês têm essa régua\?/);
});

test('descreverImagem: mimetype ausente cai no default "image/jpeg" na data URL', async () => {
  const { chamadas } = await comFetchDublado(
    respostaJson({ choices: [{ message: { content: 'algo' } }] }),
    () => mediaProcessor.descreverImagem('X', undefined, null)
  );

  const corpoEnviado = JSON.parse(chamadas[0].opcoes.body);
  assert.match(corpoEnviado.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,X$/);
});

test('descreverImagem: descrição vazia da OpenRouter lança erro', async () => {
  await comFetchDublado(
    respostaJson({ choices: [{ message: { content: '   ' } }] }),
    () => assert.rejects(
      () => mediaProcessor.descreverImagem('X', 'image/jpeg', null),
      /não retornou descrição da imagem/
    )
  );
});

test('descreverImagem: resposta sem "choices" (contrato inesperado) lança erro', async () => {
  await comFetchDublado(
    respostaJson({}),
    () => assert.rejects(() => mediaProcessor.descreverImagem('X', 'image/jpeg', null))
  );
});

test('descreverImagem: resposta HTTP de erro lança com o corpo incluído (truncado)', async () => {
  await comFetchDublado(
    respostaJson({ erro: 'limite excedido' }, false, 429),
    () => assert.rejects(
      () => mediaProcessor.descreverImagem('X', 'image/jpeg', null),
      /OpenRouter respondeu 429/
    )
  );
});
