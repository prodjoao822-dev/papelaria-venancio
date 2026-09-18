// Lado do Separador — usa o cliente ISOLADO (separadorSupabase), nunca um
// client genérico. RLS já restringe SELECT às próprias solicitações
// (separador_id = funcionario_atual_id()), então as queries daqui não
// precisam (nem devem) filtrar por funcionário manualmente — a policy faz
// isso. Contrato idêntico ao venancio-ai-ops/src/services/separacaoSeparador.service.js
// (mesmo SELECT, mesmas RPCs) — só o import do client muda entre plataformas.
import { separadorSupabase } from '../supabase/separadorClient'

// operador_delegante: join com `operadores` pelo FK operador_delegante_id
// (coluna confirmada em produção, extensao_separacao_delegada.sql — tabela
// `solicitacoes_separacao` seção B). Mesmo padrão de join que
// `listarMensagens` já usa (`autor_operador:operadores(id, nome)`).
// ATENÇÃO: a policy de leitura de `operadores` em produção (dump
// extensao_rls_completa.sql, "operadores_leem_a_si_mesmos") só libera
// `auth.uid() = id` ou admin — não tem cláusula para o papel Separador. Ou
// seja, hoje esse campo deve vir `null` quando quem consulta é um
// separador (RLS filtra a linha embutida), até o supabase-db adicionar uma
// policy equivalente à `funcionarios.separador_le_a_si_mesmo` para
// `operadores`. Mantido aqui (não quebra nada, é forward-compatible) — a
// UI trata `null` mostrando só "N itens" sem o sufixo "delegado por".
//
// itens_pedido: NÃO tem coluna de código/SKU de produto (confirmado —
// só ganhou `nome_item`/`separado` via extensao_dashboard.sql). O código
// existe em `produtos.sku`, mas só é alcançável através de `produto_id`
// (nulo em itens de texto livre) e a policy de leitura de `produtos`
// também é `eh_operador_ativo()`-only, sem cláusula de separador — por
// isso omitido deliberadamente do SELECT e da UI (ver relatório da
// Etapa B). `observacao` foi adicionada ao embed na Fase 2 (item
// faltou/substituído) — é onde a RPC grava o texto digitado pelo
// separador quando `status_item = 'faltou_substituido'`.
//
// separador:funcionarios!separador_id — join NOVO da Fase 2, mesmo padrão
// de hint de coluna (não nome de constraint) já usado em
// pedidosOperador.service.js (`funcionarios!responsavel_separacao_id`) e
// tarefasOperador.service.js (`funcionarios!responsavel_id`). Diferente do
// caso de `operador_delegante` (comentário acima), aqui a RLS JÁ libera:
// a policy `separador_le_a_si_mesmo` em `funcionarios` (baseline_producao,
// `auth_user_id = auth.uid()`) permite ao separador ler a própria linha, e
// como `separador_id` desta solicitação É o funcionário autenticado, o
// embed deve resolver normalmente. Mesmo assim a UI trata `nome` ausente
// com o mesmo fallback gracioso (nunca quebra a tela por causa disso).
const SELECT_SOLICITACAO = `
  *,
  pedidos (
    id, protocolo, valor_total, forma_entrega, forma_pagamento, status_pagamento,
    horario_retirada_desejado, observacoes,
    clientes (id, nome, telefone)
  ),
  operador_delegante:operadores (id, nome),
  separador:funcionarios!separador_id (id, nome),
  itens:solicitacoes_separacao_itens (
    id, separado, separado_em, status_item,
    itens_pedido (id, nome_item, quantidade, observacao)
  )
`

export const separacaoSeparadorService = {
  async listarMinhas(filtros = {}) {
    // Ordenação por prioridade (imediata primeiro) é feita na tela, não aqui
    // — client-side é mais simples que replicar a regra num CASE WHEN do SQL.
    let query = separadorSupabase
      .from('solicitacoes_separacao')
      .select(SELECT_SOLICITACAO)
      .order('criado_em', { ascending: false })

    if (filtros.statusIn) query = query.in('status', filtros.statusIn)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async buscarPorId(id) {
    const { data, error } = await separadorSupabase
      .from('solicitacoes_separacao')
      .select(SELECT_SOLICITACAO)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async listarMensagens(solicitacaoId) {
    const { data, error } = await separadorSupabase
      .from('solicitacoes_separacao_mensagens')
      .select('*, autor_operador:operadores(id, nome), autor_funcionario:funcionarios(id, nome)')
      .eq('solicitacao_id', solicitacaoId)
      .order('criado_em', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async assumir(solicitacaoId) {
    const { data, error } = await separadorSupabase.rpc('assumir_separacao', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  // Fase 2 (checklist de 3 estados): assinatura nova usa sempre
  // `p_status_item` ('separado' | 'faltou_substituido' | 'pendente'),
  // nunca mais `p_separado` (parâmetro legado da RPC, mantido no banco só
  // por compatibilidade — não usado a partir daqui). `observacao` só tem
  // sentido junto de 'faltou_substituido' (texto livre do que aconteceu
  // com o item); nos outros dois estados vai `null`.
  async marcarItem(solicitacaoItemId, statusItem, observacao = null) {
    const { data, error } = await separadorSupabase.rpc('marcar_item_separado_solicitacao', {
      p_solicitacao_item_id: solicitacaoItemId,
      p_status_item: statusItem,
      p_observacao: observacao,
    })
    if (error) throw error
    return data
  },

  async concluir(solicitacaoId) {
    const { data, error } = await separadorSupabase.rpc('concluir_separacao', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  async cancelar(solicitacaoId, motivo) {
    const { data, error } = await separadorSupabase.rpc('cancelar_separacao', {
      p_solicitacao_id: solicitacaoId,
      p_motivo: motivo ?? null,
    })
    if (error) throw error
    return data
  },

  async enviarMensagem(solicitacaoId, texto) {
    const { data, error } = await separadorSupabase.rpc('enviar_mensagem_separacao', {
      p_solicitacao_id: solicitacaoId,
      p_texto: texto,
    })
    if (error) throw error
    return data
  },

  // destinatarioTipos: lista de `destinatario_tipo` a trazer (ex.:
  // ['separador'], ['entregador'], ou os dois para quem acumula os dois
  // papéis — ver app-mobile/src/utils/mapearPapeisNotificacao.js, que
  // traduz `funcionarios.papeis` para este vocabulário). Default
  // `['separador']` preserva o comportamento anterior para quem não
  // informar o parâmetro. Lista vazia (funcionário sem papel mapeável)
  // devolve `[]` sem nem consultar o banco — não é erro.
  async listarNotificacoes({ apenasNaoLidas = false, destinatarioTipos = ['separador'] } = {}) {
    if (destinatarioTipos.length === 0) return []

    let query = separadorSupabase
      .from('notificacoes_internas')
      .select('*')
      .in('destinatario_tipo', destinatarioTipos)
      .order('criado_em', { ascending: false })
      .limit(50)
    if (apenasNaoLidas) query = query.eq('lida', false)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async marcarNotificacaoLida(id) {
    const { data, error } = await separadorSupabase.rpc('marcar_notificacao_lida', { p_id: id })
    if (error) throw error
    return data
  },
}
