// Lado do Operador — usa o cliente ISOLADO (operadorSupabase). Espelha
// venancio-ai-ops/src/services/listaEspera.service.js
// (`listarProdutosComEspera()`), só-leitura na v1 do app-mobile: registrar
// interesse e marcar cliente como notificado continuam exclusivos do
// dashboard web (ações que dependem de contato manual com o cliente, fora
// de escopo aqui).
import { operadorSupabase } from '../supabase/operadorClient'

export const listaEsperaOperadorService = {
  /** Produtos com pelo menos 1 registro 'aguardando', agrupados com a contagem de interessados. */
  async listarProdutosComEspera() {
    const { data, error } = await operadorSupabase
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
}
