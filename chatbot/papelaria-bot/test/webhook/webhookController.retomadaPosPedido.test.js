// TRB-2026-0020: o bloco `if (viaGatilhoPedido && ...)` (retomada inteligente
// pós-pedido, ver webhookController.js) nunca era alcançado por nenhum teste,
// porque test/webhook/webhookController.rotas.test.js dubla
// `reativacaoBot.garantirBotAtivo` com `viaGatilhoPedido: false` FIXO — algo
// estruturalmente impossível de virar `true` com aquele dublê. Este arquivo
// tem o SEU PRÓPRIO dublê de reativacaoBot (`viaGatilhoPedido: true` fixo),
// sem tocar no dublê do outro arquivo — cada teste de webhook já roda isolado
// via require.cache por arquivo, mesmo padrão dos demais.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

process.env.EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:0';
process.env.EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'TESTE';
process.env.EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'chave-de-teste';
process.env.WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN || 'token-de-teste';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:0';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'chave-de-teste';
process.env.PHONE_CHEFE = process.env.PHONE_CHEFE || '5527000000001';
process.env.PHONE_COMPRAS = process.env.PHONE_COMPRAS || '5527000000002';
process.env.PHONE_SERVICOS = process.env.PHONE_SERVICOS || '5527000000003';
process.env.PHONE_VANESSA = process.env.PHONE_VANESSA || '5527000000004';
process.env.REGISTRO_ECOS_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-webhook-retomada-')),
  'ecos.json'
);

// --- estado observável dos dublês, remontado a cada teste ---
const enviadas = [];
const estadosAtualizados = [];
let conversaAtual;
let pedidoAtivo;
let orcamentoAtivo;
let respostaAgenteVendas; // valor fixo, ou função (payload) => resposta
let ultimoPayloadAgenteVendas;
let chamadasAoAgente;
// Trava opcional pra simular concorrência (ver teste "estado só é atualizado
// quando !ignorado" mais abaixo) — mesmo padrão de
// webhookController.concorrencia.test.js.
let travaArmada;
let avisarAgenteEntrou;

function dubla(caminhoRelativo, exports) {
  const caminho = require.resolve(caminhoRelativo);
  require.cache[caminho] = {
    id: caminho, filename: caminho, loaded: true, exports,
  };
}

dubla('../../src/services/clientesService', {
  upsertCliente: async (telefone) => ({ id: 'cliente-1', telefone, nome: 'Bruna' }),
  clienteTemCadastroCompleto: async () => false,
});
dubla('../../src/services/conversasService', {
  buscarOuCriarConversa: async () => conversaAtual,
  atualizarEstadoConversa: async (conversaId, estado, dados, mensagemId) => {
    estadosAtualizados.push({
      conversaId, estado, dados, mensagemId,
    });
  },
  pausarPosPedido: async () => {},
});
dubla('../../src/services/mensagensService', {
  registrarMensagem: async () => ({ id: 'msg-1' }),
});
dubla('../../src/services/evolutionApi', {
  enviarTexto: async (telefone, texto) => { enviadas.push({ telefone, texto }); return {}; },
  enviarDocumentoBase64: async () => ({}),
  baixarMidia: async () => ({ base64: 'x' }),
  foiEnviadaPeloBot: () => false,
  enviarPresenca: async () => {},
  manterDigitando: () => () => {},
});
// Dublê PRÓPRIO deste arquivo: `viaGatilhoPedido: true` fixo — é exatamente o
// que test/webhook/webhookController.rotas.test.js NÃO pode ter (lá é sempre
// `false`), por isso este teste precisa do seu próprio dublê em vez de reusar
// o de outro arquivo.
dubla('../../src/middlewares/reativacaoBot', {
  garantirBotAtivo: async () => ({ podeResponder: true, viaGatilhoPedido: true }),
  pausarBot: async () => {},
});
dubla('../../src/services/escolasService', { listarEscolasAtivas: async () => [] });
dubla('../../src/services/pedidosService', {
  pedidoAtivoCliente: async () => pedidoAtivo,
  orcamentoAtivoCliente: async () => orcamentoAtivo,
});
dubla('../../src/services/orcamentosService', { buscarOrcamentoPorId: async () => null });
dubla('../../src/services/arquivosClienteService', { salvarPdfRecebido: async () => ({ url: null }) });
dubla('../../src/botEngine/actions', { executarAcoes: async () => {} });
dubla('../../src/services/escalonamentoService', { verificarEscalonamento: async () => {} });
dubla('../../src/integracoes/n8nClient', {
  consultarAgenteVendas: async (payload) => {
    chamadasAoAgente += 1;
    ultimoPayloadAgenteVendas = payload;

    if (travaArmada) {
      const trava = travaArmada;
      travaArmada = null; // só esta chamada trava; a próxima resolve na hora
      if (avisarAgenteEntrou) {
        const avisar = avisarAgenteEntrou;
        avisarAgenteEntrou = null;
        avisar();
      }
      await trava.promise;
    }

    return typeof respostaAgenteVendas === 'function' ? respostaAgenteVendas(payload) : respostaAgenteVendas;
  },
  notificarAgenteOrcamento: async () => null,
});

