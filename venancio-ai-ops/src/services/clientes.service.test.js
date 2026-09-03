// Testes de clientes.service.js — cadastro/busca de cliente, usado em quase
// todo fluxo de criação de pedido/orçamento. Foco em enriquecerCliente
// (cálculo de total_gasto/ticket_médio, que é dinheiro) e no fallback
// listarCrm → listar (a view v_clientes_crm pode não existir/RLS bloquear).
// Mesmo dublê de supabase usado nos outros *.service.test.js do projeto.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { clientesService } from './clientes.service'

const METODOS_CHAIN = ['select', 'order', 'limit', 'eq', 'or', 'insert', 'update']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.maybeSingle = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

function clienteRow(overrides = {}) {
  return {
    id: 'cli1',
    nome: 'Fulano',
    telefone: '2799999999',
    pedidos: [],
    orcamentos: [],
    ...overrides,
  }
}

beforeEach(() => {
  supabase.from.mockReset()
})

describe('listar', () => {
  test('sem filtros, não aplica or/eq extra e enriquece cada cliente', async () => {
    const c = chain({ data: [clienteRow()], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'clientes') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await clientesService.listar()

    expect(c.or).not.toHaveBeenCalled()
    expect(c.eq).not.toHaveBeenCalled()
    expect(resultado[0]).toMatchObject({ id: 'cli1', total_gasto: 0, qtd_pedidos: 0 })
  })

  test('filtros.busca aplica or em nome/telefone; filtros.status aplica eq', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await clientesService.listar({ busca: 'Fulano', status: 'ativo' })

    expect(c.or).toHaveBeenCalledWith('nome.ilike.%Fulano%,telefone.ilike.%Fulano%')
    expect(c.eq).toHaveBeenCalledWith('status', 'ativo')
  })

  test('data null não quebra — devolve lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    const resultado = await clientesService.listar()

    expect(resultado).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(clientesService.listar()).rejects.toThrow('timeout')
  })
})

describe('listarCrm', () => {
  test('sucesso: consulta v_clientes_crm ordenado por total_gasto, sem passar por listar()', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'v_clientes_crm') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: [{ id: 'cli1', total_gasto: 500 }], error: null })
    })

    const resultado = await clientesService.listarCrm()

    expect(resultado).toEqual([{ id: 'cli1', total_gasto: 500 }])
  })

  test('erro na view (ex.: view não existe) cai no fallback listar() em vez de propagar', async () => {
    let chamada = 0
    supabase.from.mockImplementation((tabela) => {
      chamada += 1
      if (chamada === 1) {
        if (tabela !== 'v_clientes_crm') throw new Error(`tabela inesperada: ${tabela}`)
        return chain({ data: null, error: new Error('relation v_clientes_crm does not exist') })
      }
      if (tabela !== 'clientes') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: [clienteRow()], error: null })
    })

    const resultado = await clientesService.listarCrm()

    expect(resultado[0].id).toBe('cli1')
    expect(resultado[0]).toHaveProperty('total_gasto')
  })

  test('repassa busca/status também no fallback', async () => {
    let chamada = 0
    const clientesChain = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      chamada += 1
      if (chamada === 1) return chain({ data: null, error: new Error('falhou') })
      return clientesChain
    })

    await clientesService.listarCrm({ busca: 'Ciclano' })

    expect(clientesChain.or).toHaveBeenCalledWith('nome.ilike.%Ciclano%,telefone.ilike.%Ciclano%')
  })
})

