// Contexto de autenticação do Separador — mesmo shape do
// venancio-ai-ops/src/contexts/SeparadorAuthContext.jsx ({ session,
// funcionario, carregando, login, logout }), rodando sobre separadorSupabase
// (client isolado, storageKey própria — ver ../supabase/separadorClient.js)
// e buscando a identidade em `funcionarios` (por auth_user_id).
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { separadorSupabase } from '../supabase/separadorClient'
import { separadorAuthService } from '../services/separadorAuth.service'
import { pushNotificationsService } from '../services/pushNotifications.service'

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
      .select('id, nome, codigo_funcionario, papeis, ativo')
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
    // Best-effort e não-bloqueante por design: pedir permissão de push e
    // registrar o token nunca deve atrasar a navegação pós-login nem
    // derrubar o login se falhar (rede instável da loja, permissão negada,
    // RPC ainda não existir no banco). Ver pushNotifications.service.js.
    pushNotificationsService.registrarAposLogin().catch(() => {})
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