const { receberWebhook } = require('../../src/webhook/webhookController');

function reset({ estado = 'MENU_PRINCIPAL' } = {}) {
  enviadas.length = 0;
  estadosAtualizados.length = 0;
  pedidoAtivo = null;
  orcamentoAtivo = null;
  respostaAgenteVendas = { resposta: 'Resposta padrão do agente', encerrar_atendimento_ia: false };
  ultimoPayloadAgenteVendas = undefined;
  chamadasAoAgente = 0;
  travaArmada = null;
  avisarAgenteEntrou = null;
  conversaAtual = {
    id: 'conversa-1',
    estado_atual: estado,
    dados: {},
    bot_ativo: true,
    pausado_pos_pedido: false,
    ultima_interacao_em: new Date().toISOString(),
    ultima_mensagem_id: null,
  };
}

function respostaFalsa() {
  const resposta = { statusCode: null, corpo: null };
  resposta.status = (codigo) => { resposta.statusCode = codigo; return resposta; };
  resposta.json = (corpo) => { resposta.corpo = corpo; return resposta; };
  return resposta;
}

function webhookDeTexto(texto, id = 'MSG-1') {
  return {
    body: {
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '5527997400510@s.whatsapp.net', fromMe: false, id },
        pushName: 'Bruna',
        message: { conversation: texto },
      },
    },
  };
}

test('retomada pós-pedido: cliente com PEDIDO ativo cai direto no Agente de Vendas com o contexto do pedido', async () => {
  reset();
  pedidoAtivo = { protocolo: 'PED-2026-0200', status: 'em_separacao' };
  respostaAgenteVendas = { resposta: 'Seu pedido está em separação!', encerrar_atendimento_ia: false };

  const resposta = respostaFalsa();
  await receberWebhook(webhookDeTexto('oi, ainda tá aí?'), resposta);

  assert.equal(resposta.corpo.retomadaPosPedido, true);
  assert.match(ultimoPayloadAgenteVendas.texto, /PED-2026-0200/);
  assert.deepEqual(ultimoPayloadAgenteVendas.contexto, {
    tipo: 'retomada_pos_pedido',
    protocolo: 'PED-2026-0200',
    status: 'em_separacao',
  });
  assert.equal(enviadas.length, 1);
  assert.equal(enviadas[0].texto, 'Seu pedido está em separação!');
  assert.equal(estadosAtualizados.length, 1, 'a chamada não foi ignorada — o estado precisa ser atualizado');
  assert.equal(estadosAtualizados[0].estado, 'AGENTE_VENDAS_ATIVO');
});

test('retomada pós-pedido: sem pedido mas com ORÇAMENTO ativo, cai no Agente de Vendas com o contexto do orçamento', async () => {
  reset();
  orcamentoAtivo = { protocolo: 'ORC-2026-0300', status: 'rascunho' };
  respostaAgenteVendas = { resposta: 'Seu orçamento ainda está em elaboração.', encerrar_atendimento_ia: true };

  await receberWebhook(webhookDeTexto('e aí, tudo certo?'), respostaFalsa());

  assert.match(ultimoPayloadAgenteVendas.texto, /ORC-2026-0300/);
  assert.deepEqual(ultimoPayloadAgenteVendas.contexto, {
    tipo: 'retomada_pos_orcamento',
    protocolo: 'ORC-2026-0300',
    status: 'rascunho',
  });
  assert.equal(enviadas[0].texto, 'Seu orçamento ainda está em elaboração.');
  assert.equal(estadosAtualizados.length, 1);
  assert.equal(estadosAtualizados[0].estado, 'SUBMENU_VENDAS', 'encerrar_atendimento_ia tira do handoff');
});

