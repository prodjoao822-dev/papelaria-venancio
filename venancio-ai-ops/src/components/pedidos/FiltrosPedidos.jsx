import { useState } from 'react'
import { STATUS_ORDER, getStatusConfig } from '@/utils/status'

export function FiltrosPedidos({ filtros, onChange }) {
  const [buscaLocal, setBuscaLocal] = useState(filtros.busca ?? '')

  function handleBuscaSubmit(e) {
    e.preventDefault()
    onChange({ ...filtros, busca: buscaLocal })
  }

  function handleStatus(status) {
    onChange({ ...filtros, status })
  }

  function handleData(campo, valor) {
    onChange({ ...filtros, [campo]: valor })
  }

  function limparFiltros() {
    setBuscaLocal('')
    onChange({})
  }

  const temFiltros = filtros.status || filtros.busca || filtros.dataInicio || filtros.dataFim

  return (
    <div className="filtros-painel">
      <div className="filtros-linha">
        {/* Busca */}
        <form className="filtros-busca" onSubmit={handleBuscaSubmit}>
          <input
            type="text"
            className="input filtros-busca-input"
            placeholder="Buscar por cliente ou telefone..."
            value={buscaLocal}
            onChange={(e) => setBuscaLocal(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Buscar
          </button>
        </form>

        {/* Data início */}
        <div className="filtros-campo">
          <label className="filtros-label">De</label>
          <input
            type="date"
            className="input input-sm"
            value={filtros.dataInicio ?? ''}
            onChange={(e) => handleData('dataInicio', e.target.value)}
          />
        </div>

        {/* Data fim */}
        <div className="filtros-campo">
          <label className="filtros-label">Até</label>
          <input
            type="date"
            className="input input-sm"
            value={filtros.dataFim ?? ''}
            onChange={(e) => handleData('dataFim', e.target.value)}
          />
        </div>

        {temFiltros && (
          <button className="btn btn-ghost btn-sm" onClick={limparFiltros}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* Filtros de status */}
      <div className="filtros-status">
        <button
          className={`filtro-status-btn ${!filtros.status || filtros.status === 'TODOS' ? 'filtro-status-btn--ativo' : ''}`}
          onClick={() => handleStatus('TODOS')}
        >
          Todos
        </button>
        {STATUS_ORDER.map((status) => {
          const cfg = getStatusConfig(status)
          const ativo = filtros.status === status
          return (
            <button
              key={status}
              className={`filtro-status-btn ${ativo ? 'filtro-status-btn--ativo' : ''}`}
              style={ativo ? { borderColor: cfg.cor, color: cfg.cor, backgroundColor: cfg.bg } : {}}
              onClick={() => handleStatus(status)}
            >
              {cfg.icone} {cfg.labelCurto}
            </button>
          )
        })}
      </div>
    </div>
  )
}
