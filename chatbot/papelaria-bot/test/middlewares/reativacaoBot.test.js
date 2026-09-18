const { test } = require('node:test');
const assert = require('node:assert/strict');

// Valores de fachada: nenhum teste aqui toca rede ou banco (conversasService é
// substituído logo abaixo), mas config/env valida a presença das obrigatórias.
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
process.env.REACTIVATION_TIMEOUT_MINUTES = '120';

// Substitui conversasService antes de reativacaoBot carregar, pra registrar as
// escritas em vez de executá-las. É justamente a AUSÊNCIA de uma dessas escritas
// que este arquivo protege.
const CAMINHO_CONVERSAS = require.resolve('../../src/services/conversasService');
const escritas = [];
require.cache[CAMINHO_CONVERSAS] = {
  id: CAMINHO_CONVERSAS,
  filename: CAMINHO_CONVERSAS,
  loaded: true,
  exports: {
    definirBotAtivo: async (conversaId, ativo) => { escritas.push({ conversaId, ativo }); },
  },
};

// reativacaoBot lê o timeout de configResolver (painel admin, 18/09/2026) em
// vez de env.js direto — dublado aqui com o mesmo valor de sempre (120min)
// pra manter o comportamento exercitado por este arquivo, sem bater na rede.
const CAMINHO_CONFIG_RESOLVER = require.resolve('../../src/config/configResolver');
require.cache[CAMINHO_CONFIG_RESOLVER] = {
  id: CAMINHO_CONFIG_RESOLVER,
  filename: CAMINHO_CONFIG_RESOLVER,
  loaded: true,
  exports: {
    obter: async (chave) => (chave === 'reactivation_timeout_minutos' ? 120 : null),
  },
};

const reativacaoBot = require('../../src/middlewares/reativacaoBot');

const MINUTO = 60 * 1000;

function conversaPausadaHa(minutos) {
  escritas.length = 0;
  return {
    id: 'conversa-1',
    bot_ativo: false,
    pausado_pos_pedido: false,
    ultima_interacao_em: new Date(Date.now() - minutos * MINUTO).toISOString(),
  };
}

test('bot ativo responde sem escrever nada na conversa', async () => {
  escritas.length = 0;
  const resultado = await reativacaoBot.garantirBotAtivo({ id: 'conversa-1', bot_ativo: true });

  assert.deepEqual(resultado, { podeResponder: true, viaGatilhoPedido: false });
  assert.equal(escritas.length, 0);
});

test('pausa pós-pedido reativa já na próxima mensagem, sem esperar o timeout', async () => {
  escritas.length = 0;
  const resultado = await reativacaoBot.garantirBotAtivo({
    id: 'conversa-1',
    bot_ativo: false,
    pausado_pos_pedido: true,
    ultima_interacao_em: new Date().toISOString(),
  });

  assert.deepEqual(resultado, { podeResponder: true, viaGatilhoPedido: true });
  assert.deepEqual(escritas, [{ conversaId: 'conversa-1', ativo: true }]);
});

test('passado o timeout, o bot volta sozinho', async () => {
  const conversa = conversaPausadaHa(121);
  const resultado = await reativacaoBot.garantirBotAtivo(conversa);

  assert.equal(resultado.podeResponder, true);
  assert.equal(resultado.viaGatilhoPedido, false);
  assert.deepEqual(escritas, [{ conversaId: 'conversa-1', ativo: true }]);
});

test('dentro da janela humana o bot fica calado', async () => {
  const conversa = conversaPausadaHa(30);
  const resultado = await reativacaoBot.garantirBotAtivo(conversa);

  assert.deepEqual(resultado, { podeResponder: false, viaGatilhoPedido: false });
});

// --- a correção de 12/08 ---
//
// Havia aqui um definirBotAtivo(id, false) que, como bot_ativo já era false,
// só servia pra renovar `ultima_interacao_em`. Efeito colateral: cada mensagem
// do cliente empurrava o prazo de reativação 120 min pra frente, e um cliente
// sem resposta não fica calado — ele insiste. A pausa virava permanente (24 de
// 30 conversas travadas assim em 12/08).

test('mensagem de cliente durante a pausa NÃO escreve na conversa', async () => {
  const conversa = conversaPausadaHa(30);
  await reativacaoBot.garantirBotAtivo(conversa);

  assert.deepEqual(
    escritas,
    [],
    'qualquer escrita aqui renova ultima_interacao_em e adia o retorno do bot'
  );
});

test('cliente insistindo não adia a volta do bot', async () => {
  const conversa = conversaPausadaHa(119);

  // Cliente manda três mensagens seguidas, sem resposta, logo antes do prazo.
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequência proposital
    const resultado = await reativacaoBot.garantirBotAtivo(conversa);
    assert.equal(resultado.podeResponder, false);
  }
  assert.deepEqual(escritas, [], 'nenhuma das tentativas pode reiniciar a contagem');

  // Passa do prazo contado a partir da PAUSA (não da última tentativa dele).
  const resultadoDepoisDoPrazo = await reativacaoBot.garantirBotAtivo(conversaPausadaHa(121));

  assert.equal(
    resultadoDepoisDoPrazo.podeResponder,
    true,
    'o bot precisa voltar 120 min depois da pausa, tenha o cliente escrito ou não'
  );
});

test('pausarBot desliga o atendimento automático da conversa', async () => {
  escritas.length = 0;
  await reativacaoBot.pausarBot('conversa-1', 'humano assumiu');

  assert.deepEqual(escritas, [{ conversaId: 'conversa-1', ativo: false }]);
});
