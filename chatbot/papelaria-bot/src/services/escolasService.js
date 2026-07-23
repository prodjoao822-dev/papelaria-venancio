// Operações de leitura na tabela "escolas" do Supabase, usadas no fluxo de lista escolar.

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

// Ordenado por nome para o fluxo de lista escolar mostrar as opções em ordem alfabética.
async function listarEscolasAtivas() {
  const { data, error } = await supabase
    .from('escolas')
    .select('id, nome')
    .eq('ativa', true)
    .order('nome', { ascending: true });

  if (error) {
    logger.erro('Falha ao listar escolas ativas', error);
    throw new Error(`Não foi possível listar as escolas: ${error.message}`);
  }

  return data;
}

module.exports = { listarEscolasAtivas };
