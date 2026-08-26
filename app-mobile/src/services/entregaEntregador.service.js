// Lado do Entregador — usa o mesmo cliente ISOLADO do Separador
// (separadorSupabase, ver ../supabase/separadorClient.js). Não existe (e não
// deve existir) um "entregadorClient.js" próprio: o client é isolado por
// dispositivo/app, não por papel — supabase-js mantém uma sessão por
// instância independentemente de quem logou ser Separador, Entregador ou os
// dois (funcionarios.papeis é array). RLS já restringe SELECT em
// `solicitacoes_entrega` ao próprio entregador (entregador_id =
// funcionario_atual_id()), então as queries daqui não filtram por
// funcionário manualmente — a policy faz isso. Contrato análogo ao
// venancio-ai-ops/src/services/entrega.service.js (mesmo SELECT, mesmas
// RPCs) — só o import do client muda entre plataformas, e este arquivo NÃO
// inclui `delegar`/`cancelar` (ações do Operador, fora do escopo do app do
// Entregador — ver SolicitacaoEntregaDetalheModal.jsx no dashboard web).
//
// Ocorrência (abrir_ocorrencia) mora neste mesmo arquivo por ser uma ação
// pontual do Entregador em campo (RN em abertos/tarefa 3 do prompt permitia
// arquivo separado; optei por manter junto por ser pequeno e sempre
// consumido a partir da mesma tela de detalhe da entrega).
import { separadorSupabase } from '../supabase/separadorClient'

// delegado_por: join com `operadores` pelo FK delegado_por_id. Mesma
// ressalva já documentada em separacaoSeparador.service.js para
// `operador_delegante`: a policy de leitura de `operadores` em produção
// (`operadores_leem_a_si_mesmos`) não tem cláusula para papéis de
// funcionário — hoje esse campo deve vir `null` quando quem consulta é um
// Entregador, até o supabase-db estender essa policy. Mantido aqui
// (forward-compatible, não quebra nada) — a UI trata `null` mostrando só
// "delegado" sem o nome.
//
// ATENÇÃO (vistoria 19/08, achado além do que o briefing pedia): pelo
// mesmo motivo acima, hoje NÃO existe policy de SELECT em `pedidos`,
// `clientes` NEM `itens_pedido` para o papel funcionário (só
// `eh_operador_ativo()` — ver extensao_rls_completa.sql / extensao_dashboard.sql
// em chatbot/papelaria-bot/supabase). Isso significa que, embora este SELECT
// já traga `itens_pedido` (corrigindo o bug "Entregador não vê o que está
// entregando"), o campo pode voltar `null`/vazio em produção até o
// supabase-db adicionar uma policy equivalente a
// `leitura_solicitacoes_entrega` para essas 3 tabelas (ex: liberar SELECT em
// itens_pedido quando `itens_pedido.pedido_id` bate com um pedido_id de uma
// solicitacoes_entrega/solicitacoes_separacao do funcionário autenticado).
// Mudança de RLS é fora do escopo deste agente (app-mobile) — reportado
// separadamente. Este SELECT já fica forward-compatible, sem quebrar nada.
const SELECT_SOLICITACAO_ENTREGA = `
  *,
  pedidos (
    id, protocolo, valor_total, endereco_entrega,
    clientes (id, nome, telefone),
    itens_pedido (id, nome_item, quantidade, tipo_observacao, observacao)
  ),
  delegado_por:operadores (id, nome)
`

export const entregaEntregadorService = {
  async listarMinhas(filtros = {}) {
    // Mesmo espírito de separacaoSeparadorService.listarMinhas: ordenação
    // por prioridade/urgência é feita na tela (aqui não há campo
    // `prioridade` em solicitacoes_entrega — a ordem visual é por
    // horario_previsto), refetch completo em vez de reidratar linha a
    // linha (listas pequenas).
    let query = separadorSupabase
      .from('solicitacoes_entrega')
      .select(SELECT_SOLICITACAO_ENTREGA)
      .order('criado_em', { ascending: false })

    if (filtros.statusIn) query = query.in('status', filtros.statusIn)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async buscarPorId(id) {
    const { data, error } = await separadorSupabase
      .from('solicitacoes_entrega')
      .select(SELECT_SOLICITACAO_ENTREGA)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async assumir(solicitacaoId) {
    const { data, error } = await separadorSupabase.rpc('assumir_entrega', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  async iniciarRota(solicitacaoId) {
    const { data, error } = await separadorSupabase.rpc('iniciar_rota', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  async concluir(solicitacaoId) {
    const { data, error } = await separadorSupabase.rpc('concluir_entrega', {
      p_solicitacao_id: solicitacaoId,
    })
    if (error) throw error
    return data
  },

  async registrarInsucesso(solicitacaoId, motivo) {
    const { data, error } = await separadorSupabase.rpc('registrar_insucesso_entrega', {
      p_solicitacao_id: solicitacaoId,
      p_motivo: motivo,
    })
    if (error) throw error
    return data
  },

  /**
   * tipo: um dos 4 valores operacionais de `ocorrencias.tipo`
   * (item_faltante, endereco_nao_encontrado, cliente_ausente,
   * produto_avariado) — os 3 tipos de pós-venda (troca/devolucao/
   * produto_errado) são fluxo de loja física (cliente retorna com o
   * pedido em mãos), não fazem sentido a partir do app do Entregador em
   * campo, por isso a tela nem oferece essas opções (ver
   * DetalheEntregaScreen.js).
   */
  async abrirOcorrencia({ pedidoId, tipo, descricao, solicitacaoEntregaId = null }) {
    const { data, error } = await separadorSupabase.rpc('abrir_ocorrencia', {
      p_pedido_id: pedidoId,
      p_tipo: tipo,
      p_descricao: descricao,
      p_solicitacao_separacao_id: null,
      p_solicitacao_entrega_id: solicitacaoEntregaId,
    })
    if (error) throw error
    return data
  },
}
