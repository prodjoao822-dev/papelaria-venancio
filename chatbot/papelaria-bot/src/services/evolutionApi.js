// Cliente para a Evolution API: envio de mensagens à instância do WhatsApp.
// Duas operações: texto simples (sendText) e arquivo (sendMedia, usado para
// mandar o PDF da lista de material).

const fs = require('node:fs');
const path = require('node:path');
const { Agent } = require('undici');
const env = require('../config/env');
const logger = require('../utils/logger');

// Causa raiz dos ECONNRESET vistos em produção (20/07, 22/07 e no teste de
// 23/07 que efetivamente duplicou uma mensagem pro cliente): o pool de
// keep-alive padrão do fetch reaproveita uma conexão que o servidor da
// Evolution API já fechou por inatividade — o reset acontece só na hora de
// reusar, mas às vezes DEPOIS do corpo já ter sido mandado e a mensagem já
// entregue, então a retentativa manda a mensagem de novo pro cliente.
// keepAliveTimeout bem curto = cada request praticamente abre conexão nova,
// eliminando essa classe de erro em vez de só reduzir a tentativa de reenvio.
const agenteSemConexaoOciosa = new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });

// A Evolution API (Baileys por baixo) reenvia pelo webhook, como
// `messages.upsert` com `fromMe: true`, tanto uma mensagem que um humano
// digitou manualmente no WhatsApp da loja quanto uma mensagem que o próprio
// bot acabou de mandar por aqui (as duas saem da mesma sessão autenticada, o
// WhatsApp não distingue origem). Sem isso, o bot pausava a si mesmo a cada
// resposta seguida (ver ARCHITECTURE_REVIEW.md) — guardamos por alguns
// minutos o id de toda mensagem que nós mandamos pra `webhookController`
// conseguir ignorar o eco e só pausar de verdade quando o fromMe for de um
// humano.
const idsEnviadosPeloBot = new Set();
const TEMPO_DE_VIDA_DO_ID_MS = 5 * 60 * 1000;

function registrarIdEnviadoPeloBot(resultadoEnvio) {
  const id = resultadoEnvio?.key?.id;
  if (!id) return;

  idsEnviadosPeloBot.add(id);
  // Expira sozinho caso o eco nunca chegue (ex.: webhook de saída desabilitado
  // nessa instância) — evita o Set crescer pra sempre.
  setTimeout(() => idsEnviadosPeloBot.delete(id), TEMPO_DE_VIDA_DO_ID_MS).unref();
}

// Chamado pelo webhookController ao receber um `fromMe: true`. Retorna true
// (e "consome" o id) quando é o eco de uma mensagem que o próprio bot mandou.
function foiEnviadaPeloBot(mensagemId) {
  if (!mensagemId || !idsEnviadosPeloBot.has(mensagemId)) return false;
  idsEnviadosPeloBot.delete(mensagemId);
  return true;
}

// `webhookController` já marca a mensagem como processada (`ultima_mensagem_id`)
// antes deste envio — um blip de rede (ECONNRESET etc., visto em produção em
// 20/07) que derrube o fetch faz o cliente nunca receber a resposta, e o
// retry do mesmo webhook cai no dedup como "já processado", sem tentar de
// novo. Blips assim costumam se resolver sozinhos em menos de 1-2s, então
// tentamos de novo algumas vezes antes de desistir — reduz bastante o risco
// sem precisar de fila/infra nova.
const MAX_TENTATIVAS_ENVIO = 3;

// Códigos de erro seguros pra reenviar até MAX_TENTATIVAS_ENVIO inteiras:
// - ECONNREFUSED/ENOTFOUND/EAI_AGAIN/UND_ERR_CONNECT_TIMEOUT: a conexão nunca
//   chegou a se estabelecer, o Evolution API nunca recebeu nada.
// - ECONNRESET: quase sempre é o pool de conexões (keep-alive) do fetch
//   reaproveitando um socket que o servidor remoto já fechou por inatividade
//   — o reset acontece na hora de reusar a conexão, antes do corpo da
//   requisição sair de verdade (padrão confirmado em teste real em 22/07:
//   resets se repetindo a cada ~10-50s, batendo com timeout de conexão ociosa
//   do lado do servidor, não com "resposta perdida no meio do envio").
// Qualquer OUTRO erro é tratado como ambíguo (reenvia só mais 1x, não as
// MAX_TENTATIVAS_ENVIO inteiras) — pode ter saído e sido entregue mesmo com o
// fetch() lançando erro no cliente, e reenviar às cegas várias vezes arrisca
// duplicar pro cliente.
const ERROS_SEGUROS_PARA_RETENTAR_INTEGRALMENTE = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET',
]);

function erroSeguroParaRetentarIntegralmente(erro) {
  const codigo = erro?.cause?.code || erro?.code;
  return ERROS_SEGUROS_PARA_RETENTAR_INTEGRALMENTE.has(codigo);
}

