import { useState, useEffect, useCallback } from 'react'
import { listaEsperaService } from '@/services/listaEspera.service'
import { CadastrarInteresseModal } from '@/components/lista-espera/CadastrarInteresseModal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/contexts/AppContext'
import { formatPhone, formatDateTime } from '@/utils/formatters'

/**
 * RF-04: interesse de cliente em produto fora de estoque. Notificação ao
 * cliente é sempre manual (a loja avisa por fora e só então marca aqui como
 * notificado). Telas 24-26 do bundle de design.
 */
export function ListaEsperaPage() {
  const { toast } = useToast()

  const [produtos, setProdutos] = useState([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(true)
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState(null)

  const [interessados, setInteressados] = useState([])
  const [carregandoInteressados, setCarregandoInteressados] = useState(false)
  const [incluirNotificados, setIncluirNotificados] = useState(false)

  const [modalAberto, setModalAberto] = useState(false)

  const carregarProdutos = useCallback(async () => {
    setCarregandoProdutos(true)
    try {
      const dados = await listaEsperaService.listarProdutosComEspera()
      setProdutos(dados)
      setProdutoSelecionadoId((atual) => atual ?? dados[0]?.id ?? null)
    } catch (err) {
      toast.erro('Erro ao carregar lista de espera: ' + err.message)
    } finally {
      setCarregandoProdutos(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { carregarProdutos() }, [carregarProdutos])

  const carregarInteressados = useCallback(async () => {
    if (!produtoSelecionadoId) { setInteressados([]); return }
    setCarregandoInteressados(true)
    try {
      const dados = await listaEsperaService.listarInteressados(produtoSelecionadoId, incluirNotificados)
      setInteressados(dados)
    } catch (err) {
      toast.erro('Erro ao carregar interessados: ' + err.message)
    } finally {
      setCarregandoInteressados(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoSelecionadoId, incluirNotificados])

  useEffect(() => { carregarInteressados() }, [carregarInteressados])

  async function handleMarcarNotificado(listaEsperaId) {
    try {
      await listaEsperaService.marcarNotificado(listaEsperaId)
      toast.sucesso('Cliente marcado como notificado.')
      await Promise.all([carregarProdutos(), carregarInteressados()])
    } catch (err) {
      toast.erro('Erro ao marcar notificado: ' + err.message)
    }
  }

  function handleCriado() {
    carregarProdutos()
    carregarInteressados()
  }

  const produtoSelecionado = produtos.find((p) => p.id === produtoSelecionadoId) ?? null

  if (carregandoProdutos) return <LoadingSpinner mensagem="Carregando lista de espera..." />

  if (produtos.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-header-info">
            <h1 className="page-titulo">Lista de Espera de Produto</h1>
            <p className="page-descricao">Clientes interessados em produtos sem estoque</p>
          </div>
          <div className="page-header-acoes">
            <button className="btn btn-primary" onClick={() => setModalAberto(true)}>+ Novo Interesse</button>
          </div>
        </div>
        <EmptyState
          icone="📭"
          titulo="Nenhum interesse registrado"
          descricao='Quando um cliente quiser um produto sem estoque, clique em "+ Novo Interesse" para registrar.'
          acao={{ label: '+ Novo Interesse', onClick: () => setModalAberto(true) }}
        />
        {modalAberto && (
          <CadastrarInteresseModal onFechar={() => setModalAberto(false)} onCriado={handleCriado} />
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Lista de Espera de Produto</h1>
          <p className="page-descricao">Clientes interessados em produtos sem estoque</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={carregarProdutos}>↺ Atualizar</button>
          <button className="btn btn-primary" onClick={() => setModalAberto(true)}>+ Novo Interesse</button>
        </div>
      </div>

      <div className="listas-modelo-layout" style={{ gridTemplateColumns: '260px 1fr' }}>
        {/* Coluna 1: produtos com interesse aguardando */}
        <aside className="listas-modelo-escolas">
          {produtos.map((p) => (
            <button
              key={p.id}
              className={`listas-modelo-escola-item ${produtoSelecionadoId === p.id ? 'listas-modelo-escola-item--ativa' : ''}`}
              onClick={() => setProdutoSelecionadoId(p.id)}
            >
              <span>
                {p.nome}
                {p.estoque > 0 && <span className="tag tag--sucesso tag--sm" style={{ marginLeft: 6 }}>em estoque</span>}
              </span>
              <span className="listas-modelo-escola-badge">{p.qtd_interessados}</span>
            </button>
          ))}
        </aside>

        {/* Coluna 2: interessados no produto selecionado */}
        <section className="listas-modelo-detalhe">
          {produtoSelecionado && (
            <div className="listas-modelo-detalhe-header">
              <div>
                <h3 className="listas-modelo-detalhe-titulo">{produtoSelecionado.nome}</h3>
                <p className="listas-modelo-detalhe-subtitulo">
                  {produtoSelecionado.sku ? `SKU ${produtoSelecionado.sku} · ` : ''}
                  {produtoSelecionado.estoque > 0 ? `${produtoSelecionado.estoque} em estoque` : 'Sem estoque'}
                </p>
              </div>
              <label className="form-label-check">
                <input
                  type="checkbox"
                  checked={incluirNotificados}
                  onChange={(e) => setIncluirNotificados(e.target.checked)}
                />
                Incluir já notificados
              </label>
            </div>
          )}

          {carregandoInteressados ? (
            <LoadingSpinner mensagem="Carregando interessados..." />
          ) : interessados.length === 0 ? (
            <EmptyState icone="🕐" titulo="Sem interessados aguardando" />
          ) : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th className="tabela-th">Cliente</th>
                    <th className="tabela-th">Telefone</th>
                    <th className="tabela-th">Qtd.</th>
                    <th className="tabela-th">Observação</th>
                    <th className="tabela-th">Registrado em</th>
                    <th className="tabela-th">Status</th>
                    <th className="tabela-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {interessados.map((i) => (
                    <tr key={i.id} className="tabela-row">
                      <td className="tabela-cell"><strong>{i.nome ?? i.cliente_nome ?? '—'}</strong></td>
                      <td className="tabela-cell">{formatPhone(i.telefone ?? i.cliente_telefone)}</td>
                      <td className="tabela-cell">{i.quantidade_desejada}</td>
                      <td className="tabela-cell">{i.observacao ?? '—'}</td>
                      <td className="tabela-cell">{formatDateTime(i.criado_em)}</td>
                      <td className="tabela-cell">
                        <span className={`tag ${i.status === 'notificado' ? 'tag--sucesso' : 'tag--aviso'}`}>
                          {i.status === 'notificado' ? '✅ Notificado' : '⏳ Aguardando'}
                        </span>
                      </td>
                      <td className="tabela-cell tabela-cell--acoes">
                        {i.status !== 'notificado' && (
                          <button className="btn btn-ghost btn-xs" onClick={() => handleMarcarNotificado(i.id)}>
                            Marcar notificado
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modalAberto && (
        <CadastrarInteresseModal onFechar={() => setModalAberto(false)} onCriado={handleCriado} />
      )}
    </div>
  )
}
