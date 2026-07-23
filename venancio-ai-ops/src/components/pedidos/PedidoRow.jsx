import { StatusBadge } from './StatusBadge'
import {
  formatCurrency, formatTimeAgo,
  formatPhone, formatEntrega, truncateText
} from '@/utils/formatters'

export function PedidoRow({ pedido, onClick, atrasado = false }) {
  const cliente      = pedido.clientes
  const nomeCliente  = cliente?.nome ?? cliente?.telefone ?? '—'
  const telefone     = formatPhone(cliente?.telefone)
  const itensResumo  = pedido.itens_pedido?.length
    ? pedido.itens_pedido.map((i) => `${i.quantidade}× ${i.nome_item}`).join(', ')
    : '—'

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
        <div className="pedido-cliente-nome">{nomeCliente}</div>
        <div className="pedido-cliente-tel">{telefone}</div>
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
      <td className="tabela-cell tabela-cell--acao">
        <button
          className="btn btn-sm btn-ghost"
          onClick={(e) => { e.stopPropagation(); onClick(pedido) }}
        >
          Ver
        </button>
      </td>
    </tr>
  )
}
