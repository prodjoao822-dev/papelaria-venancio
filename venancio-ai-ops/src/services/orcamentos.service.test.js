// Testes de orcamentos.service.js — foco nas áreas sensíveis (T4.2, plano de
// 26-08): mudança de status (rascunho→enviado→aceito/recusado), o nascimento
// do pedido a partir do orçamento (aceitar) e a edição de preço unitário
// (atualizarPrecoItem — dinheiro puro).
//
// Mesmo dublê de supabase usado em pedidos.service.test.js. `fetch` é sempre
// mockado globalmente: notificarN8n() e enviarPdf() chamam fetch de verdade,
// e o .env real deste projeto tem VITE_N8N_WEBHOOK_BASE/VITE_BOT_API_URL
// apontando pra infra real — sem o stub, o teste sairia da caixinha.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } },
}))

import { supabase } from '@/supabase/client'
import { orcamentosService } from './orcamentos.service'
import { prepararDuplicacaoOrcamento } from '@/utils/rascunhoOrcamento'

const METODOS_CHAIN = [
  'select', 'order', 'limit', 'eq', 'in', 'not', 'gte', 'lt', 'lte',
  'ilike', 'or', 'is', 'update', 'insert', 'delete',
]

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

function orcamentoRow(overrides = {}) {
  return {
    id: 'orc1',
    status: 'rascunho',
    cliente_id: 'cli1',
    tipo: 'venda_geral',
    clientes: { id: 'cli1', nome: 'Fulano', telefone: '2799999999' },
    pedidos: null,
    itens_orcamento: [],
    ...overrides,
  }
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
  supabase.auth.getSession.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('criar', () => {
  test('insere o orçamento e os itens, e devolve o orçamento completo (buscarPorId)', async () => {
    let chamada = 0
    const insertChain = chain({ error: null })
    supabase.from.mockImplementation((tabela) => {
      chamada += 1
      if (tabela === 'orcamentos' && chamada === 1) {
        return chain({ data: { id: 'orc1' }, error: null })
      }
      if (tabela === 'itens_orcamento') {
        return insertChain
      }
      if (tabela === 'orcamentos') {
        return chain({ data: orcamentoRow(), error: null })
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    })

    const resultado = await orcamentosService.criar({
      cliente_id: 'cli1',
      tipo: 'venda_geral',
      itens: [{ produto_id: 'prod1', quantidade: 2, valor_unitario: 15 }],
    })

    expect(insertChain.insert).toHaveBeenCalledWith([
      { orcamento_id: 'orc1', produto_id: 'prod1', descricao_livre: null, quantidade: 2, valor_unitario: 15 },
    ])
    expect(resultado.id).toBe('orc1')
  })

  test('sem itens, não toca na tabela itens_orcamento', async () => {
    const tabelasConsultadas = []
    supabase.from.mockImplementation((tabela) => {
      tabelasConsultadas.push(tabela)
      if (tabela === 'orcamentos' && tabelasConsultadas.filter((t) => t === 'orcamentos').length === 1) {
        return chain({ data: { id: 'orc1' }, error: null })
      }
      return chain({ data: orcamentoRow(), error: null })
    })

    await orcamentosService.criar({ cliente_id: 'cli1', itens: [] })

    expect(tabelasConsultadas).not.toContain('itens_orcamento')
  })

  test('erro ao inserir o orçamento é propagado e não tenta inserir itens', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'orcamentos') return chain({ data: null, error: new Error('cliente inválido') })
      throw new Error(`não deveria consultar ${tabela}`)
    })

    await expect(
      orcamentosService.criar({ cliente_id: 'cli-invalido', itens: [{ quantidade: 1, valor_unitario: 1 }] })
    ).rejects.toThrow('cliente inválido')
  })
})

