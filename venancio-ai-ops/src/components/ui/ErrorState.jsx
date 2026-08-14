export function ErrorState({ titulo = 'Não foi possível carregar os dados', detalhe, onRetry, compacto = false }) {
  return (
    <div className={`estado-erro ${compacto ? 'estado-erro--compacto' : ''}`}>
      <span>⚠️ {titulo}</span>
      {detalhe && <span className="estado-erro-detalhe">{detalhe}</span>}
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          ↺ Tentar novamente
        </button>
      )}
    </div>
  )
}
