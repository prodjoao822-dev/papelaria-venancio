// Servidor de teste de carga: sobe o app Express REAL (src/index.js) — com
// todos os middlewares (rate limiter, verifyToken, express.json) e a
// stateMachine/menuEngine reais — mas com toda dependência externa (Supabase,
// Evolution API, n8n/Agente de Vendas) dublada em memória, seguindo o mesmo
// padrão de `require.cache` já usado em
// test/webhook/webhookController.historico.test.js.
//
// Por quê um servidor HTTP de verdade, e não só chamar `receberWebhook`
// diretamente: o objetivo do teste de carga (Fase 4, pré-Volta às Aulas) é
// medir o comportamento do PROCESSO Express sob concorrência real — rate
// limiter (express-rate-limit, 300 req/min por IP), parsing do body,
// middlewares em cadeia — não só a lógica pura do controller.
//
// NUNCA aponta para nenhum serviço externo real. Todas as chamadas de rede
// (Supabase, Evolution API, n8n) são substituídas por implementações em
// memória com latência artificial configurável (ver LATENCIAS abaixo), pra
// aproximar o tempo de resposta observado sem bater em nada de produção.
//
// Uso:
//   node loadtest/server-teste.js
//   (ou `npm run loadtest:server`, ver package.json)
//
// Variáveis de ambiente que ajustam o comportamento deste servidor de teste
// (todas opcionais, com default):
//   LOADTEST_PORT               porta do servidor de teste (default 3999)
//   LOADTEST_DB_LATENCY_MS      latência simulada de cada operação "Supabase" (default 15ms)
//   LOADTEST_EVOLUTION_LATENCY_MS latência simulada de cada envio "Evolution API" (default 80ms)
//   LOADTEST_N8N_LATENCY_MS      latência simulada da consulta ao "Agente de Vendas" n8n (default 1200ms)
//   LOADTEST_LOG_SILENCIOSO       'true' para silenciar o logger real (console) durante o teste
//                                  (default: loga normalmente, igual produção)

const path = require('node:path');

// --- Variáveis de ambiente obrigatórias da aplicação (env.js falha rápido se
// faltar alguma) — valores fictícios, nunca usados para bater em serviço real,
// porque TODO módulo que faria I/O de verdade com eles está dublado abaixo.
process.env.EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:0';
process.env.EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'loadtest';
process.env.EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'chave-de-teste-loadtest';
process.env.WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN || 'loadtest-secret-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:0';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'chave-de-teste-loadtest';
process.env.PHONE_CHEFE = process.env.PHONE_CHEFE || '5527000000001';
process.env.PHONE_COMPRAS = process.env.PHONE_COMPRAS || '5527000000002';
process.env.PHONE_SERVICOS = process.env.PHONE_SERVICOS || '5527000000003';
process.env.PHONE_VANESSA = process.env.PHONE_VANESSA || '5527000000004';
process.env.PORT = process.env.LOADTEST_PORT || '3999';
// Sem isso o boot imprime o aviso de "Agente de Vendas desativado" a cada
// subida — inofensivo (n8nClient real nunca é carregado, está dublado), só
// deixa o log mais limpo.
process.env.N8N_VENDAS_WEBHOOK_URL = process.env.N8N_VENDAS_WEBHOOK_URL || 'http://localhost:0/loadtest-fake';
process.env.N8N_VENDAS_WEBHOOK_TOKEN = process.env.N8N_VENDAS_WEBHOOK_TOKEN || 'loadtest-token';

const LATENCIAS = {
  db: Number(process.env.LOADTEST_DB_LATENCY_MS ?? 15),
  evolution: Number(process.env.LOADTEST_EVOLUTION_LATENCY_MS ?? 80),
  n8n: Number(process.env.LOADTEST_N8N_LATENCY_MS ?? 1200),
};

