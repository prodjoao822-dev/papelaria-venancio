import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/supabase/client'

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

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, operador, carregando, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
