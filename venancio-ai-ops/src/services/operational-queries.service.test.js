// Testes de operational-queries.service.js (tela Consultas IA) — foco na
// tradução de vocabulário JS↔banco (normalizar/STATUS_*_PARA_*, ponto mais
// fácil de quebrar silenciosamente) e nas transições que exigem status atual
// específico (atribuir só a partir de "pendente", responder só a partir de
// "pendente"/"atribuida" — dupla condição no .eq/.in, não só no WHERE id).
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/supabase/client', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}))

import { supabase } from '@/supabase/client'
import { operationalQueriesService } from './operational-queries.service'

const METODOS_CHAIN = ['select', 'order', 'limit', 'eq', 'in', 'gte', 'insert', 'update', 'delete']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

function consultaRow(overrides = {}) {
  return {
    id: 'cq1',
    produto_nome: 'Caderno',
    tipo_duvida: 'estoque',
    contexto: 'cliente perguntou no chat',
    status: 'pendente',
    prioridade: 'normal',
    expira_em: '2026-09-01T12:00:00Z',
    criado_em: '2026-09-01T10:00:00Z',
    resposta: null,
    respondida_por_operador: null,
    clientes: { id: 'cli1', nome: 'Fulano' },
    ...overrides,
  }
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.auth.getSession.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizar (via listar)', () => {
  test('traduz status real pendente/atribuida/respondida/expirada pro vocabulário JS antigo', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_operacionais') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({
        data: [
          consultaRow({ id: '1', status: 'pendente' }),
          consultaRow({ id: '2', status: 'atribuida' }),
          consultaRow({ id: '3', status: 'respondida' }),
          consultaRow({ id: '4', status: 'expirada' }),
        ],
        error: null,
      })
    })

    const resultado = await operationalQueriesService.listar()

    expect(resultado.map((r) => r.status)).toEqual(['pending', 'assigned', 'answered', 'expired'])
  })

  test('achata produto_nome/tipo_duvida/expira_em/criado_em pro vocabulário antigo (product_name/query_type/timeout_at/created_at)', async () => {
    supabase.from.mockImplementation(() => chain({ data: [consultaRow()], error: null }))

    const [consulta] = await operationalQueriesService.listar()

    expect(consulta).toMatchObject({
      product_name: 'Caderno',
      query_type: 'estoque',
      timeout_at: '2026-09-01T12:00:00Z',
      created_at: '2026-09-01T10:00:00Z',
    })
  })

  test('respondida_por_operador vira o nome direto em responded_by (null se não houver)', async () => {
    supabase.from.mockImplementation(() => chain({
      data: [consultaRow({ respondida_por_operador: { nome: 'Ana' } })],
      error: null,
    }))

    const [consulta] = await operationalQueriesService.listar()

    expect(consulta.responded_by).toBe('Ana')
  })
})

describe('listar', () => {
  test('filtros.status="todos" não aplica eq de status', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await operationalQueriesService.listar({ status: 'todos' })

    expect(c.eq).not.toHaveBeenCalledWith('status', expect.anything())
  })

  test('filtros.status traduz do vocabulário JS pro real antes do eq', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await operationalQueriesService.listar({ status: 'assigned' })

    expect(c.eq).toHaveBeenCalledWith('status', 'atribuida')
  })

  test('limite default 100, sobrescrevível por filtros.limite', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await operationalQueriesService.listar()
    expect(c.limit).toHaveBeenCalledWith(100)

    c.limit.mockClear()
    await operationalQueriesService.listar({ limite: 20 })
    expect(c.limit).toHaveBeenCalledWith(20)
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(operationalQueriesService.listar()).rejects.toThrow('timeout')
  })
})

describe('buscarPendentes', () => {
  test('filtra sempre por pendente/atribuida, nunca respondida/expirada', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_operacionais') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await operationalQueriesService.buscarPendentes()

    expect(c.in).toHaveBeenCalledWith('status', ['pendente', 'atribuida'])
  })
})

