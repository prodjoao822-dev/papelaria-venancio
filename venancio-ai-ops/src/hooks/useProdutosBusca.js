import { useState, useRef, useCallback, useEffect } from 'react'
import { produtosService } from '@/services/produtos.service'

const DEBOUNCE_MS = 300

/** Busca produtos do catálogo com debounce — usado pelo autocomplete de itens. */
export function useProdutosBusca() {
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const timerRef = useRef(null)
  const seqRef = useRef(0)

  const buscar = useCallback((termo) => {
    clearTimeout(timerRef.current)

    if (!termo || termo.trim().length < 2) {
      setResultados([])
      setBuscando(false)
      return
    }

    setBuscando(true)
    const minhaSeq = ++seqRef.current
    timerRef.current = setTimeout(async () => {
      try {
        const data = await produtosService.listar({ busca: termo.trim(), ativo: true })
        if (seqRef.current === minhaSeq) setResultados(data.slice(0, 8))
      } catch {
        if (seqRef.current === minhaSeq) setResultados([])
      } finally {
        if (seqRef.current === minhaSeq) setBuscando(false)
      }
    }, DEBOUNCE_MS)
  }, [])

  const limpar = useCallback(() => {
    clearTimeout(timerRef.current)
    seqRef.current++
    setResultados([])
    setBuscando(false)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { resultados, buscando, buscar, limpar }
}
