// finalizarCadastroEPedido (src/botEngine/actions.js) é a função que fecha o
// ciclo de venda do bot — cria o orçamento, aceita direto (RPC
// aceitar_orcamento, via orcamentosService.aceitarOrcamento) e avisa cliente +
// grupo de vendas. Estava sem nenhum teste dedicado (Fase 1 do plano mestre,
// item 4). Mesmo padrão de monkey-patch via require.cache dos outros testes
// deste projeto — evita qualquer chamada real a Supabase/Evolution/n8n.

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
  fs.mkdtempSync(path.join(os.tmpdir(), 'ecos-actions-')),
  'ecos.json'
);

const enviadas = [];
const chamadasCadastroFiscal = [];
const chamadasPausarPosPedido = [];
const chamadasNotificarAgenteOrcamento = [];

let comportamentoCriarOrcamento; // função (args) => orcamento, ou lança
let comportamentoAceitarOrcamento; // função (orcamentoId, origem) => pedido, ou lança

function dubla(caminhoRelativo, exports) {
  const caminho = require.resolve(caminhoRelativo);
  require.cache[caminho] = {
    id: caminho, filename: caminho, loaded: true, exports,
  };
}

dubla('../../src/services/evolutionApi', {
  enviarTexto: async (telefone, texto) => { enviadas.push({ telefone, texto }); return {}; },
});
dubla('../../src/services/clientesService', {
  atualizarCadastroFiscal: async (clienteId, cadastroFiscal) => {
    chamadasCadastroFiscal.push({ clienteId, cadastroFiscal });
  },
});
dubla('../../src/services/orcamentosService', {
  criarOrcamentoComItens: async (args) => comportamentoCriarOrcamento(args),
  aceitarOrcamento: async (orcamentoId, origem) => comportamentoAceitarOrcamento(orcamentoId, origem),
});
dubla('../../src/services/conversasService', {
  pausarPosPedido: async (conversaId) => { chamadasPausarPosPedido.push(conversaId); },
});
dubla('../../src/integracoes/n8nClient', {
  notificarAgenteOrcamento: async (payload) => { chamadasNotificarAgenteOrcamento.push(payload); return null; },
});

const { executarAcoes } = require('../../src/botEngine/actions');

const CLIENTE = { id: 'cliente-1', telefone: '5527997400510', nome: 'Bruna' };
const CONVERSA_ID = 'conversa-1';

function resetar() {
  enviadas.length = 0;
  chamadasCadastroFiscal.length = 0;
  chamadasPausarPosPedido.length = 0;
  chamadasNotificarAgenteOrcamento.length = 0;
  comportamentoCriarOrcamento = async (args) => ({ id: 'orcamento-1', protocolo: 'ORC-2026-0001', ...args });
  comportamentoAceitarOrcamento = async () => ({ id: 'pedido-1', protocolo: 'PED-2026-0001', status: 'confirmado' });
}

function acaoFinalizar({ origemOrcamento, cadastroFiscal = null } = {}) {
  return {
    tipo: 'FINALIZAR_CADASTRO_E_PEDIDO',
    dados: {
      cadastroFiscal,
      origemOrcamento: {
        tipo: 'lista_escolar',
        itensTexto: '2 cadernos\n1 estojo',
        observacoes: 'entregar até sexta',
        ...origemOrcamento,
      },
    },
  };
}

// --- caminho feliz ---

test('finalizarCadastroEPedido: cliente recorrente (sem cadastro fiscal novo) cria e aceita o orçamento, confirma pro cliente e avisa vendas', async () => {
  resetar();

  await executarAcoes([acaoFinalizar()], CLIENTE, CONVERSA_ID);

  assert.equal(chamadasCadastroFiscal.length, 0, 'sem cadastroFiscal na ação, não deve chamar atualizarCadastroFiscal');

  assert.equal(enviadas.length, 2, 'confirmação pro cliente + aviso pra vendas');
  assert.equal(enviadas[0].telefone, CLIENTE.telefone);
  assert.match(enviadas[0].texto, /PED-2026-0001/);

  assert.equal(enviadas[1].telefone, process.env.PHONE_VANESSA);
  assert.match(enviadas[1].texto, /cliente recorrente, dados já cadastrados/);
  assert.match(enviadas[1].texto, /PED-2026-0001/);

  assert.equal(chamadasNotificarAgenteOrcamento.length, 1);
  assert.deepEqual(chamadasNotificarAgenteOrcamento[0], {
    cliente_id: CLIENTE.id,
    orcamento_id: 'orcamento-1',
    protocolo: 'ORC-2026-0001',
    tipo: 'lista_escolar',
    payload: { itens: '2 cadernos\n1 estojo', observacoes: 'entregar até sexta' },
  });

  assert.deepEqual(chamadasPausarPosPedido, [CONVERSA_ID]);
});

