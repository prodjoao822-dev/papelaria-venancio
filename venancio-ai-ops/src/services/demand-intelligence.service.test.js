// Testes de demand-intelligence.service.js (tela Demanda — inteligência de
// demanda agregada, NÃO confundir com RF-03/tarefas agendadas). Foco no
// cálculo de percentuais (sem_estoque_pct/converteu_pct — divisão por zero
// tem que dar 0, não NaN/Infinity) e nos pontos que engolem erro de propósito
// (contarAlertasNovos/registrarConsulta são badge/telemetria, não podem
// travar a tela).
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { demandIntelligenceService } from './demand-intelligence.service'

const METODOS_CHAIN = ['select', 'order', 'limit', 'eq', 'gte', 'insert', 'update']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

describe('topDemanda', () => {
  test('calcula sem_estoque_pct/converteu_pct arredondados', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ produto_nome: 'Caderno', produto_id: 'p1', total_consultas: 8, sem_estoque_count: 2, converteu_count: 6 }],
      error: null,
    })

    const [resultado] = await demandIntelligenceService.topDemanda()

    expect(resultado.sem_estoque_pct).toBe(25)
    expect(resultado.converteu_pct).toBe(75)
  })

  test('total_consultas=0 não gera NaN/Infinity — os percentuais viram 0', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ produto_nome: 'X', produto_id: 'p1', total_consultas: 0, sem_estoque_count: 0, converteu_count: 0 }],
      error: null,
    })

    const [resultado] = await demandIntelligenceService.topDemanda()

    expect(resultado.sem_estoque_pct).toBe(0)
    expect(resultado.converteu_pct).toBe(0)
  })

  test('repassa dias/limite pra RPC get_top_demanda com os defaults documentados', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })

    await demandIntelligenceService.topDemanda()

    expect(supabase.rpc).toHaveBeenCalledWith('get_top_demanda', { p_dias: 7, p_limit: 10 })
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('função indisponível') })

    await expect(demandIntelligenceService.topDemanda()).rejects.toThrow('função indisponível')
  })
})

describe('oportunidadesPerdidas', () => {
  test('nunca inventa receita_estimada — sempre 0', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ produto_nome: 'X', total: 5 }], error: null })

    const [resultado] = await demandIntelligenceService.oportunidadesPerdidas()

    expect(resultado.receita_estimada).toBe(0)
    expect(resultado.total_consultas).toBe(5)
  })

  test('repassa dias/limite pra RPC get_oportunidades_perdidas com os defaults', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })

    await demandIntelligenceService.oportunidadesPerdidas()

    expect(supabase.rpc).toHaveBeenCalledWith('get_oportunidades_perdidas', { p_dias: 30, p_limit: 10 })
  })
})

describe('listarAlertas', () => {
  test('status="todos" não aplica eq de status', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'alertas_demanda') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await demandIntelligenceService.listarAlertas('todos')

    expect(c.eq).not.toHaveBeenCalled()
  })

  test('status default "novo" aplica eq', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await demandIntelligenceService.listarAlertas()

    expect(c.eq).toHaveBeenCalledWith('status', 'novo')
  })

  test('achata criado_em em created_at (mantendo o resto do alerta)', async () => {
    supabase.from.mockImplementation(() => chain({ data: [{ id: 'al1', criado_em: '2026-09-01T00:00:00Z' }], error: null }))

    const [alerta] = await demandIntelligenceService.listarAlertas()

    expect(alerta.created_at).toBe('2026-09-01T00:00:00Z')
    expect(alerta.id).toBe('al1')
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(demandIntelligenceService.listarAlertas()).rejects.toThrow('timeout')
  })
})

