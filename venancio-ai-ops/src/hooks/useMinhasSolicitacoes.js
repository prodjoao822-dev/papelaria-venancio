// Lista de solicitações do Separador logado — client isolado
// (separadorSupabase), RLS já restringe ao próprio funcionário. Padrão
// "recarregar tudo no evento" (estilo useAtendimentoAtivo.js): a lista de
// um separador é pequena, não vale a pena reidratar item a item.
import { useState, useEffect, useCallback, useRef } from 'react'
import { separadorSupabase } from '@/supabase/separadorClient'
import { separacaoSeparadorService } from '@/services/separacaoSeparador.service'

let contadorInstancias = 0

export function useMinhasSolicitacoes(filtros = {}) {
  const [solicitacoes, setSolicitacoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const nomeCanalRef = useRef(`minhas-solicitacoes-${++contadorInstancias}`)
  const filtrosRef = useRef(filtros)
  filtrosRef.current = filtros

  const carregar = useCallback(async () => {
    try {
      const dados = await separacaoSeparadorService.listarMinhas(filtrosRef.current)
      setSolicitacoes(dados)
      setErro(null)
    } catch (err) {
      setErro(err)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (!separadorSupabase) return undefined
    carregar()

    const canal = separadorSupabase
      .channel(nomeCanalRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao_itens' }, carregar)
      .subscribe()

    return () => { separadorSupabase.removeChannel(canal) }
  }, [carregar])

  return { solicitacoes, carregando, erro, recarregar: carregar }
}
