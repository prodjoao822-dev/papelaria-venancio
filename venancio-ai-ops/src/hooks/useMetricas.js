import { useState, useEffect, useCallback } from 'react'
import { metricasService } from '@/services/metricas.service'

export function useMetricas(intervaloMs = 60000) {
  const [metricas, setMetricas] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    try {
      const data = await metricasService.buscarMetricasComerciais()
      setMetricas(data)
    } catch { /* silencioso */ } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    const timer = setInterval(carregar, intervaloMs)
    return () => clearInterval(timer)
  }, [carregar, intervaloMs])

  return { metricas, carregando, recarregar: carregar }
}
