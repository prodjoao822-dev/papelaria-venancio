// Leitura de `consultas_operacionais` do lado do bot — usado só pra entregar a
// resposta de um operador de volta pro WhatsApp do cliente (ver
// dashboard/operadorController.js:notificarRespostaConsulta). Escrita/gestão
// da consulta em si continua toda no dashboard (venancio-ai-ops).

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

async function buscarConsultaComCliente(consultaId) {
  const { data, error } = await supabase
    .from('consultas_operacionais')
    .select('id, status, resposta, produto_nome, conversa_id, clientes (telefone)')
    .eq('id', consultaId)
    .maybeSingle();

  if (error) {
    logger.erro(`Falha ao buscar consulta operacional ${consultaId}`, error);
    throw new Error(`Não foi possível buscar a consulta ${consultaId}: ${error.message}`);
  }

  return data;
}

module.exports = { buscarConsultaComCliente };
