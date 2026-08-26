// Mesmo padrão de useSolicitacoesSeparacao.js: reidrata só o registro afetado
// (join completo) e faz patch local do array, com fallback de refetch
// completo se a reidratação falhar. Nome de canal único por instância
// montada (duas instâncias no mesmo nome de canal derrubam a árvore React
// inteira — ver useAtendimentoAtivo.js).
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/supabase/client'
import { entregaService } from '@/services/entrega.service'

let contadorInstancias = 0

export function useSolicitacoesEntrega(filtros = {}) {
  const [solicitacoes, setSolicitacoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const nomeCanalRef = useRef(`solicitacoes-entrega-${++contadorInstancias}`)
  const filtrosRef = useRef(filtros)
  filtrosRef.current = filtros

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const dados = await entregaService.listar(filtrosRef.current)
      setSolicitacoes(dados)
      setErro(null)
    } catch (err) {
      setErro(err)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    carregar()

    async function reidratar(id) {
      try {
        return await entregaService.buscarPorId(id)
      } catch {
        return null
      }
    }

    const canal = supabase
      .channel(nomeCanalRef.current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'solicitacoes_entrega' },
        async (payload) => {
          const nova = await reidratar(payload.new.id)
          if (!nova) return carregar()
          setSolicitacoes((prev) => (prev.some((s) => s.id === nova.id) ? prev : [nova, ...prev]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'solicitacoes_entrega' },
        async (payload) => {
          const atualizada = await reidratar(payload.new.id)
          if (!atualizada) return carregar()
          setSolicitacoes((prev) => prev.map((s) => (s.id === atualizada.id ? atualizada : s)))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [carregar])

  return { solicitacoes, carregando, erro, recarregar: carregar }
}
