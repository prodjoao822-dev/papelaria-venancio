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

// Deferido que simula o Agente de Vendas demorando: SÓ a chamada "armada" por
// `abrirJanela` fica pendurada dentro do n8nClient até o teste chamar
// `liberarAgente()`. Isso importa desde 29/08/2026: mensagem concorrente agora
// é reprocessada de verdade quando o lock libera (ver fila em
// webhookController.js), o que gera uma SEGUNDA chamada real ao mock — se ela
// também ficasse pendurada por padrão, vazaria uma promise pendente pro
// próximo teste (que reusa as mesmas variáveis de módulo), travando a suíte.
// Por isso só a chamada explicitamente armada trava; qualquer outra responde
// na hora.
let travaArmada = null; // { promise } | null — consumida pela PRÓXIMA chamada ao mock
let avisarAgenteEntrou = null; // resolve da promise que sinaliza "a chamada armada começou"
let chamadasPayload; // payload completo de cada chamada a n8nClient.consultarAgenteVendas, em ordem
let respostasConfiguradas; // fila de respostas customizadas pra próximas chamadas (default se vazia)
let chamadasAtualizarEstado; // registro de cada chamada a conversasService.atualizarEstadoConversa

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
    chamadasAtualizarEstado.push({
      conversaId, estado, dados, mensagemId,
    });
  },
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
  consultarAgenteVendas: async (payload) => {
    chamadasAoAgente += 1;
    chamadasPayload.push(payload);

    if (travaArmada) {
      const trava = travaArmada;
      travaArmada = null; // só ESTA chamada trava; a próxima (reprocessamento) responde na hora
      if (avisarAgenteEntrou) {
        const avisar = avisarAgenteEntrou;
        avisarAgenteEntrou = null;
        avisar();
      }
      await trava.promise;
    }

    const resposta = respostasConfiguradas.length > 0
      ? respostasConfiguradas.shift()
      : 'Temos sim! Quer que eu separe?';
    return { resposta };
  },
  notificarAgenteOrcamento: async () => null,
});

const { receberWebhook } = require('../../src/webhook/webhookController');

function reset({ estado = 'AGENTE_VENDAS_ATIVO' } = {}) {
  historico.length = 0;
  enviadas.length = 0;
  pedidoAtivo = null;
  chamadasAoAgente = 0;
  travaArmada = null;
  avisarAgenteEntrou = null;
  chamadasPayload = [];
  respostasConfiguradas = [];
  chamadasAtualizarEstado = [];
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

// Aguarda todas as microtarefas pendentes se resolverem — usado depois de
// fechar uma janela pra dar tempo do reprocessamento fire-and-forget (ver
// filaDeMensagensConcorrentes/reprocessarFilaConcorrente em
// webhookController.js) terminar antes do teste seguinte rodar `reset()`. Sem
// isso, uma reprocessamento ainda em voo vazaria efeitos (chamada ao mock,
// `enviadas`, `historico`) pro próximo teste. `setImmediate` só roda depois que
// TODAS as microtarefas (promises) pendentes no momento já foram drenadas —
// suficiente aqui porque nenhum dublê usa timer/I/O real.
function aguardarReprocessamento() {
  return new Promise((resolve) => { setImmediate(resolve); });
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
  let liberar;
  travaArmada = { promise: new Promise((resolve) => { liberar = resolve; }) };
  const agenteEntrou = new Promise((resolve) => { avisarAgenteEntrou = resolve; });

  const primeira = receberWebhook(webhookDeTexto('tem caderno universitário?', idDaPrimeira), respostaFalsa());
  await agenteEntrou;

  return async function fecharJanela() {
    liberar();
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
  // Drena o reprocessamento fire-and-forget da mensagem enfileirada (ver
  // aguardarReprocessamento) antes de devolver o controle pro teste — senão
  // vazaria pro próximo teste.
  await aguardarReprocessamento();

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
  // Desde 29/08/2026 (fila de reprocessamento) a segunda mensagem GERA uma
  // segunda chamada ao agente — só que depois que o lock libera, nunca
  // enquanto a primeira ainda está em andamento (isso continua proibido; ver
  // os testes de reprocessamento mais abaixo, que travam explicitamente pra
  // provar que as duas chamadas nunca se sobrepõem).
  assert.equal(chamadasAoAgente, 2, 'a mensagem enfileirada precisa ser reprocessada, não só descartada');

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
  await aguardarReprocessamento();

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
  await aguardarReprocessamento();

  assert.equal(avisosEnviados().length, 1);
  assert.equal(avisosNoHistorico().length, 1);
});

test('numa janela seguinte o aviso volta a ser enviado (o dedup não é permanente)', async () => {
  reset();

  const fecharPrimeiraJanela = await abrirJanela('MSG-1');
  await mensagemConcorrente('de 200 folhas?', 'MSG-2');
  await fecharPrimeiraJanela();
  // Drena o reprocessamento da primeira janela ANTES de abrir a segunda: sem
  // isso a chamada de reprocessamento (fire-and-forget) poderia consumir a
  // trava armada pela segunda janela, quebrando o teste por uma corrida de
  // fato inexistente em produção (o lock real já garante essa ordem sozinho;
  // aqui é só o dublê que precisa da ajuda).
  await aguardarReprocessamento();

  const fecharSegundaJanela = await abrirJanela('MSG-3');
  await mensagemConcorrente('e caneta, tem?', 'MSG-4');
  await fecharSegundaJanela();
  await aguardarReprocessamento();

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
    await aguardarReprocessamento();

    assert.equal(avisosEnviados().length, 1, 'a segunda mensagem precisa reaproveitar a tentativa perdida');
    assert.deepEqual(falasDoCliente(), ['de 200 folhas?', 'capa dura']);
  } finally {
    evolutionApi.enviarTexto = original;
  }
});

