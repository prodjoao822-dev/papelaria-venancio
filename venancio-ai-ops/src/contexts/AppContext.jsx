import { createContext, useContext, useReducer, useCallback, useRef, useState, useEffect } from 'react'

// ─── Toast ────────────────────────────────────────────────────────────────────
const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de AppProvider')
  return ctx
}

// ─── Tema (claro/escuro) ───────────────────────────────────────────────────────
const ThemeContext = createContext(null)
const THEME_STORAGE_KEY = 'venancio-theme'

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de AppProvider')
  return ctx
}

function useThemeState() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme }
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
  const themeState = useThemeState()

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
    <ThemeContext.Provider value={themeState}>
      <ToastContext.Provider value={{ toasts, toast, removeToast }}>
        <RealtimeContext.Provider value={{ registrarHandler, dispararEvento }}>
          {children}
        </RealtimeContext.Provider>
      </ToastContext.Provider>
    </ThemeContext.Provider>
  )
}