function aguardar(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Silencia o logger real (console.log/warn/error) se pedido — útil pra rodar
// um teste de carga alto sem o I/O de milhares de linhas de log competir pelo
// mesmo processo que está sendo medido. Desligado por padrão: em produção o
// bot loga do mesmo jeito, então o comportamento default aqui reflete isso.
if (process.env.LOADTEST_LOG_SILENCIOSO === 'true') {
  const loggerPath = require.resolve('../src/utils/logger');
  require.cache[loggerPath] = {
    id: loggerPath, filename: loggerPath, loaded: true,
    exports: { info: () => {}, aviso: () => {}, erro: () => {} },
  };
}

// --- Contadores expostos via GET /__loadtest/stats, pra conferir server-side
// o que o k6 está inferindo só pelo HTTP (ex.: quantas consultas o "n8n"
// dublado realmente recebeu, contra quantas requisições o k6 disparou).
const stats = {
  clientesUpsert: 0,
  clientesDistintos: 0,
  conversasCriadas: 0,
  mensagensRegistradas: 0,
  evolutionEnviosTexto: 0,
  n8nConsultasIniciadas: 0,
  n8nConsultasConcluidas: 0,
  n8nConsultasConcorrentesMax: 0,
  escalonamentoChamadas: 0,
};
let n8nConsultasEmAndamento = 0;

function dubla(caminhoRelativo, exports) {
  const caminho = require.resolve(caminhoRelativo);
  require.cache[caminho] = {
    id: caminho, filename: caminho, loaded: true, exports,
  };
}

// --- clientesService: telefone -> cliente, id determinístico (mesmo telefone
// sempre volta o mesmo cliente/conversa, como no Supabase real via UNIQUE).
const clientesPorTelefone = new Map();

dubla('../src/services/clientesService', {
  async upsertCliente(telefone, nome) {
    await aguardar(LATENCIAS.db);
    stats.clientesUpsert += 1;
    let cliente = clientesPorTelefone.get(telefone);
    if (!cliente) {
      cliente = { id: `cliente-${telefone}`, telefone, nome: nome || null };
      clientesPorTelefone.set(telefone, cliente);
      stats.clientesDistintos += 1;
    } else if (nome) {
      cliente.nome = nome;
    }
    return cliente;
  },
  async clienteTemCadastroCompleto() {
    await aguardar(LATENCIAS.db);
    return false;
  },
  async atualizarCadastroFiscal() {
    await aguardar(LATENCIAS.db);
  },
});

// --- conversasService: uma conversa "viva" por cliente, igual ao real —
// suporta o dedupe por `ultima_mensagem_id` (checado pelo webhookController
// antes mesmo de chamar a stateMachine) e a máquina de estados real
// (MENU_PRINCIPAL -> SUBMENU_VENDAS -> AGENTE_VENDAS_ATIVO etc.).
const conversasPorClienteId = new Map();

function buscarConversaPorId(conversaId) {
  for (const conversa of conversasPorClienteId.values()) {
    if (conversa.id === conversaId) return conversa;
  }
  return null;
}

dubla('../src/services/conversasService', {
  async buscarOuCriarConversa(clienteId) {
    await aguardar(LATENCIAS.db);
    let conversa = conversasPorClienteId.get(clienteId);
    if (!conversa) {
      conversa = {
        id: `conversa-${clienteId}`,
        cliente_id: clienteId,
        estado_atual: 'MENU_PRINCIPAL',
        dados: {},
        bot_ativo: true,
        pausado_pos_pedido: false,
        ultima_interacao_em: new Date().toISOString(),
        ultima_mensagem_id: null,
      };
      conversasPorClienteId.set(clienteId, conversa);
      stats.conversasCriadas += 1;
    }
    return conversa;
  },
  async atualizarEstadoConversa(conversaId, estadoAtual, dados, mensagemId) {
    await aguardar(LATENCIAS.db);
    const conversa = buscarConversaPorId(conversaId);
    if (!conversa) return;
    conversa.estado_atual = estadoAtual;
    conversa.dados = dados || {};
    conversa.ultima_interacao_em = new Date().toISOString();
    if (mensagemId) conversa.ultima_mensagem_id = mensagemId;
  },
  async definirBotAtivo(conversaId, ativo) {
    await aguardar(LATENCIAS.db);
    const conversa = buscarConversaPorId(conversaId);
    if (!conversa) return;
    conversa.bot_ativo = ativo;
    conversa.ultima_interacao_em = new Date().toISOString();
    conversa.pausado_pos_pedido = false;
  },
  async pausarPosPedido(conversaId) {
    await aguardar(LATENCIAS.db);
    const conversa = buscarConversaPorId(conversaId);
    if (!conversa) return;
    conversa.bot_ativo = false;
    conversa.pausado_pos_pedido = true;
    conversa.ultima_interacao_em = new Date().toISOString();
  },
  async buscarConversaComCliente(conversaId) {
    await aguardar(LATENCIAS.db);
    const conversa = buscarConversaPorId(conversaId);
    if (!conversa) return null;
    const cliente = [...clientesPorTelefone.values()].find((c) => c.id === conversa.cliente_id);
    return { id: conversa.id, bot_ativo: conversa.bot_ativo, clientes: { telefone: cliente?.telefone } };
  },
});

dubla('../src/services/escolasService', {
  async listarEscolasAtivas() {
    await aguardar(LATENCIAS.db);
    return [];
  },
});

dubla('../src/services/pedidosService', {
  async pedidoAtivoCliente() {
    await aguardar(LATENCIAS.db);
    return null;
  },
  async orcamentoAtivoCliente() {
    await aguardar(LATENCIAS.db);
    return null;
  },
});

dubla('../src/services/orcamentosService', {
  async buscarOrcamentoPorId() {
    await aguardar(LATENCIAS.db);
    return null;
  },
  async criarOrcamentoComItens({ clienteId }) {
    await aguardar(LATENCIAS.db);
    return { id: `orc-${clienteId}-${Date.now()}`, protocolo: `ORC-LOADTEST-${Date.now()}` };
  },
  async aceitarOrcamento(orcamentoId) {
    await aguardar(LATENCIAS.db);
    return { id: `pedido-${orcamentoId}`, protocolo: `PED-LOADTEST-${Date.now()}`, status: 'confirmado' };
  },
});

dubla('../src/services/mensagensService', {
  async registrarMensagem() {
    await aguardar(LATENCIAS.db);
    stats.mensagensRegistradas += 1;
    return { id: `msg-${stats.mensagensRegistradas}` };
  },
  async buscarUltimaMensagemBotAposInstante() {
    await aguardar(LATENCIAS.db);
    return null;
  },
});

dubla('../src/services/arquivosClienteService', {
  async salvarPdfRecebido() {
    await aguardar(LATENCIAS.db);
    return { url: null };
  },
});

// --- evolutionApi: nunca sai pra rede. Só conta envios e devolve algo
// parecido com o formato real (usado só pra registrar o id do eco, que aqui
// não importa pois `foiEnviadaPeloBot` está fixo em false).
dubla('../src/services/evolutionApi', {
  async enviarTexto(telefone, texto) {
    await aguardar(LATENCIAS.evolution);
    stats.evolutionEnviosTexto += 1;
    return { key: { id: `evo-${Date.now()}-${Math.random().toString(36).slice(2)}` } };
  },
  async enviarArquivo() {
    await aguardar(LATENCIAS.evolution);
    return { key: { id: 'evo-arquivo' } };
  },
  async enviarDocumentoBase64() {
    await aguardar(LATENCIAS.evolution);
    return { key: { id: 'evo-documento' } };
  },
  async baixarMidia() {
    await aguardar(LATENCIAS.evolution);
    return { base64: 'ZmFrZS1taWRpYS1sb2FkdGVzdA==' };
  },
  foiEnviadaPeloBot() {
    return false;
  },
});

// --- escalonamentoService: a implementação real bate direto no Supabase
// (supabaseClient), sem passar por nenhum service já dublado acima — precisa
// de dublê próprio pra não tentar abrir conexão nenhuma.
dubla('../src/services/escalonamentoService', {
  async verificarEscalonamento(telefoneCliente, enviarTexto) {
    await aguardar(LATENCIAS.db);
    stats.escalonamentoChamadas += 1;
    // Fila sempre "normal" no teste de carga: não é o alvo desta bateria.
  },
});

// --- n8nClient: fica no coração do cenário de concorrência por conversa —
// simula a latência real do Agente de Vendas (env.AGENTE_VENDAS_TIMEOUT_MS
// hoje é 55s; aqui um valor bem menor e configurável, ver LOADTEST_N8N_LATENCY_MS)
// e conta quantas consultas estão em voo ao mesmo tempo, pra comparar hipótese
// (o lock em memória do webhookController deveria manter isso em 1 por
// conversa) com o que de fato acontece.
dubla('../src/integracoes/n8nClient', {
  async notificarAgenteOrcamento() {
    await aguardar(LATENCIAS.db);
    return null;
  },
  async consultarAgenteVendas(payload) {
    stats.n8nConsultasIniciadas += 1;
    n8nConsultasEmAndamento += 1;
    stats.n8nConsultasConcorrentesMax = Math.max(stats.n8nConsultasConcorrentesMax, n8nConsultasEmAndamento);
    try {
      await aguardar(LATENCIAS.n8n);
      stats.n8nConsultasConcluidas += 1;
      return {
        resposta: `[loadtest] resposta simulada do Agente de Vendas para: "${(payload.texto || '').slice(0, 40)}"`,
        encerrar_atendimento_ia: false,
        acionarHumano: false,
        motivo: null,
        tempoAgenteN8nMs: LATENCIAS.n8n,
      };
    } finally {
      n8nConsultasEmAndamento -= 1;
    }
  },
});

// mediaProcessor não é dublado: só é chamado quando env.OPENROUTER_API_KEY
// está definida, e não definimos essa variável aqui — o próprio
// webhookController pula a transcrição/descrição e cai no fallback de sempre.
// Não é um caminho exercitado pelos cenários de carga (texto puro).

const app = require('../src/index');

app.get('/__loadtest/stats', (req, res) => {
  res.json({ ...stats, n8nConsultasEmAndamento, latencias: LATENCIAS, conversasVivas: conversasPorClienteId.size });
});

app.post('/__loadtest/reset', (req, res) => {
  clientesPorTelefone.clear();
  conversasPorClienteId.clear();
  Object.keys(stats).forEach((chave) => { stats[chave] = 0; });
  n8nConsultasEmAndamento = 0;
  res.json({ ok: true });
});

// eslint-disable-next-line no-console
console.log(`\n[loadtest] servidor de teste no ar com dependências externas dubladas (latências: ${JSON.stringify(LATENCIAS)}).`);
// eslint-disable-next-line no-console
console.log(`[loadtest] token do webhook: ${process.env.WEBHOOK_SECRET_TOKEN}`);
