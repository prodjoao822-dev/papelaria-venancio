import { supabase } from '@/supabase/client'

// RF-04: interesse de cliente em produto fora de estoque. Notificação ao
// cliente é sempre manual (o operador avisa por fora — WhatsApp/telefone —
// e só então marca como notificado por aqui); sem disparo automático nesta
// fase. registrar_interesse_lista_espera é idempotente: cliente+produto
// repetido atualiza a quantidade/observação do registro 'aguardando'
// existente em vez de duplicar linha.
export const listaEsperaService = {
  /** Produtos com pelo menos 1 registro 'aguardando', agrupados com a contagem de interessados. */
  async listarProdutosComEspera() {
    const { data, error } = await supabase
      .from('lista_espera')
      .select('produto_id, produtos (id, nome, sku, estoque)')
      .eq('status', 'aguardando')

    if (error) throw error

    const porProduto = new Map()
    for (const linha of data ?? []) {
      if (!linha.produto_id) continue
      const atual = porProduto.get(linha.produto_id)
      if (atual) atual.qtd_interessados += 1
      else porProduto.set(linha.produto_id, {
        id: linha.produto_id,
        nome: linha.produtos?.nome ?? '—',
        sku: linha.produtos?.sku ?? null,
        estoque: linha.produtos?.estoque ?? 0,
        qtd_interessados: 1,
      })
    }
    return Array.from(porProduto.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  },

  /** Clientes interessados num produto — nome/telefone já vêm prontos via join da RPC. */
  async listarInteressados(produtoId, incluirNotificados = false) {
    const { data, error } = await supabase.rpc('listar_interessados_produto', {
      p_produto_id: produtoId,
      p_incluir_notificados: incluirNotificados,
    })
    if (error) throw error
    return data ?? []
  },

  async registrarInteresse({ produtoId, clienteId, quantidadeDesejada = 1, observacao = null }) {
    const { data, error } = await supabase.rpc('registrar_interesse_lista_espera', {
      p_produto_id: produtoId,
      p_cliente_id: clienteId,
      p_quantidade_desejada: quantidadeDesejada,
      p_observacao: observacao,
    })
    if (error) throw error
    return data
  },

  async marcarNotificado(listaEsperaId) {
    const { data, error } = await supabase.rpc('marcar_cliente_notificado', {
      p_lista_espera_id: listaEsperaId,
    })
    if (error) throw error
    return data
  },
}
