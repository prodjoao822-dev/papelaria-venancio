// Testes de rascunhoOrcamento.js — o formulário de orçamento (criar e
// editar) guardava tudo só em state do React, então fechar o modal sem
// querer (clicar fora — comportamento normal do modal) ou dar F5 perdia
// todo o progresso digitado. Este módulo é a persistência local que
// resolve isso; cobre também os casos de localStorage indisponível/quebrado,
// já que é só uma conveniência e não pode nunca travar o formulário.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CHAVE_RASCUNHO_NOVO_ORCAMENTO,
  chaveRascunhoEdicaoOrcamento,
  salvarRascunho,
  carregarRascunho,
  limparRascunho,
  rascunhoNovoTemConteudo,
  rascunhoEdicaoDifereDoOriginal,
  itensOrcamentoParaFormulario,
  prepararDuplicacaoOrcamento,
} from './rascunhoOrcamento'

function criarLocalStorageFake() {
  const dados = new Map()
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  }
}

describe('salvarRascunho / carregarRascunho / limparRascunho', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', criarLocalStorageFake())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('grava e recupera exatamente o mesmo objeto', () => {
    const dados = {
      cliente: { nome: 'Ana Souza', telefone: '11999990000' },
      observacoes: 'entregar até sexta',
      status: 'rascunho',
      itens: [{ descricao_livre: 'Caderno 10 matérias', quantidade: 2, valor_unitario: '25,90', produto_id: null }],
    }
    salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, dados)
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toEqual(dados)
  })

  test('carregar sem nada salvo ainda devolve null — abrir o modal pela primeira vez não quebra', () => {
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })

  test('limpar remove o rascunho salvo (caso: orçamento criado com sucesso)', () => {
    salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, { observacoes: 'x' })
    limparRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })

  test('rascunhos de edição de orçamentos diferentes não se misturam (chave inclui o id)', () => {
    salvarRascunho(chaveRascunhoEdicaoOrcamento('orc-1'), { observacoes: 'do orçamento 1' })
    salvarRascunho(chaveRascunhoEdicaoOrcamento('orc-2'), { observacoes: 'do orçamento 2' })

    expect(carregarRascunho(chaveRascunhoEdicaoOrcamento('orc-1'))).toEqual({ observacoes: 'do orçamento 1' })
    expect(carregarRascunho(chaveRascunhoEdicaoOrcamento('orc-2'))).toEqual({ observacoes: 'do orçamento 2' })
  })

  test('JSON corrompido no localStorage não quebra — carregarRascunho devolve null', () => {
    localStorage.setItem(CHAVE_RASCUNHO_NOVO_ORCAMENTO, '{ isso não é json válido')
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })
})

describe('localStorage indisponível (ex.: modo anônimo restrito)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', undefined)
  })
  afterEach(() => vi.unstubAllGlobals())

  test('carregarRascunho não lança e devolve null', () => {
    expect(() => carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).not.toThrow()
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })

  test('salvarRascunho não lança — formulário continua funcionando sem persistência', () => {
    expect(() => salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, { a: 1 })).not.toThrow()
  })

  test('limparRascunho não lança', () => {
    expect(() => limparRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).not.toThrow()
  })
})

describe('localStorage presente mas lançando (ex.: quota cheia)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => { throw new Error('SecurityError') },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  test('salvarRascunho engole o erro silenciosamente', () => {
    expect(() => salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, { a: 1 })).not.toThrow()
  })

  test('carregarRascunho engole o erro e devolve null', () => {
    expect(carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).toBeNull()
  })

  test('limparRascunho engole o erro silenciosamente', () => {
    expect(() => limparRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)).not.toThrow()
  })
})

