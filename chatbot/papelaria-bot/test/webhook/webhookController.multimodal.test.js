// Rota 8 — Entrada multimodal (áudio, imagem, PDF) processada pelo
// classificador (payloadParser.js, já bem coberto em payloadParser.test.js) e
// tratada pelo webhookController (PROMPT-03, Entrega 2). Este arquivo cobre a
// integração ponta-a-ponta dentro do processo do bot: mídia recebida ->
// transcrição/descrição (mediaProcessor, dublado) -> mesmo fluxo de texto
// normal (Agente de Vendas / stateMachine) ou fallback pra atendimento humano.
//
// Mesmo padrão de monkey-patch via require.cache dos demais testes deste
// projeto — nenhuma chamada real à OpenRouter/Evolution/Supabase/n8n sai do
// processo.

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
// Precisa estar truthy ANTES do require de config/env pra que o webhookController
// tente transcrever/descrever em vez de cair direto no fallback de sempre.
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'chave-openrouter-de-teste';
process.env.REGISTRO_ECOS_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-webhook-multimodal-')),
  'ecos.json'
);

const enviadas = [];
const documentosEnviados = [];
const historico = [];
const arquivosSalvos = [];
let conversaAtual;
let podeResponder;
let comportamentoTranscreverAudio; // (base64, mimetype) => texto, ou lança
let comportamentoDescreverImagem; // (base64, mimetype, legenda) => texto, ou lança
let ultimoPayloadAgenteVendas;
let respostaAgenteVendas;

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
  pausarPosPedido: async () => {},
});
dubla('../../src/services/mensagensService', {
  registrarMensagem: async (conversaId, remetente, conteudo) => {
    historico.push({ remetente, conteudo });
    return { id: 'msg-1' };
  },
});
dubla('../../src/services/evolutionApi', {
  enviarTexto: async (telefone, texto) => { enviadas.push({ telefone, texto }); return {}; },
  enviarDocumentoBase64: async (telefone, base64, nomeArquivo, legenda) => {
    documentosEnviados.push({ telefone, base64, nomeArquivo, legenda });
    return {};
  },
  baixarMidia: async () => ({ base64: 'BASE64-DA-MIDIA' }),
  foiEnviadaPeloBot: () => false,
  enviarPresenca: async () => {},
  manterDigitando: () => () => {},
});
dubla('../../src/middlewares/reativacaoBot', {
  garantirBotAtivo: async () => ({ podeResponder, viaGatilhoPedido: false }),
  pausarBot: async () => {},
});
dubla('../../src/services/escolasService', { listarEscolasAtivas: async () => [] });
dubla('../../src/services/pedidosService', {
  pedidoAtivoCliente: async () => null,
  orcamentoAtivoCliente: async () => null,
});
dubla('../../src/services/orcamentosService', { buscarOrcamentoPorId: async () => null });
dubla('../../src/services/arquivosClienteService', {
  salvarPdfRecebido: async ({ clienteId, nomeArquivo, base64 }) => {
    arquivosSalvos.push({ clienteId, nomeArquivo, base64 });
    return { url: `https://storage.exemplo/${nomeArquivo}` };
  },
});
dubla('../../src/botEngine/actions', { executarAcoes: async () => {} });
dubla('../../src/services/escalonamentoService', { verificarEscalonamento: async () => {} });
dubla('../../src/integracoes/n8nClient', {
  consultarAgenteVendas: async (payload) => {
    ultimoPayloadAgenteVendas = payload;
    return respostaAgenteVendas;
  },
  notificarAgenteOrcamento: async () => null,
});
dubla('../../src/utils/mediaProcessor', {
  transcreverAudio: async (base64, mimetype) => comportamentoTranscreverAudio(base64, mimetype),
  descreverImagem: async (base64, mimetype, legenda) => comportamentoDescreverImagem(base64, mimetype, legenda),
});

const { receberWebhook } = require('../../src/webhook/webhookController');
const env = require('../../src/config/env');