// Duplicar Orçamento (dashboard) reaproveita orcamentosService.criar() sem
// nenhum código especial — o teste aqui é da integração completa do fluxo:
// orçamento original → prepararDuplicacaoOrcamento() → operador troca o
// cliente → criar() grava uma linha 100% nova, sem NENHUMA referência (id,
// orcamento_id, cliente_id) ao orçamento de origem.
describe('duplicar orçamento (prepararDuplicacaoOrcamento + criar)', () => {
  test('a duplicata criada é um orçamento novo e independente — nenhuma referência ao original', async () => {
    const original = orcamentoRow({
      id: 'orc-original',
      protocolo: 'ORC-0001',
      cliente_id: 'cli-original',
      observacoes: 'Pacote de material da 4ª série',
      itens_orcamento: [
        { id: 'item-original-1', nome_item: 'Caderno 10 matérias', quantidade: 2, valor_unitario: 25.9, produto_id: 'prod1' },
      ],
    })

    const dadosDuplicados = prepararDuplicacaoOrcamento(original)
    // Operador troca o cliente — esse é o único preenchimento manual exigido.
    dadosDuplicados.cliente = { nome: 'Outro Cliente', telefone: '11977776666' }

    let chamada = 0
    const insertItensChain = chain({ error: null })
    const insertOrcamentoChain = chain({ data: { id: 'orc-nova-duplicata' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      chamada += 1
      if (tabela === 'orcamentos' && chamada === 1) return insertOrcamentoChain
      if (tabela === 'itens_orcamento') return insertItensChain
      if (tabela === 'orcamentos') {
        return chain({
          data: orcamentoRow({ id: 'orc-nova-duplicata', cliente_id: 'cli-novo', observacoes: dadosDuplicados.observacoes }),
          error: null,
        })
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    })

    const novaDuplicata = await orcamentosService.criar({
      cliente_id: 'cli-novo',
      tipo: 'venda_geral',
      status: dadosDuplicados.status,
      observacoes: dadosDuplicados.observacoes,
      itens: dadosDuplicados.itens.map((i) => ({
        produto_id: i.produto_id,
        descricao_livre: i.descricao_livre,
        quantidade: i.quantidade,
        valor_unitario: parseFloat(i.valor_unitario),
      })),
    })

    // Insert do orçamento novo não carrega id/protocolo do original.
    expect(insertOrcamentoChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: 'cli-novo' })
    )
    const argsInsertOrcamento = insertOrcamentoChain.insert.mock.calls[0][0]
    expect(argsInsertOrcamento).not.toHaveProperty('id')
    expect(JSON.stringify(argsInsertOrcamento)).not.toContain('orc-original')

    // Itens são inseridos vinculados ao ID NOVO, não ao original — e sem o
    // id do item original (item-original-1), prova de que é uma cópia real.
    expect(insertItensChain.insert).toHaveBeenCalledWith([
      { orcamento_id: 'orc-nova-duplicata', produto_id: 'prod1', descricao_livre: 'Caderno 10 matérias', quantidade: 2, valor_unitario: 25.9 },
    ])
    expect(JSON.stringify(insertItensChain.insert.mock.calls[0][0])).not.toContain('item-original-1')
    expect(JSON.stringify(insertItensChain.insert.mock.calls[0][0])).not.toContain('orc-original')

    expect(novaDuplicata.id).toBe('orc-nova-duplicata')
    expect(novaDuplicata.id).not.toBe(original.id)
  })
})

describe('atualizarStatus', () => {
  test.each([
    ['enviado', 'ORCAMENTO_CRIADO'],
    ['aceito', 'ORCAMENTO_APROVADO'],
    ['recusado', 'ORCAMENTO_RECUSADO'],
  ])('status "%s" dispara o evento n8n "%s"', async (novoStatus, eventoEsperado) => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    supabase.from.mockImplementation(() => chain({ data: orcamentoRow({ status: novoStatus }), error: null }))

    await orcamentosService.atualizarStatus('orc1', novoStatus, 'op1', 'obs')

    expect(supabase.rpc).toHaveBeenCalledWith('atualizar_status_orcamento_dashboard', {
      p_orcamento_id: 'orc1',
      p_novo_status: novoStatus,
      p_operador_id: 'op1',
      p_observacao: 'obs',
    })
    const corpo = JSON.parse(fetch.mock.calls[0][1].body)
    expect(corpo.evento).toBe(eventoEsperado)
  })

  test('status "expirado" não dispara nenhum evento n8n', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    supabase.from.mockImplementation(() => chain({ data: orcamentoRow({ status: 'expirado' }), error: null }))

    await orcamentosService.atualizarStatus('orc1', 'expirado')

    expect(fetch).not.toHaveBeenCalled()
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('transição inválida') })

    await expect(orcamentosService.atualizarStatus('orc1', 'aceito')).rejects.toThrow('transição inválida')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('aceitar', () => {
  test('chama aceitar_orcamento_dashboard e avisa o n8n com orcamentoId + pedidoId', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'ped1', protocolo: 'PED-001' }, error: null })

    const pedido = await orcamentosService.aceitar('orc1', 'op1')

    expect(supabase.rpc).toHaveBeenCalledWith('aceitar_orcamento_dashboard', {
      p_orcamento_id: 'orc1',
      p_operador_id: 'op1',
    })
    expect(pedido.id).toBe('ped1')
    const corpo = JSON.parse(fetch.mock.calls[0][1].body)
    expect(corpo).toMatchObject({ evento: 'ORCAMENTO_CONVERTIDO', orcamentoId: 'orc1', pedidoId: 'ped1' })
  })

  test('erro da RPC (ex.: orçamento já aceito) é propagado, sem notificar o n8n', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('orçamento não está em rascunho') })

    await expect(orcamentosService.aceitar('orc1')).rejects.toThrow('orçamento não está em rascunho')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('atualizar', () => {
  test('substitui os itens: apaga os antigos e insere os novos, sem tocar em outras colunas se "resto" vier vazio', async () => {
    const deleteChain = chain({ error: null })
    const insertChain = chain({ error: null })
    const tabelas = []
    supabase.from.mockImplementation((tabela) => {
      tabelas.push(tabela)
      if (tabela === 'itens_orcamento' && !insertChain.insert.mock.calls.length && deleteChain.delete.mock.calls.length === 0) {
        return deleteChain
      }
      if (tabela === 'itens_orcamento') return insertChain
      return chain({ data: orcamentoRow(), error: null })
    })

    await orcamentosService.atualizar('orc1', {
      itens: [{ produto_id: 'prod2', quantidade: 3, valor_unitario: 5 }],
    })

    expect(deleteChain.delete).toHaveBeenCalled()
    expect(deleteChain.eq).toHaveBeenCalledWith('orcamento_id', 'orc1')
    expect(insertChain.insert).toHaveBeenCalledWith([
      { orcamento_id: 'orc1', produto_id: 'prod2', descricao_livre: null, quantidade: 3, valor_unitario: 5 },
    ])
    // "resto" (campos fora de itens) veio vazio — não deve haver UPDATE em orcamentos
    expect(tabelas.filter((t) => t === 'orcamentos')).toEqual(['orcamentos'])
  })

  test('itens: [] apaga os itens existentes e não insere nada no lugar', async () => {
    const deleteChain = chain({ error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'itens_orcamento') return deleteChain
      return chain({ data: orcamentoRow(), error: null })
    })

    await orcamentosService.atualizar('orc1', { itens: [] })

    expect(deleteChain.delete).toHaveBeenCalled()
    expect(deleteChain.insert).not.toHaveBeenCalled()
  })

  test('atualiza só campos soltos quando "itens" não é passado', async () => {
    const updateChain = chain({ error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'orcamentos' && updateChain.update.mock.calls.length === 0) return updateChain
      return chain({ data: orcamentoRow(), error: null })
    })

    await orcamentosService.atualizar('orc1', { observacoes: 'Cliente pediu desconto' })

    expect(updateChain.update).toHaveBeenCalledWith({ observacoes: 'Cliente pediu desconto' })
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'orc1')
  })
})

