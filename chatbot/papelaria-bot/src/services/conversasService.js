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
    // Corrida: duas mensagens do mesmo cliente novo chegaram quase juntas (ex.:
    // reenvio de webhook da Evolution API, ou o cliente mandando 2 mensagens em
    // sequência) e as duas viram "não existe conversa ainda" antes de qualquer
    // uma inserir. A 2ª bate na constraint única de cliente_id — não é um erro
    // de verdade, é só a outra chamada tendo vencido a corrida; busca de novo em
    // vez de derrubar o webhook (visto em teste real em 24/07: perdia a mensagem
    // com erro 500 nesse cenário).
    if (erroCriacao.code === '23505') {
      const { data: criadaPelaOutraChamada, error: erroRebusca } = await supabase
        .from('conversas')
        .select()
        .eq('cliente_id', clienteId)
        .maybeSingle();

      if (!erroRebusca && criadaPelaOutraChamada) {
        return criadaPelaOutraChamada;
      }
    }

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
// que é a referência usada pelo timeout de reativação. Também zera
// `pausado_pos_pedido`: qualquer pausa/reativação manual (humano assumindo,
// comando de escalação, timeout do Agente de Vendas, reativação por timeout ou
// pelo gatilho de pedido) descarta a marca de "pausa automática pós-pedido" —
// senão uma pausa manual futura herdaria o fast-track de reativação por engano
// (ver middlewares/reativacaoBot.js). A pausa pós-pedido é ligada só por
// `pausarPosPedido` abaixo.
//
// Reativar a IA (ativo=true) também limpa operador_id: bot_ativo=true e
// operador_id preenchido nunca deveriam coexistir (o dashboard trata os dois
// como o mesmo estado em assumirConversa/liberarConversa), senão a etiqueta
// "atendido por X" no dashboard fica presa a um operador que já não está mais
// no controle depois que o timeout de reativação devolve a conversa pro bot.
async function definirBotAtivo(conversaId, ativo) {
  const payload = {
    bot_ativo: ativo,
    ultima_interacao_em: new Date().toISOString(),
    pausado_pos_pedido: false,
  };
  if (ativo) {
    payload.operador_id = null;
  }

  const { error } = await supabase
    .from('conversas')
    .update(payload)
    .eq('id', conversaId);

  if (error) {
    logger.erro(`Falha ao atualizar bot_ativo da conversa ${conversaId}`, error);
    throw new Error(`Não foi possível atualizar bot_ativo da conversa ${conversaId}: ${error.message}`);
  }
}

// Pausa automática do bot depois que um orçamento vira pedido (chamada por
// finalizarCadastroEPedido em botEngine/actions.js). Diferente de
// definirBotAtivo(false)/pausarBot (pausa manual de humano), marca
// `pausado_pos_pedido = true` pra que a PRÓXIMA mensagem do cliente reative o
// bot na hora, sem esperar REACTIVATION_TIMEOUT_MINUTES, e acione o Agente de
// Vendas com o contexto do pedido em vez do menu normal (ver reativacaoBot.js).
async function pausarPosPedido(conversaId) {
  const { error } = await supabase
    .from('conversas')
    .update({ bot_ativo: false, pausado_pos_pedido: true, ultima_interacao_em: new Date().toISOString() })
    .eq('id', conversaId);

  if (error) {
    logger.erro(`Falha ao pausar (pós-pedido) o bot da conversa ${conversaId}`, error);
    throw new Error(`Não foi possível pausar (pós-pedido) o bot da conversa ${conversaId}: ${error.message}`);
  }
}

// Busca a conversa com o telefone do cliente associado — usado pela rota do
// operador (src/dashboard/operadorController.js) pra saber pra quem mandar a
// mensagem manual e conferir bot_ativo antes de enviar.
async function buscarConversaComCliente(conversaId) {
  const { data, error } = await supabase
    .from('conversas')
    .select('id, bot_ativo, clientes(telefone)')
    .eq('id', conversaId)
    .maybeSingle();

  if (error) {
    logger.erro(`Falha ao buscar conversa ${conversaId} com cliente`, error);
    throw new Error(`Não foi possível buscar a conversa ${conversaId}: ${error.message}`);
  }

  return data;
}

module.exports = {
  buscarOuCriarConversa,
  atualizarEstadoConversa,
  definirBotAtivo,
  pausarPosPedido,
  buscarConversaComCliente,
};
