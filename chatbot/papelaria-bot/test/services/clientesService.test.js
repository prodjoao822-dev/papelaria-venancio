const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mesmo padrão de orcamentosService.test.js: dublê do cliente do Supabase antes
// de carregar o service, pra inspecionar o payload que iria pro banco.
const caminhoSupabase = require.resolve('../../src/services/supabaseClient');
const upsertsRecebidos = [];

require.cache[caminhoSupabase] = {
  id: caminhoSupabase,
  filename: caminhoSupabase,
  loaded: true,
  exports: {
    from: (tabela) => {
      if (tabela === 'empresa') {
        return {
          select: () => ({ limit: () => ({ single: async () => ({ data: { id: 'empresa-1' }, error: null }) }) }),
        };
      }

      return {
        upsert: (payload, opcoes) => {
          upsertsRecebidos.push({ payload, opcoes });
          return {
            select: () => ({
              single: async () => ({ data: { id: 'cliente-1', ...payload }, error: null }),
            }),
          };
        },
      };
    },
  },
};

const { upsertCliente } = require('../../src/services/clientesService');

function ultimoPayload() {
  return upsertsRecebidos[upsertsRecebidos.length - 1].payload;
}

test('nome do cliente é gravado normalmente quando vem preenchido', async () => {
  await upsertCliente('5527997400510', 'Bruna');

  assert.equal(ultimoPayload().nome, 'Bruna');
});

// --- a correção de 12/08 ---
//
// `upsertCliente` era chamado antes de o webhookController checar `fromMe`. Num
// fromMe o pushName é o da LOJA, mas o telefone é o do CLIENTE — então toda
// resposta manual da loja gravava "Papelaria Venâncio Ga..." por cima do nome do
// cliente (5 clientes distintos assim em 12/08). Como o PostgREST monta o
// ON CONFLICT DO UPDATE a partir das chaves presentes no JSON, mandar
// `nome: null` não seria "não mexer": seria APAGAR o nome existente.

test('nome ausente é omitido do payload, e não enviado como null', async () => {
  await upsertCliente('5527997400510', null);

  const payload = ultimoPayload();
  assert.equal('nome' in payload, false, 'mandar nome:null apagaria o nome já cadastrado');
  assert.equal(payload.telefone, '5527997400510');
});

test('nome vazio também é omitido', async () => {
  await upsertCliente('5527997400510', '');

  assert.equal('nome' in ultimoPayload(), false);
});

test('o telefone segue sendo a chave de conflito, junto da empresa', async () => {
  await upsertCliente('5527997400510', 'Bruna');

  const { opcoes, payload } = upsertsRecebidos[upsertsRecebidos.length - 1];
  assert.equal(opcoes.onConflict, 'empresa_id,telefone');
  assert.equal(payload.empresa_id, 'empresa-1');
});
