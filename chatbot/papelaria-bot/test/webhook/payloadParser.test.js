const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parsePayload } = require('../../src/webhook/payloadParser');

function payloadDeMensagem({ remoteJid, fromMe = false, texto, pushName = 'Cliente Teste', id = 'MSG1' }) {
  return {
    event: 'messages.upsert',
    data: {
      key: { remoteJid, fromMe, id },
      pushName,
      message: texto === undefined ? undefined : { conversation: texto },
    },
  };
}

test('extrai telefone, nome, texto e fromMe de um payload válido', () => {
  const resultado = parsePayload(payloadDeMensagem({
    remoteJid: '5511988887777@s.whatsapp.net',
    texto: 'Olá',
  }));

  assert.deepEqual(resultado, {
    telefone: '5511988887777',
    nome: 'Cliente Teste',
    texto: 'Olá',
    documentoPdf: null,
    fromMe: false,
    mensagemId: 'MSG1',
  });
});

test('remove o sufixo de grupo do telefone', () => {
  const resultado = parsePayload(payloadDeMensagem({
    remoteJid: '5511988887777@g.us',
    texto: 'oi',
  }));

  assert.equal(resultado.telefone, '5511988887777');
});

test('lê texto de extendedTextMessage quando conversation não existe', () => {
  const payload = {
    data: {
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG2' },
      pushName: 'Cliente',
      message: { extendedTextMessage: { text: 'resposta a uma mensagem' } },
    },
  };

  assert.equal(parsePayload(payload).texto, 'resposta a uma mensagem');
});

test('retorna texto null quando a mensagem não tem conteúdo reconhecível (ex.: mídia)', () => {
  const payload = {
    data: {
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG3' },
      pushName: 'Cliente',
      message: { imageMessage: {} },
    },
  };

  assert.equal(parsePayload(payload).texto, null);
});

test('reconhece um PDF enviado como documentMessage', () => {
  const payload = {
    data: {
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG5' },
      pushName: 'Cliente',
      message: {
        documentMessage: { mimetype: 'application/pdf', fileName: 'lista.pdf', caption: 'segue a lista' },
      },
    },
  };

  assert.deepEqual(parsePayload(payload).documentoPdf, { nomeArquivo: 'lista.pdf', legenda: 'segue a lista' });
  assert.equal(parsePayload(payload).texto, null);
});

test('reconhece um PDF enviado com legenda (documentWithCaptionMessage)', () => {
  const payload = {
    data: {
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG6' },
      pushName: 'Cliente',
      message: {
        documentWithCaptionMessage: {
          message: { documentMessage: { mimetype: 'application/pdf', fileName: 'orcamento.pdf' } },
        },
      },
    },
  };

  assert.deepEqual(parsePayload(payload).documentoPdf, { nomeArquivo: 'orcamento.pdf', legenda: null });
});

test('não reconhece documento que não seja PDF (ex.: planilha)', () => {
  const payload = {
    data: {
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG7' },
      pushName: 'Cliente',
      message: {
        documentMessage: { mimetype: 'application/vnd.ms-excel', fileName: 'planilha.xls' },
      },
    },
  };

  assert.equal(parsePayload(payload).documentoPdf, null);
});

test('usa "arquivo.pdf" como nome padrão quando o documento não tem fileName nem title', () => {
  const payload = {
    data: {
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG8' },
      pushName: 'Cliente',
      message: { documentMessage: { mimetype: 'application/pdf' } },
    },
  };

  assert.equal(parsePayload(payload).documentoPdf.nomeArquivo, 'arquivo.pdf');
});

test('retorna null quando falta data ou key no payload', () => {
  assert.equal(parsePayload({}), null);
  assert.equal(parsePayload({ data: {} }), null);
});

test('retorna null quando não é possível extrair um telefone', () => {
  const payload = {
    data: {
      key: { remoteJid: null, fromMe: false, id: 'MSG4' },
      message: { conversation: 'oi' },
    },
  };

  assert.equal(parsePayload(payload), null);
});

test('marca fromMe corretamente quando a mensagem foi enviada pela loja', () => {
  const resultado = parsePayload(payloadDeMensagem({
    remoteJid: '5511988887777@s.whatsapp.net',
    fromMe: true,
    texto: 'Já te atendo por aqui!',
  }));

  assert.equal(resultado.fromMe, true);
});
