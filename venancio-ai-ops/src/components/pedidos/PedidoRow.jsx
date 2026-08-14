import { useNavigate } from 'react-router-dom'
import { StatusBadge } from './StatusBadge'
import { EtiquetaAtendimento } from '@/components/atendimento/EtiquetaAtendimento'
import {
  formatCurrency, formatTimeAgo,
  formatPhone, formatEntrega, truncateText
} from '@/utils/formatters'

export function PedidoRow({ pedido, onClick, atrasado = false, nomeAtendente = null }) {
  const navigate     = useNavigate()
  const cliente      = pedido.clientes
  const nomeCliente  = cliente?.nome ?? cliente?.telefone ?? '—'
  const telefone     = formatPhone(cliente?.telefone)
  const itensResumo  = pedido.itens_pedido?.length
    ? pedido.itens_pedido.map((i) => `${i.quantidade}× ${i.nome_item}`).join(', ')
    : '—'
  const nomeResponsavel = pedido.responsavel_separacao?.nome ?? pedido.responsavel_entrega?.nome ?? '—'

  return (
    <tr
      className={`tabela-row tabela-row--clicavel${atrasado ? ' tabela-row--atrasado' : ''}`}
      onClick={() => onClick(pedido)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(pedido)}
    >
      <td className="tabela-cell tabela-cell--numero">
        <span className="pedido-numero">{pedido.protocolo}</span>
      </td>
      <td className="tabela-cell">
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{pedido.sequencia || '—'}</span>
      </td>
      <td className="tabela-cell">
        <div className="pedido-cliente-nome">{nomeCliente}</div>
        <div className="pedido-cliente-tel">{telefone}</div>
        <EtiquetaAtendimento nome={nomeAtendente} />
      </td>
      <td className="tabela-cell tabela-cell--itens">
        <span className="pedido-itens-resumo" title={itensResumo}>
          {truncateText(itensResumo, 48)}
        </span>
      </td>
      <td className="tabela-cell tabela-cell--valor">
        <span className="pedido-valor">{formatCurrency(pedido.valor_total)}</span>
      </td>
      <td className="tabela-cell tabela-cell--entrega">
        <span className="pedido-entrega">{formatEntrega(pedido.forma_entrega)}</span>
      </td>
      <td className="tabela-cell">
        <StatusBadge status={pedido.status} tamanho="sm" />
      </td>
      <td className="tabela-cell tabela-cell--tempo">
        <span className={`pedido-tempo${atrasado ? ' pedido-tempo--atrasado' : ''}`}>
          {atrasado ? '⚠ ' : ''}{formatTimeAgo(pedido.criado_em)}
        </span>
      </td>
      <td className="tabela-cell">
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{nomeResponsavel}</span>
      </td>
      <td className="tabela-cell tabela-cell--acao">
        <button
          className="btn btn-sm btn-ghost"
          onClick={(e) => { e.stopPropagation(); onClick(pedido) }}
        >
          Ver
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={(e) => { e.stopPropagation(); navigate(`/pedidos/${pedido.id}/ficha`) }}
        >
          Ficha
        </button>
        <button
          className="btn btn-sm btn-ghost"
          title="Delegar separação a um funcionário"
          onClick={(e) => { e.stopPropagation(); navigate('/separacao', { state: { pedidoId: pedido.id } }) }}
        >
          Delegar
        </button>
      </td>
    </tr>
  )
}
