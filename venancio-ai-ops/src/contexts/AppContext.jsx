import { createContext, useContext, useReducer, useCallback, useRef } from 'react'

// ─── Toast ────────────────────────────────────────────────────────────────────
const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de AppProvider')
  return ctx
}

// ─── Realtime ────────────────────────────────────────────────────────────────
const RealtimeContext = createContext(null)

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime deve ser usado dentro de AppProvider')
  return ctx
}

// ─── Toast Reducer ────────────────────────────────────────────────────────────
function toastReducer(state, action) {
  switch (action.type) {
    case 'ADD':
      return [...state, action.toast]
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id)
    default:
      return state
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function AppProvider({ children }) {
  const [toasts, dispatch] = useReducer(toastReducer, [])
  const realtimeHandlers = useRef({})

  const showToast = useCallback((mensagem, tipo = 'info', duracao = 4000) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    dispatch({ type: 'ADD', toast: { id, mensagem, tipo } })
    setTimeout(() => dispatch({ type: 'REMOVE', id }), duracao)
    return id
  }, [])

  const removeToast = useCallback((id) => {
    dispatch({ type: 'REMOVE', id })
  }, [])

  const toast = {
    sucesso: (msg, dur) => showToast(msg, 'sucesso', dur),
    erro: (msg, dur) => showToast(msg, 'erro', dur ?? 6000),
    aviso: (msg, dur) => showToast(msg, 'aviso', dur),
    info: (msg, dur) => showToast(msg, 'info', dur),
  }

  const registrarHandler = useCallback((evento, handler) => {
    realtimeHandlers.current[evento] = handler
  }, [])

  const dispararEvento = useCallback((evento, payload) => {
    const handler = realtimeHandlers.current[evento]
    if (handler) handler(payload)
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, toast, removeToast }}>
      <RealtimeContext.Provider value={{ registrarHandler, dispararEvento }}>
        {children}
      </RealtimeContext.Provider>
    </ToastContext.Provider>
  )
}