describe('rascunhoNovoTemConteudo', () => {
  test('null/undefined não tem conteúdo', () => {
    expect(rascunhoNovoTemConteudo(null)).toBe(false)
    expect(rascunhoNovoTemConteudo(undefined)).toBe(false)
  })

  test('estado inicial vazio do formulário não conta como conteúdo (evita aviso de recuperação sem motivo)', () => {
    const vazio = {
      cliente: { nome: '', telefone: '' },
      observacoes: '',
      status: 'rascunho',
      itens: [{ descricao_livre: '', quantidade: 1, valor_unitario: '', produto_id: null }],
    }
    expect(rascunhoNovoTemConteudo(vazio)).toBe(false)
  })

  test('nome do cliente preenchido já conta como conteúdo', () => {
    expect(rascunhoNovoTemConteudo({ cliente: { nome: 'Ana', telefone: '' }, itens: [] })).toBe(true)
  })

  test('telefone preenchido já conta como conteúdo', () => {
    expect(rascunhoNovoTemConteudo({ cliente: { nome: '', telefone: '11999990000' }, itens: [] })).toBe(true)
  })

  test('item com descrição preenchida conta como conteúdo', () => {
    expect(rascunhoNovoTemConteudo({
      cliente: { nome: '', telefone: '' },
      itens: [{ descricao_livre: 'Caneta azul' }],
    })).toBe(true)
  })

  test('observações preenchidas contam como conteúdo', () => {
    expect(rascunhoNovoTemConteudo({ cliente: {}, observacoes: 'desconto combinado', itens: [] })).toBe(true)
  })
})

describe('rascunhoEdicaoDifereDoOriginal', () => {
  const original = {
    itens: [{ descricao_livre: 'Caneta', quantidade: 1, valor_unitario: '2,50', produto_id: null }],
    observacoes: '',
  }

  test('sem rascunho salvo não é considerado diferente (nada a recuperar)', () => {
    expect(rascunhoEdicaoDifereDoOriginal(null, original)).toBe(false)
  })

  test('rascunho idêntico ao original não conta como diferente — não gera aviso à toa', () => {
    const identico = JSON.parse(JSON.stringify(original))
    expect(rascunhoEdicaoDifereDoOriginal(identico, original)).toBe(false)
  })

  test('rascunho com item alterado é considerado diferente e deve ser recuperado', () => {
    const alterado = { ...original, itens: [{ ...original.itens[0], quantidade: 5 }] }
    expect(rascunhoEdicaoDifereDoOriginal(alterado, original)).toBe(true)
  })

  test('rascunho com observações alteradas é considerado diferente', () => {
    const alterado = { ...original, observacoes: 'cliente pediu desconto' }
    expect(rascunhoEdicaoDifereDoOriginal(alterado, original)).toBe(true)
  })
})

describe('itensOrcamentoParaFormulario', () => {
  test('converte itens_orcamento (shape do banco) pro shape do formulário', () => {
    const orc = {
      itens_orcamento: [
        { id: 'item1', nome_item: 'Caderno 10 matérias', quantidade: 2, valor_unitario: 25.9, produto_id: 'prod1' },
        { id: 'item2', nome_item: 'Item sem preço ainda', quantidade: 1, valor_unitario: null, produto_id: null },
      ],
    }
    expect(itensOrcamentoParaFormulario(orc)).toEqual([
      { descricao_livre: 'Caderno 10 matérias', quantidade: 2, valor_unitario: '25.9', produto_id: 'prod1' },
      { descricao_livre: 'Item sem preço ainda', quantidade: 1, valor_unitario: '', produto_id: null },
    ])
  })

  test('orçamento sem itens_orcamento (ou undefined) devolve lista vazia, não quebra', () => {
    expect(itensOrcamentoParaFormulario({})).toEqual([])
    expect(itensOrcamentoParaFormulario(undefined)).toEqual([])
  })
})

