// Mensagem que chega enquanto o Agente de Vendas ainda processa a anterior da
// mesma conversa (guarda `conversasComAgenteVendasEmAndamento`).
//
// Por que estes testes existem: no teste de carga de 24/08/2026 (loadtest/),
// 90% das mensagens concorrentes simplesmente sumiram — o webhook respondia 200
// e a mensagem não gerava resposta ao cliente nem linha no histórico, então nem
// o operador a via na tela de Atendimento. Aqui a concorrência é reproduzida de
// verdade: o dublê do n8n fica PENDURADO até o teste liberar, e a segunda
// mensagem entra no meio.
//
// Mesmo padrão de dublê por require.cache dos outros testes de webhook —
// nenhuma chamada real sai do processo.

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
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-webhook-concorrencia-')),
  'ecos.json'
);

// --- estado observável dos dublês, remontado a cada teste ---
const historico = [];
const enviadas = [];
let conversaAtual;
let pedidoAtivo;
let chamadasAoAgente;
// Deferido que simula o Agente de Vendas demorando: a primeira mensagem fica
// dentro do n8nClient até o teste chamar `liberarAgente()`.
let liberarAgente;
let agenteEntrou;
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
  atualizarEstadoConversa: async () => {},
});
dubla('../../src/services/mensagensService', {
  registrarMensagem: async (conversaId, remetente, conteudo) => {
    historico.push({ remetente, conteudo });
    return { id: `msg-${historico.length}` };
  },
});
dubla('../../src/services/evolutionApi', {
  enviarTexto: async (telefone, texto) => { enviadas.push({ telefone, texto }); return {}; },
  enviarDocumentoBase64: async () => ({}),
  baixarMidia: async () => ({ base64: 'x' }),
  foiEnviadaPeloBot: () => false,
});
dubla('../../src/middlewares/reativacaoBot', {
  garantirBotAtivo: async () => ({ podeResponder: true, viaGatilhoPedido: false }),
  pausarBot: async () => {},
});
dubla('../../src/services/escolasService', { listarEscolasAtivas: async () => [] });
dubla('../../src/services/pedidosService', {
  pedidoAtivoCliente: async () => pedidoAtivo,
  orcamentoAtivoCliente: async () => null,
});
dubla('../../src/services/orcamentosService', { buscarOrcamentoPorId: async () => null });
dubla('../../src/services/arquivosClienteService', { salvarPdfRecebido: async () => ({ url: null }) });
dubla('../../src/botEngine/actions', { executarAcoes: async () => {} });
dubla('../../src/services/escalonamentoService', { verificarEscalonamento: async () => {} });
dubla('../../src/integracoes/n8nClient', {
  consultarAgenteVendas: async () => {
    chamadasAoAgente += 1;
    avisarAgenteEntrou();
    await new Promise((resolve) => { liberarAgente = resolve; });
    return { resposta: 'Temos sim! Quer que eu separe?' };
  },
  notificarAgenteOrcamento: async () => null,
});

const { receberWebhook } = require('../../src/webhook/webhookController');

