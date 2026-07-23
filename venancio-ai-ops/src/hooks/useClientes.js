import { useState, useEffect, useCallback } from 'react'
import { clientesService } from '@/services/clientes.service'
import { useToast } from '@/contexts/AppContext'

export function useClientes(filtrosIniciais = {}) {
  const [clientes, setClientes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const { toast } = useToast()

  const carregar = useCallback(
    async (filtros = filtrosIniciais) => {
      setCarregando(true)
      try {
        const data = await clientesService.listarCrm(filtros)
        setClientes(data)
      } catch (err) {
        toast.erro('Erro ao carregar clientes: ' + err.message)
      } finally {
        setCarregando(false)
      }
    },
    [toast]
  )

  useEffect(() => { carregar() }, [carregar])

  const atualizar = useCallback(async (id, dados) => {
    await clientesService.atualizar(id, dados)
    await carregar()
  }, [carregar])

  return { clientes, carregando, carregar, atualizar }
}
