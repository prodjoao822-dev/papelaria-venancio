import { supabase } from '@/supabase/client'
import { N8N_WEBHOOKS, BOT_API_URL } from '@/utils/constants'
import { normalizarTelefone } from '@/utils/telefone'

const SELECT_ORC_COMPLETO = `
  *,
  clientes (id, nome, telefone),
  pedidos (id, protocolo, status),
  itens_orcamento (
    id, nome_item, quantidade, valor_unitario, valor_total, produto_id,
    produtos (id, nome, sku, imagem_url)
  )
`

export const orcamentosService = {
  async listar(filtros = {}) {
    // Mesma limitação do PostgREST documentada em pedidos.service.js: filtrar
    // uma coluna de tabela embutida (clientes.nome) sem !inner não garante
    // filtrar as linhas de fora — busca clientes primeiro, filtra orçamentos
    // por cliente_id.
    let clienteIdsBusca = null
    if (filtros.busca) {
      const termoBusca = filtros.busca.trim()
      const { data: clientesMatch, error: errClientes } = await supabase
        .from('clientes')
        .select('id')
        .or(`nome.ilike.%${termoBusca}%,telefone.ilike.%${termoBusca}%`)
      if (errClientes) throw errClientes
      clienteIdsBusca = (clientesMatch ?? []).map((c) => c.id)
      if (clienteIdsBusca.length === 0) return []
    }

    let query = supabase
      .from('orcamentos')
      .select(SELECT_ORC_COMPLETO)
      .order('criado_em', { ascending: false })
      .limit(100)

    if (filtros.status && filtros.status !== 'TODOS') {
      query = query.eq('status', filtros.status)
    }
    if (filtros.clienteId) {
      query = query.eq('cliente_id', filtros.clienteId)
    }
    if (clienteIdsBusca) {
      query = query.in('cliente_id', clienteIdsBusca)
    }

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async buscarPorId(id) {
    const { data, error } = await supabase
      .from('orcamentos')
      .select(SELECT_ORC_COMPLETO)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  /** cliente_id, tipo ('lista_escolar'|'cotacao_empresa'|'venda_geral'), itens: [{produto_id?, descricao_livre?, quantidade, valor_unitario}] */
  async criar(dadosOrcamento) {
    const { itens, ...campos } = dadosOrcamento

    const { data: orcamento, error: errOrc } = await supabase
      .from('orcamentos')
      .insert({
        cliente_id: campos.cliente_id,
        conversa_id: campos.conversa_id ?? null,
        tipo: campos.tipo ?? 'venda_geral',
        escola_id: campos.escola_id ?? null,
        status: campos.status ?? 'rascunho',
        observacoes: campos.observacoes ?? null,
      })
      .select()
      .single()

    if (errOrc) throw errOrc

    if (itens && itens.length > 0) {
      const itensMapeados = itens.map((item) => ({
        orcamento_id: orcamento.id,
        produto_id: item.produto_id ?? null,
        descricao_livre: item.descricao_livre ?? null,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
      }))
      const { error: errItens } = await supabase.from('itens_orcamento').insert(itensMapeados)
      if (errItens) throw errItens
    }

    await notificarN8n('ORCAMENTO_CRIADO', { orcamentoId: orcamento.id })
    return orcamentosService.buscarPorId(orcamento.id)
  },

  /** novoStatus é um dos valores reais do enum status_orcamento (rascunho/enviado/aceito/recusado/expirado). */
  async atualizarStatus(id, novoStatus, operadorId = null, observacao = null) {
    const { error } = await supabase.rpc('atualizar_status_orcamento_dashboard', {
      p_orcamento_id: id,
      p_novo_status: novoStatus,
      p_operador_id: operadorId,
      p_observacao: observacao,
    })
    if (error) throw error

    if (novoStatus === 'enviado') await notificarN8n('ORCAMENTO_CRIADO', { orcamentoId: id })
    if (novoStatus === 'aceito') await notificarN8n('ORCAMENTO_APROVADO', { orcamentoId: id })
    if (novoStatus === 'recusado') await notificarN8n('ORCAMENTO_RECUSADO', { orcamentoId: id })

    return orcamentosService.buscarPorId(id)
  },

  /**
   * Aceita o orçamento — nasce o pedido (aceitar_orcamento() já copia os itens
   * de itens_orcamento pra itens_pedido numa transação central, o dashboard
   * nunca monta o pedido manualmente).
   */
  async aceitar(id, operadorId = null) {
    const { data: pedido, error } = await supabase.rpc('aceitar_orcamento_dashboard', {
      p_orcamento_id: id,
      p_operador_id: operadorId,
    })
    if (error) throw error

    await notificarN8n('ORCAMENTO_CONVERTIDO', { orcamentoId: id, pedidoId: pedido.id })
    return pedido
  },

  /** Atualiza campos soltos e/ou substitui os itens (valor_total é recalculado por trigger). */
  async atualizar(id, campos) {
    const { itens, ...resto } = campos

    if (itens) {
      const { error: errDelete } = await supabase.from('itens_orcamento').delete().eq('orcamento_id', id)
      if (errDelete) throw errDelete

      if (itens.length > 0) {
        const itensMapeados = itens.map((item) => ({
          orcamento_id: id,
          produto_id: item.produto_id ?? null,
          descricao_livre: item.descricao_livre ?? null,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
        }))
        const { error: errItens } = await supabase.from('itens_orcamento').insert(itensMapeados)
        if (errItens) throw errItens
      }
    }

    if (Object.keys(resto).length > 0) {
      const { error } = await supabase.from('orcamentos').update(resto).eq('id', id)
      if (error) throw error
    }

    return orcamentosService.buscarPorId(id)
  },

  /**
   * Preenche o preço de um item sem valor_unitario — caso mais comum: itens
   * de "Cotação Empresa" (WhatsApp → lista digitada pelo cliente), que
   * nascem sem preço de propósito (cotacaoEmpresa.js: "sem catálogo/preço
   * automático") e ficavam sem nenhum jeito de precificar depois no
   * dashboard. valor_total é coluna gerada (quantidade * valor_unitario),
   * recalcula sozinha.
   */
  async atualizarPrecoItem(itemId, valorUnitario) {
    const { data, error } = await supabase
      .from('itens_orcamento')
      .update({ valor_unitario: valorUnitario })
      .eq('id', itemId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Manda o PDF do orçamento pro WhatsApp do cliente através do JS Bot (mesmo
   * motivo de atendimentoService.enviarMensagem: é ele quem tem a credencial
   * da Evolution API). Diferente do envio de mensagem manual, não exige uma
   * conversa com bot pausado — mandar um documento não é "assumir" a
   * conversa, então funciona mesmo pra cliente sem conversa em aberto.
   */
  async enviarPdf(telefone, base64, nomeArquivo, legenda) {
    if (!BOT_API_URL) {
      throw new Error('VITE_BOT_API_URL não configurado — não é possível enviar o PDF pelo WhatsApp.')
    }
    if (!telefone) {
      throw new Error('Orçamento sem telefone de cliente associado.')
    }

    // Defesa em profundidade: clientes.service.js já normaliza o telefone na
    // hora de cadastrar (mesmo formato só-dígitos-com-DDI que o bot grava a
    // partir de uma conversa real do WhatsApp — ver utils/telefone.js), mas
    // orçamentos criados manualmente ANTES desse fix podem ter o telefone do
    // cliente salvo num formato antigo (com máscara, sem DDI etc.), que a
    // Evolution API rejeita — causa raiz confirmada do "Falha ao enviar o PDF
    // pelo WhatsApp" em orçamento criado pelo dashboard (02/09/2026).
    // Normaliza de novo aqui pra também corrigir esses registros já existentes,
    // sem depender de backfill manual no banco.
    const telefoneNormalizado = normalizarTelefone(telefone)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sessão expirada. Faça login novamente.')

    const resposta = await fetch(`${BOT_API_URL}/operador/orcamentos/enviar-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ telefone: telefoneNormalizado, base64, nomeArquivo, legenda }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok || !corpo.ok) {
      throw new Error(corpo.erro || 'Falha ao enviar o PDF pelo WhatsApp.')
    }

    return true
  },

  /** Sequência/Operação do ShopControl — pode ser preenchida antes de virar pedido. */
  async atualizarSequencia(orcamentoId, { sequencia, operacao }) {
    const { data, error } = await supabase
      .from('orcamentos')
      .update({ sequencia, operacao })
      .eq('id', orcamentoId)
      .select()
      .single()

    if (error) throw error
    return data
  },
}

async function notificarN8n(evento, payload) {
  const base = import.meta.env.VITE_N8N_WEBHOOK_BASE
  if (!base) return
  const endpoint = N8N_WEBHOOKS[evento]
  if (!endpoint) return
  try {
    await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento, ...payload, timestamp: new Date().toISOString() }),
    })
  } catch { /* n8n offline não bloqueia */ }
}