function reset({ estado = 'MENU_PRINCIPAL', dados = {}, botAtivo = true } = {}) {
  enviadas.length = 0;
  documentosEnviados.length = 0;
  historico.length = 0;
  arquivosSalvos.length = 0;
  podeResponder = botAtivo;
  ultimoPayloadAgenteVendas = undefined;
  respostaAgenteVendas = { resposta: 'ok', encerrar_atendimento_ia: false };
  comportamentoTranscreverAudio = async () => { throw new Error('não configurado neste teste'); };
  comportamentoDescreverImagem = async () => { throw new Error('não configurado neste teste'); };
  env.OPENROUTER_API_KEY = 'chave-openrouter-de-teste';
  conversaAtual = {
    id: 'conversa-1',
    estado_atual: estado,
    dados,
    bot_ativo: botAtivo,
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

function webhookDeAudio({ ptt = true, seconds = 8, mimetype = 'audio/ogg; codecs=opus' } = {}, id = 'MSG-AUDIO') {
  return {
    body: {
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '5527997400510@s.whatsapp.net', fromMe: false, id },
        pushName: 'Bruna',
        message: { audioMessage: { ptt, seconds, mimetype } },
      },
    },
  };
}

function webhookDeImagem({ mimetype = 'image/jpeg', legenda = null } = {}, id = 'MSG-IMG') {
  return {
    body: {
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '5527997400510@s.whatsapp.net', fromMe: false, id },
        pushName: 'Bruna',
        message: { imageMessage: { mimetype, caption: legenda } },
      },
    },
  };
}

function webhookDePdf({ fileName = 'lista.pdf', caption = null } = {}, id = 'MSG-PDF') {
  return {
    body: {
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '5527997400510@s.whatsapp.net', fromMe: false, id },
        pushName: 'Bruna',
        message: { documentMessage: { mimetype: 'application/pdf', fileName, caption } },
      },
    },
  };
}

// =====================================================================
// Áudio
// =====================================================================

test('áudio: transcrito com sucesso e tratado como texto livre no Agente de Vendas (com prefixo de origem)', async () => {
  reset({ estado: 'AGENTE_VENDAS_ATIVO' });
  comportamentoTranscreverAudio = async () => 'quero saber o preço da resma de papel';
  respostaAgenteVendas = { resposta: 'A resma sai por R$ 24,90.', encerrar_atendimento_ia: false };

  await receberWebhook(webhookDeAudio(), respostaFalsa());

  assert.equal(ultimoPayloadAgenteVendas.texto, '[Áudio transcrito do cliente]: quero saber o preço da resma de papel');
  assert.equal(enviadas.length, 1);
  assert.equal(enviadas[0].texto, 'A resma sai por R$ 24,90.');
});

test('áudio: transcrição igual a um comando global ("atendente") não ganha prefixo e aciona a escalação de verdade', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });
  comportamentoTranscreverAudio = async () => 'atendente';

  const reativacaoBot = require('../../src/middlewares/reativacaoBot');
  const chamadasPausar = [];
  const pausarOriginal = reativacaoBot.pausarBot;
  reativacaoBot.pausarBot = async (conversaId, motivo) => { chamadasPausar.push({ conversaId, motivo }); };

  try {
    await receberWebhook(webhookDeAudio(), respostaFalsa());
  } finally {
    reativacaoBot.pausarBot = pausarOriginal;
  }

  assert.equal(chamadasPausar.length, 1, 'o comando de escalação precisa ter sido reconhecido sem o prefixo atrapalhar');
});

test('áudio: falha na transcrição cai no fallback (avisa vendas + confirma recebimento ao cliente) e registra no histórico', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });
  comportamentoTranscreverAudio = async () => { throw new Error('OpenRouter fora do ar'); };

  await receberWebhook(webhookDeAudio({ ptt: true, seconds: 15 }), respostaFalsa());

  assert.equal(enviadas.length, 2);
  assert.equal(enviadas[0].telefone, process.env.PHONE_VANESSA);
  assert.match(enviadas[0].texto, /mandou um áudio de 15s/);
  assert.equal(enviadas[1].telefone, '5527997400510');
  assert.match(enviadas[1].texto, /Recebi seu áudio/);
  assert.deepEqual([...historico], [{ remetente: 'cliente', conteudo: 'Enviou um áudio de 15s.' }]);
});

test('áudio: sem OPENROUTER_API_KEY configurada, nem tenta transcrever — cai direto no fallback', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });
  env.OPENROUTER_API_KEY = null;
  let chamouTranscricao = false;
  comportamentoTranscreverAudio = async () => { chamouTranscricao = true; return 'nunca deveria chegar aqui'; };

  await receberWebhook(webhookDeAudio(), respostaFalsa());

  assert.equal(chamouTranscricao, false);
  assert.equal(enviadas.length, 2, 'fallback de sempre: avisa vendas + confirma pro cliente');
});

