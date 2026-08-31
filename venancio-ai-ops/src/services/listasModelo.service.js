import { supabase } from '@/supabase/client'

// Listas Modelo: listas de material escolar prontas por escola/ano,
// extraídas dos orçamentos reais (chatbot/papelaria-bot/supabase/
// extensao_listas_modelo_escolar_01-09.sql). Não são orçamento de
// cliente nenhum — são moldes reaproveitáveis. "Criar Pedido" clona os
// itens do modelo pra um orçamento novo do cliente escolhido e já aceita
// (mesma RPC atômica usada pelo Agente de Vendas), pronto pra delegar
// separação — ver criar_pedido_de_lista_modelo() no banco.
export const listasModeloService = {
  /** Escolas que têm pelo menos 1 lista modelo ativa, com a contagem de listas. */
  async listarEscolasComListas() {
    const { data, error } = await supabase
      .from('listas_modelo')
      .select('escola_id, escolas (id, nome)')
      .eq('ativo', true)

    if (error) throw error

    const porEscola = new Map()
    for (const linha of data ?? []) {
      if (!linha.escola_id) continue
      const atual = porEscola.get(linha.escola_id)
      if (atual) atual.qtd_listas += 1
      else porEscola.set(linha.escola_id, { id: linha.escola_id, nome: linha.escolas?.nome ?? '—', qtd_listas: 1 })
    }
    return Array.from(porEscola.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  },

  /** Listas modelo (anos/séries) de uma escola, com a contagem de itens. */
  async listarPorEscola(escolaId) {
    const { data, error } = await supabase
      .from('listas_modelo')
      .select('id, ano, valor_total, arquivo_origem, listas_modelo_itens (id)')
      .eq('escola_id', escolaId)
      .eq('ativo', true)
      .order('ano')

    if (error) throw error
    return (data ?? []).map((l) => ({
      id: l.id,
      ano: l.ano,
      valor_total: l.valor_total,
      qtd_itens: l.listas_modelo_itens?.length ?? 0,
    }))
  },

  /** Uma lista modelo com todos os itens (nome do produto, quantidade, preço). */
  async buscarComItens(listaModeloId) {
    const { data, error } = await supabase
      .from('listas_modelo')
      .select(`
        id, ano, valor_total, arquivo_origem,
        escolas (id, nome),
        listas_modelo_itens (
          id, descricao_livre, quantidade, valor_unitario,
          produtos (id, nome)
        )
      `)
      .eq('id', listaModeloId)
      .single()

    if (error) throw error
    return data
  },

  /**
   * Cria um pedido de verdade a partir de uma lista modelo, pro cliente
   * informado. Retorna o pedido criado (já com protocolo PED-), pronto
   * pra abrir a tela de Pedidos ou delegar a separação na sequência.
   */
  async criarPedido({ listaModeloId, clienteId, formaEntrega = 'retirada', enderecoEntrega = null, horarioRetiradaDesejado = null }) {
    const { data, error } = await supabase.rpc('criar_pedido_de_lista_modelo', {
      p_lista_modelo_id: listaModeloId,
      p_cliente_id: clienteId,
      p_forma_entrega: formaEntrega,
      p_endereco_entrega: enderecoEntrega,
      p_horario_retirada_desejado: horarioRetiradaDesejado,
    })
    if (error) throw error
    return data
  },
}
