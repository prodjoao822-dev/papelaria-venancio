// Cliente Supabase ISOLADO do Separador — distinto do cliente do Operador
// (src/supabase/client.js). Precisa ser um client separado, não só um
// segundo AuthContext sobre o mesmo client: supabase-js mantém UMA sessão
// ativa por instância (guardada em localStorage sob uma storageKey), então
// se a tela do Separador chamasse `setSession()` no client do Operador, ia
// sobrescrever a sessão dele (e vice-versa) — quebraria a premissa central
// do fluxo: "Operador delega e acompanha ao vivo enquanto o Separador
// trabalha, cada um na própria sessão". `storageKey` diferente é o que
// permite as duas sessões coexistirem no mesmo navegador sem colidir.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const separadorSupabaseConfigurado = !!(supabaseUrl && supabaseAnonKey)

export const separadorSupabase = separadorSupabaseConfigurado
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sb-separador-auth-token' },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null
