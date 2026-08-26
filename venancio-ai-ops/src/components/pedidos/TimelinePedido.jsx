import { useState, useEffect } from 'react'
import { eventosService } from '@/services/eventos.service'
import { formatDateTime } from '@/utils/formatters'
import { useToast } from '@/contexts/AppContext'

// Mapeamento genérico por prefixo de `tipo_evento` — não precisa ser
// exaustivo (novos tipos de evento caem no ícone padrão sem quebrar nada).
const ICONES_POR_PREFIXO = [
  ['pedido_status', '🔵'],
  ['orcamento_status', '📝'],
  ['consulta_operacional', '❓'],
  ['entrega', '🚚'],
  ['ocorrencia', '⚠️'],
]

function iconeDoEvento(tipoEvento) {
  const encontrado = ICONES_POR_PREFIXO.find(([prefixo]) => tipoEvento?.startsWith(prefixo))
  return encontrado ? encontrado[1] : '•'
}

const LABEL_ATOR_TIPO = {
  bot: 'Bot',
  cliente: 'Cliente',
  sistema: 'Sistema',
  n8n: 'Automação (n8n)',
}

function nomeDoAtor(evento) {
  if (evento.ator_tipo === 'operador') return evento.operadores?.nome ?? 'Operador'
  if (evento.ator_tipo === 'funcionario') return evento.funcionarios?.nome ?? 'Funcionário'
  return LABEL_ATOR_TIPO[evento.ator_tipo] ?? evento.ator_tipo ?? 'Sistema'
}

/**
 * Linha do tempo unificada de um pedido: une histórico de status, entrega e
 * ocorrências (tabela `eventos`, alimentada por triggers no banco — ver
 * Requisitos_Addendum_Entrega_Ocorrencia.md, Fase D). Só leitura.
 */
export function TimelinePedido({ pedidoId, orcamentoId }) {
  const [eventos, setEventos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    if (!pedidoId) return
    setCarregando(true)
    eventosService
      .buscarPorPedido(pedidoId, orcamentoId)
      .then(setEventos)
      .catch((err) => toast.erro('Erro ao carregar linha do tempo: ' + err.message))
      .finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId, orcamentoId])

  if (carregando) {
    return <p className="texto-vazio">Carregando linha do tempo...</p>
  }

  if (eventos.length === 0) {
    return <p className="texto-vazio">Nenhum evento registrado ainda.</p>
  }

  return (
    <div className="timeline-lista">
      {eventos.map((evento) => (
        <div key={evento.id} className="timeline-item">
          <span className="timeline-icone">{iconeDoEvento(evento.tipo_evento)}</span>
          <div className="timeline-info">
            <span className="timeline-descricao">{evento.descricao}</span>
            <span className="timeline-meta">
              {nomeDoAtor(evento)} · {formatDateTime(evento.criado_em)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
