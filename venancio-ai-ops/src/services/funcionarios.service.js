import { supabase } from '@/supabase/client'

export const funcionariosService = {
  async listar(filtros = {}) {
    let query = supabase
      .from('funcionarios')
      .select('*')
      .order('nome', { ascending: true })

    if (filtros.ativo !== undefined) {
      query = query.eq('ativo', filtros.ativo)
    }
    if (filtros.papel) {
      query = query.contains('papeis', [filtros.papel])
    }

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  /** Funcionários ativos com um papel específico ('separacao' | 'entrega') — usado nos dropdowns de atribuição. */
  async listarPorPapel(papel) {
    return funcionariosService.listar({ ativo: true, papel })
  },

  async criar(dados) {
    const { data, error } = await supabase
      .from('funcionarios')
      .insert({ nome: dados.nome, papeis: dados.papeis ?? [] })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async atualizar(id, dados) {
    const { data, error } = await supabase
      .from('funcionarios')
      .update(dados)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async toggleAtivo(id) {
    const { data: atual, error: errBusca } = await supabase
      .from('funcionarios')
      .select('ativo')
      .eq('id', id)
      .single()
    if (errBusca) throw errBusca

    const { data, error } = await supabase
      .from('funcionarios')
      .update({ ativo: !atual.ativo })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },
}
