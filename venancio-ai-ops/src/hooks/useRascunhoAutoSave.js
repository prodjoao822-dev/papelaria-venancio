import { useEffect, useRef } from 'react'
import { salvarRascunho } from '@/utils/rascunhoOrcamento'

const DEBOUNCE_MS = 400

/**
 * Grava `dados` em localStorage sob `chave`, com debounce — usado pelos
 * formulários de orçamento (novo e edição) pra não perder progresso não
 * salvo se o modal fechar sem querer (clique fora) ou a página recarregar.
 *
 * `ativo=false` desliga o auto-save (ex.: enquanto o formulário ainda não
 * carregou os dados originais, pra não sobrescrever um rascunho existente
 * com estado vazio/parcial antes da hora).
 */
export function useRascunhoAutoSave(chave, dados, ativo = true) {
  const timerRef = useRef(null)

  useEffect(() => {
    if (!ativo) return undefined
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      salvarRascunho(chave, dados)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, JSON.stringify(dados), ativo])
}
