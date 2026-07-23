import { supabase } from '@/supabase/client'

// A maior parte dos eventos (mudança de status de pedido/orçamento, consulta
// operacional criada/respondida) é gravada automaticamente por trigger no
// banco (ver extensao_dashboard.sql, seção L) — o dashboard só lê, não
// precisa mais chamar um `.registrar()` manual a cada ação.
export const eventLogService = {
  async registrar({ tipoEvento, entidadeTipo = null, entidadeId = null, atorTipo = 'sistema', atorId = null, descricao = null, payload = {} }) {
    try {
      await supabase.from('eventos').insert({
        tipo_evento: tipoEvento,
        entidade_tipo: entidadeTipo,
        entidade_id: entidadeId,
        ator_tipo: atorTipo,
        ator_id: atorId,
        descricao,
        payload,
      })
    } catch {
      // evento nunca deve quebrar o fluxo principal
    }
  },

  async listarParaEntidade(entidadeTipo, entidadeId, limite = 50) {
    const { data, error } = await supabase
      .from('eventos')
      .select('*')
      .eq('entidade_tipo', entidadeTipo)
      .eq('entidade_id', entidadeId)
      .order('criado_em', { ascending: false })
      .limit(limite)

    if (error) throw error
    return data ?? []
  },

  async listarAtividadeFeed(limite = 30) {
    const { data, error } = await supabase.rpc('get_activity_feed', { p_limit: limite })
    if (error) throw error
    return data ?? []
  },

  subscribe(callback) {
    return supabase
      .channel('eventos-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos' }, callback)
      .subscribe()
  },
}
