// Contexto de autenticação do Operador — mesmo shape do
// SeparadorAuthContext.js ({ session, operador, carregando, login, logout}),
// rodando sobre operadorSupabase (client isolado, storageKey própria — ver
// ../supabase/operadorClient.js) e buscando a identidade em `operadores`.
//
// Diferença estrutural importante em relação ao Separador (documentada em
// chatbot/papelaria-bot/src/dashboard/operadorAuthController.js e espelhada
// em venancio-ai-ops/src/contexts/AuthContext.jsx): `operadores.id` JÁ É o
// `auth.uid()` diretamente — não existe uma coluna `auth_user_id`
// desacoplada como em `funcionarios`. Por isso a busca aqui é
// `.eq('id', authUserId)`, nunca `.eq('auth_user_id', ...)`.
//
// Sem registro de push aqui (decisão desta implementação — RF-08/push para
// o papel Operador não está no escopo desta v1, ver plano de tarefas):
// diferente de SeparadorAuthContext.login, que dispara
// pushNotificationsService.registrarAposLogin() best-effort, o login do
// Operador não mexe em push.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { operadorSupabase } from '../supabase/operadorClient'
import { operadorAuthService } from '../services/operadorAuth.service'

const OperadorAuthContext = createContext(null)

export function useOperadorAuth() {
  const ctx = useContext(OperadorAuthContext)
  if (!ctx) throw new Error('useOperadorAuth deve ser usado dentro de OperadorAuthProvider')
  return ctx
}

export function OperadorAuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [operador, setOperador] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const buscarOperador = useCallback(async (authUserId) => {
    if (!authUserId || !operadorSupabase) {
      setOperador(null)
      return
    }
    // Colunas explícitas (não `select('*')`): evita trazer pro client
    // campos internos de bloqueio por tentativa (pin_tentativas_falhas,
    // pin_bloqueado_ate) que nenhuma tela precisa exibir.
    const { data } = await operadorSupabase
      .from('operadores')
      .select('id, nome, codigo, papel, ativo')
      .eq('id', authUserId)
      .maybeSingle()
    setOperador(data ?? null)
  }, [])

  useEffect(() => {
    if (!operadorSupabase) {
      setCarregando(false)
      return undefined
    }

    operadorSupabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      buscarOperador(s?.user?.id).finally(() => setCarregando(false))
    })

    const { data: listener } = operadorSupabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      buscarOperador(s?.user?.id)
    })

    return () => listener.subscription.unsubscribe()
  }, [buscarOperador])

  const login = useCallback(async (codigo, pin) => {
    await operadorAuthService.login(codigo, pin)
  }, [])

  const logout = useCallback(async () => {
    await operadorAuthService.logout()
  }, [])

  return (
    <OperadorAuthContext.Provider value={{ session, operador, carregando, login, logout }}>
      {children}
    </OperadorAuthContext.Provider>
  )
}