describe('buscarPorTelefone', () => {
  test('usa maybeSingle — telefone sem cliente devolve null, não erro', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'clientes') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: null, error: null })
    })

    const resultado = await clientesService.buscarPorTelefone('2799999999')

    expect(resultado).toBeNull()
  })

  // Bug real (02/09/2026): cliente cadastrado manualmente com telefone
  // mascarado ("+55 (27) 99999-9999") não batia por igualdade exata com o
  // telefone já normalizado de um cliente vindo do WhatsApp — resultava em
  // cliente duplicado e, no caso do envio de PDF, número rejeitado pela
  // Evolution API. buscarPorTelefone agora normaliza antes do .eq().
  test('normaliza o telefone (tira máscara, garante DDI) antes de comparar', async () => {
    const c = chain({ data: null, error: null })
    supabase.from.mockImplementation(() => c)

    await clientesService.buscarPorTelefone('+55 (27) 99999-9999')

    expect(c.eq).toHaveBeenCalledWith('telefone', '5527999999999')
  })

  test('telefone sem DDI (só DDD + número) é buscado já com o 55 na frente', async () => {
    const c = chain({ data: null, error: null })
    supabase.from.mockImplementation(() => c)

    await clientesService.buscarPorTelefone('27999999999')

    expect(c.eq).toHaveBeenCalledWith('telefone', '5527999999999')
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('conexão caiu') }))

    await expect(clientesService.buscarPorTelefone('2799999999')).rejects.toThrow('conexão caiu')
  })
})

describe('buscarPorId', () => {
  test('ordena pedidos e orçamentos por criado_em desc e enriquece o cliente', async () => {
    const c = chain({
      data: clienteRow({
        pedidos: [
          { id: 'p1', status: 'concluido', valor_total: 100, criado_em: '2026-08-01T00:00:00Z' },
          { id: 'p2', status: 'em_separacao', valor_total: 50, criado_em: '2026-08-05T00:00:00Z' },
        ],
      }),
      error: null,
    })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'clientes') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await clientesService.buscarPorId('cli1')

    expect(c.order).toHaveBeenCalledWith('criado_em', { referencedTable: 'pedidos', ascending: false })
    expect(c.order).toHaveBeenCalledWith('criado_em', { referencedTable: 'orcamentos', ascending: false })
    expect(resultado.total_gasto).toBe(100)
    expect(resultado.qtd_pedidos).toBe(2)
    expect(resultado.qtd_finalizados).toBe(1)
    expect(resultado.ultimo_pedido_em).toBe('2026-08-05T00:00:00Z')
    expect(resultado.ultima_compra_em).toBe('2026-08-01T00:00:00Z')
  })

  test('erro do banco (ex.: id inexistente) é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('cliente não encontrado') }))

    await expect(clientesService.buscarPorId('cli-invalido')).rejects.toThrow('cliente não encontrado')
  })
})

describe('criarOuAtualizar', () => {
  test('telefone já cadastrado: faz UPDATE no cliente existente, não INSERT', async () => {
    let chamada = 0
    const updateChain = chain({ data: { id: 'cli1', nome: 'Fulano Atualizado' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'clientes') throw new Error(`tabela inesperada: ${tabela}`)
      chamada += 1
      if (chamada === 1) return chain({ data: clienteRow(), error: null }) // buscarPorTelefone
      return updateChain
    })

    const resultado = await clientesService.criarOuAtualizar('2799999999', { nome: 'Fulano Atualizado' })

    expect(updateChain.update).toHaveBeenCalledWith({ nome: 'Fulano Atualizado' })
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'cli1')
    expect(resultado.nome).toBe('Fulano Atualizado')
  })

  test('telefone novo: faz INSERT com o telefone normalizado (DDI garantido) + dados extras', async () => {
    let chamada = 0
    const insertChain = chain({ data: { id: 'cli-novo' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      chamada += 1
      if (chamada === 1) return chain({ data: null, error: null }) // buscarPorTelefone: não achou
      return insertChain
    })

    await clientesService.criarOuAtualizar('2788888888', { nome: 'Novo Cliente', origem: 'bot' })

    expect(insertChain.insert).toHaveBeenCalledWith({ telefone: '552788888888', nome: 'Novo Cliente', origem: 'bot' })
  })

  // Mesmo bug de buscarPorTelefone: telefone digitado com máscara no
  // NovoOrcamentoModal/NovoPedidoModal precisa ser salvo já normalizado, ou o
  // cliente cadastrado assim nunca vai casar com o telefone real do WhatsApp
  // (nem vai dar pra mandar PDF pela Evolution API depois).
  test('telefone com máscara é normalizado antes do INSERT', async () => {
    let chamada = 0
    const insertChain = chain({ data: { id: 'cli-novo' }, error: null })
    supabase.from.mockImplementation(() => {
      chamada += 1
      if (chamada === 1) return chain({ data: null, error: null })
      return insertChain
    })

    await clientesService.criarOuAtualizar('+55 (27) 98888-8888', { nome: 'Novo Cliente', origem: 'manual' })

    expect(insertChain.insert).toHaveBeenCalledWith({
      telefone: '5527988888888',
      nome: 'Novo Cliente',
      origem: 'manual',
    })
  })

  test('erro no UPDATE do cliente existente é propagado', async () => {
    let chamada = 0
    supabase.from.mockImplementation(() => {
      chamada += 1
      if (chamada === 1) return chain({ data: clienteRow(), error: null })
      return chain({ data: null, error: new Error('violação de constraint') })
    })

    await expect(
      clientesService.criarOuAtualizar('2799999999', { nome: 'X' })
    ).rejects.toThrow('violação de constraint')
  })

  test('erro no INSERT de cliente novo é propagado', async () => {
    let chamada = 0
    supabase.from.mockImplementation(() => {
      chamada += 1
      if (chamada === 1) return chain({ data: null, error: null })
      return chain({ data: null, error: new Error('origem inválida') })
    })

    await expect(
      clientesService.criarOuAtualizar('2788888888', { nome: 'X', origem: 'origem-invalida' })
    ).rejects.toThrow('origem inválida')
  })
})

