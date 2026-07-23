import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { APP_NAME } from '@/utils/constants'

export function LoginPage() {
  const { session, login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await login(email, senha)
    } catch (err) {
      setErro('E-mail ou senha inválidos.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form
        onSubmit={handleSubmit}
        className="modal"
        style={{ width: 360, padding: 32, position: 'static' }}
      >
        <h1 className="page-titulo" style={{ marginBottom: 4 }}>{APP_NAME}</h1>
        <p className="page-descricao" style={{ marginBottom: 24 }}>Entre com sua conta de operador</p>

        <label className="campo-label" htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          style={{ marginBottom: 16, width: '100%' }}
        />

        <label className="campo-label" htmlFor="senha">Senha</label>
        <input
          id="senha"
          type="password"
          className="input"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
          style={{ marginBottom: 16, width: '100%' }}
        />

        {erro && <p style={{ color: 'var(--danger, #EF4444)', marginBottom: 16 }}>{erro}</p>}

        <button type="submit" className="btn btn-primary w-full" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
