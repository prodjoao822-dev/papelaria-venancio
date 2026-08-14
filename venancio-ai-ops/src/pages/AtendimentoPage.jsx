import { useState, useMemo, useEffect, useRef } from 'react'
import { PRIORIDADE_CONFIG, INTENCOES_CONFIG, STATUS_ATENDIMENTO_CONFIG, DEMO_MODE } from '@/utils/constants'
import { atendimentoService } from '@/services/atendimento.service'
import { useConversas, useMensagens } from '@/hooks/useAtendimento'
import { RealtimeIndicator } from '@/components/dashboard/RealtimeIndicator'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { NovoPedidoModal } from '@/components/pedidos/NovoPedidoModal'
import { NovoOrcamentoModal } from '@/components/orcamentos/NovoOrcamentoModal'
import { useToast } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — só usada com VITE_DEMO_MODE=true (opt-in explícito, ver
// .env.example). Nunca é um fallback automático de erro: se o Supabase real
// falhar com DEMO_MODE desligado (padrão), a tela mostra erro explícito —
// ver ErrorState abaixo.
// ─────────────────────────────────────────────────────────────────────────────

const now = Date.now()
const min = (m) => new Date(now - m * 60000).toISOString()

const MOCK_CONVERSAS = [
  {
    id: 'mock-1',
    nome_cliente: 'Escola Municipal São Paulo',
    telefone: '(11) 99123-0001',
    status: 'aguardando_operador',
    intencao: 'empresa',
    prioridade: 'critica',
    prioridade_score: 100,
    ia_ativa: false,
    operador_nome: 'Ana',
    ultima_mensagem: 'Temos 400 alunos, verba de R$ 180/kit. Precisamos até 10 de fevereiro.',
    ultima_msg_at: min(2),
    tags: ['empresa', 'grande_pedido'],
  },
  {
    id: 'mock-5',
    nome_cliente: 'Distribuidora ABC Ltda',
    telefone: '(11) 3456-7890',
    status: 'aguardando_operador',
    intencao: 'atacado',
    prioridade: 'critica',
    prioridade_score: 95,
    ia_ativa: false,
    operador_nome: null,
    ultima_mensagem: 'Precisamos de cotação para 500 cadernos, 200 resmas A4 e canetas a granel.',
    ultima_msg_at: min(4),
    tags: ['atacado', 'urgente'],
  },
  {
    id: 'mock-2',
    nome_cliente: 'Maria dos Santos',
    telefone: '(11) 98765-4321',
    status: 'aguardando_cliente',
    intencao: 'lista_escolar',
    prioridade: 'alta',
    prioridade_score: 80,
    ia_ativa: true,
    operador_nome: null,
    ultima_mensagem: 'Total: R$ 92,70 → R$ 88,00 à vista! Interesse? 😊',
    ultima_msg_at: min(15),
    tags: ['lista_escolar', '3_ano'],
  },
  {
    id: 'mock-3',
    nome_cliente: 'Pedro Oliveira',
    telefone: '(11) 97654-3210',
    status: 'aguardando_cliente',
    intencao: 'orcamento',
    prioridade: 'alta',
    prioridade_score: 70,
    ia_ativa: true,
    operador_nome: null,
    ultima_mensagem: 'Quer que eu monte um orçamento completo para escritório?',
    ultima_msg_at: min(38),
    tags: ['orcamento'],
  },
  {
    id: 'mock-4',
    nome_cliente: 'Carlos Lima',
    telefone: '(11) 96543-2109',
    status: 'aguardando_cliente',
    intencao: 'duvida',
    prioridade: 'baixa',
    prioridade_score: 25,
    ia_ativa: true,
    operador_nome: null,
    ultima_mensagem: 'Funcionamos de Segunda a Sábado, 8h às 18h.',
    ultima_msg_at: min(59),
    tags: [],
  },
]

const MOCK_MENSAGENS = {
  'mock-1': [
    { id: 'm1-1', remetente: 'cliente', conteudo: 'Olá! Sou da Escola Municipal São Paulo. Preciso fazer um pedido grande de material escolar para o ano letivo 2025.', created_at: min(18) },
    { id: 'm1-2', remetente: 'ia', conteudo: 'Olá! Que ótimo ter a Escola Municipal São Paulo aqui 😊 Para pedidos institucionais de grande volume, vou chamar um de nossos especialistas. Um momento...', created_at: min(17) },
    { id: 'm1-3', remetente: 'sistema', conteudo: 'Ana assumiu o atendimento', created_at: min(10) },
    { id: 'm1-4', remetente: 'operador', operador_nome: 'Ana', conteudo: 'Olá! Sou a Ana, especialista em pedidos institucionais. Poderia me dizer quantos alunos vocês têm e para quais séries precisam do material?', created_at: min(8) },
    { id: 'm1-5', remetente: 'cliente', conteudo: 'Ótimo! Temos 400 alunos, do 1º ao 5º ano fundamental. Temos verba de R$ 180 por kit.', created_at: min(5) },
    { id: 'm1-6', remetente: 'cliente', conteudo: 'Temos 400 alunos, verba de R$ 180/kit. Precisamos até 10 de fevereiro.', created_at: min(2) },
  ],
  'mock-5': [
    { id: 'm5-1', remetente: 'cliente', conteudo: 'Bom dia! Sou da Distribuidora ABC Ltda. Vocês trabalham com venda no atacado para revendedores?', created_at: min(10) },
    { id: 'm5-2', remetente: 'ia', conteudo: 'Bom dia! Sim, trabalhamos com atacado com condições especiais para grandes volumes. Vou transferir para nosso setor comercial. Um momento...', created_at: min(9) },
    { id: 'm5-3', remetente: 'sistema', conteudo: 'IA pausada — aguardando operador', created_at: min(9) },
    { id: 'm5-4', remetente: 'cliente', conteudo: 'Precisamos de cotação para 500 cadernos, 200 resmas A4 e canetas a granel.', created_at: min(4) },
  ],
  'mock-2': [
    { id: 'm2-1', remetente: 'cliente', conteudo: 'Boa tarde! Tenho a lista do meu filho do 3º ano. Posso mandar foto?', created_at: min(25) },
    { id: 'm2-2', remetente: 'ia', conteudo: 'Boa tarde! Pode sim, manda a foto que faço um orçamento rapidinho! 📚', created_at: min(24) },
    { id: 'm2-3', remetente: 'cliente', conteudo: '[📎 Foto da lista escolar]', created_at: min(22) },
    { id: 'm2-4', remetente: 'ia', conteudo: '📋 Orçamento — Lista Escolar 3º Ano:\n\n• 2x Caderno Universitário 96f — R$ 17,80\n• 1x Caderno Brochurão Quad. — R$ 12,50\n• 1x Lápis de cor 24 cores — R$ 22,90\n• 1x Estojo escolar — R$ 35,90\n• 1x Régua 30cm — R$ 3,60\n\n━━━━━━━━━━━━━━━━\nTotal: R$ 92,70\n→ À vista: R$ 88,00 😉\n\nTodos os itens disponíveis. Confirmamos o pedido?', created_at: min(15) },
  ],
  'mock-3': [
    { id: 'm3-1', remetente: 'cliente', conteudo: 'Oi! Quero montar meu home office. Vocês têm organizadores, porta-caneta, bloco de notas?', created_at: min(45) },
    { id: 'm3-2', remetente: 'ia', conteudo: 'Oi! Temos ótimas opções para escritório! 💼 Posso montar um orçamento completo com:\n\n• Organizadores de mesa\n• Porta-caneta em acrílico\n• Blocos de notas e cadernos\n• Canetas e marcadores\n• Grampeador e furador\n\nQuer que eu monte um orçamento completo para escritório?', created_at: min(38) },
  ],
  'mock-4': [
    { id: 'm4-1', remetente: 'cliente', conteudo: 'Olá! Vocês abrem no domingo?', created_at: min(61) },
    { id: 'm4-2', remetente: 'ia', conteudo: 'Olá! 😊 Funcionamos de Segunda a Sábado, das 8h às 18h. Domingos e feriados estamos fechados. Posso ajudar com mais alguma coisa?', created_at: min(59) },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function tempoRelativo(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

function PrioridadeBadge({ prioridade }) {
  const cfg = PRIORIDADE_CONFIG[prioridade] ?? PRIORIDADE_CONFIG.normal
  return (
    <span
      className="prioridade-badge"
      style={{ color: cfg.cor, background: cfg.bg, border: `1px solid ${cfg.borda}` }}
    >
      {cfg.icone} {cfg.label}
    </span>
  )
}

function IntencaoBadge({ intencao }) {
  const cfg = INTENCOES_CONFIG[intencao]
  if (!cfg) return null
  return (
    <span className="intencao-badge">
      {cfg.icone} {cfg.label}
    </span>
  )
}

function StatusAtendBadge({ status }) {
  const cfg = STATUS_ATENDIMENTO_CONFIG[status] ?? STATUS_ATENDIMENTO_CONFIG.novo_lead
  return (
    <span
      className="status-atend-badge"
      style={{ color: cfg.cor, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  )
}

function MsgBalao({ msg }) {
  const tipo = msg.remetente ?? (msg.direcao === 'saida' ? 'operador' : 'cliente')

  if (tipo === 'sistema') {
    return (
      <div className="atend-msg atend-msg--sistema">
        <span>{msg.conteudo}</span>
      </div>
    )
  }

  const esquerda = tipo === 'cliente'
  const linhas = (msg.conteudo ?? '').split('\n')

  return (
    <div className={`atend-msg ${esquerda ? 'atend-msg--cliente' : tipo === 'ia' ? 'atend-msg--ia' : 'atend-msg--operador'}`}>
      {!esquerda && (
        <span className="atend-msg-remetente">
          {tipo === 'ia' ? '🤖 IA' : `👤 ${msg.operador_nome ?? 'Operador'}`}
        </span>
      )}
      <div className="atend-msg-balao">
        {linhas.map((linha, i) => (
          <span key={i}>
            {linha}
            {i < linhas.length - 1 && <br />}
          </span>
        ))}
      </div>
      <span className="atend-msg-hora">{new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const FILTROS = [
  { id: 'todos',    label: 'Todos' },
  { id: 'urgente',  label: 'Urgente' },
  { id: 'operador', label: 'Com Operador' },
  { id: 'ia',       label: 'IA Ativa' },
]

export function AtendimentoPage() {
  const { toast } = useToast()
  const { operador } = useAuth()
  const OPERADOR_ATUAL = operador?.nome ?? 'Operador'

  const real = useConversas()
  const [conversasMock, setConversasMock] = useState(MOCK_CONVERSAS)
  const conversas = DEMO_MODE ? conversasMock : real.conversas
  const setConversas = DEMO_MODE ? setConversasMock : real.setConversas

  const [conversaId, setConversaId] = useState(null)
  const [painelMobile, setPainelMobile] = useState('fila')
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [input, setInput] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [modalPedido, setModalPedido] = useState(false)
  const [modalOrcamento, setModalOrcamento] = useState(false)
  const msgsEndRef = useRef(null)

  const mensagensReal = useMensagens(DEMO_MODE ? null : conversaId)
  const [mensagensMock, setMensagensMock] = useState(MOCK_MENSAGENS)
  const mensagens = DEMO_MODE ? (mensagensMock[conversaId] ?? []) : mensagensReal.mensagens
  const setMensagens = mensagensReal.setMensagens

  // Seleciona a primeira conversa assim que a lista carrega
  useEffect(() => {
    if (!conversaId && conversas.length > 0) setConversaId(conversas[0].id)
  }, [conversas, conversaId])

  // Scroll automático ao final das mensagens
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversaId, mensagens])

  const conversa = useMemo(
    () => conversas.find((c) => c.id === conversaId) ?? null,
    [conversas, conversaId]
  )

  const conversasFiltradas = useMemo(() => {
    let lista = [...conversas]

    if (busca.trim()) {
      const q = busca.toLowerCase()
      lista = lista.filter(
        (c) =>
          (c.nome_cliente ?? '').toLowerCase().includes(q) ||
          (c.telefone ?? '').includes(q) ||
          (c.ultima_mensagem ?? '').toLowerCase().includes(q)
      )
    }

    if (filtro === 'urgente') {
      lista = lista.filter((c) => c.prioridade === 'critica' || c.prioridade === 'alta')
    } else if (filtro === 'operador') {
      lista = lista.filter((c) => c.operador_nome)
    } else if (filtro === 'ia') {
      lista = lista.filter((c) => c.ia_ativa)
    }

    return lista.sort((a, b) => (b.prioridade_score ?? 0) - (a.prioridade_score ?? 0))
  }, [conversas, filtro, busca])

  // ── Helpers de mensagem local (decoração — "sistema" não é persistido) ──────

  function adicionarMensagemLocal(cId, msg) {
    if (DEMO_MODE) {
      setMensagensMock((prev) => ({ ...prev, [cId]: [...(prev[cId] ?? []), msg] }))
    } else if (cId === conversaId) {
      setMensagens((prev) => [...prev, msg])
    }
  }

  function addSistema(cId, texto) {
    adicionarMensagemLocal(cId, {
      id: `sys-${Date.now()}`,
      remetente: 'sistema',
      conteudo: texto,
      created_at: new Date().toISOString(),
    })
  }

  function mutarConversaLocal(id, campos) {
    setConversas((prev) => prev.map((c) => (c.id === id ? { ...c, ...campos } : c)))
  }

  // ── Ações do operador ───────────────────────────────────────────────────────

  async function handleAssumir() {
    if (!conversa) return
    if (DEMO_MODE) {
      mutarConversaLocal(conversa.id, { operador_nome: OPERADOR_ATUAL, ia_ativa: false, status: 'aguardando_operador' })
      addSistema(conversa.id, `${OPERADOR_ATUAL} assumiu o atendimento`)
      toast.sucesso('Conversa assumida')
      return
    }
    try {
      const atualizada = await atendimentoService.assumirConversa(conversa.id, operador?.id)
      setConversas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
      addSistema(conversa.id, `${OPERADOR_ATUAL} assumiu o atendimento`)
      toast.sucesso('Conversa assumida')
    } catch (e) {
      toast.erro(e.message)
    }
  }

  async function handleLiberar() {
    if (!conversa) return
    if (DEMO_MODE) {
      mutarConversaLocal(conversa.id, { operador_nome: null, ia_ativa: true, status: 'aguardando_cliente' })
      addSistema(conversa.id, 'Operador liberou — IA retomou o atendimento')
      toast.info('IA retomou o atendimento')
      return
    }
    try {
      const atualizada = await atendimentoService.liberarConversa(conversa.id)
      setConversas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
      addSistema(conversa.id, 'Operador liberou — IA retomou o atendimento')
      toast.info('IA retomou o atendimento')
    } catch (e) {
      toast.erro(e.message)
    }
  }

  async function handleToggleIA() {
    if (!conversa) return
    const novoEstado = !conversa.ia_ativa
    if (DEMO_MODE) {
      mutarConversaLocal(conversa.id, { ia_ativa: novoEstado })
      addSistema(conversa.id, novoEstado ? 'IA reativada' : 'IA pausada pelo operador')
      toast.info(novoEstado ? 'IA ativada' : 'IA pausada')
      return
    }
    try {
      const atualizada = await atendimentoService.toggleIA(conversa.id, novoEstado)
      setConversas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
      addSistema(conversa.id, novoEstado ? 'IA reativada' : 'IA pausada pelo operador')
      toast.info(novoEstado ? 'IA ativada' : 'IA pausada')
    } catch (e) {
      toast.erro(e.message)
    }
  }

  async function handleChangePrioridade(prioridade) {
    if (!conversa) return
    if (DEMO_MODE) {
      const score = PRIORIDADE_CONFIG[prioridade]?.score ?? 50
      mutarConversaLocal(conversa.id, { prioridade, prioridade_score: score })
      toast.sucesso(`Prioridade alterada para ${PRIORIDADE_CONFIG[prioridade]?.label}`)
      return
    }
    try {
      const atualizada = await atendimentoService.atualizarPrioridade(conversa.id, prioridade)
      setConversas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
      toast.sucesso(`Prioridade alterada para ${PRIORIDADE_CONFIG[prioridade]?.label}`)
    } catch (e) {
      toast.erro(e.message)
    }
  }

  async function handleEnviarMensagem() {
    if (!input.trim() || !conversa) return
    const texto = input.trim()
    setInput('')

    if (DEMO_MODE) {
      adicionarMensagemLocal(conversa.id, {
        id: `op-${Date.now()}`,
        remetente: 'operador',
        operador_nome: OPERADOR_ATUAL,
        conteudo: texto,
        created_at: new Date().toISOString(),
      })
      mutarConversaLocal(conversa.id, { ultima_mensagem: texto, ultima_msg_at: new Date().toISOString() })
      return
    }

    try {
      // Não insere otimista na lista local: a mensagem volta pelo canal
      // realtime de `mensagens` (INSERT) assim que o Supabase confirma —
      // fonte única de verdade, sem duplicar a bolha na tela.
      await atendimentoService.enviarMensagem(conversa.id, texto, operador?.id)
    } catch (e) {
      toast.erro('Erro ao enviar: ' + e.message)
      setInput(texto)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviarMensagem()
    }
  }

  async function handleAddTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '_')
    if (!t || !conversa) return
    setTagInput('')
    if (DEMO_MODE) {
      const novasTags = [...new Set([...(conversa.tags ?? []), t])]
      mutarConversaLocal(conversa.id, { tags: novasTags })
      return
    }
    try {
      const atualizada = await atendimentoService.adicionarTag(conversa.id, t, conversa.tags)
      setConversas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
    } catch (e) {
      toast.erro(e.message)
    }
  }

  async function handleRemoveTag(tag) {
    if (!conversa) return
    if (DEMO_MODE) {
      const novasTags = (conversa.tags ?? []).filter((t) => t !== tag)
      mutarConversaLocal(conversa.id, { tags: novasTags })
      return
    }
    try {
      const atualizada = await atendimentoService.removerTag(conversa.id, tag, conversa.tags)
      setConversas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
    } catch (e) {
      toast.erro(e.message)
    }
  }

  // ── Contadores para header ───────────────────────────────────────────────────

  const nCriticos = conversas.filter((c) => c.prioridade === 'critica').length
  const nComIA = conversas.filter((c) => c.ia_ativa).length
  const nAguardando = conversas.filter((c) => c.status === 'aguardando_operador').length

  // ──────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────────
  return (
    <div className="page page--atendimento">

      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Central de Atendimento</h1>
          <p className="page-descricao">Conversas WhatsApp • IA + Operador em tempo real</p>
        </div>
        <div className="page-header-acoes">
          {DEMO_MODE ? (
            <span className="badge-mock">⚡ Demo</span>
          ) : (
            <RealtimeIndicator status={real.realtimeStatus} />
          )}
          <div className="atend-chips">
            {nCriticos > 0 && (
              <span className="atend-chip atend-chip--danger">🔴 {nCriticos} crítico{nCriticos > 1 ? 's' : ''}</span>
            )}
            {nAguardando > 0 && (
              <span className="atend-chip atend-chip--warning">👤 {nAguardando} aguardando</span>
            )}
            <span className="atend-chip">🤖 {nComIA} com IA</span>
            <span className="atend-chip">💬 {conversas.length} conversas</span>
          </div>
        </div>
      </div>

      {!DEMO_MODE && real.erro && (
        <ErrorState
          compacto
          titulo="Não foi possível carregar as conversas"
          detalhe={`Verifique a conexão com o Supabase. (${real.erro})`}
          onRetry={real.carregar}
        />
      )}

      {/* ── Layout 3 colunas ── */}
      {(DEMO_MODE || !real.erro) && (
      <div className={`atend-layout atend-layout--mobile-${painelMobile}`}>

        {/* ── COL 1: Fila de Atendimento ── */}
        <div className="atend-fila">
          <div className="atend-fila-header">
            <input
              className="atend-busca"
              type="text"
              placeholder="Buscar conversa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <div className="atend-filtros">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  className={`atend-filtro-btn ${filtro === f.id ? 'atend-filtro-btn--ativo' : ''}`}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="atend-fila-lista">
            {!DEMO_MODE && real.carregando ? (
              <LoadingSpinner mensagem="Carregando conversas..." />
            ) : conversasFiltradas.length === 0 ? (
              <div className="atend-fila-vazia">
                <span>💬</span>
                <p>Nenhuma conversa</p>
              </div>
            ) : (
              conversasFiltradas.map((c) => {
                const prCfg = PRIORIDADE_CONFIG[c.prioridade] ?? PRIORIDADE_CONFIG.normal
                const ativa = c.id === conversaId
                return (
                  <button
                    key={c.id}
                    className={`atend-conversa-item ${ativa ? 'atend-conversa-item--ativa' : ''} ${c.prioridade === 'critica' ? 'atend-conversa-item--critica' : ''}`}
                    onClick={() => { setConversaId(c.id); setPainelMobile('chat') }}
                  >
                    {/* Avatar */}
                    <div
                      className="atend-conversa-avatar"
                      style={{ background: `linear-gradient(135deg, ${prCfg.cor}44, ${prCfg.cor}22)`, border: `1px solid ${prCfg.cor}44` }}
                    >
                      <span style={{ color: prCfg.cor, fontSize: 14 }}>
                        {(c.nome_cliente ?? c.telefone)[0].toUpperCase()}
                      </span>
                    </div>

                    <div className="atend-conversa-info">
                      <div className="atend-conversa-topo">
                        <span className="atend-conversa-nome">{c.nome_cliente ?? c.telefone}</span>
                        <span className="atend-conversa-tempo">{tempoRelativo(c.ultima_msg_at)}</span>
                      </div>

                      <div className="atend-conversa-preview">{c.ultima_mensagem ?? '...'}</div>

                      <div className="atend-conversa-badges">
                        <span className="atend-prio-dot" style={{ background: prCfg.cor }} title={prCfg.label} />
                        {c.intencao && <IntencaoBadge intencao={c.intencao} />}
                        {c.ia_ativa ? (
                          <span className="atend-ia-mini atend-ia-mini--on">🤖</span>
                        ) : (
                          <span className="atend-ia-mini atend-ia-mini--off">👤</span>
                        )}
                        {c.operador_nome && (
                          <span className="atend-operador-mini">{c.operador_nome}</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── COL 2: Chat ── */}
        <div className="atend-chat">
          {conversa ? (
            <>
              {/* Chat Header */}
              <div className="atend-chat-header">
                <button
                  className="atend-voltar-fila"
                  onClick={() => setPainelMobile('fila')}
                  aria-label="Voltar para a fila de conversas"
                >
                  ←
                </button>
                <div className="atend-chat-header-info">
                  <span className="atend-chat-nome">{conversa.nome_cliente ?? conversa.telefone}</span>
                  <span className="atend-chat-telefone">{conversa.telefone}</span>
                </div>
                <div className="atend-chat-header-badges">
                  <StatusAtendBadge status={conversa.status} />
                  {conversa.intencao && <IntencaoBadge intencao={conversa.intencao} />}
                  <PrioridadeBadge prioridade={conversa.prioridade} />
                  <span className={`atend-ia-status ${conversa.ia_ativa ? 'atend-ia-status--on' : 'atend-ia-status--off'}`}>
                    {conversa.ia_ativa ? '🤖 IA Ativa' : '👤 Operador'}
                  </span>
                </div>
              </div>

              {/* Mensagens */}
              <div className="atend-chat-msgs">
                {!DEMO_MODE && mensagensReal.erro ? (
                  <ErrorState
                    compacto
                    titulo="Não foi possível carregar as mensagens"
                    detalhe={mensagensReal.erro}
                    onRetry={mensagensReal.recarregar}
                  />
                ) : !DEMO_MODE && mensagensReal.carregando ? (
                  <LoadingSpinner mensagem="Carregando mensagens..." />
                ) : mensagens.length === 0 ? (
                  <div className="atend-msgs-vazio">
                    <span>💬</span>
                    <p>Sem mensagens ainda</p>
                  </div>
                ) : (
                  mensagens.map((msg) => <MsgBalao key={msg.id} msg={msg} />)
                )}
                <div ref={msgsEndRef} />
              </div>

              {/* Input do operador */}
              <div className="atend-chat-input">
                <textarea
                  className="atend-input-textarea"
                  placeholder="Escreva como operador... (Enter para enviar, Shift+Enter para nova linha)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                />
                <div className="atend-input-acoes">
                  <span className="atend-input-hint">Enviando como {OPERADOR_ATUAL}</span>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleEnviarMensagem}
                    disabled={!input.trim()}
                  >
                    Enviar ↗
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="atend-chat-vazio">
              <span className="atend-chat-vazio-icone">💬</span>
              <p>Selecione uma conversa</p>
            </div>
          )}
        </div>

        {/* ── COL 3: Painel do Operador ── */}
        <div className="atend-painel">
          {conversa ? (
            <>
              {/* Controle IA */}
              <div className="atend-painel-secao">
                <p className="atend-painel-titulo">Controle de IA</p>
                <div className="atend-ia-control">
                  <div className="atend-ia-indicator">
                    <span
                      className="atend-ia-dot"
                      style={{ background: conversa.ia_ativa ? '#10B981' : '#EF4444' }}
                    />
                    <span className="atend-ia-label">
                      {conversa.ia_ativa ? 'IA Ativa' : 'IA Pausada'}
                    </span>
                  </div>
                  <button
                    className={`btn btn-sm ${conversa.ia_ativa ? 'btn-warning' : 'btn-success'}`}
                    onClick={handleToggleIA}
                  >
                    {conversa.ia_ativa ? '⏸ Pausar IA' : '▶ Ativar IA'}
                  </button>
                </div>
              </div>

              {/* Operador */}
              <div className="atend-painel-secao">
                <p className="atend-painel-titulo">Responsável</p>
                {conversa.operador_nome ? (
                  <div className="atend-responsavel">
                    <div className="atend-responsavel-info">
                      <div className="atend-responsavel-avatar">
                        {conversa.operador_nome[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="atend-responsavel-nome">{conversa.operador_nome}</p>
                        <p className="atend-responsavel-status">Atendendo</p>
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={handleLiberar}>
                      Liberar
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-primary btn-sm w-full" onClick={handleAssumir}>
                    👤 Assumir Conversa
                  </button>
                )}
              </div>

              {/* Prioridade */}
              <div className="atend-painel-secao">
                <p className="atend-painel-titulo">Prioridade</p>
                <div className="atend-prio-opcoes">
                  {Object.entries(PRIORIDADE_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      className={`atend-prio-btn ${conversa.prioridade === key ? 'atend-prio-btn--ativo' : ''}`}
                      style={conversa.prioridade === key ? { borderColor: cfg.cor, background: cfg.bg, color: cfg.cor } : {}}
                      onClick={() => handleChangePrioridade(key)}
                    >
                      {cfg.icone} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="atend-painel-secao">
                <p className="atend-painel-titulo">Tags</p>
                <div className="atend-tags">
                  {(conversa.tags ?? []).map((tag) => (
                    <span key={tag} className="atend-tag">
                      {tag}
                      <button className="atend-tag-remove" onClick={() => handleRemoveTag(tag)}>✕</button>
                    </span>
                  ))}
                </div>
                <div className="atend-tag-input-row">
                  <input
                    className="atend-tag-input"
                    type="text"
                    placeholder="Nova tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={handleAddTag}>+</button>
                </div>
              </div>

              {/* Ações Rápidas */}
              <div className="atend-painel-secao">
                <p className="atend-painel-titulo">Ações Rápidas</p>
                <div className="atend-acoes-rapidas">
                  <button className="atend-acao-btn" onClick={() => setModalPedido(true)}>
                    📦 Criar Pedido
                  </button>
                  <button className="atend-acao-btn" onClick={() => setModalOrcamento(true)}>
                    📋 Gerar Orçamento
                  </button>
                  <button className="atend-acao-btn" onClick={() => toast.info('Agendar Follow-up ainda não foi implementado — precisa de decisão de produto sobre o fluxo.')}>
                    🔁 Agendar Follow-up
                  </button>
                  <button className="atend-acao-btn atend-acao-btn--danger" onClick={() => toast.info('Encerrar Conversa ainda não foi implementado — precisa de decisão de produto sobre o que "encerrada" significa.')}>
                    ✕ Encerrar Conversa
                  </button>
                </div>
              </div>

              {/* Info do cliente */}
              <div className="atend-painel-secao">
                <p className="atend-painel-titulo">Dados</p>
                <div className="atend-dados">
                  <div className="atend-dado">
                    <span className="atend-dado-label">Telefone</span>
                    <span className="atend-dado-valor">{conversa.telefone}</span>
                  </div>
                  <div className="atend-dado">
                    <span className="atend-dado-label">Intenção</span>
                    <span className="atend-dado-valor">
                      {conversa.intencao ? INTENCOES_CONFIG[conversa.intencao]?.label ?? conversa.intencao : '—'}
                    </span>
                  </div>
                  <div className="atend-dado">
                    <span className="atend-dado-label">Score</span>
                    <span className="atend-dado-valor">{conversa.prioridade_score ?? 50}/100</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="atend-painel-vazio">
              <span>👈</span>
              <p>Selecione uma conversa</p>
            </div>
          )}
        </div>

      </div>
      )}

      {modalPedido && (
        <NovoPedidoModal
          clienteInicial={{ nome: conversa?.nome_cliente ?? '', telefone: conversa?.telefone ?? '' }}
          onFechar={() => setModalPedido(false)}
        />
      )}
      {modalOrcamento && (
        <NovoOrcamentoModal
          clienteInicial={{ nome: conversa?.nome_cliente ?? '', telefone: conversa?.telefone ?? '' }}
          onFechar={() => setModalOrcamento(false)}
        />
      )}
    </div>
  )
}
