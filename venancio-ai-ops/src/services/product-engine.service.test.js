// Testes de product-engine.service.js (Memória IA). Duas frentes: as funções
// puras exportadas (calcularNivelConfianca, extrairPrecoDeTexto,
// extrairDisponibilidadeDeTexto — usadas pra interpretar a resposta digitada
// pelo operador quando confirma disponibilidade/preço de um produto) e o
// wrapper sobre supabase (registrarConsulta nunca deve lançar — é telemetria
// de demanda, não pode quebrar o fluxo de quem chama).
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

import { supabase } from '@/supabase/client'
import {
  productEngineService,
  calcularNivelConfianca,
  extrairPrecoDeTexto,
  extrairDisponibilidadeDeTexto,
} from './product-engine.service'

const METODOS_CHAIN = ['select', 'order', 'eq', 'gte', 'ilike', 'limit', 'insert', 'update', 'delete']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.maybeSingle = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.rpc.mockReset()
})

describe('calcularNivelConfianca', () => {
  test.each([
    [100, 'alta'],
    [75, 'alta'],
    [74, 'media'],
    [45, 'media'],
    [44, 'baixa'],
    [0, 'baixa'],
  ])('score %i → %s', (score, esperado) => {
    expect(calcularNivelConfianca(score)).toBe(esperado)
  })
})

describe('extrairPrecoDeTexto', () => {
  test('extrai preço com vírgula decimal', () => {
    expect(extrairPrecoDeTexto('Tem sim, R$159,90. Temos 3 unidades.')).toBe(159.9)
  })

  test('extrai preço com separador de milhar', () => {
    expect(extrairPrecoDeTexto('Custa R$1.250,00')).toBe(1250)
  })

  test('extrai preço inteiro sem centavos', () => {
    expect(extrairPrecoDeTexto('R$50')).toBe(50)
  })

  test('texto sem preço devolve null', () => {
    expect(extrairPrecoDeTexto('Não temos esse produto')).toBeNull()
  })

  test('texto vazio/null devolve null sem lançar', () => {
    expect(extrairPrecoDeTexto('')).toBeNull()
    expect(extrairPrecoDeTexto(null)).toBeNull()
  })
})

describe('extrairDisponibilidadeDeTexto', () => {
  test.each([
    ['Tem sim, 3 unidades', 'disponivel'],
    ['Temos em estoque', 'disponivel'],
    ['Não tem mais', 'indisponivel'],
    ['Esgotado no momento', 'indisponivel'],
    ['Sem estoque', 'indisponivel'],
  ])('%s → %s', (texto, esperado) => {
    expect(extrairDisponibilidadeDeTexto(texto)).toBe(esperado)
  })

  // BUG REAL encontrado escrevendo este teste (não corrigido — fora do escopo
  // pedido, reportado à parte): a alternativa `sim,` do regex de disponível
  // nunca casa. `\b` exige um caractere de palavra de um dos lados; "sim,"
  // termina em vírgula e é sempre seguida de espaço/pontuação, então o
  // boundary depois da vírgula nunca existe. Resultado: uma resposta do tipo
  // "Sim, chegou agora" (sem a palavra "tem") não é reconhecida como
  // disponível — só funciona hoje porque frases reais quase sempre têm outro
  // gatilho junto (como "tem"/"temos").
  test('"Sim, chegou agora" (sem a palavra "tem") NÃO é reconhecido como disponível — bug de regex, ver comentário acima', () => {
    expect(extrairDisponibilidadeDeTexto('Sim, chegou agora')).toBeNull()
  })

  test('texto ambíguo (nem confirma nem nega) devolve null', () => {
    expect(extrairDisponibilidadeDeTexto('Vou verificar e te aviso')).toBeNull()
  })

  test('texto vazio/null devolve null sem lançar', () => {
    expect(extrairDisponibilidadeDeTexto('')).toBeNull()
    expect(extrairDisponibilidadeDeTexto(null)).toBeNull()
  })

  test('"não tem" tem precedência sobre um "tem" solto na mesma frase', () => {
    // regra real do código: primeiro testa disponível (que já exclui "não tem"),
    // então testa indisponível — "não tem estoque" nunca deveria virar "disponivel"
    expect(extrairDisponibilidadeDeTexto('Não tem, infelizmente')).toBe('indisponivel')
  })
})

