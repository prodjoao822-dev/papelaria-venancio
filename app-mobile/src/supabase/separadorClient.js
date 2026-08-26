// Cliente Supabase ISOLADO do Separador — mesmo motivo do
// venancio-ai-ops/src/supabase/separadorClient.js: supabase-js mantém UMA
// sessão ativa por instância (guardada no storage sob uma storageKey), e o
// app mobile é usado só pelo Separador, mas manter uma storageKey própria
// evita colidir com qualquer outra sessão Supabase que venha a existir no
// mesmo device no futuro. `auth.storage` usa LargeSecureStore (ver
// largeSecureStore.js) em vez de AsyncStorage puro, porque a sessão é
// token + PII e não pode ficar em texto legível no device.
import { createClient } from '@supabase/supabase-js'
import { LargeSecureStore } from './largeSecureStore'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const separadorSupabaseConfigurado = !!(supabaseUrl && supabaseAnonKey)

export const separadorSupabase = separadorSupabaseConfigurado
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: new LargeSecureStore(),
        persistSession: true,
        autoRefreshToken: true,
        // Só existe pra fluxo OAuth via navegador (lê o token de `window.location`),
        // que não existe em React Native — deixar default (true) tentaria acessar
        // `window` e quebraria a inicialização do client neste ambiente.
        detectSessionInUrl: false,
        storageKey: 'sb-separador-mobile-auth-token',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null