function reset({ estado = 'AGENTE_VENDAS_ATIVO' } = {}) {
  historico.length = 0;
  enviadas.length = 0;
  pedidoAtivo = null;
  chamadasAoAgente = 0;
  liberarAgente = null;
  armarAgenteEntrou();
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

// Rearma o deferido de "o agente começou a processar". Precisa ser rearmável
// porque os testes de dedup abrem MAIS DE UMA janela de processamento seguidas.
function armarAgenteEntrou() {
  agenteEntrou = new Promise((resolve) => { avisarAgenteEntrou = resolve; });
}

function respostaFalsa() {
  const resposta = { statusCode: null, corpo: null };
  resposta.status = (codigo) => { resposta.statusCode = codigo; return resposta; };
  resposta.json = (corpo) => { resposta.corpo = corpo; return resposta; };
  return resposta;
}

function webhookDeTexto(texto, id) {
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

// Abre uma "janela de processamento": dispara uma mensagem e espera ela travar
// dentro do Agente de Vendas (lock de conversa segurado). Devolve a função que
// fecha a janela — liberando o agente e aguardando a primeira concluir, pra não
// vazar promise pendente entre os testes.
async function abrirJanela(idDaPrimeira = 'MSG-1') {
  armarAgenteEntrou();
  const primeira = receberWebhook(webhookDeTexto('tem caderno universitário?', idDaPrimeira), respostaFalsa());
  await agenteEntrou;

  return async function fecharJanela() {
    liberarAgente();
    await primeira;
  };
}

// Uma mensagem do cliente que chega com a janela aberta (processada do início
// ao fim, como a Evolution API faria).
async function mensagemConcorrente(texto, id) {
  const resposta = respostaFalsa();
  await receberWebhook(webhookDeTexto(texto, id), resposta);
  return resposta;
}

async function segundaMensagemDurantePrimeira(textoSegunda) {
  const fecharJanela = await abrirJanela();
  const resposta = await mensagemConcorrente(textoSegunda, 'MSG-2');
  await fecharJanela();

  return resposta;
}

const ehAvisoDeEspera = (texto) => /ainda estou vendo sua mensagem anterior/i.test(texto);
const avisosEnviados = () => enviadas.filter((e) => ehAvisoDeEspera(e.texto));
const avisosNoHistorico = () => historico.filter((m) => m.remetente === 'bot' && ehAvisoDeEspera(m.conteudo));
const falasDoCliente = () => historico.filter((m) => m.remetente === 'cliente').map((m) => m.conteudo);

test('mensagem concorrente recebe resposta ao cliente em vez de sumir', async () => {
  reset();

  const resposta = await segundaMensagemDurantePrimeira('de 200 folhas?');

  assert.equal(resposta.statusCode, 200);
  assert.equal(chamadasAoAgente, 1, 'a segunda mensagem não pode virar uma segunda chamada ao agente');

  const avisoDeEspera = enviadas.find((e) => /ainda estou vendo sua mensagem anterior/i.test(e.texto));
  assert.ok(avisoDeEspera, `o cliente ficou sem resposta; enviadas: ${JSON.stringify(enviadas)}`);
  assert.equal(avisoDeEspera.telefone, '5527997400510');
});

test('mensagem concorrente aparece no histórico da conversa', async () => {
  reset();

  await segundaMensagemDurantePrimeira('de 200 folhas?');

  assert.deepEqual(
    historico.filter((m) => m.remetente === 'cliente'),
    [{ remetente: 'cliente', conteudo: 'de 200 folhas?' }],
    'sem isso o operador não vê a mensagem na tela de Atendimento'
  );
});

test('o aviso de espera também entra no histórico, exatamente como foi enviado', async () => {
  reset();

  await segundaMensagemDurantePrimeira('de 200 folhas?');

  const registradoComoBot = historico.filter((m) => m.remetente === 'bot');
  assert.equal(registradoComoBot.length, 1);
  assert.equal(registradoComoBot[0].conteudo, enviadas[0].texto);
});

// O texto que vai pro agente é embrulhado em contexto de sistema
// (prefixarPedidoAtivo). Esse embrulho não pode vazar pra tela do operador.
test('o histórico guarda a fala crua do cliente, sem o contexto de sistema', async () => {
  reset();
  pedidoAtivo = { protocolo: 'PED-2026-0083', status: 'confirmado', orcamento_id: 'orc-1' };

  await segundaMensagemDurantePrimeira('de 200 folhas?');

  const doCliente = historico.find((m) => m.remetente === 'cliente');
  assert.equal(doCliente.conteudo, 'de 200 folhas?');
  assert.doesNotMatch(doCliente.conteudo, /Contexto do sistema/);
});

// Best-effort, mesmo critério do PDF/áudio: este caminho já é um fallback, e um
// 500 aqui faria a Evolution API reenviar o webhook — multiplicando justamente
// o problema de concorrência que estamos tratando.
test('falha ao gravar o histórico não derruba o webhook nem impede o aviso', async () => {
  reset();
  const mensagensService = require('../../src/services/mensagensService');
  const original = mensagensService.registrarMensagem;
  mensagensService.registrarMensagem = async () => { throw new Error('Supabase fora do ar'); };

  try {
    const resposta = await segundaMensagemDurantePrimeira('de 200 folhas?');

    assert.equal(resposta.statusCode, 200);
    assert.ok(enviadas.some((e) => /ainda estou vendo sua mensagem anterior/i.test(e.texto)));
  } finally {
    mensagensService.registrarMensagem = original;
  }
});

// Se a Evolution API estiver fora, o aviso não sai — mas a mensagem do cliente
// não pode sumir do histórico por causa disso (por isso o registro vem antes do
// envio).
test('falha ao enviar o aviso não impede o registro da mensagem do cliente', async () => {
  reset();
  const evolutionApi = require('../../src/services/evolutionApi');
  const original = evolutionApi.enviarTexto;
  evolutionApi.enviarTexto = async () => { throw new Error('Evolution API fora do ar'); };

  try {
    const resposta = await segundaMensagemDurantePrimeira('de 200 folhas?');

    assert.equal(resposta.statusCode, 200);
    assert.deepEqual(historico, [{ remetente: 'cliente', conteudo: 'de 200 folhas?' }]);
  } finally {
    evolutionApi.enviarTexto = original;
  }
});

// --- dedup do aviso por janela de lock (26/08/2026) ---
//
// A correção acima resolveu o sumiço, mas criou dois efeitos colaterais que o
// dono do projeto mandou corrigir no mesmo dia: (1) cliente que dispara várias
// mensagens durante uma consulta lenta recebia um aviso idêntico pra cada uma;
// (2) reenvio do mesmo webhook pela Evolution API repetia o aviso pra uma
// mensagem só. A regra virou: fala do cliente SEMPRE registrada; aviso do bot
// no máximo um por janela.

test('várias mensagens na mesma janela geram um único aviso, mas todas entram no histórico', async () => {
  reset();
  const fecharJanela = await abrirJanela();

  await mensagemConcorrente('de 200 folhas?', 'MSG-2');
  await mensagemConcorrente('capa dura', 'MSG-3');
  await mensagemConcorrente('e quanto custa?', 'MSG-4');

  await fecharJanela();

  assert.equal(avisosEnviados().length, 1, `3 mensagens viraram ${avisosEnviados().length} avisos ao cliente`);
  assert.equal(avisosNoHistorico().length, 1, 'o aviso repetido poluiria a tela do operador');
  assert.deepEqual(
    falasDoCliente(),
    ['de 200 folhas?', 'capa dura', 'e quanto custa?'],
    'o dedup é só do aviso: nenhuma fala do cliente pode sumir do histórico'
  );
});

// Risco 2 do relatório: com o lock de pé, `ultima_mensagem_id` não é gravado,
// então um retry da Evolution API do MESMO mensagemId chega a ser processado de
// novo. O dedup por janela é o que impede o cliente de ver o aviso duas vezes.
test('reenvio do mesmo webhook pela Evolution API não repete o aviso', async () => {
  reset();
  const fecharJanela = await abrirJanela();

  await mensagemConcorrente('de 200 folhas?', 'MSG-2');
  await mensagemConcorrente('de 200 folhas?', 'MSG-2'); // retry idêntico

  await fecharJanela();

  assert.equal(avisosEnviados().length, 1);
  assert.equal(avisosNoHistorico().length, 1);
});

test('numa janela seguinte o aviso volta a ser enviado (o dedup não é permanente)', async () => {
  reset();

  const fecharPrimeiraJanela = await abrirJanela('MSG-1');
  await mensagemConcorrente('de 200 folhas?', 'MSG-2');
  await fecharPrimeiraJanela();

  const fecharSegundaJanela = await abrirJanela('MSG-3');
  await mensagemConcorrente('e caneta, tem?', 'MSG-4');
  await fecharSegundaJanela();

  assert.equal(avisosEnviados().length, 2, 'o dedup morre junto com o lock que o justifica');
  assert.equal(avisosNoHistorico().length, 2);
});

// Se o aviso não chegou a sair, o cliente continua sem saber de nada — o dedup
// não pode "consumir" uma tentativa que falhou.
test('aviso que falhou ao ser enviado não bloqueia a tentativa da mensagem seguinte', async () => {
  reset();
  const evolutionApi = require('../../src/services/evolutionApi');
  const original = evolutionApi.enviarTexto;
  let primeiraTentativa = true;
  evolutionApi.enviarTexto = async (telefone, texto) => {
    if (primeiraTentativa && ehAvisoDeEspera(texto)) {
      primeiraTentativa = false;
      throw new Error('Evolution API fora do ar');
    }
    return original(telefone, texto);
  };

  try {
    const fecharJanela = await abrirJanela();

    await mensagemConcorrente('de 200 folhas?', 'MSG-2');
    await mensagemConcorrente('capa dura', 'MSG-3');

    await fecharJanela();

    assert.equal(avisosEnviados().length, 1, 'a segunda mensagem precisa reaproveitar a tentativa perdida');
    assert.deepEqual(falasDoCliente(), ['de 200 folhas?', 'capa dura']);
  } finally {
    evolutionApi.enviarTexto = original;
  }
});