test('finalizarCadastroEPedido: com cadastro fiscal novo, grava o cadastro ANTES de criar o orçamento e detalha os dados na mensagem pra vendas', async () => {
  resetar();
  const cadastroFiscal = {
    tipo_pessoa: 'fisica',
    cpf: '123.456.789-00',
    nome: 'Bruna Oliveira',
    endereco: 'Rua das Flores, 123',
  };

  await executarAcoes([acaoFinalizar({ cadastroFiscal })], CLIENTE, CONVERSA_ID);

  assert.equal(chamadasCadastroFiscal.length, 1);
  assert.deepEqual(chamadasCadastroFiscal[0], { clienteId: CLIENTE.id, cadastroFiscal });

  assert.match(enviadas[1].texto, /CPF: 123\.456\.789-00/);
  assert.match(enviadas[1].texto, /Nome: Bruna Oliveira/);
  assert.doesNotMatch(enviadas[1].texto, /cliente recorrente/);
});

test('finalizarCadastroEPedido: aceita o orçamento com a origem "js_bot" (trilha de auditoria)', async () => {
  resetar();
  let origemRecebida;
  comportamentoAceitarOrcamento = async (orcamentoId, origem) => {
    origemRecebida = origem;
    return { id: 'pedido-2', protocolo: 'PED-2026-0002' };
  };

  await executarAcoes([acaoFinalizar()], CLIENTE, CONVERSA_ID);

  assert.equal(origemRecebida, 'js_bot');
});

// --- caminho de falha ---

test('finalizarCadastroEPedido: falha ao criar o orçamento avisa cliente e vendas com mensagem de erro, e NÃO confirma protocolo nem notifica o Agente de Orçamento', async () => {
  resetar();
  comportamentoCriarOrcamento = async () => { throw new Error('Supabase fora do ar'); };

  await executarAcoes([acaoFinalizar()], CLIENTE, CONVERSA_ID);

  assert.equal(enviadas.length, 2);
  assert.equal(enviadas[0].telefone, CLIENTE.telefone);
  assert.match(enviadas[0].texto, /problema técnico/);

  assert.equal(enviadas[1].telefone, process.env.PHONE_VANESSA);
  assert.match(enviadas[1].texto, /FALHA ao confirmar pedido/);
  assert.match(enviadas[1].texto, /2 cadernos/);

  assert.equal(chamadasNotificarAgenteOrcamento.length, 0, 'não deve notificar o Agente de Orçamento sem pedido de verdade');
  assert.equal(chamadasPausarPosPedido.length, 0, 'não deve pausar a conversa como se o pedido tivesse ido pra frente');
});

test('finalizarCadastroEPedido: falha ao ACEITAR o orçamento (criado, mas não virou pedido) cai no mesmo fallback de erro', async () => {
  resetar();
  comportamentoAceitarOrcamento = async () => { throw new Error('transição de status inválida'); };

  await executarAcoes([acaoFinalizar()], CLIENTE, CONVERSA_ID);

  assert.match(enviadas[1].texto, /FALHA ao confirmar pedido/);
  assert.equal(chamadasNotificarAgenteOrcamento.length, 0);
  assert.equal(chamadasPausarPosPedido.length, 0);
});

test('finalizarCadastroEPedido: mensagem de falha avisa pra conferir o Supabase quando o cadastro fiscal já tinha sido coletado', async () => {
  resetar();
  comportamentoCriarOrcamento = async () => { throw new Error('timeout'); };

  await executarAcoes(
    [acaoFinalizar({ cadastroFiscal: { tipo_pessoa: 'fisica', cpf: '000.000.000-00' } })],
    CLIENTE,
    CONVERSA_ID
  );

  assert.match(enviadas[1].texto, /cadastro fiscal foi coletado nesta conversa/);
});

// --- best-effort: uma etapa falhando não deve travar as seguintes ---

test('finalizarCadastroEPedido: falha ao ENVIAR a confirmação pro cliente não impede o aviso a vendas nem a notificação ao Agente de Orçamento', async () => {
  resetar();
  const evolutionApi = require('../../src/services/evolutionApi');
  const enviarTextoOriginal = evolutionApi.enviarTexto;
  let chamadas = 0;
  evolutionApi.enviarTexto = async (telefone, texto) => {
    chamadas += 1;
    if (chamadas === 1) throw new Error('ECONNRESET');
    enviadas.push({ telefone, texto });
    return {};
  };

  try {
    await executarAcoes([acaoFinalizar()], CLIENTE, CONVERSA_ID);
  } finally {
    evolutionApi.enviarTexto = enviarTextoOriginal;
  }

  assert.equal(enviadas.length, 1, 'só a mensagem pra vendas foi registrada (a do cliente falhou)');
  assert.equal(enviadas[0].telefone, process.env.PHONE_VANESSA);
  assert.equal(chamadasNotificarAgenteOrcamento.length, 1, 'best-effort: continua mesmo com a 1ª etapa falhando');
  assert.deepEqual(chamadasPausarPosPedido, [CONVERSA_ID]);
});

