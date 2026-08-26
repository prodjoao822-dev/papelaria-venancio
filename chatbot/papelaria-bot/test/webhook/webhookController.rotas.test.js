// Testes E2E por rota (Fase 3 da validação técnica pré-Volta às Aulas),
// rodando `receberWebhook` do início ao fim como a Evolution API faria,
// exatamente como test/webhook/webhookController.historico.test.js já faz —
// mesmo padrão de monkey-patch via require.cache pra dublar todo I/O externo
// (Supabase, Evolution API, n8n). Nenhuma chamada real sai do processo.
//
// Cobertura por rota (ver tabela final no relatório da tarefa):
//   1. Triagem inicial (roteamento determinístico)
//   2/3/4. Handoff pro Agente de Vendas/Orçamento (o que É responsabilidade
//      do bot: payload de saída e processamento da resposta — o agente em si
//      roda no n8n, fora deste processo)
//   5. Handoff automático IA -> humano (acionar_humano e timeout do n8n)
//   7 (parcial). A fração que o bot cobre: comunicar de volta ao cliente o
//      status "pronto" de um pedido quando ele volta a falar.
//
// Rotas 6 e 7 (RPC de separação/entrega) não têm nenhum código no processo do
// bot — ver test/supabase/separacaoSemFilaFifo.contrato.test.js e o relatório
// final para a evidência dessas duas.

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
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-webhook-rotas-')),
  'ecos.json'
);

// --- estado observável dos dublês, remontado a cada teste ---
const enviadas = [];
const pausas = [];
const acoesExecutadas = [];
const estadosAtualizados = [];
const escalonamentosVerificados = [];
let conversaAtual;
let podeResponder;
let respostaAgenteVendas; // função (payload) => resposta simulada do n8n, ou valor fixo
let ultimoPayloadAgenteVendas;
let pedidoAtivo;
let orcamentoAtivo;

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
    estadosAtualizados.push({ conversaId, estado, dados, mensagemId });
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
});
dubla('../../src/middlewares/reativacaoBot', {
  garantirBotAtivo: async () => ({ podeResponder, viaGatilhoPedido: false }),
  pausarBot: async (conversaId, motivo) => { pausas.push({ conversaId, motivo }); },
});
dubla('../../src/services/escolasService', { listarEscolasAtivas: async () => [] });
dubla('../../src/services/pedidosService', {
  pedidoAtivoCliente: async () => pedidoAtivo,
  orcamentoAtivoCliente: async () => orcamentoAtivo,
});
dubla('../../src/services/orcamentosService', {
  buscarOrcamentoPorId: async (id) => (pedidoAtivo ? { id, valor_total: 199.9 } : null),
});
dubla('../../src/services/arquivosClienteService', { salvarPdfRecebido: async () => ({ url: null }) });
dubla('../../src/botEngine/actions', {
  executarAcoes: async (acoes) => { acoesExecutadas.push(...acoes); },
});
dubla('../../src/services/escalonamentoService', {
  verificarEscalonamento: async (telefone) => { escalonamentosVerificados.push(telefone); },
});
dubla('../../src/integracoes/n8nClient', {
  consultarAgenteVendas: async (payload) => {
    ultimoPayloadAgenteVendas = payload;
    return typeof respostaAgenteVendas === 'function' ? respostaAgenteVendas(payload) : respostaAgenteVendas;
  },
  notificarAgenteOrcamento: async () => null,
});

const { receberWebhook } = require('../../src/webhook/webhookController');