describe('atualizar', () => {
  test('grava os dados exatos no cliente pelo id', async () => {
    const c = chain({ data: { id: 'cli1', nome: 'Fulano Editado' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'clientes') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await clientesService.atualizar('cli1', { nome: 'Fulano Editado' })

    expect(c.update).toHaveBeenCalledWith({ nome: 'Fulano Editado' })
    expect(c.eq).toHaveBeenCalledWith('id', 'cli1')
    expect(resultado.nome).toBe('Fulano Editado')
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('cliente não encontrado') }))

    await expect(clientesService.atualizar('cli-invalido', { nome: 'X' })).rejects.toThrow('cliente não encontrado')
  })
})

describe('enriquecerCliente (via buscarPorId)', () => {
  test('cliente sem nenhum pedido: total_gasto/ticket_medio zerados, datas nulas', async () => {
    supabase.from.mockImplementation(() => chain({ data: clienteRow({ pedidos: [], orcamentos: [] }), error: null }))

    const resultado = await clientesService.buscarPorId('cli1')

    expect(resultado.total_gasto).toBe(0)
    expect(resultado.ticket_medio).toBe(0)
    expect(resultado.ultima_compra_em).toBeNull()
    expect(resultado.ultimo_pedido_em).toBeNull()
  })

  test('pedidos concluídos sem valor_total (null) não quebram a soma — tratado como 0', async () => {
    supabase.from.mockImplementation(() => chain({
      data: clienteRow({
        pedidos: [{ id: 'p1', status: 'concluido', valor_total: null, criado_em: '2026-08-01T00:00:00Z' }],
      }),
      error: null,
    }))

    const resultado = await clientesService.buscarPorId('cli1')

    expect(resultado.total_gasto).toBe(0)
    expect(resultado.ticket_medio).toBe(0)
  })

  test('ticket_medio é arredondado em 2 casas decimais', async () => {
    supabase.from.mockImplementation(() => chain({
      data: clienteRow({
        pedidos: [
          { id: 'p1', status: 'concluido', valor_total: 10, criado_em: '2026-08-01T00:00:00Z' },
          { id: 'p2', status: 'concluido', valor_total: 10, criado_em: '2026-08-02T00:00:00Z' },
          { id: 'p3', status: 'concluido', valor_total: 10.01, criado_em: '2026-08-03T00:00:00Z' },
        ],
      }),
      error: null,
    }))

    const resultado = await clientesService.buscarPorId('cli1')

    expect(resultado.total_gasto).toBeCloseTo(30.01, 2)
    expect(resultado.ticket_medio).toBeCloseTo(10, 2)
  })
})
