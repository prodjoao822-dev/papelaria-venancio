// Transcreve áudio e descreve imagem recebidos do cliente via OpenRouter, pra
// alimentar o fluxo normal de texto (Agente de Vendas / stateMachine) em vez
// de exigir intervenção humana pra toda mídia (PROMPT-03, Entrega 2).
//
// OpenRouter em vez de OpenAI direto: decisão do dono do projeto (mesma
// preferência já usada no RAG do catálogo) — um fornecedor só pras
// integrações de IA do bot.
//
// Tolerante a falha por design: cada função lança em caso de erro, e quem
// chama (webhookController) decide o fallback (hoje: avisa a equipe de
// vendas e confirma recebimento pro cliente, sem travar o webhook).

const env = require('../config/env');
const logger = require('../utils/logger');

const OPENROUTER_TRANSCRIPTIONS_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO_TRANSCRICAO = 'openai/whisper-1';
const MODELO_VISAO = 'google/gemini-2.5-flash';

// Timeout curto o bastante pra não segurar o webhook indefinidamente (mesmo
// critério do EVOLUTION_API_TIMEOUT_MS em evolutionApi.js), generoso o
// bastante pra um áudio/imagem de WhatsApp processar numa chamada só.
const MEDIA_TIMEOUT_MS = 25000;

async function chamarOpenRouter(url, corpo) {
  const controleTimeout = new AbortController();
  const timeoutId = setTimeout(() => controleTimeout.abort(), MEDIA_TIMEOUT_MS);

  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
      signal: controleTimeout.signal,
    });

    if (!resposta.ok) {
      const corpoErro = await resposta.text().catch(() => '');
      throw new Error(`OpenRouter respondeu ${resposta.status}: ${corpoErro.slice(0, 500)}`);
    }

    return resposta.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Deriva o "format" que a API de transcrição da OpenRouter espera (ex.: "ogg",
// "mp3") a partir do mimetype que o Baileys manda no audioMessage (ex.:
// "audio/ogg; codecs=opus" — a nota de voz padrão do WhatsApp).
function formatoDoMimetype(mimetype) {
  const tipo = (mimetype || '').split(';')[0].trim();
  const subtipo = tipo.split('/')[1];
  return subtipo || 'ogg';
}

async function transcreverAudio(base64, mimetype) {
  const dados = await chamarOpenRouter(OPENROUTER_TRANSCRIPTIONS_URL, {
    model: MODELO_TRANSCRICAO,
    input_audio: { data: base64, format: formatoDoMimetype(mimetype) },
  });

  const texto = (dados?.text || '').trim();
  if (!texto) {
    throw new Error('OpenRouter não retornou texto transcrito.');
  }

  return texto;
}

const PROMPT_DESCRICAO_IMAGEM = 'Descreva objetivamente, em português, o que aparece nesta imagem que um '
  + 'cliente mandou no WhatsApp de uma papelaria. Foque em produtos/itens visíveis, cores, marca (se '
  + 'legível) e características relevantes pra uma compra. Se for uma foto de algo que não é produto '
  + '(pessoa, documento, print de tela etc.), descreva isso objetivamente também. Máximo 2-3 frases.';

async function descreverImagem(base64, mimetype, legenda) {
  const dados = await chamarOpenRouter(OPENROUTER_CHAT_URL, {
    model: MODELO_VISAO,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: legenda
              ? `${PROMPT_DESCRICAO_IMAGEM}\n\nLegenda que o cliente escreveu junto: "${legenda}"`
              : PROMPT_DESCRICAO_IMAGEM,
          },
          { type: 'image_url', image_url: { url: `data:${mimetype || 'image/jpeg'};base64,${base64}` } },
        ],
      },
    ],
  });

  const descricao = (dados?.choices?.[0]?.message?.content || '').trim();
  if (!descricao) {
    throw new Error('OpenRouter não retornou descrição da imagem.');
  }

  return descricao;
}

if (!env.OPENROUTER_API_KEY) {
  logger.aviso('OPENROUTER_API_KEY não configurada — transcrição de áudio e descrição de imagem desativadas (cai no fallback de notificar a equipe de vendas).');
}

module.exports = { transcreverAudio, descreverImagem };
