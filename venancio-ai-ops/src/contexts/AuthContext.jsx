import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/supabase/client'
import { BOT_API_URL } from '@/utils/constants'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [operador, setOperador] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const buscarOperador = useCallback(async (userId) => {
    if (!userId) {
      setOperador(null)
      return
    }
    const { data } = await supabase.from('operadores').select('*').eq('id', userId).maybeSingle()
    setOperador(data ?? null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      buscarOperador(s?.user?.id).finally(() => setCarregando(false))
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      buscarOperador(s?.user?.id)
    })

    return () => listener.subscription.unsubscribe()
  }, [buscarOperador])

  const login = useCallback(async (email, senha) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
  }, [])

  // Segunda forma de entrar, ao lado de e-mail/senha (01/09/2026) -- pros
  // demais operadores da equipe, mesmo espírito do login do Separador no
  // app mobile (código+PIN), mas aqui é sempre o backend do JS Bot quem
  // decide se bate (rate limit + bloqueio por tentativa, nunca client-side
  // contra o Supabase Auth direto -- ver operadorAuthController.js).
  const loginComCodigo = useCallback(async (codigo, pin) => {
    if (!BOT_API_URL) {
      throw new Error('VITE_BOT_API_URL não configurado — login por código indisponível.')
    }

    const resposta = await fetch(`${BOT_API_URL}/operador/login-codigo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, pin }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok || !corpo.ok) {
      throw new Error(corpo.erro || 'Falha no login.')
    }

    const { error } = await supabase.auth.setSession({
      access_token: corpo.sessao.access_token,
      refresh_token: corpo.sessao.refresh_token,
    })
    if (error) throw error
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, operador, carregando, login, loginComCodigo, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
