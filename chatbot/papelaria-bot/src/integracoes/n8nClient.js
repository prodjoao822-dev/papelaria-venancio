// Clientes dos webhooks dos agentes n8n: Agente de Orçamento e Agente de
// Vendas. Contrato JS Bot -> n8n do Agente de Orçamento definido no PRD
// (Claudeinstruções.md, seção 6): o JS Bot já criou cliente_id/orcamento_id/
// protocolo antes de chamar aqui — o n8n nunca cria nenhum dos dois, só
// recebe e processa.
//
// notificarAgenteOrcamento é best-effort: se a URL não estiver configurada ou
// a chamada falhar, loga e segue — nunca deve impedir a confirmação do
// pedido pro cliente, que já aconteceu antes desta chamada.
// consultarAgenteVendas é diferente: é síncrona, com timeout — ver comentário
// na própria função.

const env = require('../config/env');
const logger = require('../utils/logger');

async function notificarAgenteOrcamento(payload) {
  if (!env.N8N_ORCAMENTO_WEBHOOK_URL) {
    logger.aviso('N8N_ORCAMENTO_WEBHOOK_URL não configurado; orçamento não foi notificado ao Agente de Orçamento.');
    return null;
  }

  let resposta;
  try {
    resposta = await fetch(env.N8N_ORCAMENTO_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (erroDeRede) {
    logger.erro('Falha de rede ao notificar o Agente de Orçamento via n8n', erroDeRede);
    return null;
  }

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro('Webhook do Agente de Orçamento retornou erro', { status: resposta.status, corpoErro });
    return null;
  }

  return resposta.json().catch(() => null);
}

// Cliente do webhook do Agente de Vendas (n8n). Ao contrário de
// notificarAgenteOrcamento (fire-and-forget), essa chamada é síncrona: o
// webhookController espera a resposta pra decidir o que mandar ao cliente e
// se o atendimento automático continua (ver B.3 do prompt de integração de
// webhooks de agentes). Timeout explícito porque o n8n não fala mais direto
// com a Evolution API nesse fluxo — sem resposta, o cliente ficaria sem
// mensagem nenhuma se não houvesse limite de espera.
//
// Retorna `null` em qualquer cenário de falha (sem URL configurada, timeout,
// erro de rede, status HTTP de erro, corpo de resposta fora do contrato) —
// nunca lança. Quem chama decide a rede de segurança a partir do `null`.
async function consultarAgenteVendas(payload) {
  if (!env.N8N_VENDAS_WEBHOOK_URL) {
    logger.erro('N8N_VENDAS_WEBHOOK_URL não configurado; não foi possível consultar o Agente de Vendas.');
    return null;
  }

  const controleTimeout = new AbortController();
  const timeoutId = setTimeout(() => controleTimeout.abort(), env.AGENTE_VENDAS_TIMEOUT_MS);

  let resposta;
  try {
    resposta = await fetch(env.N8N_VENDAS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controleTimeout.signal,
    });
  } catch (erro) {
    if (erro.name === 'AbortError') {
      logger.erro(`Timeout de ${env.AGENTE_VENDAS_TIMEOUT_MS}ms ao consultar o Agente de Vendas`, {
        conversaId: payload.conversa_id,
      });
    } else {
      logger.erro('Falha de rede ao consultar o Agente de Vendas via n8n', erro);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    logger.erro('Webhook do Agente de Vendas retornou erro', { status: resposta.status, corpoErro });
    return null;
  }

  const corpo = await resposta.json().catch(() => null);
  if (!corpo || typeof corpo.resposta !== 'string') {
    logger.erro('Webhook do Agente de Vendas retornou payload fora do contrato esperado', corpo);
    return null;
  }

  return { resposta: corpo.resposta, encerrar_atendimento_ia: Boolean(corpo.encerrar_atendimento_ia) };
}

module.exports = { notificarAgenteOrcamento, consultarAgenteVendas };
