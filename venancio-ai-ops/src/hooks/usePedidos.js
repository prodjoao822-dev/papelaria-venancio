import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/supabase/client'
import { pedidosService } from '@/services/pedidos.service'
import { useToast } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'

export function usePedidos(filtrosIniciais = {}) {
  const [pedidos, setPedidos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [realtimeStatus, setRealtimeStatus] = useState('conectando')
  const { toast } = useToast()
  const { operador } = useAuth()
  const canalRef = useRef(null)
  const filtrosRef = useRef(filtrosIniciais)

  const carregar = useCallback(async (filtros = filtrosRef.current) => {
    filtrosRef.current = filtros
    setCarregando(true)
    setErro(null)
    try {
      const data = await pedidosService.listar(filtros)
      setPedidos(data)
    } catch (err) {
      setErro(err.message)
      toast.erro('Erro ao carregar pedidos: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }, [toast])

  const atualizarStatus = useCallback(
    async (pedidoId, novoStatus, observacao = null) => {
      try {
        const atualizado = await pedidosService.atualizarStatus(pedidoId, novoStatus, operador?.id ?? null, observacao)
        setPedidos((prev) =>
          prev.map((p) => (p.id === pedidoId ? { ...p, ...atualizado } : p))
        )
        toast.sucesso(`Status atualizado para "${novoStatus.replace(/_/g, ' ')}"`)
        return atualizado
      } catch (err) {
        toast.erro('Erro ao atualizar status: ' + err.message)
        throw err
      }
    },
    [toast, operador]
  )

  // Assinatura Realtime
  useEffect(() => {
    const canal = supabase
      .channel('pedidos-dashboard')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        async (payload) => {
          try {
            const novoPedido = await pedidosService.buscarPorId(payload.new.id)
            setPedidos((prev) => [novoPedido, ...prev])
            const nome = novoPedido.clientes?.nome ?? novoPedido.clientes?.telefone ?? 'cliente'
            toast.info(`Novo pedido ${novoPedido.protocolo} de ${nome}`, 6000)
          } catch {
            carregar()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos' },
        async (payload) => {
          try {
            const atualizado = await pedidosService.buscarPorId(payload.new.id)
            setPedidos((prev) =>
              prev.map((p) => (p.id === atualizado.id ? atualizado : p))
            )
          } catch {
            // ignora — o estado já foi atualizado localmente pelo atualizarStatus
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('conectado')
        else if (status === 'CHANNEL_ERROR') setRealtimeStatus('erro')
        else if (status === 'CLOSED') setRealtimeStatus('desconectado')
      })

    canalRef.current = canal

    return () => {
      supabase.removeChannel(canal)
    }
  }, [carregar, toast])

  useEffect(() => {
    carregar(filtrosIniciais)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    pedidos,
    carregando,
    erro,
    realtimeStatus,
    carregar,
    atualizarStatus,
    setPedidos,
  }
}

export function useKpis() {
  const [kpis, setKpis] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const { toast } = useToast()

  const carregar = useCallback(async () => {
    try {
      const data = await pedidosService.buscarKpis()
      setKpis(data)
    } catch (err) {
      toast.erro('Erro ao carregar KPIs: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => {
    carregar()
    // Atualiza KPIs a cada 60s
    const intervalo = setInterval(carregar, 60_000)
    return () => clearInterval(intervalo)
  }, [carregar])

  return { kpis, carregando, recarregar: carregar }
}
