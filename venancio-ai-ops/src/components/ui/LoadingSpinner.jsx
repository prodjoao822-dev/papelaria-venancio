export function LoadingSpinner({ tamanho = 'md', mensagem = 'Carregando...' }) {
  return (
    <div className={`spinner-wrapper spinner-wrapper--${tamanho}`}>
      <div className="spinner" />
      {mensagem && <p className="spinner-msg">{mensagem}</p>}
    </div>
  )
}

export function LoadingOverlay({ visivel, mensagem = 'Processando...' }) {
  if (!visivel) return null
  return (
    <div className="loading-overlay">
      <div className="loading-overlay-box">
        <div className="spinner spinner--branco" />
        <p>{mensagem}</p>
      </div>
    </div>
  )
}
