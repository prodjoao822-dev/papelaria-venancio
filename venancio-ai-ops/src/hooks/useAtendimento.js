import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/supabase/client'
import { atendimentoService } from '@/services/atendimento.service'
import { DEMO_MODE } from '@/utils/constants'

/** Fila de conversas (coluna 1 da Central de Atendimento) com realtime —
 * mesmo padrão de usePedidos.js: INSERT/UPDATE reidratam a linha via
 * buscarPorId (pra trazer os joins) e atualizam o estado local sem re-fetch
 * completo da lista inteira. */
export function useConversas() {
  const [conversas, setConversas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [realtimeStatus, setRealtimeStatus] = useState('conectando')

  const carregar = useCallback(async () => {
    if (DEMO_MODE) {
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const data = await atendimentoService.listar()
      setConversas(data)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    if (DEMO_MODE || !supabase) return undefined

    const canal = supabase
      .channel('conversas-fila-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversas' },
        async (payload) => {
          try {
            const nova = await atendimentoService.buscarPorId(payload.new.id)
            setConversas((prev) => (prev.some((c) => c.id === nova.id) ? prev : [nova, ...prev]))
          } catch {
            carregar()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversas' },
        async (payload) => {
          try {
            const atualizada = await atendimentoService.buscarPorId(payload.new.id)
            setConversas((prev) => prev.map((c) => (c.id === atualizada.id ? atualizada : c)))
          } catch {
            // ignora — o estado já pode ter sido atualizado localmente pela ação do operador
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'conversas' },
        (payload) => {
          setConversas((prev) => prev.filter((c) => c.id !== payload.old.id))
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('conectado')
        else if (status === 'CHANNEL_ERROR') setRealtimeStatus('erro')
        else if (status === 'CLOSED') setRealtimeStatus('desconectado')
      })

    return () => {
      supabase.removeChannel(canal)
    }
  }, [carregar])

  return { conversas, carregando, erro, realtimeStatus, carregar, setConversas }
}

/** Mensagens da conversa aberta no momento, com realtime — assina só a
 * conversa ativa (filter conversa_id=eq.<id>) e reabre o canal a cada troca
 * de conversa, sempre dando removeChannel no canal anterior antes de abrir
 * o novo, pra não empilhar subscriptions duplicadas. */
export function useMensagens(conversaId) {
  const [mensagens, setMensagens] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(null)
  const idsVistos = useRef(new Set())

  const carregar = useCallback(async () => {
    if (!conversaId || DEMO_MODE) {
      setMensagens([])
      idsVistos.current = new Set()
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const data = await atendimentoService.buscarMensagens(conversaId)
      idsVistos.current = new Set(data.map((m) => m.id))
      setMensagens(data)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }, [conversaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    if (!conversaId || DEMO_MODE || !supabase) return undefined

    const canal = atendimentoService.subscribeMensagens(conversaId, async (payload) => {
      if (!payload.new) return
      try {
        const completa = await atendimentoService.buscarMensagemPorId(payload.new.id)
        if (idsVistos.current.has(completa.id)) return
        idsVistos.current.add(completa.id)
        setMensagens((prev) => [...prev, completa])
      } catch {
        // se a re-busca falhar, ignora — a próxima troca de conversa recarrega tudo
      }
    })

    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversaId])

  return { mensagens, carregando, erro, setMensagens, recarregar: carregar }
}
