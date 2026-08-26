import { useState, useEffect, useCallback } from 'react'
import { ocorrenciasService } from '@/services/ocorrencias.service'
import { getTipoOcorrenciaConfig, getStatusOcorrenciaConfig } from '@/utils/ocorrencias'
import { formatDateTime } from '@/utils/formatters'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { AbrirOcorrenciaModal } from '@/components/ocorrencias/AbrirOcorrenciaModal'
import { OcorrenciaDetalheModal } from '@/components/ocorrencias/OcorrenciaDetalheModal'

const FILTROS = [
  { valor: 'aberta', label: 'Abertas' },
  { valor: 'resolvida', label: 'Resolvidas' },
  { valor: null, label: 'Todas' },
]

/**
 * Fila de ocorrências (item faltante, endereço não encontrado, cliente
 * ausente, produto avariado — operacional; troca, devolução, produto
 * errado — pós-venda). Mesmo padrão da fila de Consultas IA (ConsultasPage):
 * lista + resolver, com realtime.
 */
export function OcorrenciasPage() {
  const [ocorrencias, setOcorrencias] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [filtroIdx, setFiltroIdx] = useState(0)
  const [busca, setBusca] = useState('')
  const [modalAbrir, setModalAbrir] = useState(false)
  const [ocorrenciaAberta, setOcorrenciaAberta] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const status = FILTROS[filtroIdx].valor
      const dados = await ocorrenciasService.listar(status ? { status } : {})
      setOcorrencias(dados)
      setErro(null)
    } catch (err) {
      setErro(err)
    } finally {
      setCarregando(false)
    }
  }, [filtroIdx])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    let channel = null
    try {
      channel = ocorrenciasService.subscribe(() => carregar())
    } catch {
      channel = null
    }
    return () => {
      try { channel?.unsubscribe() } catch { /* ignora */ }
    }
  }, [carregar])

  const abertas = ocorrencias.filter((o) => o.status === 'aberta')

  const ocorrenciasFiltradas = ocorrencias.filter((o) => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    return (
      o.pedidos?.protocolo?.toLowerCase().includes(termo) ||
      o.pedidos?.clientes?.nome?.toLowerCase().includes(termo)
    )
  })

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Ocorrências</h1>
          <p className="page-descricao">Problemas operacionais e pós-venda (troca, devolução, produto errado)</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={carregar}>↺ Atualizar</button>
          <button className="btn btn-primary" onClick={() => setModalAbrir(true)}>+ Abrir Ocorrência</button>
        </div>
      </div>

      <div className="section-header">
        <div className="section-header-esquerda" style={{ display: 'flex', gap: 8 }}>
          {FILTROS.map((f, idx) => (
            <button
              key={f.label}
              className={`btn btn-sm ${filtroIdx === idx ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFiltroIdx(idx)}
            >
              {f.label}
              {f.valor === 'aberta' && abertas.length > 0 && (
                <span style={{ marginLeft: 6 }}>({abertas.length})</span>
              )}
            </button>
          ))}
        </div>
        <input
          className="consultas-busca"
          type="text"
          placeholder="Buscar por nº do pedido ou cliente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="section-contagem">{ocorrenciasFiltradas.length} ocorrência(s)</div>
      </div>

      <div className="card">
        {carregando ? (
          <LoadingSpinner mensagem="Carregando ocorrências..." />
        ) : erro ? (
          <ErrorState titulo="Erro ao carregar ocorrências" detalhe={erro.message} onRetry={carregar} />
        ) : ocorrenciasFiltradas.length === 0 ? (
          <EmptyState
            icone="✅"
            titulo={busca ? 'Nenhuma ocorrência encontrada' : 'Nenhuma ocorrência'}
            descricao={busca ? 'Tente buscar por outro nome ou número.' : 'Clique em "+ Abrir Ocorrência" para registrar uma.'}
          />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="tabela-th">Tipo</th>
                  <th className="tabela-th">Pedido</th>
                  <th className="tabela-th">Cliente</th>
                  <th className="tabela-th">Descrição</th>
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {ocorrenciasFiltradas.map((o) => {
                  const tipoCfg = getTipoOcorrenciaConfig(o.tipo)
                  const statusCfg = getStatusOcorrenciaConfig(o.status)
                  return (
                    <tr key={o.id} className="tabela-row tabela-row--clicavel" onClick={() => setOcorrenciaAberta(o)}>
                      <td className="tabela-cell">{tipoCfg.icone} {tipoCfg.label}</td>
                      <td className="tabela-cell"><strong>{o.pedidos?.protocolo ?? '—'}</strong></td>
                      <td className="tabela-cell">{o.pedidos?.clientes?.nome ?? '—'}</td>
                      <td className="tabela-cell" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.descricao}
                      </td>
                      <td className="tabela-cell">
                        <span className="status-badge status-badge--sm" style={{ color: statusCfg.cor, backgroundColor: statusCfg.bg, borderColor: statusCfg.borda }}>
                          {statusCfg.icone} {statusCfg.label}
                        </span>
                      </td>
                      <td className="tabela-cell">{formatDateTime(o.criado_em)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalAbrir && (
        <AbrirOcorrenciaModal
          onFechar={() => setModalAbrir(false)}
          onCriada={carregar}
        />
      )}
      {ocorrenciaAberta && (
        <OcorrenciaDetalheModal
          ocorrencia={ocorrenciaAberta}
          onFechar={() => setOcorrenciaAberta(null)}
          onAtualizado={carregar}
        />
      )}
    </div>
  )
}
