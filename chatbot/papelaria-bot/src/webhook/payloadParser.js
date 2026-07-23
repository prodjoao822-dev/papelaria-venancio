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
const SUFIXO_CONTATO = '@s.whatsapp.net';
const SUFIXO_GRUPO = '@g.us';

function extrairTelefone(remoteJid) {
  if (!remoteJid) return null;
  return remoteJid.replace(SUFIXO_CONTATO, '').replace(SUFIXO_GRUPO, '');
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

function parsePayload(payloadBruto) {
  const dados = payloadBruto?.data;

  if (!dados || !dados.key) {
    return null;
  }

  const telefone = extrairTelefone(dados.key.remoteJid);
  const texto = extrairTexto(dados.message);
  const documentoPdf = extrairDocumentoPdf(dados.message);

  if (!telefone) {
    return null;
  }

  return {
    telefone,
    nome: dados.pushName || null,
    texto,
    documentoPdf,
    fromMe: Boolean(dados.key.fromMe),
    mensagemId: dados.key.id || null,
  };
}

module.exports = { parsePayload };
