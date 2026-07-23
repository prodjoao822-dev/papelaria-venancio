import { useState, useEffect, useCallback } from 'react'
import { eventLogService } from '@/services/event-log.service'
import { EVENT_TYPE_CONFIG, ACTOR_TYPE_CONFIG } from '@/utils/constants'

const MOCK_FEED = [
  { id: 'e1', tipo_evento: 'pedido_status_alterado', ator_tipo: 'sistema', ator_nome: 'WhatsApp', descricao: 'Pedido mudou de (novo) para confirmado', criado_em: new Date(Date.now() - 3 * 60000).toISOString() },
  { id: 'e2', tipo_evento: 'consulta_operacional_status_alterado', ator_tipo: 'operador', ator_nome: 'Ana', descricao: 'Consulta operacional mudou de pendente para respondida', criado_em: new Date(Date.now() - 7 * 60000).toISOString() },
  { id: 'e3', tipo_evento: 'pedido_status_alterado', ator_tipo: 'operador', ator_nome: 'Carlos', descricao: 'Pedido mudou de confirmado para em_separacao', criado_em: new Date(Date.now() - 12 * 60000).toISOString() },
  { id: 'e4', tipo_evento: 'orcamento_status_alterado', ator_tipo: 'operador', ator_nome: 'Marcos', descricao: 'Orçamento mudou de rascunho para aceito', criado_em: new Date(Date.now() - 18 * 60000).toISOString() },
  { id: 'e5', tipo_evento: 'pedido_status_alterado', ator_tipo: 'operador', ator_nome: 'Ana', descricao: 'Pedido mudou de em_separacao para pronto', criado_em: new Date(Date.now() - 25 * 60000).toISOString() },
]

function formatarTempo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString)) / 60000)
  if (diff < 1) return 'agora'
  if (diff < 60) return `${diff}min`
  const h = Math.floor(diff / 60)
  return `${h}h`
}

export function ActivityFeed({ limite = 15 }) {
  const [eventos, setEventos] = useState([])
  const [usandoMock, setUsandoMock] = useState(false)
  const [, setTick] = useState(0)

  const carregar = useCallback(async () => {
    try {
      const data = await eventLogService.listarAtividadeFeed(limite)
      setEventos(data)
      setUsandoMock(false)
    } catch {
      setEventos(MOCK_FEED)
      setUsandoMock(true)
    }
  }, [limite])

  useEffect(() => { carregar() }, [carregar])

  // Atualiza tempos a cada 60s sem recarregar do servidor
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Realtime: novo evento → prepend sem reload total
  useEffect(() => {
    if (usandoMock) return
    let channel = null
    try {
      channel = eventLogService.subscribe((payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          setEventos((prev) => [payload.new, ...prev].slice(0, limite))
        }
      })
    } catch {
      channel = null
    }
    return () => { try { channel?.unsubscribe() } catch { /* ignora */ } }
  }, [usandoMock, limite])

  return (
    <div className="activity-feed">
      <div className="activity-feed-header">
        <span className="activity-feed-titulo">Feed de Atividade</span>
        {usandoMock && <span className="badge-mock badge-mock--xs">demo</span>}
        <div className="activity-feed-dot" title="Ao vivo" />
      </div>

      <div className="activity-feed-lista">
        {eventos.length === 0 ? (
          <div className="activity-feed-vazio">Nenhuma atividade recente</div>
        ) : (
          eventos.map((evento) => {
            const cfg = EVENT_TYPE_CONFIG[evento.tipo_evento] ?? { icone: '●', cor: 'var(--text-3)' }
            const actorCfg = ACTOR_TYPE_CONFIG[evento.ator_tipo] ?? { icone: '⚙️', label: 'sistema' }
            return (
              <div key={evento.id} className="activity-event">
                <span className="activity-event-icone" style={{ color: cfg.cor }}>
                  {cfg.icone}
                </span>
                <div className="activity-event-info">
                  <span className="activity-event-desc">{evento.descricao}</span>
                  <span className="activity-event-meta">
                    {actorCfg.icone} {evento.ator_nome ?? actorCfg.label}
                  </span>
                </div>
                <span className="activity-event-tempo">{formatarTempo(evento.criado_em)}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
