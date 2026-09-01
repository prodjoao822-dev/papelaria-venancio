import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { APP_NAME } from '@/utils/constants'

export function LoginPage() {
  const { session } = useAuth()
  const [aba, setAba] = useState('email')

  if (session) return <Navigate to="/" replace />

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal" style={{ width: 360, padding: 32, position: 'static' }}>
        <h1 className="page-titulo" style={{ marginBottom: 4 }}>{APP_NAME}</h1>
        <p className="page-descricao" style={{ marginBottom: 20 }}>
          {aba === 'email' ? 'Entre com sua conta de operador' : 'Entre com seu código de operador'}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border, #E5E7EB)' }}>
          <button
            type="button"
            onClick={() => setAba('email')}
            className={`btn-tab ${aba === 'email' ? 'btn-tab--ativa' : ''}`}
            style={{ flex: 1, padding: '8px 0', border: 'none', background: 'none', cursor: 'pointer', fontWeight: aba === 'email' ? 700 : 400, borderBottom: aba === 'email' ? '2px solid var(--primary, #1B5FAE)' : '2px solid transparent' }}
          >
            E-mail e senha
          </button>
          <button
            type="button"
            onClick={() => setAba('codigo')}
            className={`btn-tab ${aba === 'codigo' ? 'btn-tab--ativa' : ''}`}
            style={{ flex: 1, padding: '8px 0', border: 'none', background: 'none', cursor: 'pointer', fontWeight: aba === 'codigo' ? 700 : 400, borderBottom: aba === 'codigo' ? '2px solid var(--primary, #1B5FAE)' : '2px solid transparent' }}
          >
            Código e PIN
          </button>
        </div>

        {aba === 'email' ? <FormularioEmailSenha /> : <FormularioCodigoPin />}
      </div>
    </div>
  )
}

function FormularioEmailSenha() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

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
    <form onSubmit={handleSubmit}>
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
  )
}

// Segunda forma de entrar (01/09/2026) — pros demais operadores da equipe,
// cadastrados pelo dono em Configurações. Código de 4 dígitos + PIN de 6,
// mesmo formato do login do Separador no app mobile. O backend (JS Bot)
// decide se bate — nunca chamamos o Supabase Auth direto daqui (ver
// AuthContext.jsx#loginComCodigo).
function FormularioCodigoPin() {
  const { loginComCodigo } = useAuth()
  const [codigo, setCodigo] = useState('')
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await loginComCodigo(codigo, pin)
    } catch (err) {
      setErro(err.message || 'Código ou PIN inválido.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="campo-label" htmlFor="codigo">Código</label>
      <input
        id="codigo"
        type="text"
        inputMode="numeric"
        maxLength={4}
        className="input"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4))}
        required
        autoFocus
        placeholder="0000"
        style={{ marginBottom: 16, width: '100%', letterSpacing: 4, textAlign: 'center', fontSize: 20 }}
      />

      <label className="campo-label" htmlFor="pin">PIN</label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        maxLength={6}
        className="input"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        required
        placeholder="••••••"
        style={{ marginBottom: 16, width: '100%', letterSpacing: 4, textAlign: 'center', fontSize: 20 }}
      />

      {erro && <p style={{ color: 'var(--danger, #EF4444)', marginBottom: 16 }}>{erro}</p>}

      <button type="submit" className="btn btn-primary w-full" disabled={enviando || codigo.length !== 4 || pin.length !== 6}>
        {enviando ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  )
}