describe('buscarProduto', () => {
  test('chama a RPC fuzzy com limite 5 e anexa nivel_confianca a cada resultado', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ id: 'prod1', nome: 'Caderno', confidence_score: 80 }],
      error: null,
    })

    const [produto] = await productEngineService.buscarProduto('caderno')

    expect(supabase.rpc).toHaveBeenCalledWith('buscar_produto_fuzzy', { p_nome: 'caderno', p_limit: 5 })
    expect(produto.nivel_confianca).toBe('alta')
  })

  test('confidence_score ausente usa fallback 50 (media)', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'prod1' }], error: null })

    const [produto] = await productEngineService.buscarProduto('x')

    expect(produto.nivel_confianca).toBe('media')
  })

  test('erro da RPC é propagado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('função indisponível') })

    await expect(productEngineService.buscarProduto('x')).rejects.toThrow('função indisponível')
  })
})

describe('registrarConsulta', () => {
  test('repassa os campos com os defaults documentados (source/resultado)', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'mem1' }, error: null })

    await productEngineService.registrarConsulta({ nome: 'Lápis 2B' })

    expect(supabase.rpc).toHaveBeenCalledWith('registrar_demanda_produto', {
      p_produto_nome: 'Lápis 2B',
      p_produto_id: null,
      p_cliente_id: null,
      p_conversa_id: null,
      p_origem: 'dashboard',
      p_resultado: 'nao_encontrado',
    })
  })

  test('erro da RPC nunca é lançado — é telemetria, devolve null', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('constraint falhou') })

    await expect(productEngineService.registrarConsulta({ nome: 'X' })).resolves.toBeNull()
  })

  test('supabase.rpc rejeitando (erro de rede) também devolve null, não propaga', async () => {
    supabase.rpc.mockRejectedValue(new Error('rede caiu'))

    await expect(productEngineService.registrarConsulta({ nome: 'X' })).resolves.toBeNull()
  })
})

describe('aprenderDeResposta', () => {
  test('memória já existe (ilike por nome): usa o id encontrado, não cria nova', async () => {
    let memoriaChamada = 0
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'memoria_produtos') throw new Error(`tabela inesperada: ${tabela}`)
      memoriaChamada += 1
      return chain({ data: { id: 'mem1' }, error: null })
    })
    supabase.rpc.mockResolvedValue({ data: { ok: true }, error: null })

    await productEngineService.aprenderDeResposta({ produto_nome: 'Caderno 96 folhas', disponibilidade: 'disponivel', preco: 15.9 })

    expect(memoriaChamada).toBe(1)
    expect(supabase.rpc).toHaveBeenCalledWith('aprender_de_resposta_operador', {
      p_memoria_produto_id: 'mem1',
      p_disponibilidade: 'disponivel',
      p_preco: 15.9,
      p_operador_id: null,
      p_observacao: null,
      p_origem: 'manual',
    })
  })

  test('memória não existe: cria a linha antes de gravar a confirmação', async () => {
    let chamada = 0
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'memoria_produtos') throw new Error(`tabela inesperada: ${tabela}`)
      chamada += 1
      if (chamada === 1) return chain({ data: null, error: null }) // não achou
      return chain({ data: { id: 'mem-novo' }, error: null }) // insert
    })
    supabase.rpc.mockResolvedValue({ data: { ok: true }, error: null })

    await productEngineService.aprenderDeResposta({ produto_nome: 'Produto Inédito' })

    expect(chamada).toBe(2)
    expect(supabase.rpc).toHaveBeenCalledWith(
      'aprender_de_resposta_operador',
      expect.objectContaining({ p_memoria_produto_id: 'mem-novo', p_disponibilidade: 'disponivel', p_origem: 'manual' })
    )
  })

  test('erro ao buscar a memória é propagado, sem chegar a criar nem confirmar', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(productEngineService.aprenderDeResposta({ produto_nome: 'X' })).rejects.toThrow('timeout')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  test('erro da RPC de confirmação é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: { id: 'mem1' }, error: null }))
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('memória inválida') })

    await expect(productEngineService.aprenderDeResposta({ produto_nome: 'X' })).rejects.toThrow('memória inválida')
  })
})

