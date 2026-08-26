const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ─────────────────────────────────────────────────────────────────────────────
// Dublê do Supabase — intercepta chamadas a `from()`, `select()`, `in()` etc.
// Mesmo padrão de clientesService.test.js / orcamentosService.test.js.
// ─────────────────────────────────────────────────────────────────────────────

let mockConfigs = [];
let mockConversasCount = 0;

const caminhoSupabase = require.resolve('../../src/services/supabaseClient');
require.cache[caminhoSupabase] = {
  id: caminhoSupabase,
  filename: caminhoSupabase,
  loaded: true,
  exports: {
    from: (tabela) => {
      if (tabela === 'configuracoes') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: mockConfigs, error: null }),
          }),
        };
      }
      if (tabela === 'conversas') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ count: mockConversasCount, error: null }),
            }),
          }),
        };
      }
      return {};
    },
  },
};

// Stub do logger pra não poluir o output dos testes
const caminhoLogger = require.resolve('../../src/utils/logger');
require.cache[caminhoLogger] = {
  id: caminhoLogger,
  filename: caminhoLogger,
  loaded: true,
  exports: { info: () => {}, erro: () => {}, aviso: () => {} },
};

const { verificarEscalonamento, lerConfigs, contarFilaAtual } = require('../../src/services/escalonamentoService');

// ─────────────────────────────────────────────────────────────────────────────
// Testes
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockConfigs = [];
  mockConversasCount = 0;
});

test('lerConfigs retorna defaults quando tabela está vazia', async () => {
  mockConfigs = [];
  const config = await lerConfigs();
  assert.equal(config.escalonamento_threshold, 10);
  assert.ok(config.escalonamento_mensagem.includes('{posicao}'));
  assert.equal(config.escalonamento_tempo_estimado_por_posicao, 5);
});

test('lerConfigs respeita valores da tabela configuracoes', async () => {
  mockConfigs = [
    { chave: 'escalonamento_threshold', valor: '5' },
    { chave: 'escalonamento_tempo_estimado_por_posicao', valor: '3' },
  ];
  // Força recarregar cache (limpa o TTL)
  const mod = require('../../src/services/escalonamentoService');
  mod._configCache = null;
  mod._configCacheExpiraEm = 0;

  const config = await lerConfigs();
  assert.equal(config.escalonamento_threshold, 5);
  assert.equal(config.escalonamento_tempo_estimado_por_posicao, 3);
});

test('verificarEscalonamento NÃO envia mensagem quando fila < threshold', async () => {
  mockConversasCount = 3;
  mockConfigs = [{ chave: 'escalonamento_threshold', valor: '10' }];

  let mensagemEnviada = null;
  const enviarTexto = async (tel, msg) => { mensagemEnviada = { tel, msg }; };

  await verificarEscalonamento('5511999990001', enviarTexto);
  assert.equal(mensagemEnviada, null, 'Não deve enviar mensagem quando fila < threshold');
});

test('verificarEscalonamento ENVIA mensagem quando fila >= threshold', async () => {
  mockConversasCount = 12;
  mockConfigs = [
    { chave: 'escalonamento_threshold', valor: '10' },
    { chave: 'escalonamento_mensagem', valor: 'Você é o Nº {posicao}, espera de {minutos} min.' },
    { chave: 'escalonamento_tempo_estimado_por_posicao', valor: '4' },
  ];
  // Limpa cache
  const mod = require('../../src/services/escalonamentoService');
  mod._configCache = null;
  mod._configCacheExpiraEm = 0;

  let mensagemEnviada = null;
  const enviarTexto = async (tel, msg) => { mensagemEnviada = { tel, msg }; };

  await verificarEscalonamento('5511999990001', enviarTexto);
  assert.ok(mensagemEnviada, 'Deve enviar mensagem quando fila >= threshold');
  assert.equal(mensagemEnviada.tel, '5511999990001');
  assert.ok(mensagemEnviada.msg.includes('Nº 12'), 'Mensagem deve conter a posição');
  assert.ok(mensagemEnviada.msg.includes('48 min'), 'Mensagem deve conter o tempo estimado (12*4=48)');
});

test('verificarEscalonamento é best-effort: não lança erro se envio falhar', async () => {
  mockConversasCount = 15;
  mockConfigs = [{ chave: 'escalonamento_threshold', valor: '5' }];
  const mod = require('../../src/services/escalonamentoService');
  mod._configCache = null;
  mod._configCacheExpiraEm = 0;

  const enviarTexto = async () => { throw new Error('Falha de rede'); };

  // Não deve lançar
  await verificarEscalonamento('5511999990001', enviarTexto);
});
