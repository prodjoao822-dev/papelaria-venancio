// Operações de escrita na tabela "mensagens" (histórico de mensagens por
// conversa, ver supabase/schema.sql) — usada como log de auditoria pelo
// callback do Agente de Orçamento (POST /webhook/agente-orcamento) e, desde a
// rota /operador/mensagens/enviar, para registrar mensagens manuais do
// operador (remetente 'humano', com operadorId).

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

// operadorId é opcional (só se aplica a remetente 'humano'). Retorna a linha
// inserida com operadores(nome) junto — o dashboard usa esse mesmo formato em
// atendimento.service.js pra normalizar a mensagem na UI.
async function registrarMensagem(conversaId, remetente, conteudo, operadorId = null) {
  const { data, error } = await supabase
    .from('mensagens')
    .insert({
      conversa_id: conversaId,
      remetente,
      conteudo,
      ...(operadorId ? { operador_id: operadorId } : {}),
    })
    .select('*, operadores(nome)')
    .single();

  if (error) {
    logger.erro(`Falha ao registrar mensagem (${remetente}) da conversa ${conversaId}`, error);
    throw new Error(`Não foi possível registrar a mensagem da conversa ${conversaId}: ${error.message}`);
  }

  return data;
}

// Usada pela recuperação de resposta do Agente de Vendas quando o corpo HTTP
// chega vazio (n8nClient.js, recuperarRespostaViaSupabase): o node n8n
// "Supabase · Grava Resposta" já grava a resposta do bot nesta tabela antes
// do "Respond to Webhook" — se o corpo HTTP se perder no meio do caminho, a
// linha já existe aqui. maybeSingle() porque "não encontrou ainda" é um
// resultado válido (o poll trata isso como falha de recuperação, não como erro).
async function buscarUltimaMensagemBotAposInstante(conversaId, desdeIso) {
  const { data, error } = await supabase
    .from('mensagens')
    .select('conteudo, enviado_em')
    .eq('conversa_id', conversaId)
    .eq('remetente', 'bot')
    .gt('enviado_em', desdeIso)
    .order('enviado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.erro(`Falha ao buscar última mensagem do bot na conversa ${conversaId} (recuperação via Supabase)`, error);
    return null;
  }

  return data;
}

module.exports = { registrarMensagem, buscarUltimaMensagemBotAposInstante };
