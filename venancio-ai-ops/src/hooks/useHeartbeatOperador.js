import { useEffect } from 'react'
import { atendimentoService } from '@/services/atendimento.service'
import { DEMO_MODE } from '@/utils/constants'

const INTERVALO_HEARTBEAT_MS = 20000

/** Heartbeat de presença do operador logado na Central de Atendimento.
 *
 * O banco (trigger de distribuição automática) usa
 * `operadores.ultimo_heartbeat` pra decidir quem está "online" (heartbeat
 * nos últimos 90s) e escolher a quem atribuir automaticamente uma conversa
 * que o bot deixou de atender (bot_ativo=false + operador_id nulo). Sem
 * heartbeat recente, o operador simplesmente não recebe distribuição
 * automática — não existe nada pra "desligar" em caso de falha, por isso
 * `registrarHeartbeat` no service já ignora erro silenciosamente.
 *
 * Dispara uma vez no mount (não espera os 20s iniciais) e depois a cada
 * INTERVALO_HEARTBEAT_MS enquanto operadorId existir e DEMO_MODE estiver
 * desligado. */
export function useHeartbeatOperador(operadorId) {
  useEffect(() => {
    if (DEMO_MODE || !operadorId) return undefined

    atendimentoService.registrarHeartbeat()
    const intervalo = setInterval(() => {
      atendimentoService.registrarHeartbeat()
    }, INTERVALO_HEARTBEAT_MS)

    return () => clearInterval(intervalo)
  }, [operadorId])
}
