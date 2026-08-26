// Extrai e normaliza os dados relevantes do payload bruto da Evolution API
// (telefone, nome, texto da mensagem, flag fromMe).
//
// Formato de referência (evento "messages.upsert" da Evolution API):
// {
//   "event": "messages.upsert",
//   "instance": "nome-da-instancia",
//   "data": {
//     "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": false, "id": "..." },
//     "pushName": "Nome do contato",
//     "message": { "conversation": "texto enviado" }
//   }
// }

// Sufixos usados pelo WhatsApp para identificar contato individual ou grupo.
// `@lid` é o identificador "linked ID" que o WhatsApp vem usando pra alguns
// contatos (privacidade), visto em teste real em 24/07 — sem remover esse
// sufixo, o "telefone" salvo ficava como "251629416747016@lid" e todo envio
// futuro pra esse cliente saía quebrado (Evolution API não entende esse
// formato como destinatário).
const SUFIXO_CONTATO = '@s.whatsapp.net';
const SUFIXO_GRUPO = '@g.us';
const SUFIXO_LID = '@lid';

function extrairTelefone(remoteJid) {
  if (!remoteJid) return null;
  return remoteJid.replace(SUFIXO_CONTATO, '').replace(SUFIXO_GRUPO, '').replace(SUFIXO_LID, '');
}

function extrairTexto(mensagem) {
  if (!mensagem) return null;

  // A Evolution API representa o texto de formas diferentes dependendo do tipo de mensagem
  // (mensagem simples vs. resposta a outra mensagem, por exemplo).
  return (
    mensagem.conversation
    ?? mensagem.extendedTextMessage?.text
    ?? null
  );
}

const MIMETYPE_PDF = 'application/pdf';

// Documento PDF enviado pelo cliente. O Baileys (por trás da Evolution API)
// representa um documento normal em `documentMessage`, mas quando o cliente
// manda junto de uma legenda o WhatsApp embrulha isso em
// `documentWithCaptionMessage.message.documentMessage` — sem checar as duas
// formas, um PDF mandado com legenda passaria batido como não reconhecido.
function extrairDocumentoPdf(mensagem) {
  if (!mensagem) return null;

  const documento = mensagem.documentMessage
    ?? mensagem.documentWithCaptionMessage?.message?.documentMessage
    ?? null;

  if (!documento || documento.mimetype !== MIMETYPE_PDF) {
    return null;
  }

  return {
    nomeArquivo: documento.fileName || documento.title || 'arquivo.pdf',
    legenda: documento.caption || null,
  };
}

// Áudio (nota de voz ou arquivo) enviado pelo cliente. Transcrito via
// OpenRouter (ver src/utils/mediaProcessor.js) e tratado como texto normal —
// ver PROMPT-03 Entrega 2. Guardamos o mimetype aqui porque é ele quem diz o
// formato do arquivo (a Evolution API só devolve o base64 puro).
function extrairAudio(mensagem) {
  const audio = mensagem?.audioMessage;
  if (!audio) return null;

  return {
    // `ptt` (push-to-talk) separa nota de voz gravada na hora de um arquivo de
    // áudio anexado — muda só o texto do fallback pra Vanessa quando a
    // transcrição falha (ver receberAudio no webhookController).
    notaDeVoz: Boolean(audio.ptt),
    duracaoSegundos: Number(audio.seconds) || null,
    mimetype: audio.mimetype || null,
  };
}

// Imagem enviada pelo cliente. Descrita via OpenRouter (visão) e tratada como
// texto normal, igual ao áudio — ver PROMPT-03 Entrega 2.
function extrairImagem(mensagem) {
  const imagem = mensagem?.imageMessage;
  if (!imagem) return null;

  return {
    legenda: imagem.caption || null,
    mimetype: imagem.mimetype || null,
  };
}

function parsePayload(payloadBruto) {
  const dados = payloadBruto?.data;

  if (!dados || !dados.key) {
    return null;
  }

  const telefone = extrairTelefone(dados.key.remoteJid);
  const texto = extrairTexto(dados.message);
  const documentoPdf = extrairDocumentoPdf(dados.message);
  const audio = extrairAudio(dados.message);
  const imagem = extrairImagem(dados.message);

  if (!telefone) {
    return null;
  }

  return {
    telefone,
    nome: dados.pushName || null,
    texto,
    documentoPdf,
    audio,
    imagem,
    fromMe: Boolean(dados.key.fromMe),
    mensagemId: dados.key.id || null,
  };
}

module.exports = { parsePayload };
