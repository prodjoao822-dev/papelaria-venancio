// Consultas de "orçamento/pedido ativo do cliente", usadas pelo webhookController
// pra decidir se retoma um fluxo em andamento ou mostra o menu normalmente.
// Só leitura — as funções `orcamento_ativo_cliente`/`pedido_ativo_cliente` do
// banco não travam nada; a regra de "1 ativo por cliente" vive na aplicação.

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');

// `orcamento_ativo_cliente`/`pedido_ativo_cliente` são funções SQL que
// `returns orcamentos`/`returns pedidos` (uma linha, não um conjunto). Quando
// a consulta interna não acha nenhuma linha, o Postgres não devolve NULL puro
// — devolve uma linha "composta" com todo campo null (inclusive `id`), e o
// PostgREST serializa isso como um objeto `{ id: null, protocolo: null, ... }`
// em vez de `null`. `data || null` não pega esse caso (o objeto é truthy) —
// por isso checamos `data?.id` pra decidir se é uma linha real.
function linhaReal(data) {
  return data?.id ? data : null;
}

async function orcamentoAtivoCliente(clienteId) {
  const { data, error } = await supabase.rpc('orcamento_ativo_cliente', { p_cliente_id: clienteId });

  if (error) {
    logger.erro(`Falha ao buscar orçamento ativo do cliente ${clienteId}`, error);
    throw new Error(`Não foi possível buscar o orçamento ativo do cliente ${clienteId}: ${error.message}`);
  }

  return linhaReal(data);
}

async function pedidoAtivoCliente(clienteId) {
  const { data, error } = await supabase.rpc('pedido_ativo_cliente', { p_cliente_id: clienteId });

  if (error) {
    logger.erro(`Falha ao buscar pedido ativo do cliente ${clienteId}`, error);
    throw new Error(`Não foi possível buscar o pedido ativo do cliente ${clienteId}: ${error.message}`);
  }

  return linhaReal(data);
}

module.exports = { orcamentoAtivoCliente, pedidoAtivoCliente };
