// Operações de leitura e escrita na tabela "conversas" do Supabase,
// incluindo estado_atual, dados (contexto da máquina de estados) e bot_ativo.

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

const ESTADO_INICIAL = 'MENU_PRINCIPAL';

// Busca a conversa aberta do cliente ou cria uma nova, já no estado inicial do
// menu principal. Cada cliente tem uma conversa "viva" por vez (não criamos
// uma nova conversa a cada mensagem).
async function buscarOuCriarConversa(clienteId) {
  const { data: existente, error: erroBusca } = await supabase
    .from('conversas')
    .select()
    .eq('cliente_id', clienteId)
    .maybeSingle();

  if (erroBusca) {
    logger.erro(`Falha ao buscar conversa do cliente ${clienteId}`, erroBusca);
    throw new Error(`Não foi possível buscar a conversa do cliente ${clienteId}: ${erroBusca.message}`);
  }

  if (existente) {
    return existente;
  }

  const { data: nova, error: erroCriacao } = await supabase
    .from('conversas')
    .insert({
      cliente_id: clienteId,
      estado_atual: ESTADO_INICIAL,
      dados: {},
      bot_ativo: true,
      ultima_interacao_em: new Date().toISOString(),
    })
    .select()
    .single();

  if (erroCriacao) {
    logger.erro(`Falha ao criar conversa do cliente ${clienteId}`, erroCriacao);
    throw new Error(`Não foi possível criar a conversa do cliente ${clienteId}: ${erroCriacao.message}`);
  }

  return nova;
}

// Persiste o novo estado_atual e dados da máquina de estados após processar uma mensagem.
// `mensagemId` (opcional) grava qual foi a última mensagem da Evolution API já
// processada nesta conversa, usado por `receberWebhook` para detectar retries
// do mesmo webhook (ver ultima_mensagem_id / supabase/migrations/0001_*.sql).
async function atualizarEstadoConversa(conversaId, estadoAtual, dados, mensagemId) {
  const { error } = await supabase
    .from('conversas')
    .update({
      estado_atual: estadoAtual,
      dados: dados || {},
      ultima_interacao_em: new Date().toISOString(),
      ...(mensagemId ? { ultima_mensagem_id: mensagemId } : {}),
    })
    .eq('id', conversaId);

  if (error) {
    logger.erro(`Falha ao atualizar estado da conversa ${conversaId}`, error);
    throw new Error(`Não foi possível atualizar a conversa ${conversaId}: ${error.message}`);
  }
}

// Liga/desliga o atendimento automático e sempre atualiza ultima_interacao_em,
// que é a referência usada pelo timeout de reativação.
async function definirBotAtivo(conversaId, ativo) {
  const { error } = await supabase
    .from('conversas')
    .update({ bot_ativo: ativo, ultima_interacao_em: new Date().toISOString() })
    .eq('id', conversaId);

  if (error) {
    logger.erro(`Falha ao atualizar bot_ativo da conversa ${conversaId}`, error);
    throw new Error(`Não foi possível atualizar bot_ativo da conversa ${conversaId}: ${error.message}`);
  }
}

module.exports = { buscarOuCriarConversa, atualizarEstadoConversa, definirBotAtivo };
