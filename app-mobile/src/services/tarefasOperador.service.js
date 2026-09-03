// Lado do Operador — usa o cliente ISOLADO (operadorSupabase). Espelha
// venancio-ai-ops/src/services/tarefas.service.js, reduzido ao que a v1 do
// app-mobile precisa: listar tarefas pendentes (leitura) e concluir uma
// tarefa (única ação de escrita desta tela, sempre via RPC já existente —
// nunca update direto na tabela `tarefas`). Criar/reatribuir tarefa
// continuam exclusivos do dashboard web.
import { operadorSupabase } from '../supabase/operadorClient'

const SELECT_TAREFA = `
  id, descricao, data_execucao, status, concluido_em, criado_em,
  pedido_id, responsavel_id,
  responsavel:funcionarios!responsavel_id (id, nome),
  pedidos (id, protocolo),
  criado_por_operador:operadores!criado_por (id, nome)
`

export const tarefasOperadorService = {
  async listarPendentes() {
    const { data, error } = await operadorSupabase
      .from('tarefas')
      .select(SELECT_TAREFA)
      .eq('status', 'pendente')
      .order('data_execucao', { ascending: true })

    if (error) throw error
    return data ?? []
  },

  async concluir(tarefaId) {
    const { data, error } = await operadorSupabase.rpc('concluir_tarefa', {
      p_tarefa_id: tarefaId,
    })
    if (error) throw error
    return data
  },
}
