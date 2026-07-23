export function ConfirmDialog({ visivel, titulo, descricao, onConfirmar, onCancelar, perigo = false }) {
  if (!visivel) return null

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal modal--pequeno" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-titulo">{titulo}</h3>
        </div>
        <div className="modal-body">
          <p className="modal-descricao">{descricao}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className={`btn ${perigo ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirmar}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
