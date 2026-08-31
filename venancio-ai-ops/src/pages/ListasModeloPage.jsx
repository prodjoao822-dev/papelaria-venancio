import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { listasModeloService } from '@/services/listasModelo.service'
import { CriarPedidoDeListaModal } from '@/components/listas-modelo/CriarPedidoDeListaModal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency } from '@/utils/formatters'

// "Listas Prontas": listas de material escolar já montadas (escola + ano),
// pra criar o pedido de um cliente em 1 clique em vez de digitar item por
// item. Ideia do dono (01/09) — reaproveita as mesmas listas reais que a
// loja já usa pra orçamento de volta às aulas.
export function ListasModeloPage() {
  const { toast } = useToast()
  const navigate = useNavigate()

  const [escolas, setEscolas] = useState([])
  const [escolaSelecionada, setEscolaSelecionada] = useState(null)
  const [listas, setListas] = useState([])
  const [carregandoEscolas, setCarregandoEscolas] = useState(true)
  const [carregandoListas, setCarregandoListas] = useState(false)

  const [listaDetalhe, setListaDetalhe] = useState(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const [listaParaPedido, setListaParaPedido] = useState(null)

  useEffect(() => {
    listasModeloService.listarEscolasComListas()
      .then((data) => {
        setEscolas(data)
        if (data.length > 0) setEscolaSelecionada(data[0].id)
      })
      .catch((err) => toast.erro('Erro ao carregar escolas: ' + err.message))
      .finally(() => setCarregandoEscolas(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!escolaSelecionada) return
    setCarregandoListas(true)
    setListaDetalhe(null)
    listasModeloService.listarPorEscola(escolaSelecionada)
      .then(setListas)
      .catch((err) => toast.erro('Erro ao carregar listas: ' + err.message))
      .finally(() => setCarregandoListas(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolaSelecionada])

  const abrirDetalhe = useCallback(async (listaId) => {
    setCarregandoDetalhe(true)
    setListaDetalhe(null)
    try {
      const lista = await listasModeloService.buscarComItens(listaId)
      setListaDetalhe(lista)
    } catch (err) {
      toast.erro('Erro ao carregar itens da lista: ' + err.message)
    } finally {
      setCarregandoDetalhe(false)
    }
  }, [toast])

  function handlePedidoCriado(pedido) {
    setListaParaPedido(null)
    navigate('/pedidos', { state: { abrirPedidoId: pedido.id } })
  }

  if (carregandoEscolas) return <LoadingSpinner mensagem="Carregando listas prontas..." />

  if (escolas.length === 0) {
    return (
      <div className="page">
        <EmptyState
          icone="🎒"
          titulo="Nenhuma lista modelo cadastrada"
          descricao="As listas prontas por escola/ano aparecem aqui assim que forem importadas."
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="section-header">
        <div className="section-header-esquerda">
          <span className="section-contagem">{escolas.length} escola(s) com lista pronta</span>
        </div>
      </div>

      <div className="listas-modelo-layout">
        {/* Coluna 1: escolas */}
        <aside className="listas-modelo-escolas">
          {escolas.map((e) => (
            <button
              key={e.id}
              className={`listas-modelo-escola-item ${escolaSelecionada === e.id ? 'listas-modelo-escola-item--ativa' : ''}`}
              onClick={() => setEscolaSelecionada(e.id)}
            >
              <span>{e.nome}</span>
              <span className="listas-modelo-escola-badge">{e.qtd_listas}</span>
            </button>
          ))}
        </aside>

        {/* Coluna 2: listas (anos/séries) da escola selecionada */}
        <section className="listas-modelo-anos">
          <h3 className="listas-modelo-anos-titulo">
            {escolas.find((e) => e.id === escolaSelecionada)?.nome ?? 'Listas'}
          </h3>
          {carregandoListas ? (
            <LoadingSpinner mensagem="Carregando..." />
          ) : listas.length === 0 ? (
            <EmptyState icone="📭" titulo="Sem listas pra esta escola" />
          ) : (
            <div className="listas-modelo-grid">
              {listas.map((l) => (
                <button
                  key={l.id}
                  className={`listas-modelo-card ${listaDetalhe?.id === l.id ? 'listas-modelo-card--ativo' : ''}`}
                  onClick={() => abrirDetalhe(l.id)}
                >
                  <span className="listas-modelo-card-ano">{l.ano}</span>
                  <span className="listas-modelo-card-info">{l.qtd_itens} itens</span>
                  <span className="listas-modelo-card-valor">{formatCurrency(l.valor_total)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Coluna 3: detalhe da lista selecionada */}
        <section className="listas-modelo-detalhe">
          {carregandoDetalhe ? (
            <LoadingSpinner mensagem="Carregando itens..." />
          ) : !listaDetalhe ? (
            <EmptyState icone="👈" titulo="Selecione uma lista" descricao="Clique numa lista ao lado pra ver os itens." />
          ) : (
            <>
              <div className="listas-modelo-detalhe-header">
                <div>
                  <h3 className="listas-modelo-detalhe-titulo">{listaDetalhe.escolas?.nome} — {listaDetalhe.ano}</h3>
                  <p className="listas-modelo-detalhe-subtitulo">{listaDetalhe.listas_modelo_itens?.length ?? 0} itens · {formatCurrency(listaDetalhe.valor_total)}</p>
                </div>
                <button className="btn btn-purple" onClick={() => setListaParaPedido(listaDetalhe)}>
                  ✓ Criar Pedido
                </button>
              </div>

              <div className="listas-modelo-itens-lista">
                {(listaDetalhe.listas_modelo_itens ?? []).map((item) => (
                  <div key={item.id} className="listas-modelo-item-linha">
                    <span>{item.produtos?.nome ?? item.descricao_livre}</span>
                    <span className="listas-modelo-item-qtd">{item.quantidade}x</span>
                    <span className="listas-modelo-item-valor">{formatCurrency(item.valor_unitario)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {listaParaPedido && (
        <CriarPedidoDeListaModal
          lista={listaParaPedido}
          onFechar={() => setListaParaPedido(null)}
          onCriado={handlePedidoCriado}
        />
      )}
    </div>
  )
}
