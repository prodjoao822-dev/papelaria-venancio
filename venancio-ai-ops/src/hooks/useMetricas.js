import { useState, useEffect, useCallback } from 'react'
import { metricasService } from '@/services/metricas.service'
import { useToast } from '@/contexts/AppContext'

export function useMetricas(intervaloMs = 60000) {
  const [metricas, setMetricas] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const { toast } = useToast()

  const carregar = useCallback(async () => {
    try {
      const data = await metricasService.buscarMetricasComerciais()
      setMetricas(data)
    } catch (err) {
      toast.erro('Erro ao carregar métricas comerciais: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => {
    carregar()
    const timer = setInterval(carregar, intervaloMs)
    return () => clearInterval(timer)
  }, [carregar, intervaloMs])

  return { metricas, carregando, recarregar: carregar }
}
