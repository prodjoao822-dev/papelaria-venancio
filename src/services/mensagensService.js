// Operações de escrita na tabela "mensagens" (histórico de mensagens por
// conversa, ver supabase/schema.sql) — hoje usada só como log de auditoria
// pelo callback do Agente de Orçamento (POST /webhook/agente-orcamento);
// não faz parte do fluxo normal de conversa com o cliente.

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

async function registrarMensagem(conversaId, remetente, conteudo) {
  const { error } = await supabase
    .from('mensagens')
    .insert({ conversa_id: conversaId, remetente, conteudo });

  if (error) {
    logger.erro(`Falha ao registrar mensagem (${remetente}) da conversa ${conversaId}`, error);
    throw new Error(`Não foi possível registrar a mensagem da conversa ${conversaId}: ${error.message}`);
  }
}

module.exports = { registrarMensagem };
