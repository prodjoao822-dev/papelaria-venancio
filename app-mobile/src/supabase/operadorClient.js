// Cliente Supabase ISOLADO do Operador — mesmo motivo do
// ../supabase/separadorClient.js: supabase-js mantém UMA sessão ativa por
// instância (guardada no storage sob uma storageKey), e o app agora atende
// dois papéis (funcionário via `funcionarios` e operador via `operadores`,
// mesma tabela usada pelo dashboard web). Cada papel precisa da sua própria
// instância de client com storageKey própria — senão logar como um dos dois
// sobrescreveria a sessão do outro no mesmo storage. `auth.storage` usa
// LargeSecureStore (ver largeSecureStore.js) em vez de AsyncStorage puro,
// porque a sessão é token + PII e não pode ficar em texto legível no device.
import { createClient } from '@supabase/supabase-js'
import { LargeSecureStore } from './largeSecureStore'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const operadorSupabaseConfigurado = !!(supabaseUrl && supabaseAnonKey)

export const operadorSupabase = operadorSupabaseConfigurado
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: new LargeSecureStore(),
        persistSession: true,
        autoRefreshToken: true,
        // Só existe pra fluxo OAuth via navegador (lê o token de `window.location`),
        // que não existe em React Native — deixar default (true) tentaria acessar
        // `window` e quebraria a inicialização do client neste ambiente.
        detectSessionInUrl: false,
        storageKey: 'sb-operador-mobile-auth-token',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null