function aguardar(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function fetchComRetentativa(url, opcoes, descricaoErro) {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_ENVIO; tentativa += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop -- retentativas são sequenciais por natureza
      return await fetch(url, { ...opcoes, dispatcher: agenteSemConexaoOciosa });
    } catch (erroDeRede) {
      // Erro genuinamente ambíguo (não está na lista de seguros): ainda vale
      // tentar mais uma vez (não deixar o cliente sem resposta nenhuma por
      // causa de um blip), mas não as MAX_TENTATIVAS_ENVIO inteiras — reduz a
      // janela de duplicar sem eliminar a rede de segurança contra silêncio total.
      const tentativasMaximasParaEsteErro = erroSeguroParaRetentarIntegralmente(erroDeRede) ? MAX_TENTATIVAS_ENVIO : 2;

      if (tentativa >= tentativasMaximasParaEsteErro) {
        logger.erro(descricaoErro, erroDeRede);
        throw new Error(`${descricaoErro}: ${erroDeRede.message}`);
      }
      logger.aviso(
        `${descricaoErro} (tentativa ${tentativa}/${tentativasMaximasParaEsteErro}) — tentando de novo`,
        erroDeRede.message
      );
      // eslint-disable-next-line no-await-in-loop -- espera intencional entre tentativas
      await aguardar(500 * tentativa);
    }
  }
  return undefined; // inalcançável: o loop sempre retorna ou lança na última tentativa
}

async function enviarTexto(telefoneDestino, mensagem) {
  const url = `${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`;

  const resposta = await fetchComRetentativa(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ number: telefoneDestino, text: mensagem }),
    },
    `Falha de rede ao enviar mensagem para ${telefoneDestino}`
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro(`Evolution API retornou erro ao enviar para ${telefoneDestino}`, {
      status: resposta.status,
      corpoErro,
    });
    throw new Error(`Evolution API retornou status ${resposta.status} ao enviar mensagem para ${telefoneDestino}`);
  }

  const resultado = await resposta.json().catch(() => null);
  registrarIdEnviadoPeloBot(resultado);
  return resultado;
}

// Base comum das duas formas de mandar documento: a partir de um arquivo
// local em disco (enviarArquivo, ex.: PDF de lista de material) ou a partir de
// um base64 já em mãos (enviarDocumentoBase64, ex.: PDF que o próprio cliente
// acabou de mandar e só estamos repassando pra Vendas). A Evolution API aceita
// o conteúdo do arquivo em base64 no campo `media` quando ele ainda não está
// hospedado em uma URL pública.
async function enviarMedia(telefoneDestino, { nomeArquivo, legenda, conteudoBase64 }) {
  const url = `${env.EVOLUTION_API_URL}/message/sendMedia/${env.EVOLUTION_INSTANCE}`;

  const resposta = await fetchComRetentativa(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: telefoneDestino,
        mediatype: 'document',
        fileName: nomeArquivo,
        caption: legenda,
        media: conteudoBase64,
      }),
    },
    `Falha de rede ao enviar arquivo para ${telefoneDestino}`
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro(`Evolution API retornou erro ao enviar arquivo para ${telefoneDestino}`, {
      status: resposta.status,
      corpoErro,
    });
    throw new Error(`Evolution API retornou status ${resposta.status} ao enviar arquivo para ${telefoneDestino}`);
  }

  const resultado = await resposta.json().catch(() => null);
  registrarIdEnviadoPeloBot(resultado);
  return resultado;
}

async function enviarArquivo(telefoneDestino, caminhoArquivo, legenda) {
  let conteudoBase64;
  try {
    conteudoBase64 = fs.readFileSync(caminhoArquivo).toString('base64');
  } catch (erroDeLeitura) {
    logger.erro(`Falha ao ler o arquivo "${caminhoArquivo}" para enviar a ${telefoneDestino}`, erroDeLeitura);
    throw new Error(`Não foi possível ler o arquivo "${caminhoArquivo}": ${erroDeLeitura.message}`);
  }

  return enviarMedia(telefoneDestino, { nomeArquivo: path.basename(caminhoArquivo), legenda, conteudoBase64 });
}

// Usado para repassar um arquivo que já veio em base64 (ex.: PDF recebido do
// cliente, baixado via baixarMidia) sem precisar gravar em disco antes.
async function enviarDocumentoBase64(telefoneDestino, conteudoBase64, nomeArquivo, legenda) {
  return enviarMedia(telefoneDestino, { nomeArquivo, legenda, conteudoBase64 });
}

// Baixa o conteúdo (em base64) de uma mensagem de mídia recebida do cliente.
// O payload do webhook só traz uma referência à mídia (chave/tipo), não o
// arquivo em si — a Evolution API exige essa chamada separada, passando de
// volta o objeto de mensagem inteiro recebido no webhook (`data`), não só o id.
async function baixarMidia(mensagemBruta) {
  const url = `${env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${env.EVOLUTION_INSTANCE}`;

  const resposta = await fetchComRetentativa(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ message: mensagemBruta, convertToMp4: false }),
    },
    'Falha de rede ao baixar mídia recebida da Evolution API'
  );

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro('Evolution API retornou erro ao baixar mídia recebida', { status: resposta.status, corpoErro });
    throw new Error(`Evolution API retornou status ${resposta.status} ao baixar mídia recebida`);
  }

  return resposta.json();
}

module.exports = {
  enviarTexto, enviarArquivo, enviarDocumentoBase64, baixarMidia, foiEnviadaPeloBot,
};
