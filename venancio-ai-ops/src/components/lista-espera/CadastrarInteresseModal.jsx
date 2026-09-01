import { useState, useEffect, useRef, useCallback } from 'react'
import { clientesService } from '@/services/clientes.service'
import { listaEsperaService } from '@/services/listaEspera.service'
import { ProdutoAutocompleteInput } from '@/components/pedidos/ProdutoAutocompleteInput'
import { useToast } from '@/contexts/AppContext'
import { formatPhone } from '@/utils/formatters'

const DEBOUNCE_MS = 300

/**
 * Registrar interesse de um cliente num produto sem estoque (RF-04, tela 26
 * do design). Se `produtoInicial` vier preenchido (aberto de dentro do
 * Catálogo), pula direto pra busca do cliente. Cliente é buscado entre os
 * já cadastrados (nome/telefone) — mesmo padrão de busca do
 * AbrirOcorrenciaModal, mas sobre `clientes` em vez de `pedidos`.
 */
export function CadastrarInteresseModal({ produtoInicial = null, onFechar, onCriado }) {
  const { toast } = useToast()

  const [produto, setProduto] = useState(produtoInicial)
  const [descricaoProduto, setDescricaoProduto] = useState('')

  const [termoCliente, setTermoCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState([])
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [cliente, setCliente] = useState(null)
  const timerRef = useRef(null)

  const [quantidadeDesejada, setQuantidadeDesejada] = useState(1)
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const buscarCliente = useCallback((termo) => {
    clearTimeout(timerRef.current)
    if (!termo || termo.trim().length < 2) {
      setResultadosCliente([])
      setBuscandoCliente(false)
      return
    }
    setBuscandoCliente(true)
    timerRef.current = setTimeout(async () => {
      try {
        const data = await clientesService.listar({ busca: termo.trim() })
        setResultadosCliente(data.slice(0, 8))
      } catch {
        setResultadosCliente([])
      } finally {
        setBuscandoCliente(false)
      }
    }, DEBOUNCE_MS)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function handleTermoCliente(valor) {
    setTermoCliente(valor)
    buscarCliente(valor)
  }

  function selecionarCliente(c) {
    setCliente(c)
    setTermoCliente('')
    setResultadosCliente([])
  }

  async function handleSalvar() {
    if (!produto) return toast.aviso('Escolha o produto.')
    if (!cliente) return toast.aviso('Escolha o cliente.')
    const qtd = Number(quantidadeDesejada) || 1
    if (qtd < 1) return toast.aviso('Quantidade desejada precisa ser ao menos 1.')

    setSalvando(true)
    try {
      await listaEsperaService.registrarInteresse({
        produtoId: produto.id,
        clienteId: cliente.id,
        quantidadeDesejada: qtd,
        observacao: observacao.trim() || null,
      })
      toast.sucesso('Interesse registrado.')
      onCriado?.()
      onFechar()
    } catch (err) {
      toast.erro('Erro ao registrar interesse: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--medio">
        <div className="modal-header">
          <h2 className="modal-titulo">Cadastrar Novo Interesse</h2>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="modal-body">
          <div className="form-grid form-grid--2">
            <div className="form-grupo form-grupo--full">
              <label className="form-label">Produto *</label>
              {produto ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{produto.nome}</strong>
                  {!produtoInicial && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setProduto(null)}>Trocar</button>
                  )}
                </div>
              ) : (
                <ProdutoAutocompleteInput
                  placeholder="Buscar produto no catálogo..."
                  value={descricaoProduto}
                  onChangeText={setDescricaoProduto}
                  onSelecionar={(p) => { setProduto(p); setDescricaoProduto('') }}
                />
              )}
            </div>

            <div className="form-grupo form-grupo--full">
              <label className="form-label">Cliente *</label>
              {cliente ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{cliente.nome}</strong> — {formatPhone(cliente.telefone)}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setCliente(null)}>Trocar</button>
                </div>
              ) : (
                <>
                  <input
                    className="input"
                    placeholder="Buscar cliente por nome ou telefone..."
                    value={termoCliente}
                    onChange={(e) => handleTermoCliente(e.target.value)}
                  />
                  {termoCliente.trim().length >= 2 && (
                    <div style={{ marginTop: 8 }}>
                      {buscandoCliente ? (
                        <div className="produto-autocomplete-vazio">Buscando…</div>
                      ) : resultadosCliente.length === 0 ? (
                        <div className="produto-autocomplete-vazio">Nenhum cliente encontrado — cadastre-o na tela Clientes primeiro.</div>
                      ) : (
                        resultadosCliente.map((c) => (
                          <div
                            key={c.id}
                            className="header-search-item"
                            style={{ cursor: 'pointer', border: '1px solid var(--border-1)', borderRadius: 6, marginBottom: 4, padding: 8 }}
                            onClick={() => selecionarCliente(c)}
                          >
                            <div className="header-search-item-linha1">
                              <span className="header-search-item-protocolo">{c.nome}</span>
                            </div>
                            <div className="header-search-item-linha2">
                              <span>{formatPhone(c.telefone)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="form-grupo">
              <label className="form-label">Quantidade Desejada</label>
              <input
                type="number"
                min="1"
                className="input"
                value={quantidadeDesejada}
                onChange={(e) => setQuantidadeDesejada(e.target.value)}
              />
            </div>
            <div className="form-grupo">
              <label className="form-label">Observação</label>
              <input
                className="input"
                placeholder="Ex: quer cor azul"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSalvar} disabled={salvando}>
            {salvando ? 'Salvando...' : '✓ Registrar Interesse'}
          </button>
        </div>
      </div>
    </div>
  )
}
