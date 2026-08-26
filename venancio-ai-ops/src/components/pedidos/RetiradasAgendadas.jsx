import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/supabase/client'
import { formatDateTime } from '@/utils/formatters'

// ─── helpers de tempo ────────────────────────────────────────────────────────
function calcularEstado(horarioPrevisto) {
  if (!horarioPrevisto) return 'sem-horario'
  const agora = new Date()
  const horario = new Date(horarioPrevisto)
  const diffMin = (horario - agora) / 60000

  if (diffMin < 0) return 'atrasado'
  if (diffMin <= 30) return 'proximo'
  return 'normal'
}

function formatarHorario(horarioPrevisto) {
  if (!horarioPrevisto) return null
  const horario = new Date(horarioPrevisto)
  const agora = new Date()
  const diffMin = Math.round((horario - agora) / 60000)

  if (diffMin < -60) return `Atrasado ${Math.abs(Math.round(diffMin / 60))}h`
  if (diffMin < 0) return `Atrasado ${Math.abs(diffMin)} min`
  if (diffMin === 0) return 'Agora'
  if (diffMin < 60) return `Em ${diffMin} min`
  return `Em ${Math.round(diffMin / 60)}h`
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function RetiradasAgendadas({ onAbrirPedido }) {
  const [pedidos, setPedidos] = useState([])
  const [carregando, setCarregando] = useState(true)

  // Atualiza o "relogio" a cada 30s para re-calcular estado visual sem refetch
  useEffect(() => {
    const intervalo = setInterval(() => setPedidos((prev) => [...prev]), 30000)
    return () => clearInterval(intervalo)
  }, [])

  const carregar = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          id, protocolo, valor_total, status, forma_entrega,
          horario_retirada_previsto,
          pronto_para_retirada_em, saiu_para_entrega_em,
          clientes (id, nome, telefone),
          itens_pedido (id, nome_item, quantidade)
        `)
        .not('horario_retirada_previsto', 'is', null)
        .in('status', ['pronto', 'em_separacao'])
        .gte(
          'horario_retirada_previsto',
          new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
        )
        .order('horario_retirada_previsto', { ascending: true })

      if (error) throw error
      setPedidos(data ?? [])
    } catch (err) {
      console.warn('[RetiradasAgendadas] Erro ao carregar:', err.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()

    let channel = null
    try {
      channel = supabase
        .channel('retiradas-agendadas')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pedidos' },
          () => carregar()
        )
        .subscribe()
    } catch { /* supabase indisponivel */ }

    return () => {
      try { channel?.unsubscribe() } catch { /* ignora */ }
    }
  }, [carregar])

  if (carregando || pedidos.length === 0) return null

  return (
    <div className="retiradas-agendadas">
      <div className="retiradas-agendadas-header">
        <span className="retiradas-agendadas-titulo">
          Retiradas Agendadas
        </span>
        <span className="retiradas-agendadas-count">{pedidos.length}</span>
      </div>

      <div className="retiradas-agendadas-lista">
        {pedidos.map((pedido) => {
          const estado = calcularEstado(pedido.horario_retirada_previsto)
          const tempoRelativo = formatarHorario(pedido.horario_retirada_previsto)
          const nomeCliente = pedido.clientes?.nome ?? pedido.clientes?.telefone ?? '—'
          const itensResumo = (pedido.itens_pedido ?? [])
            .slice(0, 2)
            .map((i) => `${i.quantidade}x ${i.nome_item}`)
            .join(', ')
          const maisItens = (pedido.itens_pedido?.length ?? 0) > 2
            ? ` +${pedido.itens_pedido.length - 2}`
            : ''

          return (
            <div
              key={pedido.id}
              className={`retirada-card retirada-card--${estado}`}
              onClick={() => onAbrirPedido?.(pedido.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onAbrirPedido?.(pedido.id)}
            >
              <div className="retirada-card-tempo">
                <span className={`retirada-tempo-badge retirada-tempo-badge--${estado}`}>
                  {estado === 'atrasado' ? '⚠ ' : estado === 'proximo' ? '⏰ ' : '🗓️ '}{tempoRelativo}
                </span>
                <span className="retirada-hora-exata">
                  {formatDateTime(pedido.horario_retirada_previsto)}
                </span>
              </div>

              <div className="retirada-card-info">
                <div className="retirada-card-topo">
                  <span className="retirada-protocolo">{pedido.protocolo}</span>
                  <span className="retirada-cliente">{nomeCliente}</span>
                </div>
                {itensResumo && (
                  <span className="retirada-itens">
                    {itensResumo}{maisItens}
                  </span>
                )}
              </div>

              <div className="retirada-card-acao">›</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
