// Contexto de autenticação do Separador — paralelo e independente de
// AuthContext.jsx (Operador). Mesmo shape ({ session, funcionario,
// carregando, login, logout }) pra quem já conhece o AuthContext do
// operador entender de cara, mas roda sobre separadorSupabase (client
// isolado, storageKey própria — ver separadorClient.js) e busca a
// identidade em `funcionarios` (por auth_user_id), não em `operadores`.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { separadorSupabase } from '@/supabase/separadorClient'
import { separadorAuthService } from '@/services/separadorAuth.service'

const SeparadorAuthContext = createContext(null)

export function useSeparadorAuth() {
  const ctx = useContext(SeparadorAuthContext)
  if (!ctx) throw new Error('useSeparadorAuth deve ser usado dentro de SeparadorAuthProvider')
  return ctx
}

export function SeparadorAuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [funcionario, setFuncionario] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const buscarFuncionario = useCallback(async (authUserId) => {
    if (!authUserId || !separadorSupabase) {
      setFuncionario(null)
      return
    }
    const { data } = await separadorSupabase
      .from('funcionarios')
      .select('id, nome, papeis, ativo')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    setFuncionario(data ?? null)
  }, [])

  useEffect(() => {
    if (!separadorSupabase) {
      setCarregando(false)
      return undefined
    }

    separadorSupabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      buscarFuncionario(s?.user?.id).finally(() => setCarregando(false))
    })

    const { data: listener } = separadorSupabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      buscarFuncionario(s?.user?.id)
    })

    return () => listener.subscription.unsubscribe()
  }, [buscarFuncionario])

  const login = useCallback(async (codigoFuncionario, pin) => {
    await separadorAuthService.login(codigoFuncionario, pin)
  }, [])

  const logout = useCallback(async () => {
    await separadorAuthService.logout()
  }, [])

  return (
    <SeparadorAuthContext.Provider value={{ session, funcionario, carregando, login, logout }}>
      {children}
    </SeparadorAuthContext.Provider>
  )
}
