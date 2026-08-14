import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePedidoBuscaRapida } from '@/hooks/usePedidoBuscaRapida'
import { StatusBadge } from './StatusBadge'
import { formatCurrency, formatPhone } from '@/utils/formatters'

/**
 * Busca global de pedidos no Header — visível em todas as telas. Busca por
 * protocolo, nome ou telefone do cliente; selecionar um resultado navega
 * pra /pedidos e abre o PedidoModal correspondente (via location.state).
 */
export function BuscaPedidoGlobal() {
  const navigate = useNavigate()
  const { resultados, buscando, buscar, limpar } = usePedidoBuscaRapida()
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)

  function handleChange(e) {
    const v = e.target.value
    setTermo(v)
    if (v.trim().length >= 2) {
      buscar(v)
      setAberto(true)
    } else {
      limpar()
      setAberto(false)
    }
  }

  function handleSelecionar(pedido) {
    navigate('/pedidos', { state: { abrirPedidoId: pedido.id } })
    setTermo('')
    limpar()
    setAberto(false)
  }

  const mostrarDropdown = aberto && termo.trim().length >= 2

  return (
    <div className="header-search">
      <span className="header-search-icone">🔍</span>
      <input
        className="header-search-input"
        type="text"
        placeholder="Buscar pedido por nº, cliente ou telefone..."
        value={termo}
        onChange={handleChange}
        onFocus={() => { if (termo.trim().length >= 2) setAberto(true) }}
        onBlur={() => setAberto(false)}
        autoComplete="off"
        aria-label="Busca global de pedidos"
      />
      {mostrarDropdown && (
        <div className="header-search-dropdown" onMouseDown={(e) => e.preventDefault()}>
          {buscando ? (
            <div className="produto-autocomplete-vazio">Buscando…</div>
          ) : resultados.length === 0 ? (
            <div className="produto-autocomplete-vazio">Nenhum pedido encontrado</div>
          ) : (
            resultados.map((p) => (
              <div key={p.id} className="header-search-item" onClick={() => handleSelecionar(p)}>
                <div className="header-search-item-linha1">
                  <span className="header-search-item-protocolo">{p.protocolo}</span>
                  <StatusBadge status={p.status} tamanho="sm" />
                </div>
                <div className="header-search-item-linha2">
                  <span>{p.clientes?.nome ?? '—'}</span>
                  <span>{formatPhone(p.clientes?.telefone)}</span>
                  <span className="header-search-item-valor">{formatCurrency(p.valor_total)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
