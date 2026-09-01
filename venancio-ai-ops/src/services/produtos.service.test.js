// Testes de produtos.service.js — catálogo. Foco nos helpers de lookup
// (resolverLookupId: resolve-ou-cria categoria/marca por nome, case
// insensitive) e em mesclarLookup (reatribui produtos antes de apagar a
// origem — nunca pode perder produto no meio do caminho), além do
// achatamento categorias/marcas → categoria/marca (string) que a UI espera.
import { describe, test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/supabase/client', () => ({ supabase: { from: vi.fn() } }))

import { supabase } from '@/supabase/client'
import { produtosService } from './produtos.service'

const METODOS_CHAIN = ['select', 'order', 'eq', 'or', 'ilike', 'insert', 'update', 'delete']

function chain(result) {
  const c = {}
  METODOS_CHAIN.forEach((metodo) => { c[metodo] = vi.fn(() => c) })
  c.single = vi.fn(() => Promise.resolve(result))
  c.maybeSingle = vi.fn(() => Promise.resolve(result))
  c.then = (resolve) => resolve(result)
  return c
}

function produtoRow(overrides = {}) {
  return {
    id: 'prod1',
    nome: 'Caderno 96 folhas',
    categoria_id: 'cat1',
    marca_id: 'marca1',
    categorias: { id: 'cat1', nome: 'Cadernos' },
    marcas: { id: 'marca1', nome: 'Tilibra' },
    ...overrides,
  }
}

beforeEach(() => {
  supabase.from.mockReset()
})

describe('listar', () => {
  test('achata categorias/marcas em categoria/marca (string), preservando os ids', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'produtos') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: [produtoRow()], error: null })
    })

    const [produto] = await produtosService.listar()

    expect(produto).toMatchObject({ categoria: 'Cadernos', categoria_id: 'cat1', marca: 'Tilibra', marca_id: 'marca1' })
    expect(produto).not.toHaveProperty('categorias')
    expect(produto).not.toHaveProperty('marcas')
  })

  test('filtros.ativo aplica eq; filtros.busca aplica or em nome/sku', async () => {
    const c = chain({ data: [], error: null })
    supabase.from.mockImplementation(() => c)

    await produtosService.listar({ ativo: true, busca: 'caderno' })

    expect(c.eq).toHaveBeenCalledWith('ativo', true)
    expect(c.or).toHaveBeenCalledWith('nome.ilike.%caderno%,sku.ilike.%caderno%')
  })

  test('filtros.categoria/marca filtram client-side, depois de achatar', async () => {
    supabase.from.mockImplementation(() => chain({
      data: [produtoRow(), produtoRow({ id: 'prod2', categorias: { nome: 'Canetas' }, marcas: { nome: 'Bic' } })],
      error: null,
    }))

    const resultado = await produtosService.listar({ categoria: 'Cadernos' })

    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe('prod1')
  })

  test('data null vira lista vazia', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: null }))

    expect(await produtosService.listar()).toEqual([])
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('timeout') }))

    await expect(produtosService.listar()).rejects.toThrow('timeout')
  })
})

describe('buscarPorId', () => {
  test('busca e achata o produto', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'produtos') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: produtoRow(), error: null })
    })

    const produto = await produtosService.buscarPorId('prod1')

    expect(produto.categoria).toBe('Cadernos')
  })

  test('erro (ex.: id inexistente) é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('produto não encontrado') }))

    await expect(produtosService.buscarPorId('prod-invalido')).rejects.toThrow('produto não encontrado')
  })
})

describe('listarCategorias / listarMarcas', () => {
  test('listarCategorias devolve só os nomes, ordenados', async () => {
    const c = chain({ data: [{ id: 'cat1', nome: 'Cadernos' }, { id: 'cat2', nome: 'Canetas' }], error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'categorias') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    const resultado = await produtosService.listarCategorias()

    expect(resultado).toEqual(['Cadernos', 'Canetas'])
    expect(c.order).toHaveBeenCalledWith('nome', { ascending: true })
  })

  test('listarMarcas devolve só os nomes', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'marcas') throw new Error(`tabela inesperada: ${tabela}`)
      return chain({ data: [{ id: 'm1', nome: 'Tilibra' }], error: null })
    })

    expect(await produtosService.listarMarcas()).toEqual(['Tilibra'])
  })
})

describe('criar (resolução de categoria/marca por nome)', () => {
  test('categoria e marca já existentes (case diferente): resolve pelo ilike, não cria duplicata', async () => {
    const produtosChain = chain({ data: produtoRow(), error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'categorias') return chain({ data: { id: 'cat1' }, error: null })
      if (tabela === 'marcas') return chain({ data: { id: 'marca1' }, error: null })
      if (tabela === 'produtos') return produtosChain
      throw new Error(`tabela inesperada: ${tabela}`)
    })

    await produtosService.criar({ nome: 'Caderno', categoria: 'cadernos', marca: 'tilibra', preco: 10 })

    expect(produtosChain.insert).toHaveBeenCalledWith({
      nome: 'Caderno', preco: 10, categoria_id: 'cat1', marca_id: 'marca1',
    })
  })

  test('categoria nova: cria a linha em categorias e usa o id retornado', async () => {
    let categoriasChamada = 0
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'categorias') {
        categoriasChamada += 1
        if (categoriasChamada === 1) return chain({ data: null, error: null }) // não achou
        return chain({ data: { id: 'cat-novo' }, error: null }) // insert
      }
      if (tabela === 'marcas') return chain({ data: null, error: null })
      if (tabela === 'produtos') return chain({ data: produtoRow(), error: null })
      throw new Error(`tabela inesperada: ${tabela}`)
    })

    await produtosService.criar({ nome: 'Item Novo', categoria: 'Categoria Inédita' })

    expect(categoriasChamada).toBe(2)
  })

  test('sem categoria nem marca informadas, não toca nas tabelas de lookup', async () => {
    const tabelasConsultadas = []
    supabase.from.mockImplementation((tabela) => {
      tabelasConsultadas.push(tabela)
      return chain({ data: produtoRow(), error: null })
    })

    await produtosService.criar({ nome: 'Item Sem Categoria' })

    expect(tabelasConsultadas).toEqual(['produtos'])
  })

  test('erro ao inserir o produto é propagado', async () => {
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'produtos') return chain({ data: null, error: new Error('sku duplicado') })
      return chain({ data: null, error: null })
    })

    await expect(produtosService.criar({ nome: 'X' })).rejects.toThrow('sku duplicado')
  })
})