test('executarAcoes: uma ação de tipo desconhecido é ignorada sem quebrar as demais', async () => {
  resetar();

  await executarAcoes(
    [{ tipo: 'ACAO_QUE_NAO_EXISTE' }, acaoFinalizar()],
    CLIENTE,
    CONVERSA_ID
  );

  assert.equal(enviadas.length, 2, 'a ação seguinte (finalizar pedido) ainda roda normalmente');
});

// --- CRIAR_ORCAMENTO_LISTA_ESCOLAR (lista escolar de "outra escola", 28/08/2026) ---
//
// Diferente de FINALIZAR_CADASTRO_E_PEDIDO: cria só o ORÇAMENTO (fica em
// 'rascunho', nunca chama aceitarOrcamento) e não grava cadastro fiscal
// nenhum. O fechamento de verdade (forma de entrega, endereço) é feito depois
// pelo Agente de Vendas, quando o cliente voltar a falar.

function acaoCriarOrcamentoListaEscolar({ origemOrcamento } = {}) {
  return {
    tipo: 'CRIAR_ORCAMENTO_LISTA_ESCOLAR',
    dados: {
      origemOrcamento: {
        tipo: 'lista_escolar',
        escolaId: null,
        itensTexto: 'Escola: Colégio Novo (1º ano - Fundamental)\n5 cadernos, 2 lápis, 1 estojo',
        observacoes: 'sem observação',
        ...origemOrcamento,
      },
    },
  };
}

test('CRIAR_ORCAMENTO_LISTA_ESCOLAR: cria o orçamento, notifica vendas, aciona o Agente de Orçamento e pausa a conversa — sem aceitar o orçamento nem gravar cadastro fiscal', async () => {
  resetar();

  await executarAcoes([acaoCriarOrcamentoListaEscolar()], CLIENTE, CONVERSA_ID);

  assert.equal(chamadasCadastroFiscal.length, 0, 'lista escolar "outra escola" nunca grava cadastro fiscal');

  assert.equal(enviadas.length, 1, 'só o aviso pra vendas — nenhuma mensagem de protocolo de pedido pro cliente aqui');
  assert.equal(enviadas[0].telefone, process.env.PHONE_VANESSA);
  assert.match(enviadas[0].texto, /ORC-2026-0001/);
  assert.match(enviadas[0].texto, /Agente de Orçamento já foi acionado/);

  assert.equal(chamadasNotificarAgenteOrcamento.length, 1);
  assert.deepEqual(chamadasNotificarAgenteOrcamento[0], {
    cliente_id: CLIENTE.id,
    orcamento_id: 'orcamento-1',
    protocolo: 'ORC-2026-0001',
    tipo: 'lista_escolar',
    payload: {
      itens: 'Escola: Colégio Novo (1º ano - Fundamental)\n5 cadernos, 2 lápis, 1 estojo',
      observacoes: 'sem observação',
    },
  });

  // É essa pausa que garante a retomada: o orçamento fica em 'rascunho',
  // orcamento_ativo_cliente já trata isso como "ativo", e a próxima mensagem
  // do cliente é roteada pro Agente de Vendas em vez do menu principal (ver
  // reativacaoBot.garantirBotAtivo + webhookController.receberWebhook).
  assert.deepEqual(chamadasPausarPosPedido, [CONVERSA_ID]);
});

test('CRIAR_ORCAMENTO_LISTA_ESCOLAR: falha ao criar o orçamento avisa vendas e NÃO notifica o Agente de Orçamento nem pausa a conversa', async () => {
  resetar();
  comportamentoCriarOrcamento = async () => { throw new Error('Supabase fora do ar'); };

  await executarAcoes([acaoCriarOrcamentoListaEscolar()], CLIENTE, CONVERSA_ID);

  assert.equal(enviadas.length, 1);
  assert.equal(enviadas[0].telefone, process.env.PHONE_VANESSA);
  assert.match(enviadas[0].texto, /FALHA ao criar orçamento de lista escolar/);
  assert.match(enviadas[0].texto, /Colégio Novo/);

  assert.equal(chamadasNotificarAgenteOrcamento.length, 0);
  assert.equal(chamadasPausarPosPedido.length, 0);
  assert.equal(chamadasCadastroFiscal.length, 0);
});

test('CRIAR_ORCAMENTO_LISTA_ESCOLAR: falha ao notificar vendas não impede a notificação ao Agente de Orçamento nem a pausa (best-effort)', async () => {
  resetar();
  const evolutionApi = require('../../src/services/evolutionApi');
  const enviarTextoOriginal = evolutionApi.enviarTexto;
  evolutionApi.enviarTexto = async () => { throw new Error('ECONNRESET'); };

  try {
    await executarAcoes([acaoCriarOrcamentoListaEscolar()], CLIENTE, CONVERSA_ID);
  } finally {
    evolutionApi.enviarTexto = enviarTextoOriginal;
  }

  assert.equal(chamadasNotificarAgenteOrcamento.length, 1, 'best-effort: continua mesmo com a notificação de vendas falhando');
  assert.deepEqual(chamadasPausarPosPedido, [CONVERSA_ID]);
});
