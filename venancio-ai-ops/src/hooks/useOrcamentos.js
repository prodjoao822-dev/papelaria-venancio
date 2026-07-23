import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/supabase/client'
import { orcamentosService } from '@/services/orcamentos.service'
import { useToast } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'

export function useOrcamentos(filtrosIniciais = {}) {
  const [orcamentos, setOrcamentos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const { toast } = useToast()
  const { operador } = useAuth()

  const carregar = useCallback(async (filtros = filtrosIniciais) => {
    setCarregando(true)
    try {
      const data = await orcamentosService.listar(filtros)
      setOrcamentos(data)
    } catch (err) {
      toast.erro('Erro ao carregar orçamentos: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => {
    carregar()

    // Realtime: ouve mudanças na tabela orcamentos
    const canal = supabase
      .channel('orcamentos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos' }, () => {
        carregar()
      })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [carregar])

  const aceitar = useCallback(async (id) => {
    try {
      const pedido = await orcamentosService.aceitar(id, operador?.id ?? null)
      toast.sucesso(`Orçamento aceito! Pedido ${pedido.protocolo} criado.`)
      await carregar()
      return pedido
    } catch (err) {
      toast.erro('Erro ao aceitar: ' + err.message)
      throw err
    }
  }, [toast, carregar, operador])

  const atualizarStatus = useCallback(async (id, novoStatus) => {
    try {
      await orcamentosService.atualizarStatus(id, novoStatus, operador?.id ?? null)
      toast.sucesso(`Status atualizado para ${novoStatus}`)
      await carregar()
    } catch (err) {
      toast.erro('Erro: ' + err.message)
    }
  }, [toast, carregar, operador])

  return { orcamentos, carregando, carregar, aceitar, atualizarStatus }
}