describe('listarMemoria', () => {
  test('normaliza confirmado_por, confirmacoes e nivel_confianca de cada linha', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'memoria_produtos') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({
        data: [{
          id: 'mem1',
          confidence_score: 80,
          confirmado_por_op: { nome: 'Ana' },
          confirmacoes: [{ id: 'c1', criado_em: '2026-09-01T00:00:00Z', operador: { nome: 'Ana' } }],
        }],
        error: null,
      })
    })

    const [memoria] = await productEngineService.listarMemoria()

    expect(memoria.confirmado_por).toBe('Ana')
    expect(memoria.nivel_confianca).toBe('alta')
    expect(memoria.confirmacoes[0]).toMatchObject({ operador: 'Ana', created_at: '2026-09-01T00:00:00Z' })
  })

  test('confirmação sem operador (registrada pelo sistema) cai no fallback "sistema"', async () => {
    supabase.from.mockImplementation(() => chain({
      data: [{ id: 'mem1', confirmacoes: [{ id: 'c1', operador: null, criado_em: '2026-09-01T00:00:00Z' }] }],
      error: null,
    }))

    const [memoria] = await productEngineService.listarMemoria()

    expect(memoria.confirmacoes[0].operador).toBe('sistema')
  })

  test('filtros disponibilidade/confiancaMinima/busca aplicam eq/gte/ilike', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await productEngineService.listarMemoria({ disponibilidade: 'disponivel', confiancaMinima: 60, busca: 'caderno' })

    expect(c.eq).toHaveBeenCalledWith('disponibilidade', 'disponivel')
    expect(c.gte).toHaveBeenCalledWith('confidence_score', 60)
    expect(c.ilike).toHaveBeenCalledWith('nome', '%caderno%')
  })

  test('data null vira lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await productEngineService.listarMemoria()).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(productEngineService.listarMemoria()).rejects.toThrow('timeout')
  })
})

describe('atualizarMemoria', () => {
  test('mudar disponibilidade também grava ultima_confirmacao (timestamp)', async () => {
    const c = chain({ data: { id: 'mem1' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'memoria_produtos') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await productEngineService.atualizarMemoria('mem1', { disponibilidade: 'indisponivel' })

    expect(c.update).toHaveBeenCalledWith(
      expect.objectContaining({ disponibilidade: 'indisponivel', ultima_confirmacao: expect.any(String) })
    )
  })

  test('atualizar só o preço não mexe em disponibilidade/ultima_confirmacao', async () => {
    const c = chain({ data: { id: 'mem1' }, error: null })
    supabase.from.mockImplementation(() => c)

    await productEngineService.atualizarMemoria('mem1', { ultimo_preco: 19.9 })

    expect(c.update).toHaveBeenCalledWith({ ultimo_preco: 19.9 })
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('não encontrada') }))

    await expect(productEngineService.atualizarMemoria('mem-invalida', { observacoes: 'x' })).rejects.toThrow('não encontrada')
  })
})

describe('vincularAoCatalogo', () => {
  test('grava produto_id na memória', async () => {
    const c = chain({ data: { id: 'mem1', produto_id: 'prod1' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'memoria_produtos') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await productEngineService.vincularAoCatalogo('mem1', 'prod1')

    expect(c.update).toHaveBeenCalledWith({ produto_id: 'prod1' })
    expect(resultado.produto_id).toBe('prod1')
  })
})

describe('adicionarRelacionamento', () => {
  test('produto_id é obrigatório, os demais campos têm default', async () => {
    const c = chain({ data: { id: 'rel1' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'produtos_relacionados') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await productEngineService.adicionarRelacionamento({ produto_id: 'prod1' })

    expect(c.insert).toHaveBeenCalledWith({
      produto_id: 'prod1',
      relacionado_id: null,
      relacionado_nome_livre: null,
      tipo: 'similar',
      criado_por: null,
    })
  })

  test('erro do banco (ex.: produto_id nulo, NOT NULL) é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('produto_id não pode ser nulo') }))

    await expect(productEngineService.adicionarRelacionamento({})).rejects.toThrow('produto_id não pode ser nulo')
  })
})

describe('buscarRelacionamentos / removerRelacionamento', () => {
  test('buscarRelacionamentos filtra por produto_id e ordena por criado_em desc', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'produtos_relacionados') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await productEngineService.buscarRelacionamentos('prod1')

    expect(c.eq).toHaveBeenCalledWith('produto_id', 'prod1')
    expect(c.order).toHaveBeenCalledWith('criado_em', { ascending: false })
  })

  test('removerRelacionamento propaga erro do banco', async () => {
    supabase.from.mockImplementation(() => chain({ error: new Error('não encontrado') }))

    await expect(productEngineService.removerRelacionamento('rel-invalido')).rejects.toThrow('não encontrado')
  })
})
