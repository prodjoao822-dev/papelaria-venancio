import { useState, useEffect, useCallback } from 'react'
import { funcionariosService } from '@/services/funcionarios.service'
import { useToast } from '@/contexts/AppContext'

export function useFuncionarios(filtrosIniciais = {}) {
  const [dados, setDados] = useState([])
  const [carregando, setCarregando] = useState(true)
  const { toast } = useToast()

  const carregar = useCallback(
    async (filtros = filtrosIniciais) => {
      setCarregando(true)
      try {
        const data = await funcionariosService.listar(filtros)
        setDados(data)
      } catch (err) {
        toast.erro('Erro ao carregar funcionários: ' + err.message)
      } finally {
        setCarregando(false)
      }
    },
    [toast]
  )

  useEffect(() => { carregar() }, [carregar])

  return { dados, carregando, carregar }
}