function reset({ estado = 'MENU_PRINCIPAL', dados = {}, botAtivo = true } = {}) {
  enviadas.length = 0;
  pausas.length = 0;
  acoesExecutadas.length = 0;
  estadosAtualizados.length = 0;
  escalonamentosVerificados.length = 0;
  podeResponder = botAtivo;
  respostaAgenteVendas = null;
  ultimoPayloadAgenteVendas = undefined;
  pedidoAtivo = null;
  orcamentoAtivo = null;
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

// =====================================================================
// Rota 1 — Triagem inicial (WhatsApp -> roteamento determinístico)
// =====================================================================
// A stateMachine.test.js já cobre boa parte do roteamento puro; aqui o alvo é
// confirmar que receberWebhook (o processo inteiro, com I/O dublado) chega no
// destino certo pra um cliente novo/numa conversa fresca.

test('rota 1: cliente novo cai no menu principal sem acusar "opção inválida"', async () => {
  reset({ estado: 'MENU_PRINCIPAL', dados: {} });

  await receberWebhook(webhookDeTexto('Oi, bom dia'), respostaFalsa());

  assert.equal(enviadas.length, 1);
  assert.match(enviadas[0].texto, /Comprar \/ Ver preços/);
  assert.doesNotMatch(enviadas[0].texto, /inválida/i);
});

test('rota 1: escolher a opção "1" no menu principal roteia para SUBMENU_VENDAS', async () => {
  reset({ estado: 'MENU_PRINCIPAL', dados: { menuApresentado: true } });

  await receberWebhook(webhookDeTexto('1'), respostaFalsa());

  assert.equal(estadosAtualizados.length, 1);
  assert.equal(estadosAtualizados[0].estado, 'SUBMENU_VENDAS');
});

// =====================================================================
// Rotas 2/3/4 — Handoff pro Agente de Vendas/Orçamento (o que é do bot)
// =====================================================================
// O slot-filling, a consulta de catálogo e a RPC aceitar_orcamento rodam
// inteiramente no workflow n8n, fora deste processo — só testável de verdade
// com o n8n real no ar. O que é responsabilidade do bot, e o que os testes
// abaixo comprovam: (a) o payload enviado ao n8n carrega os dados certos
// (cliente_id/conversa_id SEMPRE do webhook, nunca de saída de IA); (b) a
// resposta do n8n (dublada) é repassada ao cliente e usada pra decidir o
// próximo estado da conversa.

test('rota 2: opção de produto no submenu de Vendas aciona o Agente de Vendas com cliente_id/conversa_id do webhook', async () => {
  reset({ estado: 'SUBMENU_VENDAS' });
  respostaAgenteVendas = { resposta: 'Temos caderno report 96 folhas por R$ 12,90. Quer que eu já separe?', encerrar_atendimento_ia: false };

  await receberWebhook(webhookDeTexto('2'), respostaFalsa());

  assert.deepEqual(ultimoPayloadAgenteVendas, {
    cliente_id: 'cliente-1',
    conversa_id: 'conversa-1',
    telefone: '5527997400510',
    texto: 'material escolar',
  });
  assert.equal(enviadas.length, 1);
  assert.equal(enviadas[0].texto, respostaAgenteVendas.resposta);
  assert.equal(estadosAtualizados[0].estado, 'AGENTE_VENDAS_ATIVO', 'continua em handoff enquanto o agente não encerra');
});

test('rota 2: com a conversa já em AGENTE_VENDAS_ATIVO, texto livre vai direto pro agente (sem passar pela stateMachine)', async () => {
  reset({ estado: 'AGENTE_VENDAS_ATIVO' });
  respostaAgenteVendas = { resposta: 'Vocês têm sim, cor azul e vermelha.', encerrar_atendimento_ia: false };

  await receberWebhook(webhookDeTexto('vocês tem mochila?'), respostaFalsa());

  assert.equal(ultimoPayloadAgenteVendas.texto, 'vocês tem mochila?');
  assert.equal(enviadas[0].texto, 'Vocês têm sim, cor azul e vermelha.');
  assert.equal(estadosAtualizados[0].estado, 'AGENTE_VENDAS_ATIVO');
});

test('rota 2: "encerrar_atendimento_ia" tira a conversa do handoff (volta pro SUBMENU_VENDAS)', async () => {
  reset({ estado: 'AGENTE_VENDAS_ATIVO' });
  respostaAgenteVendas = { resposta: 'Foi um prazer te ajudar!', encerrar_atendimento_ia: true };

  await receberWebhook(webhookDeTexto('obrigada, só isso'), respostaFalsa());

  assert.equal(estadosAtualizados[0].estado, 'SUBMENU_VENDAS');
});

test('rota 3: cliente com pedido ativo pedindo pra "pagar" é encaminhado ao Agente de Vendas com o protocolo/valor certos (RPC aceitar_orcamento roda no n8n)', async () => {
  reset({ estado: 'MENU_PRINCIPAL' });
  pedidoAtivo = { protocolo: 'PED-2026-0099', status: 'confirmado', orcamento_id: 'orc-1' };
  respostaAgenteVendas = { resposta: 'Perfeito, seu pedido PED-2026-0099 já está confirmado!', encerrar_atendimento_ia: true };

  await receberWebhook(webhookDeTexto('quero pagar meu pedido'), respostaFalsa());

  assert.match(ultimoPayloadAgenteVendas.texto, /PED-2026-0099/);
  assert.deepEqual(ultimoPayloadAgenteVendas.contexto, {
    tipo: 'fechamento_pedido',
    protocolo: 'PED-2026-0099',
    valorTotal: 199.9,
    status: 'confirmado',
  });
  assert.equal(enviadas[0].texto, respostaAgenteVendas.resposta);
});

test('rota 3: cliente com orçamento (ainda não pedido) pedindo pra "fechar" manda o contexto de fechamento de orçamento', async () => {
  reset({ estado: 'SUBMENU_VENDAS' });
  orcamentoAtivo = { protocolo: 'ORC-2026-0050', status: 'rascunho' };
  respostaAgenteVendas = { resposta: 'Já fechei seu orçamento, protocolo ORC-2026-0050!', encerrar_atendimento_ia: true };

  await receberWebhook(webhookDeTexto('posso fechar esse orçamento?'), respostaFalsa());

  assert.deepEqual(ultimoPayloadAgenteVendas.contexto, {
    tipo: 'fechamento_orcamento',
    protocolo: 'ORC-2026-0050',
    status: 'rascunho',
  });
});

test('rota 4: resposta do agente com a confirmação de horário de retirada é repassada ao cliente sem alteração', async () => {
  // A extração de forma_entrega/horario_retirada_desejado acontece dentro do
  // n8n (ver memória "Fix fechamento/entrega Agente de Vendas 20/08") — o bot
  // não parseia nem valida esses campos, só entrega o texto final do agente
  // ao cliente e decide o próximo estado a partir de encerrar_atendimento_ia.
  reset({ estado: 'AGENTE_VENDAS_ATIVO' });
  respostaAgenteVendas = {
    resposta: 'Combinado! Retirada hoje às 17h na loja, forma de entrega: retirada no balcão.',
    encerrar_atendimento_ia: true,
  };

  await receberWebhook(webhookDeTexto('pode ser retirada hoje às 17h'), respostaFalsa());

  assert.equal(enviadas[0].texto, respostaAgenteVendas.resposta);
  assert.match(enviadas[0].texto, /17h/);
  assert.equal(estadosAtualizados[0].estado, 'SUBMENU_VENDAS');
});

// =====================================================================
// Rota 5 — Handoff automático IA -> humano (escalação)
// =====================================================================

test('rota 5: acionar_humano=true (falha técnica do agente) pausa o bot, notifica vendas e verifica escalonamento', async () => {
  reset({ estado: 'AGENTE_VENDAS_ATIVO' });
  respostaAgenteVendas = { resposta: 'Já te transfiro pra equipe.', acionarHumano: true, motivo: 'rate limit do modelo' };

  await receberWebhook(webhookDeTexto('quero fechar agora'), respostaFalsa());

  assert.equal(pausas.length, 1);
  assert.match(pausas[0].motivo, /Falha técnica no Agente de Vendas/);
  assert.equal(acoesExecutadas.length, 1);
  assert.equal(acoesExecutadas[0].tipo, 'NOTIFICAR_HUMANO');
  assert.equal(acoesExecutadas[0].alvo, 'vendas');
  assert.match(acoesExecutadas[0].dados.intencao, /rate limit do modelo/);
  assert.deepEqual(escalonamentosVerificados, ['5527997400510']);
  assert.equal(estadosAtualizados[0].estado, 'SUBMENU_VENDAS', 'não continua roteando pro agente depois do handoff');
});

test('rota 5: timeout/erro do Agente de Vendas (n8n retorna null) aciona a mesma rede de segurança', async () => {
  reset({ estado: 'AGENTE_VENDAS_ATIVO' });
  respostaAgenteVendas = null;

  await receberWebhook(webhookDeTexto('alguém ainda aí?'), respostaFalsa());

  assert.equal(enviadas.length, 1);
  assert.match(enviadas[0].texto, /Vou te conectar com nossa equipe/);
  assert.equal(pausas.length, 1);
  assert.match(pausas[0].motivo, /timeout\/erro ao consultar o Agente de Vendas/);
  assert.equal(acoesExecutadas[0].tipo, 'NOTIFICAR_HUMANO');
  assert.equal(estadosAtualizados[0].estado, 'AGENTE_VENDAS_ATIVO', 'estadoFinal null mantém o estado atual — quem decide o resto é o handoff');
});

test('rota 5: comando explícito "atendente" (fora do agente) pausa o bot e verifica escalonamento', async () => {
  reset({ estado: 'MENU_PRINCIPAL', dados: { menuApresentado: true } });

  await receberWebhook(webhookDeTexto('atendente'), respostaFalsa());

  assert.equal(pausas.length, 1);
  assert.match(pausas[0].motivo, /cliente pediu atendimento humano \(comando de escalação\)/);
  assert.deepEqual(escalonamentosVerificados, ['5527997400510']);
});

// =====================================================================
// Rota 7 (parcial) — a fatia que o bot cobre no handoff separação -> entrega
// =====================================================================
// A transição de status em si (separado -> pronto -> entregue) é feita
// inteiramente por RPC no Postgres, disparada pelo dashboard/app — o bot não
// participa dela (nenhuma rota HTTP do bot toca `solicitacoes_separacao`,
// `solicitacoes_entrega` ou `notificacoes_internas`, confirmado por busca no
// código-fonte). A notificação proativa "seu pedido está pronto" também roda
// fora deste processo (workflow n8n ativado em 22/08, ver memória "Timeline
// pedido / notificação status"). O que o bot faz, e é testável aqui: quando o
// CLIENTE volta a falar, ele informa corretamente o status vigente do pedido
// (inclusive "pronto pra retirada/entrega", que é exatamente o status que a
// separação delegada produz ao concluir).

test('rota 7 (parcial): cliente com pedido "pronto" que volta ao menu principal recebe o status certo', async () => {
  reset({ estado: 'MENU_PRINCIPAL', dados: { menuApresentado: true } });
  pedidoAtivo = { protocolo: 'PED-2026-0123', status: 'pronto' };

  await receberWebhook(webhookDeTexto('menu'), respostaFalsa());

  assert.match(enviadas[0].texto, /PED-2026-0123/);
  assert.match(enviadas[0].texto, /pronto pra retirada\/entrega/);
});