test('áudio: com o bot pausado (humano já atendendo), não tenta transcrever nem manda nada — só registra', async () => {
  reset({ estado: 'MENU_PRINCIPAL', botAtivo: false });
  let chamouTranscricao = false;
  comportamentoTranscreverAudio = async () => { chamouTranscricao = true; return 'x'; };

  await receberWebhook(webhookDeAudio(), respostaFalsa());

  assert.equal(chamouTranscricao, false, 'a IA não deve responder por cima de um humano já atendendo');
  assert.equal(enviadas.length, 0, 'avisarVanessa é falso: só registra, sem notificar de novo');
  // Snapshot (não a referência viva): `historico` continua sendo reaproveitado
  // pelos próximos testes deste arquivo — comparar a referência direto faria
  // o node:test exibir, num eventual diff de falha, o estado dela no FIM da
  // suíte inteira (relatório é preguiçoso), e não o estado no instante do assert.
  assert.deepEqual([...historico], [{ remetente: 'cliente', conteudo: 'Enviou um áudio de 8s.' }]);
});

// =====================================================================
// Imagem
// =====================================================================

test('imagem: descrita com sucesso e tratada como texto livre, com a legenda do cliente preservada', async () => {
  reset({ estado: 'AGENTE_VENDAS_ATIVO' });
  comportamentoDescreverImagem = async () => 'Uma mochila azul com detalhes pretos.';
  respostaAgenteVendas = { resposta: 'Temos sim, no estoque!', encerrar_atendimento_ia: false };

  await receberWebhook(webhookDeImagem({ legenda: 'vocês têm essa mochila?' }), respostaFalsa());

  assert.match(ultimoPayloadAgenteVendas.texto, /Uma mochila azul com detalhes pretos\./);
  assert.match(ultimoPayloadAgenteVendas.texto, /vocês têm essa mochila\?/);
  assert.equal(enviadas[0].texto, 'Temos sim, no estoque!');
});

test('imagem: legenda igual a um comando global ("menu") não vira descrição — respeita o comando', async () => {
  reset({ estado: 'SUBMENU_VENDAS', dados: {} });
  comportamentoDescreverImagem = async () => 'nunca deveria ser usado';

  await receberWebhook(webhookDeImagem({ legenda: 'menu' }), respostaFalsa());

  assert.equal(enviadas.length, 1);
  assert.match(enviadas[0].texto, /Comprar \/ Ver preços/, 'caiu no menu principal, não numa descrição de imagem');
});

test('imagem: falha na descrição cai no fallback (avisa vendas + confirma recebimento) e registra no histórico', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });
  comportamentoDescreverImagem = async () => { throw new Error('OpenRouter fora do ar'); };

  await receberWebhook(webhookDeImagem(), respostaFalsa());

  assert.equal(enviadas.length, 2);
  assert.equal(enviadas[0].telefone, process.env.PHONE_VANESSA);
  assert.match(enviadas[0].texto, /mandou uma imagem/);
  assert.match(enviadas[1].texto, /Recebi sua imagem/);
  assert.deepEqual([...historico], [{ remetente: 'cliente', conteudo: 'Enviou uma imagem.' }]);
});

// =====================================================================
// PDF (captura genérica, independe do estado/bot_ativo)
// =====================================================================

test('PDF: encaminhado pra vendas, confirmado ao cliente e arquivado com cópia registrada no histórico', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });

  await receberWebhook(webhookDePdf({ fileName: 'orcamento-cliente.pdf', caption: 'segue o que preciso' }), respostaFalsa());

  assert.equal(documentosEnviados.length, 1);
  assert.equal(documentosEnviados[0].telefone, process.env.PHONE_VANESSA);
  assert.equal(documentosEnviados[0].nomeArquivo, 'orcamento-cliente.pdf');
  assert.match(documentosEnviados[0].legenda, /segue o que preciso/);

  assert.equal(enviadas.length, 1);
  assert.equal(enviadas[0].telefone, '5527997400510');
  assert.match(enviadas[0].texto, /Recebemos seu arquivo/);

  assert.equal(arquivosSalvos.length, 1);
  assert.equal(arquivosSalvos[0].nomeArquivo, 'orcamento-cliente.pdf');
  assert.match(historico[0].conteudo, /orcamento-cliente\.pdf/);
  assert.match(historico[0].conteudo, /storage\.exemplo/);
});

test('PDF: continua sendo encaminhado mesmo com o bot pausado (fila humana já monitora essa notificação à parte)', async () => {
  reset({ estado: 'MENU_PRINCIPAL', botAtivo: false });

  await receberWebhook(webhookDePdf(), respostaFalsa());

  assert.equal(documentosEnviados.length, 1);
  assert.equal(enviadas.length, 1, 'confirmação ao cliente sai independente do bot estar pausado');
});
