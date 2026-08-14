import { useState } from 'react'
import { useProdutosBusca } from '@/hooks/useProdutosBusca'
import { formatCurrency } from '@/utils/formatters'

/**
 * Input de texto livre com sugestões do catálogo (busca por nome/sku,
 * debounced). Selecionar uma sugestão dispara onSelecionar(produto);
 * continuar digitando sem selecionar se comporta como texto livre puro
 * (fallback pra item fora do catálogo, igual ao input original).
 */
export function ProdutoAutocompleteInput({ value, onChangeText, onSelecionar, placeholder }) {
  const { resultados, buscando, buscar, limpar } = useProdutosBusca()
  const [aberto, setAberto] = useState(false)

  function handleChange(e) {
    const texto = e.target.value
    onChangeText(texto)
    if (texto.trim().length >= 2) {
      buscar(texto)
      setAberto(true)
    } else {
      limpar()
      setAberto(false)
    }
  }

  function handleSelecionar(produto) {
    onSelecionar(produto)
    limpar()
    setAberto(false)
  }

  const mostrarDropdown = aberto && (buscando || resultados.length > 0)

  return (
    <div className="produto-autocomplete">
      <input
        className="input input-sm"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => { if (resultados.length > 0) setAberto(true) }}
        onBlur={() => setAberto(false)}
        autoComplete="off"
      />
      {mostrarDropdown && (
        <div className="produto-autocomplete-dropdown" onMouseDown={(e) => e.preventDefault()}>
          {buscando ? (
            <div className="produto-autocomplete-vazio">Buscando…</div>
          ) : (
            resultados.map((p) => (
              <div
                key={p.id}
                className="produto-autocomplete-item"
                onClick={() => handleSelecionar(p)}
              >
                <div className="produto-autocomplete-item-info">
                  <span className="produto-autocomplete-item-nome">{p.nome}</span>
                  {p.sku && <span className="produto-autocomplete-item-sku">{p.sku}</span>}
                </div>
                <span className="produto-autocomplete-item-preco">{formatCurrency(p.preco)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