describe('criar', () => {
  test('usa os defaults documentados (tipo_duvida=estoque, prioridade=normal)', async () => {
    const c = chain({ data: consultaRow(), error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_operacionais') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await operationalQueriesService.criar({ product_name: 'Caderno' })

    expect(c.insert).toHaveBeenCalledWith(expect.objectContaining({
      produto_nome: 'Caderno',
      tipo_duvida: 'estoque',
      prioridade: 'normal',
      cliente_id: null,
      conversa_id: null,
      contexto: null,
    }))
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('cliente inválido') }))

    await expect(operationalQueriesService.criar({ product_name: 'X' })).rejects.toThrow('cliente inválido')
  })
})

describe('atribuir', () => {
  test('só atualiza se o status atual for pendente (dupla condição id + status no WHERE)', async () => {
    const c = chain({ data: consultaRow({ status: 'atribuida' }), error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_operacionais') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await operationalQueriesService.atribuir('cq1', 'op1')

    expect(c.update).toHaveBeenCalledWith({ atribuido_a: 'op1', status: 'atribuida' })
    expect(c.eq).toHaveBeenCalledWith('id', 'cq1')
    expect(c.eq).toHaveBeenCalledWith('status', 'pendente')
  })

  test('erro (ex.: já estava atribuída, 0 linhas afetadas via single()) é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('nenhuma linha encontrada') }))

    await expect(operationalQueriesService.atribuir('cq1', 'op1')).rejects.toThrow('nenhuma linha encontrada')
  })
})

describe('responder', () => {
  test('permite responder tanto pendente quanto atribuida (in, não eq)', async () => {
    const c = chain({ data: consultaRow({ status: 'respondida' }), error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_operacionais') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await operationalQueriesService.responder('cq1', 'Tem sim, R$15', 'op1')

    expect(c.update).toHaveBeenCalledWith({ status: 'respondida', resposta: 'Tem sim, R$15', respondido_por: 'op1' })
    expect(c.in).toHaveBeenCalledWith('status', ['pendente', 'atribuida'])
  })

  test('erro (ex.: já expirada) é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('consulta expirada') }))

    await expect(operationalQueriesService.responder('cq1', 'x', 'op1')).rejects.toThrow('consulta expirada')
  })
})

describe('notificarCliente', () => {
  test('sem sessão ativa, não chega a chamar fetch', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    await expect(operationalQueriesService.notificarCliente('cq1')).rejects.toThrow(
      'Sessão expirada. Faça login novamente.'
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  test('sucesso: manda Bearer pro endpoint certo com o id da consulta', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } })

    await operationalQueriesService.notificarCliente('cq1')

    const [url, opcoes] = fetch.mock.calls[0]
    expect(url).toMatch(/\/operador\/consultas\/cq1\/notificar$/)
    expect(opcoes.headers.Authorization).toBe('Bearer tok123')
  })

  test('resposta de erro do bot vira exceção com a mensagem do corpo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, erro: 'WhatsApp offline' }) })

    await expect(operationalQueriesService.notificarCliente('cq1')).rejects.toThrow('WhatsApp offline')
  })
})

describe('expirarManual', () => {
  test('grava status=expirada pelo id', async () => {
    const c = chain({ data: consultaRow({ status: 'expirada' }), error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_operacionais') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await operationalQueriesService.expirarManual('cq1')

    expect(c.update).toHaveBeenCalledWith({ status: 'expirada' })
    expect(resultado.status).toBe('expired')
  })
})

describe('apagar', () => {
  test('deleta pelo id (RLS decide se o operador pode)', async () => {
    const c = chain({ error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_operacionais') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await operationalQueriesService.apagar('cq1')

    expect(c.delete).toHaveBeenCalled()
    expect(c.eq).toHaveBeenCalledWith('id', 'cq1')
  })

  test('erro do RLS (operador comum tentando apagar) é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ error: new Error('permissão negada pela política admin_exclusao') }))

    await expect(operationalQueriesService.apagar('cq1')).rejects.toThrow('permissão negada pela política admin_exclusao')
  })
})

describe('contarPendentes', () => {
  test('conta pendente + atribuida juntos', async () => {
    const c = chain({ count: 7, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_operacionais') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    expect(await operationalQueriesService.contarPendentes()).toBe(7)
    expect(c.in).toHaveBeenCalledWith('status', ['pendente', 'atribuida'])
  })

  test('count null vira 0', async () => {
    supabase.from.mockImplementation(() => chain({ count: null, error: null }))

    expect(await operationalQueriesService.contarPendentes()).toBe(0)
  })
})
