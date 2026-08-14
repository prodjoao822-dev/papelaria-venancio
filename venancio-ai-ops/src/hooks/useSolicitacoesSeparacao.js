// Mesmo padrão de useAtendimento.js#useConversas: reidrata só o registro
// afetado (join completo) e faz patch local do array, com fallback de
// refetch completo se a reidratação falhar. Nome de canal único por
// instância montada (mesmo motivo documentado em useAtendimentoAtivo.js:
// duas instâncias no mesmo nome de canal derrubam a árvore React inteira).
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/supabase/client'
import { separacaoService } from '@/services/separacao.service'

let contadorInstancias = 0

export function useSolicitacoesSeparacao(filtros = {}) {
  const [solicitacoes, setSolicitacoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const nomeCanalRef = useRef(`solicitacoes-separacao-${++contadorInstancias}`)
  const filtrosRef = useRef(filtros)
  filtrosRef.current = filtros

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const dados = await separacaoService.listar(filtrosRef.current)
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
        return await separacaoService.buscarPorId(id)
      } catch {
        return null
      }
    }

    const canal = supabase
      .channel(nomeCanalRef.current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'solicitacoes_separacao' },
        async (payload) => {
          const nova = await reidratar(payload.new.id)
          if (!nova) return carregar()
          setSolicitacoes((prev) => (prev.some((s) => s.id === nova.id) ? prev : [nova, ...prev]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'solicitacoes_separacao' },
        async (payload) => {
          const atualizada = await reidratar(payload.new.id)
          if (!atualizada) return carregar()
          setSolicitacoes((prev) => prev.map((s) => (s.id === atualizada.id ? atualizada : s)))
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_separacao_itens' },
        (payload) => {
          const solicitacaoId = payload.new?.solicitacao_id ?? payload.old?.solicitacao_id
          if (!solicitacaoId) return
          reidratar(solicitacaoId).then((atualizada) => {
            if (!atualizada) return
            setSolicitacoes((prev) => prev.map((s) => (s.id === atualizada.id ? atualizada : s)))
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [carregar])

  return { solicitacoes, carregando, erro, recarregar: carregar }
}
