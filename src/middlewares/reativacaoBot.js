// Lógica responsável por pausar o bot quando um humano responde manualmente
// pelo WhatsApp da loja (evento fromMe) e por reativá-lo sozinho depois de
// REACTIVATION_TIMEOUT_MINUTES sem atividade na conversa.
//
// Não é um middleware Express (req, res, next) porque a decisão depende da
// conversa específica do cliente, que só é conhecida depois que o
// webhookController já buscou o cliente e a conversa no banco. Por isso é
// chamado diretamente pelo controller como função de apoio.

const env = require('../config/env');
const conversasService = require('../services/conversasService');
const logger = require('../utils/logger');

function minutosDesde(dataIso) {
  return (Date.now() - new Date(dataIso).getTime()) / (1000 * 60);
}

// Chamado quando chega uma mensagem fromMe: um humano assumiu a conversa.
async function pausarBot(conversaId) {
  logger.info(`Pausando bot da conversa ${conversaId}: humano respondeu manualmente pela loja.`);
  await conversasService.definirBotAtivo(conversaId, false);
}

// Chamado antes de processar uma mensagem do cliente. Retorna true se o bot
// deve responder automaticamente agora (já estava ativo, ou acabou de ser
// reativado por timeout). Retorna false se o bot deve continuar em silêncio
// porque um humano ainda está dentro da janela de atendimento.
async function garantirBotAtivo(conversa) {
  if (conversa.bot_ativo) {
    return true;
  }

  const minutosInativo = minutosDesde(conversa.ultima_interacao_em);
  if (minutosInativo < env.REACTIVATION_TIMEOUT_MINUTES) {
    // Ainda dentro da janela humana: só registra a atividade, sem reativar o bot.
    await conversasService.definirBotAtivo(conversa.id, false);
    return false;
  }

  logger.info(
    `Reativando bot da conversa ${conversa.id} após ${minutosInativo.toFixed(1)} min de inatividade.`
  );
  await conversasService.definirBotAtivo(conversa.id, true);
  return true;
}

module.exports = { pausarBot, garantirBotAtivo };
