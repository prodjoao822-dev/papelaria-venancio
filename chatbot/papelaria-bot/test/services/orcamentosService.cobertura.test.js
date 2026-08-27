const { test } = require('node:test');
const assert = require('node:assert/strict');

// Complementa orcamentosService.test.js (aquele cobre o parser itensDeTexto e
// o formato do payload de criarOrcamentoComItens). Este arquivo cobre o que
// faltava na T4.1 (25-27/08/2026): as funções que nunca tinham teste
// (aceitarOrcamento, buscarOrcamentoPorId, atualizarStatusOrcamento) e os
// caminhos de erro de cada RPC/consulta.
const caminhoSupabase = require.resolve('../../src/services/supabaseClient');

const estado = {
  rpcError: null,
  rpcData: { id: 'orc-1', protocolo: 'ORC-0001' },
  orcamentoSelectError: null,
  orcamentoSelectData: null,
};
const chamadasRpc = [];

require.cache[caminhoSupabase] = {
  id: caminhoSupabase,
  filename: caminhoSupabase,
  loaded: true,
  exports: {
    rpc: async (funcao, parametros) => {
      chamadasRpc.push({ funcao, parametros });
      return estado.rpcError
        ? { data: null, error: estado.rpcError }
        : { data: estado.rpcData, error: null };
    },
    from: (tabela) => {
      if (tabela === 'orcamentos') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => (
                estado.orcamentoSelectError
                  ? { data: null, error: estado.orcamentoSelectError }
                  : { data: estado.orcamentoSelectData, error: null }
              ),
            }),
          }),
        };
      }

      throw new Error(`dublê não configurado para a tabela "${tabela}"`);
    },
  },
};

const {
  criarOrcamentoComItens,
  aceitarOrcamento,
  atualizarStatusOrcamento,
  buscarOrcamentoPorId,
} = require('../../src/services/orcamentosService');

// --- criarOrcamentoComItens: caminho de erro (o de sucesso já é coberto em orcamentosService.test.js) ---

test('erro na RPC de criação de orçamento é propagado', async () => {
  estado.rpcError = { message: 'jsonb_array_length: cannot get array length of a scalar' };

  await assert.rejects(
    () => criarOrcamentoComItens({ clienteId: 'cli-1', tipo: 'lista_escolar', itensTexto: 'caneta' }),
    /Não foi possível criar o orçamento/
  );

  estado.rpcError = null;
});

// --- aceitarOrcamento ---

test('aceitarOrcamento repassa o retorno da RPC', async () => {
  estado.rpcData = { pedido_id: 'ped-1', protocolo: 'PED-0001' };
  chamadasRpc.length = 0;

  const resultado = await aceitarOrcamento('orc-1', 'whatsapp');

  assert.equal(chamadasRpc[0].funcao, 'aceitar_orcamento');
  assert.deepEqual(chamadasRpc[0].parametros, { p_orcamento_id: 'orc-1', p_origem: 'whatsapp' });
  assert.equal(resultado.pedido_id, 'ped-1');
});

test('erro ao aceitar orçamento é propagado', async () => {
  estado.rpcError = { message: 'orçamento já aceito' };

  await assert.rejects(
    () => aceitarOrcamento('orc-1', 'whatsapp'),
    /Não foi possível aceitar o orçamento orc-1/
  );

  estado.rpcError = null;
});

// --- buscarOrcamentoPorId ---
// Usado só pelo callback do Agente de Orçamento (POST /webhook/agente-orcamento).

test('buscarOrcamentoPorId devolve o orçamento encontrado', async () => {
  estado.orcamentoSelectData = { id: 'orc-1', conversa_id: 'conv-1', status: 'rascunho' };

  const orcamento = await buscarOrcamentoPorId('orc-1');

  assert.equal(orcamento.conversa_id, 'conv-1');
});

test('buscarOrcamentoPorId devolve null quando não existe (maybeSingle)', async () => {
  estado.orcamentoSelectData = null;

  assert.equal(await buscarOrcamentoPorId('orc-inexistente'), null);
});

test('erro ao buscar orçamento por id é propagado', async () => {
  estado.orcamentoSelectError = { message: 'timeout' };

  await assert.rejects(
    () => buscarOrcamentoPorId('orc-1'),
    /Não foi possível buscar o orçamento orc-1/
  );

  estado.orcamentoSelectError = null;
});

// --- atualizarStatusOrcamento ---

test('atualizarStatusOrcamento repassa o retorno da RPC', async () => {
  estado.rpcData = { id: 'orc-1', status: 'enviado' };
  chamadasRpc.length = 0;

  const resultado = await atualizarStatusOrcamento('orc-1', 'enviado', 'agente_orcamento');

  assert.equal(chamadasRpc[0].funcao, 'atualizar_status_orcamento');
  assert.deepEqual(chamadasRpc[0].parametros, {
    p_orcamento_id: 'orc-1', p_novo_status: 'enviado', p_origem: 'agente_orcamento',
  });
  assert.equal(resultado.status, 'enviado');
});

test('erro ao atualizar status do orçamento é propagado', async () => {
  estado.rpcError = { message: 'transição de status inválida' };

  await assert.rejects(
    () => atualizarStatusOrcamento('orc-1', 'enviado', 'agente_orcamento'),
    /Não foi possível atualizar o orçamento orc-1/
  );

  estado.rpcError = null;
});
