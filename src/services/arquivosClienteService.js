// Arquiva no Supabase Storage os arquivos que o cliente manda pelo WhatsApp
// (hoje, só PDFs — ver webhookController.js). É só uma cópia de auditoria:
// o encaminhamento pra Vendas já acontece direto via Evolution API, com o
// base64 que já temos em mãos; isso aqui existe pra sobreviver além da janela
// de retenção do WhatsApp, caso alguém precise achar o arquivo depois.

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

const BUCKET = 'pdfs-clientes';
const VALIDADE_LINK_SEGUNDOS = 60 * 60 * 24 * 30; // 30 dias

let bucketGarantido = false;

// Cria o bucket na primeira vez que for preciso (memoizado por processo). Não
// trata "já existe" como erro fatal — só loga um aviso pra qualquer outra
// falha e deixa o upload seguinte revelar o problema de verdade, se houver.
async function garantirBucket() {
  if (bucketGarantido) return;

  const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message || '')) {
    logger.aviso(`Não foi possível confirmar/criar o bucket "${BUCKET}" no Supabase Storage`, error.message);
  }

  bucketGarantido = true;
}

// Salva o PDF e devolve um link assinado (bucket é privado) válido por 30
// dias, pra anexar no log de auditoria da conversa.
async function salvarPdfRecebido({ clienteId, nomeArquivo, base64 }) {
  await garantirBucket();

  const caminho = `${clienteId}/${Date.now()}-${nomeArquivo}`;
  const conteudo = Buffer.from(base64, 'base64');

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, conteudo, { contentType: 'application/pdf', upsert: false });

  if (erroUpload) {
    logger.erro(`Falha ao salvar PDF recebido do cliente ${clienteId} no Storage`, erroUpload);
    throw new Error(`Não foi possível salvar o PDF recebido: ${erroUpload.message}`);
  }

  const { data: assinada, error: erroAssinatura } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(caminho, VALIDADE_LINK_SEGUNDOS);

  if (erroAssinatura) {
    logger.erro(`PDF do cliente ${clienteId} salvo, mas falha ao gerar o link assinado`, erroAssinatura);
    return { caminho, url: null };
  }

  return { caminho, url: assinada.signedUrl };
}

module.exports = { salvarPdfRecebido };