describe('atualizar', () => {
  test('não resolve categoria/marca quando eles não vêm no payload (undefined ≠ null)', async () => {
    const tabelasConsultadas = []
    supabase.from.mockImplementation((tabela) => {
      tabelasConsultadas.push(tabela)
      return chain({ data: produtoRow(), error: null })
    })

    await produtosService.atualizar('prod1', { preco: 15 })

    expect(tabelasConsultadas).toEqual(['produtos'])
  })

  test('categoria=null explícito resolve pra null (remove a categoria do produto)', async () => {
    const produtosChain = chain({ data: produtoRow(), error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela === 'produtos') return produtosChain
      throw new Error(`não deveria consultar ${tabela} com categoria null`)
    })

    await produtosService.atualizar('prod1', { categoria: null })

    expect(produtosChain.update).toHaveBeenCalledWith({ categoria_id: null })
  })

  test('erro do banco é propagado', async () => {
    supabase.from.mockImplementation(() => chain({ data: null, error: new Error('produto não encontrado') }))

    await expect(produtosService.atualizar('prod-invalido', { preco: 1 })).rejects.toThrow('produto não encontrado')
  })
})

describe('atualizarEstoque', () => {
  test('grava a quantidade exata na coluna estoque', async () => {
    const c = chain({ data: produtoRow(), error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'produtos') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await produtosService.atualizarEstoque('prod1', 42)

    expect(c.update).toHaveBeenCalledWith({ estoque: 42 })
  })
})

describe('gerenciamento de categorias/marcas (Marcas & Categorias)', () => {
  test('criarCategoria grava o nome trimado', async () => {
    const c = chain({ data: { id: 'cat1', nome: 'Cadernos' }, error: null })
    supabase.from.mockImplementation((tabela) => {
      if (tabela !== 'categorias') throw new Error(`tabela inesperada: ${tabela}`)
      return c
    })

    await produtosService.criarCategoria('  Cadernos  ')

    expect(c.insert).toHaveBeenCalledWith({ nome: 'Cadernos' })
  })

  test('renomearCategoria grava o novo nome trimado pelo id', async () => {
    const c = chain({ data: { id: 'cat1', nome: 'Cadernos Escolares' }, error: null })
    supabase.from.mockImplementation(() => c)

    await produtosService.renomearCategoria('cat1', '  Cadernos Escolares  ')

    expect(c.update).toHaveBeenCalledWith({ nome: 'Cadernos Escolares' })
    expect(c.eq).toHaveBeenCalledWith('id', 'cat1')
  })

  test('excluirCategoria em uso (FK violada, code 23503) vira mensagem amigável, não erro cru do postgres', async () => {
    supabase.from.mockImplementation(() => ({
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: { code: '23503', message: 'foreign key violation' } })) })),
    }))

    await expect(produtosService.excluirCategoria('cat1')).rejects.toThrow(
      'Categoria em uso por um ou mais produtos — remova ou reatribua os produtos antes de excluir.'
    )
  })

  test('excluirMarca em uso usa o label "Marca" na mensagem', async () => {
    supabase.from.mockImplementation(() => ({
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: { code: '23503' } })) })),
    }))

    await expect(produtosService.excluirMarca('marca1')).rejects.toThrow(
      'Marca em uso por um ou mais produtos — remova ou reatribua os produtos antes de excluir.'
    )
  })

  test('excluirCategoria com outro erro (não 23503) propaga o erro original', async () => {
    supabase.from.mockImplementation(() => ({
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: new Error('permissão negada') })) })),
    }))

    await expect(produtosService.excluirCategoria('cat1')).rejects.toThrow('permissão negada')
  })

  test('mesclarCategoria com origem igual ao destino lança erro sem tocar no banco', async () => {
    await expect(produtosService.mesclarCategoria('cat1', 'cat1')).rejects.toThrow(
      'Escolha um destino diferente da origem.'
    )
    expect(supabase.from).not.toHaveBeenCalled()
  })

  test('mesclarCategoria: reatribui os produtos da origem pro destino antes de apagar a categoria origem', async () => {
    const chamadas = []
    supabase.from.mockImplementation((tabela) => {
      chamadas.push(tabela)
      if (tabela === 'produtos') {
        return { update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) }
      }
      return { delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) }
    })

    await produtosService.mesclarCategoria('cat-origem', 'cat-destino')

    expect(chamadas).toEqual(['produtos', 'categorias'])
  })

  test('mesclarCategoria: se o UPDATE de produtos falhar, não chega a apagar a categoria origem', async () => {
    const chamadas = []
    supabase.from.mockImplementation((tabela) => {
      chamadas.push(tabela)
      return { update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: new Error('falha no update') })) })) }
    })

    await expect(produtosService.mesclarCategoria('cat-origem', 'cat-destino')).rejects.toThrow('falha no update')
    expect(chamadas).toEqual(['produtos'])
  })
})
