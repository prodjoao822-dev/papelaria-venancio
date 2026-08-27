const { test } = require('node:test');
const assert = require('node:assert/strict');

// Complementa clientesService.test.js: aquele arquivo cobre o essencial do
// upsert (o "nome:null apagaria o cadastro"). Este cobre os caminhos que
// faltavam na T4.1 (25-27/08/2026): erro de rede/banco em cada função, e as
// três funções que não tinham teste nenhum (buscarClientePorTelefone,
// atualizarCadastroFiscal, clienteTemCadastroCompleto).
//
// Dublê do Supabase configurável por teste via `estado` — precisa ser mutável
// porque a MESMA suíte exercita tanto o caminho de erro quanto o de sucesso da
// função `obterEmpresaId` (cache em memória de módulo, ver comentário em
// clientesService.js). A primeira chamada desta suíte é de propósito a que
// testa o erro, antes de qualquer sucesso preencher o cache.
const caminhoSupabase = require.resolve('../../src/services/supabaseClient');

const estado = {
  empresaError: null,
  clienteSelectError: null,
  clienteSelectData: null,
  upsertError: null,
  updateError: null,
  rpcError: null,
  rpcData: null,
};

require.cache[caminhoSupabase] = {
  id: caminhoSupabase,
  filename: caminhoSupabase,
  loaded: true,
  exports: {
    from: (tabela) => {
      if (tabela === 'empresa') {
        return {
          select: () => ({
            limit: () => ({
              single: async () => (
                estado.empresaError
                  ? { data: null, error: estado.empresaError }
                  : { data: { id: 'empresa-1' }, error: null }
              ),
            }),
          }),
        };
      }

      if (tabela === 'clientes') {
        return {
          upsert: (payload) => ({
            select: () => ({
              single: async () => (
                estado.upsertError
                  ? { data: null, error: estado.upsertError }
                  : { data: { id: 'cliente-1', ...payload }, error: null }
              ),
            }),
          }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => (
                  estado.clienteSelectError
                    ? { data: null, error: estado.clienteSelectError }
                    : { data: estado.clienteSelectData, error: null }
                ),
              }),
            }),
          }),
          update: () => ({
            eq: async () => (
              estado.updateError ? { error: estado.updateError } : { error: null }
            ),
          }),
        };
      }

      throw new Error(`dublê não configurado para a tabela "${tabela}"`);
    },
    rpc: async () => (
      estado.rpcError ? { data: null, error: estado.rpcError } : { data: estado.rpcData, error: null }
    ),
  },
};

const {
  upsertCliente,
  buscarClientePorTelefone,
  atualizarCadastroFiscal,
  clienteTemCadastroCompleto,
} = require('../../src/services/clientesService');

// --- obterEmpresaId (via buscarClientePorTelefone) ---
// Precisa ser o primeiro teste do arquivo: o cache de empresaId só existe
// depois da primeira consulta bem-sucedida.

test('erro ao buscar o id da empresa é propagado como falha de negócio', async () => {
  estado.empresaError = { message: 'conexão recusada' };

  await assert.rejects(
    () => buscarClientePorTelefone('5527997400510'),
    /Não foi possível buscar o id da empresa/
  );

  estado.empresaError = null;
});

// --- buscarClientePorTelefone ---

test('buscarClientePorTelefone devolve o cliente encontrado', async () => {
  estado.clienteSelectData = { id: 'cliente-9', nome: 'Ana', telefone: '5527997400510' };

  const cliente = await buscarClientePorTelefone('5527997400510');

  assert.equal(cliente.nome, 'Ana');
});

test('buscarClientePorTelefone devolve null quando não existe (maybeSingle)', async () => {
  estado.clienteSelectData = null;

  assert.equal(await buscarClientePorTelefone('0000000000000'), null);
});

test('erro ao buscar cliente por telefone é propagado', async () => {
  estado.clienteSelectError = { message: 'timeout' };

  await assert.rejects(
    () => buscarClientePorTelefone('5527997400510'),
    /Não foi possível buscar o cliente/
  );

  estado.clienteSelectError = null;
});

// --- upsertCliente: caminho de erro (o de sucesso já é coberto em clientesService.test.js) ---

test('erro no upsert do cliente é propagado', async () => {
  estado.upsertError = { message: 'violação de constraint' };

  await assert.rejects(
    () => upsertCliente('5527997400510', 'Bruna'),
    /Não foi possível salvar o cliente/
  );

  estado.upsertError = null;
});

// --- atualizarCadastroFiscal ---

test('atualizarCadastroFiscal grava os campos do fluxo fiscal sem lançar', async () => {
  await assert.doesNotReject(() => atualizarCadastroFiscal('cliente-1', {
    tipo_pessoa: 'fisica', cpf: '12345678900',
  }));
});

test('erro ao atualizar cadastro fiscal é propagado', async () => {
  estado.updateError = { message: 'cliente não encontrado' };

  await assert.rejects(
    () => atualizarCadastroFiscal('cliente-1', { cpf: '12345678900' }),
    /Não foi possível atualizar o cadastro fiscal/
  );

  estado.updateError = null;
});

// --- clienteTemCadastroCompleto ---

test('clienteTemCadastroCompleto repassa true da RPC', async () => {
  estado.rpcData = true;

  assert.equal(await clienteTemCadastroCompleto('cliente-1'), true);
});

test('clienteTemCadastroCompleto converte valor falsy/null da RPC em false', async () => {
  estado.rpcData = null;

  assert.equal(await clienteTemCadastroCompleto('cliente-1'), false);
});

test('erro ao checar cadastro fiscal completo é propagado', async () => {
  estado.rpcError = { message: 'função indisponível' };

  await assert.rejects(
    () => clienteTemCadastroCompleto('cliente-1'),
    /Não foi possível checar o cadastro fiscal/
  );

  estado.rpcError = null;
});