// Duplicar Orçamento — mesmo "pacote" de material pra um cliente diferente
// (pedido real do dono: não redigitar tudo de novo). O cliente tem que
// nascer vazio de propósito, e itens/observações são cópia de verdade
// (novo array, sem referência ao orçamento original).
describe('prepararDuplicacaoOrcamento', () => {
  function orcamentoOriginal() {
    return {
      id: 'orc-original',
      protocolo: 'ORC-0001',
      observacoes: 'Entregar embrulhado para presente',
      clientes: { id: 'cli-original', nome: 'Ana Souza', telefone: '11999990000' },
      itens_orcamento: [
        { id: 'item1', nome_item: 'Caderno 10 matérias', quantidade: 2, valor_unitario: 25.9, produto_id: 'prod1' },
        { id: 'item2', nome_item: 'Caneta azul', quantidade: 3, valor_unitario: 2.5, produto_id: null },
      ],
    }
  }

  test('copia itens e observações do orçamento original', () => {
    const duplicado = prepararDuplicacaoOrcamento(orcamentoOriginal())

    expect(duplicado.observacoes).toBe('Entregar embrulhado para presente')
    expect(duplicado.itens).toEqual([
      { descricao_livre: 'Caderno 10 matérias', quantidade: 2, valor_unitario: '25.9', produto_id: 'prod1' },
      { descricao_livre: 'Caneta azul', quantidade: 3, valor_unitario: '2.5', produto_id: null },
    ])
  })

  test('cliente nasce vazio — não copia nome/telefone do cliente original', () => {
    const duplicado = prepararDuplicacaoOrcamento(orcamentoOriginal())

    expect(duplicado.cliente).toEqual({ nome: '', telefone: '' })
  })

  test('status nasce como rascunho, independente do status do original', () => {
    const original = { ...orcamentoOriginal(), status: 'aceito' }
    expect(prepararDuplicacaoOrcamento(original).status).toBe('rascunho')
  })

  test('itens duplicados são um array novo — mexer neles não afeta o orçamento original', () => {
    const original = orcamentoOriginal()
    const duplicado = prepararDuplicacaoOrcamento(original)

    duplicado.itens[0].quantidade = 999
    duplicado.itens.push({ descricao_livre: 'Item novo', quantidade: 1, valor_unitario: '1', produto_id: null })

    expect(original.itens_orcamento).toHaveLength(2)
    expect(original.itens_orcamento[0].quantidade).toBe(2)
  })

  test('orçamento sem observações não quebra — vira string vazia', () => {
    const original = { ...orcamentoOriginal(), observacoes: null }
    expect(prepararDuplicacaoOrcamento(original).observacoes).toBe('')
  })
})

describe('duplicação sobrescreve rascunho pré-existente de "novo orçamento"', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', criarLocalStorageFake())
  })
  afterEach(() => vi.unstubAllGlobals())

  test('rascunho antigo não relacionado é substituído pelo conteúdo duplicado, sem misturar', () => {
    // Rascunho de um "novo orçamento" qualquer que o operador tinha começado
    // a digitar e não salvou — não tem nenhuma relação com a duplicação.
    salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, {
      cliente: { nome: 'Rascunho Antigo', telefone: '11888880000' },
      observacoes: 'nada a ver com a duplicação',
      status: 'enviado',
      itens: [{ descricao_livre: 'Produto do rascunho antigo', quantidade: 5, valor_unitario: '9,99', produto_id: null }],
    })

    const original = {
      protocolo: 'ORC-0002',
      observacoes: 'Pacote de material escolar padrão',
      itens_orcamento: [
        { id: 'item1', nome_item: 'Mochila', quantidade: 1, valor_unitario: 120, produto_id: 'prod9' },
      ],
    }
    const duplicado = prepararDuplicacaoOrcamento(original)

    // Isso é exatamente o que o NovoOrcamentoModal faz de forma síncrona ao
    // montar com `duplicarDe` — sobrescreve na hora, sem esperar debounce.
    salvarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO, duplicado)

    const carregado = carregarRascunho(CHAVE_RASCUNHO_NOVO_ORCAMENTO)
    expect(carregado).toEqual(duplicado)
    expect(carregado.cliente).toEqual({ nome: '', telefone: '' })
    expect(carregado.observacoes).toBe('Pacote de material escolar padrão')
    expect(carregado.itens).toEqual([
      { descricao_livre: 'Mochila', quantidade: 1, valor_unitario: '120', produto_id: 'prod9' },
    ])
    // Nada do rascunho antigo sobrevive misturado.
    expect(JSON.stringify(carregado)).not.toContain('Rascunho Antigo')
    expect(JSON.stringify(carregado)).not.toContain('nada a ver com a duplicação')
  })
})