// --- fila de reprocessamento (29/08/2026) ---
//
// Teste real neste dia: um cliente confirmou um item com "sim" e, antes da
// resposta do agente voltar, mandou "quero pilot gel tbm". O "sim" foi
// processado normal, mas o "pilot gel" ficou só registrado no histórico e
// nunca foi respondido — o cliente teve que perceber sozinho e pedir de novo.
// A fila resolve isso: em vez de só avisar e descartar (26/08/2026), a
// mensagem enfileirada é reprocessada de verdade assim que o lock desta
// conversa é liberado.

test('mensagem enfileirada é reprocessada pelo agente e o cliente recebe uma segunda resposta, sem precisar mandar de novo', async () => {
  reset();
  respostasConfiguradas = ['Show, já anotei o primeiro item!', 'Temos pilot gel sim, quer que eu inclua?'];

  const fecharJanela = await abrirJanela(); // "primeira" mensagem: "tem caderno universitário?"
  const respostaDaConcorrente = await mensagemConcorrente('quero pilot gel tbm', 'MSG-2');

  // Enquanto o lock está de pé, a mensagem não pode ter gerado uma segunda
  // chamada ao agente nem uma segunda resposta de verdade — só o aviso.
  assert.equal(chamadasAoAgente, 1, 'nenhuma chamada concorrente pode acontecer enquanto o lock está de pé');
  assert.equal(respostaDaConcorrente.statusCode, 200);

  await fecharJanela();
  await aguardarReprocessamento();

  // Agora sim: o lock foi liberado e a mensagem enfileirada foi reprocessada
  // como uma chamada de verdade ao Agente de Vendas.
  assert.equal(chamadasAoAgente, 2, 'a mensagem enfileirada precisa virar uma segunda chamada real ao agente');
  assert.equal(
    chamadasPayload[1].texto,
    'quero pilot gel tbm',
    'o texto reprocessado precisa ser a fala crua que ficou pendurada, não o aviso nem a primeira mensagem'
  );

  // O cliente recebe: o aviso de espera, a resposta da primeira mensagem, e
  // por fim a resposta de verdade pra mensagem que tinha ficado pendurada —
  // sem precisar mandar "quero pilot gel tbm" de novo.
  assert.deepEqual(
    enviadas.map((e) => e.texto),
    [
      'Só um instante, ainda estou vendo sua mensagem anterior 😊',
      'Show, já anotei o primeiro item!',
      'Temos pilot gel sim, quer que eu inclua?',
    ]
  );

  // O estado da conversa reflete o reprocessamento, não só a mensagem original:
  // a última chamada a atualizarEstadoConversa é a do reprocessamento
  // (mensagemId null, porque não existe um mensagemId de webhook associado a
  // essa consolidação — ver reprocessarFilaConcorrente).
  const ultimaAtualizacao = chamadasAtualizarEstado[chamadasAtualizarEstado.length - 1];
  assert.equal(ultimaAtualizacao.conversaId, 'conversa-1');
  assert.equal(ultimaAtualizacao.estado, 'AGENTE_VENDAS_ATIVO');
  assert.equal(ultimaAtualizacao.mensagemId, null);
});
