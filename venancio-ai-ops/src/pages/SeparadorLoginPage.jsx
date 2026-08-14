import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useSeparadorAuth } from '@/contexts/SeparadorAuthContext'

/** Login do Separador — código de funcionário + PIN de 6 dígitos. Rota
 * pública `/separador`, fora do Layout/RequireAuth do Operador (é uma
 * identidade totalmente separada, ver SeparadorAuthContext.jsx). */
export function SeparadorLoginPage() {
  const { session, carregando, login } = useSeparadorAuth()
  const [codigo, setCodigo] = useState('')
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  if (carregando) return null
  if (session) return <Navigate to="/separador/painel" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await login(codigo.trim(), pin)
    } catch (err) {
      setErro(err.message || 'Código ou PIN inválido.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} className="modal" style={{ width: 340, padding: 32, position: 'static' }}>
        <h1 className="page-titulo" style={{ marginBottom: 4 }}>Área do Separador</h1>
        <p className="page-descricao" style={{ marginBottom: 24 }}>Entre com seu código e PIN</p>

        <label className="campo-label" htmlFor="codigo">Código de funcionário</label>
        <input
          id="codigo"
          type="text"
          className="input"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          style={{ marginBottom: 16, width: '100%' }}
        />

        <label className="campo-label" htmlFor="pin">PIN (6 dígitos)</label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          className="input"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
          autoComplete="current-password"
          style={{ marginBottom: 16, width: '100%', letterSpacing: 4, textAlign: 'center' }}
        />

        {erro && <p style={{ color: 'var(--danger, #EF4444)', marginBottom: 16 }}>{erro}</p>}

        <button type="submit" className="btn btn-primary w-full" disabled={enviando || pin.length !== 6}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