describe('contarAlertasNovos', () => {
  test('sucesso: conta status=novo', async () => {
    const c = chain({ count: 3, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'alertas_demanda') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    expect(await demandIntelligenceService.contarAlertasNovos()).toBe(3)
  })

  test('erro do banco nunca é lançado — badge devolve 0 silenciosamente', async () => {
    supabase.from.mockImplementation(() => chain({ count: null, error: new Error('timeout') }))

    await expect(demandIntelligenceService.contarAlertasNovos()).resolves.toBe(0)
  })

  test('exceção síncrona (ex.: supabase.from lançando) também devolve 0', async () => {
    supabase.from.mockImplementation(() => { throw new Error('cliente indisponível') })

    await expect(demandIntelligenceService.contarAlertasNovos()).resolves.toBe(0)
  })
})

describe('marcarVisto / marcarResolvido', () => {
  test('marcarVisto grava status=visto pelo id', async () => {
    const c = chain({ error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'alertas_demanda') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await demandIntelligenceService.marcarVisto('al1')

    expect(c.update).toHaveBeenCalledWith({ status: 'visto' })
    expect(c.eq).toHaveBeenCalledWith('id', 'al1')
  })

  test('marcarResolvido grava status=resolvido pelo id', async () => {
    const c = chain({ error: null })
    supabase.from.mockImplementation(() => c)

    await demandIntelligenceService.marcarResolvido('al1')

    expect(c.update).toHaveBeenCalledWith({ status: 'resolvido' })
  })

  test('erro do banco é propagado (aqui não é side-channel)', async () => {
    supabase.from.mockImplementation(() => chain({ error: new Error('não encontrado') }))

    await expect(demandIntelligenceService.marcarVisto('al-invalido')).rejects.toThrow('não encontrado')
  })
})

describe('buscarConfig / atualizarConfig', () => {
  test('buscarConfig sempre busca a linha "global"', async () => {
    const c = chain({ data: { nome: 'global', limite_consultas: 5 }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'config_alerta_demanda') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await demandIntelligenceService.buscarConfig()

    expect(c.eq).toHaveBeenCalledWith('nome', 'global')
  })

  test('atualizarConfig grava só os 3 campos suportados, mesmo se vier lixo extra', async () => {
    const c = chain({ data: { nome: 'global' }, error: null })
    supabase.from.mockImplementation(() => c)

    await demandIntelligenceService.atualizarConfig({
      limite_consultas: 10,
      janela_horas: 24,
      canal_alerta: 'whatsapp',
      campo_nao_suportado: 'x',
    })

    expect(c.update).toHaveBeenCalledWith({ limite_consultas: 10, janela_horas: 24, canal_alerta: 'whatsapp' })
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('config não encontrada') }))

    await expect(demandIntelligenceService.buscarConfig()).rejects.toThrow('config não encontrada')
  })
})

describe('registrarConsulta', () => {
  test('usa os defaults documentados (origem=dashboard, resultado=nao_encontrado)', async () => {
    const c = chain({ data: { id: 'cd1' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_demanda') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await demandIntelligenceService.registrarConsulta({ produto_nome: 'Caderno' })

    expect(c.insert).toHaveBeenCalledWith({
      produto_nome: 'Caderno',
      produto_id: null,
      memoria_produto_id: null,
      cliente_id: null,
      conversa_id: null,
      origem: 'dashboard',
      resultado: 'nao_encontrado',
    })
  })

  test('erro do banco nunca é lançado — telemetria devolve null', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('constraint falhou') }))

    await expect(demandIntelligenceService.registrarConsulta({ produto_nome: 'X' })).resolves.toBeNull()
  })
})

describe('resumo', () => {
  test('conta cada categoria de resultado + convertidos, filtrando pela janela de dias', async () => {
    const c = chain({
      data: [
        { resultado: 'respondido_ia', converteu: true },
        { resultado: 'consultou_operador', converteu: false },
        { resultado: 'nao_encontrado', converteu: false },
        { resultado: 'sem_estoque', converteu: false },
        { resultado: 'sem_estoque', converteu: true },
      ],
      error: null,
    })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'consultas_demanda') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resumo = await demandIntelligenceService.resumo(7)

    expect(resumo).toEqual({
      total: 5,
      respondidos: 1,
      consultados: 1,
      nao_encontrados: 1,
      sem_estoque: 2,
      convertidos: 2,
    })
    expect(c.gte).toHaveBeenCalledWith('criado_em', expect.any(String))
  })

  test('sem nenhuma consulta na janela, todos os contadores ficam 0 (não undefined)', async () => {
    supabase.from.mockImplementation(() => chain({ data: [], error: null }))

    const resumo = await demandIntelligenceService.resumo()

    expect(resumo).toEqual({ total: 0, respondidos: 0, consultados: 0, nao_encontrados: 0, sem_estoque: 0, convertidos: 0 })
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(demandIntelligenceService.resumo()).rejects.toThrow('timeout')
  })
})
