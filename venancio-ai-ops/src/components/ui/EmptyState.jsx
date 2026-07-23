export function EmptyState({ icone = '📭', titulo, descricao, acao }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icone">{icone}</div>
      {titulo && <h3 className="empty-state-titulo">{titulo}</h3>}
      {descricao && <p className="empty-state-desc">{descricao}</p>}
      {acao && (
        <button className="btn btn-primary" onClick={acao.onClick}>
          {acao.label}
        </button>
      )}
    </div>
  )
}
