import { useToast } from '@/contexts/AppContext'

const ICONES = {
  sucesso: '✅',
  erro: '❌',
  aviso: '⚠️',
  info: 'ℹ️',
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tipo}`}>
          <span className="toast-icone">{ICONES[t.tipo] ?? 'ℹ️'}</span>
          <span className="toast-mensagem">{t.mensagem}</span>
          <button
            className="toast-fechar"
            onClick={() => removeToast(t.id)}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
