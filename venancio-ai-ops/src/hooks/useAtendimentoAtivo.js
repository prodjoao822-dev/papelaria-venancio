import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/supabase/client'
import { atendimentoService } from '@/services/atendimento.service'

let contadorInstancias = 0

/**
 * Mapa cliente_id -> { nome, operadorId } dos atendimentos ativos agora
 * (conversas com operador atribuído), atualizado em tempo real. Usado pra
 * mostrar a etiqueta "atendido por X" em qualquer tela — não só na Central
 * de Atendimento.
 */
export function useAtendimentoAtivo() {
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  // Nome de canal único por instância do hook — duas telas/componentes
  // montados ao mesmo tempo (ex: DashboardPage + ResumoAtendimentoOperadores)
  // nunca podem disputar o mesmo canal Realtime: o Supabase reaproveita um
  // canal já existente com o mesmo nome e trava ao tentar registrar um novo
  // callback nele depois de já ter dado subscribe() ("cannot add
  // postgres_changes callbacks... after subscribe()"), o que sobe como
  // exceção não tratada e derruba a árvore React inteira (tela branca).
  const nomeCanalRef = useRef(`atendimento-ativo-${++contadorInstancias}`)

  const carregar = useCallback(async () => {
    try {
      const data = await atendimentoService.listarAtendimentosAtivos()
      setLinhas(data)
    } catch {
      // silencioso — a etiqueta é um extra visual, não deve travar a tela
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()

    const canal = supabase
      .channel(nomeCanalRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, carregar)
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [carregar])

  const mapa = {}
  linhas.forEach((l) => {
    if (l.operadores?.nome) mapa[l.cliente_id] = l.operadores.nome
  })

  return { mapa, linhas, carregando }
}