describe('atualizarPrecoItem', () => {
  test('grava o valor_unitario exato recebido no item (valor_total é coluna gerada, recalcula sozinha)', async () => {
    const c = chain({ data: { id: 'item1', valor_unitario: 12.9 }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'itens_orcamento') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await orcamentosService.atualizarPrecoItem('item1', 12.9)

    expect(c.update).toHaveBeenCalledWith({ valor_unitario: 12.9 })
    expect(c.eq).toHaveBeenCalledWith('id', 'item1')
    expect(resultado.valor_unitario).toBe(12.9)
  })

  test('erro do banco é propagado, não engolido', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('item não encontrado') }))

    await expect(orcamentosService.atualizarPrecoItem('item-inexistente', 10)).rejects.toThrow('item não encontrado')
  })
})

describe('listar', () => {
  test('sem filtros, lista os orçamentos mais recentes', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'orcamentos') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: [orcamentoRow()], error: null })
    })

    const resultado = await orcamentosService.listar()

    expect(resultado).toHaveLength(1)
  })

  test('busca por nome/telefone: sem cliente correspondente, devolve lista vazia sem consultar orçamentos', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'clientes') throw new Error(`não deveria consultar ${tabela} sem cliente encontrado`)
      return chain({ data: [], error: null })
    })

    const resultado = await orcamentosService.listar({ busca: 'ninguém com esse nome' })

    expect(resultado).toEqual([])
  })

  test('busca por nome/telefone: filtra orçamentos pelos cliente_id encontrados', async () => {
    const orcamentosChain = chain({ data: [orcamentoRow()], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'clientes') return chain({ data: [{ id: 'cli1' }], error: null })
      if (tabela === 'orcamentos') return orcamentosChain
      throw new Error(`tabela inesperada: ${tabela}`)
    })

    await orcamentosService.listar({ busca: 'Fulano' })

    expect(orcamentosChain.in).toHaveBeenCalledWith('cliente_id', ['cli1'])
  })

  test('erro na query de orçamentos é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(orcamentosService.listar()).rejects.toThrow('timeout')
  })
})

describe('enviarPdf', () => {
  test('sem telefone associado ao orçamento, não chega a chamar fetch', async () => {
    await expect(orcamentosService.enviarPdf(null, 'base64x', 'orc.pdf', 'legenda')).rejects.toThrow(
      'Orçamento sem telefone de cliente associado.'
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  test('sem sessão ativa, não chega a chamar fetch', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    await expect(orcamentosService.enviarPdf('2799999999', 'base64x', 'orc.pdf', 'legenda')).rejects.toThrow(
      'Sessão expirada. Faça login novamente.'
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  test('resposta de erro do bot vira exceção com a mensagem do corpo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } })
    fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, erro: 'Evolution API offline' }) })

    await expect(orcamentosService.enviarPdf('2799999999', 'base64x', 'orc.pdf', 'legenda')).rejects.toThrow(
      'Evolution API offline'
    )
  })

  test('sucesso: manda Authorization Bearer com o token da sessão do operador', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } })
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })

    const resultado = await orcamentosService.enviarPdf('2799999999', 'base64x', 'orc.pdf', 'legenda')

    expect(resultado).toBe(true)
    const [, opcoes] = fetch.mock.calls[0]
    expect(opcoes.headers.Authorization).toBe('Bearer tok123')
  })
})
