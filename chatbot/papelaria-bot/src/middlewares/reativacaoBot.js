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

// Chamado sempre que o bot precisa parar de responder automaticamente numa
// conversa — não só quando um humano assume de verdade (fromMe), mas também em
// timeout/erro do Agente de Vendas e no comando de escalação. `motivo` (opcional)
// deixa o log honesto sobre qual foi o gatilho real; sem isso, todo log dizia
// "humano respondeu manualmente pela loja" mesmo quando a causa era um erro de
// rede — isso já atrapalhou diagnóstico em teste real (24/07).
async function pausarBot(conversaId, motivo = 'humano respondeu manualmente pela loja') {
  logger.info(`Pausando bot da conversa ${conversaId}: ${motivo}.`);
  await conversasService.definirBotAtivo(conversaId, false);
}

// Chamado antes de processar uma mensagem do cliente. Retorna um objeto
// { podeResponder, viaGatilhoPedido }:
//   - podeResponder: true se o bot deve responder automaticamente agora (já
//     estava ativo, reativado por timeout, ou reativado pelo gatilho de
//     pedido); false se deve continuar em silêncio porque um humano ainda está
//     dentro da janela de atendimento.
//   - viaGatilhoPedido: true só quando a reativação veio da pausa automática
//     pós-pedido (`pausado_pos_pedido`) — sinaliza pro controller acionar o
//     Agente de Vendas com o contexto do pedido em vez de cair no menu normal
//     (ver webhookController.receberWebhook).
async function garantirBotAtivo(conversa) {
  if (conversa.bot_ativo) {
    return { podeResponder: true, viaGatilhoPedido: false };
  }

  // Pausa automática pós-pedido: reativa já na próxima mensagem do cliente,
  // ignorando o timeout humano. definirBotAtivo já zera pausado_pos_pedido ao
  // reativar, pra não vazar esse fast-track pra uma pausa manual futura.
  if (conversa.pausado_pos_pedido) {
    logger.info(`Reativando bot da conversa ${conversa.id} via gatilho de pedido (pausa pós-pedido).`);
    await conversasService.definirBotAtivo(conversa.id, true);
    return { podeResponder: true, viaGatilhoPedido: true };
  }

  const minutosInativo = minutosDesde(conversa.ultima_interacao_em);
  if (minutosInativo < env.REACTIVATION_TIMEOUT_MINUTES) {
    // Ainda dentro da janela humana: fica em silêncio, e — importante — sem
    // escrever nada na conversa.
    //
    // Aqui havia um `definirBotAtivo(conversa.id, false)`. Como `bot_ativo` já
    // é false pra chegar nesta linha, a única coisa que aquela chamada fazia de
    // fato era renovar `ultima_interacao_em` (ver conversasService.definirBotAtivo)
    // — ou seja, cada mensagem do cliente empurrava o prazo de reativação
    // REACTIVATION_TIMEOUT_MINUTES minutos pra frente. Pra o bot voltar, o
    // cliente precisava ficar todo esse tempo CALADO; e um cliente que não está
    // sendo respondido justamente não fica calado, ele insiste. Na prática a
    // pausa virava permanente (em 12/08 havia 24 das 30 conversas travadas
    // assim, nenhuma com operador atribuído).
    //
    // O risco já estava anotado no ARCHITECTURE_REVIEW.md (fase 3.6), mas a
    // correção daquela vez atacou só a causa de origem (o bot pausando a si
    // mesmo pelo eco) e deixou o relógio deslizante de pé. Com pausa humana
    // legítima acontecendo todo dia, ele voltou a morder.
    //
    // Sem essa escrita, `ultima_interacao_em` passa a significar "última vez que
    // o BOT ou a LOJA agiram", que é exatamente o marco que o timeout de
    // reativação quer medir. Mensagem de cliente não adia mais o retorno do bot.
    return { podeResponder: false, viaGatilhoPedido: false };
  }

  logger.info(
    `Reativando bot da conversa ${conversa.id} após ${minutosInativo.toFixed(1)} min de inatividade.`
  );
  await conversasService.definirBotAtivo(conversa.id, true);
  return { podeResponder: true, viaGatilhoPedido: false };
}

module.exports = { pausarBot, garantirBotAtivo };