test('retomada pós-pedido: sem pedido nem orçamento ativo, cai no fluxo normal (menu) em vez de chamar o agente', async () => {
  reset();

  await receberWebhook(webhookDeTexto('oi'), respostaFalsa());

  assert.equal(chamadasAoAgente, 0, 'sem pedido/orçamento ativo não há o que retomar — não deve acionar o agente');
});

// Aguarda todas as microtarefas pendentes se resolverem — mesmo helper de
// webhookController.concorrencia.test.js, necessário aqui porque
// `consultarAgenteVendasComRedeDeSeguranca` é a MESMA função usada pelo
// handoff normal: uma mensagem "ignorada" por concorrência não é só
// descartada, ela é reenfileirada e reprocessada de verdade assim que o lock
// da conversa libera (ver `filaDeMensagensConcorrentes`/
// `reprocessarFilaConcorrente` em webhookController.js) — fire-and-forget, sem
// `await` no caminho principal.
function aguardarReprocessamento() {
  return new Promise((resolve) => { setImmediate(resolve); });
}

test('retomada pós-pedido: quando a chamada ao agente é ignorada (concorrência), o estado NÃO é atualizado por essa chamada', async () => {
  reset();
  pedidoAtivo = { protocolo: 'PED-2026-0400', status: 'confirmado' };

  let liberar;
  travaArmada = { promise: new Promise((resolve) => { liberar = resolve; }) };
  const agenteEntrou = new Promise((resolve) => { avisarAgenteEntrou = resolve; });

  const primeira = receberWebhook(webhookDeTexto('mensagem 1', 'MSG-1'), respostaFalsa());
  await agenteEntrou; // a primeira já segura o lock `conversasComAgenteVendasEmAndamento`

  const respostaSegunda = respostaFalsa();
  await receberWebhook(webhookDeTexto('mensagem 2', 'MSG-2'), respostaSegunda);

  // A segunda mensagem encontrou o lock ocupado -> ignorado:true -> a própria
  // chamada da retomada não pode ter atualizado o estado por causa dela (a
  // primeira, não ignorada, ainda está pendurada e também não atualizou nada).
  assert.equal(estadosAtualizados.length, 0, 'nem a primeira (ainda em andamento) nem a segunda (ignorada) atualizaram o estado ainda');
  assert.equal(respostaSegunda.statusCode, 200);
  assert.equal(respostaSegunda.corpo.retomadaPosPedido, true);
  assert.equal(chamadasAoAgente, 1, 'a mensagem ignorada não pode ter virado uma segunda chamada REAL ao agente enquanto o lock está de pé');

  liberar();
  await primeira;

  // A retomada da primeira mensagem (não ignorada) já atualizou o estado —
  // sozinha, sem nenhuma contribuição da chamada ignorada.
  assert.equal(estadosAtualizados.length, 1, 'só a chamada não-ignorada atualiza o estado dentro do próprio bloco de retomada');

  // A mensagem que foi ignorada é reprocessada de forma assíncrona (fila de
  // concorrência) assim que o lock libera — isso é uma ATUALIZAÇÃO DIFERENTE,
  // disparada por `reprocessarFilaConcorrente`, não pelo bloco de retomada
  // pós-pedido em si (que já retornou 200 pra ela faz tempo).
  await aguardarReprocessamento();
  assert.equal(chamadasAoAgente, 2, 'a mensagem enfileirada acaba virando uma chamada real, só que depois — via reprocessamento, não via retomada');
  assert.equal(estadosAtualizados.length, 2, 'o reprocessamento tem sua própria atualização de estado, separada da chamada original ignorada');
});
