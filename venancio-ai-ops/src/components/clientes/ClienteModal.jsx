import { useState, useEffect } from 'react'
import { clientesService } from '@/services/clientes.service'
import { mapStatusRealParaDashboard } from '@/services/pedidos.service'
import { StatusBadge } from '@/components/pedidos/StatusBadge'
import { StatusOrcBadge } from '@/components/orcamentos/StatusOrcBadge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatCurrency, formatDate, formatPhone } from '@/utils/formatters'
import { useToast } from '@/contexts/AppContext'

const STATUS_CLIENTE_CONFIG = {
  ativo:   { label: 'Ativo',   cor: '#2FA85A', bg: 'rgba(47,168,90,0.14)',   borda: 'rgba(47,168,90,0.28)'   },
  inativo: { label: 'Inativo', cor: '#8A90A6', bg: 'rgba(138,144,166,0.12)', borda: 'rgba(138,144,166,0.22)' },
  vip:     { label: 'VIP ⭐',  cor: '#F0B23E', bg: 'rgba(240,178,62,0.14)',  borda: 'rgba(240,178,62,0.28)'  },
}

export function ClienteModal({ clienteId, onFechar }) {
  const [cliente, setCliente] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [abaPedidos, setAbaPedidos] = useState('pedidos')
  const [editandoObs, setEditandoObs] = useState(false)
  const [obs, setObs] = useState('')
  const [salvandoObs, setSalvandoObs] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!clienteId) return
    clientesService.buscarPorId(clienteId)
      .then((c) => { setCliente(c); setObs(c.observacoes ?? '') })
      .catch((err) => toast.erro('Erro ao carregar cliente: ' + err.message))
      .finally(() => setCarregando(false))
  }, [clienteId, toast])

  async function salvarObservacao() {
    setSalvandoObs(true)
    try {
      await clientesService.atualizar(clienteId, { observacoes: obs })
      setCliente((c) => ({ ...c, observacoes: obs }))
      setEditandoObs(false)
      toast.sucesso('Observação salva')
    } catch (err) {
      toast.erro(err.message)
    } finally {
      setSalvandoObs(false)
    }
  }

  async function alterarStatus(novoStatus) {
    try {
      await clientesService.atualizar(clienteId, { status: novoStatus })
      setCliente((c) => ({ ...c, status: novoStatus }))
      toast.sucesso(`Status atualizado para ${novoStatus}`)
    } catch (err) {
      toast.erro(err.message)
    }
  }

  const cfg = cliente ? (STATUS_CLIENTE_CONFIG[cliente.status] ?? STATUS_CLIENTE_CONFIG.ativo) : null

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--grande">
        <div className="modal-header">
          <div className="modal-header-esquerda">
            <div
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary), var(--purple))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: 'white', flexShrink: 0,
              }}
            >
              {cliente?.nome?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <h2 className="modal-titulo">{cliente?.nome ?? '—'}</h2>
              <p className="modal-subtitulo">{formatPhone(cliente?.telefone)}</p>
            </div>
          </div>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-body">
          {carregando ? (
            <LoadingSpinner mensagem="Carregando cliente..." />
          ) : !cliente ? (
            <p style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)' }}>Cliente não encontrado.</p>
          ) : (
            <div className="pedido-detalhe">

              {/* Métricas CRM */}
              <div className="pedido-detalhe-secao">
                <p className="pedido-detalhe-titulo">Resumo Comercial</p>
                <div className="cliente-crm-grid">
                  <div className="cliente-crm-stat">
                    <span className="cliente-crm-stat-label">Total Gasto</span>
                    <span className="cliente-crm-stat-valor" style={{ color: 'var(--success)', fontSize: 14 }}>
                      {formatCurrency(cliente.total_gasto ?? 0)}
                    </span>
                  </div>
                  <div className="cliente-crm-stat">
                    <span className="cliente-crm-stat-label">Pedidos</span>
                    <span className="cliente-crm-stat-valor">{cliente.qtd_pedidos ?? 0}</span>
                  </div>
                  <div className="cliente-crm-stat">
                    <span className="cliente-crm-stat-label">Ticket Médio</span>
                    <span className="cliente-crm-stat-valor" style={{ fontSize: 14 }}>
                      {formatCurrency(cliente.ticket_medio ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dados */}
              <div className="pedido-detalhe-secao">
                <p className="pedido-detalhe-titulo">Dados</p>
                <div className="pedido-detalhe-grid">
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Origem</span>
                    <span className="campo-valor">
                      <span className={`tag tag--${cliente.origem}`}>
                        {cliente.origem === 'whatsapp' ? '📱 WhatsApp' : '🖥️ Manual'}
                      </span>
                    </span>
                  </div>
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Status</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', padding: '3px 9px',
                          borderRadius: 99, fontSize: 11, fontWeight: 600,
                          color: cfg.cor, background: cfg.bg, border: `1px solid ${cfg.borda}`,
                        }}
                      >
                        {cfg.label}
                      </span>
                      <select
                        className="input input-sm"
                        style={{ width: 'auto', fontSize: 11 }}
                        value={cliente.status}
                        onChange={(e) => alterarStatus(e.target.value)}
                      >
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                        <option value="vip">VIP</option>
                      </select>
                    </div>
                  </div>
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Cadastrado em</span>
                    <span className="campo-valor">{formatDate(cliente.criado_em)}</span>
                  </div>
                  <div className="pedido-detalhe-campo">
                    <span className="campo-label">Última Compra</span>
                    <span className="campo-valor">
                      {cliente.ultima_compra_em ? formatDate(cliente.ultima_compra_em) : '—'}
                    </span>
                  </div>
                  <div className="pedido-detalhe-campo pedido-detalhe-campo--full">
                    <span className="campo-label">Observações</span>
                    {editandoObs ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                        <textarea
                          className="input input-textarea"
                          value={obs}
                          onChange={(e) => setObs(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button className="btn btn-primary btn-sm" onClick={salvarObservacao} disabled={salvandoObs}>
                            {salvandoObs ? '...' : 'Salvar'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditandoObs(false)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span className="campo-valor" style={{ flex: 1 }}>
                          {cliente.observacoes || <span className="texto-vazio">Sem observações</span>}
                        </span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditandoObs(true)}>
                          ✏️ Editar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Abas: Pedidos / Orçamentos */}
              <div className="pedido-detalhe-secao">
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
                  {['pedidos', 'orcamentos'].map((aba) => (
                    <button
                      key={aba}
                      className={`aba-btn ${abaPedidos === aba ? 'aba-btn--ativa' : ''}`}
                      onClick={() => setAbaPedidos(aba)}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {aba === 'pedidos' ? `Pedidos (${cliente.pedidos?.length ?? 0})` : `Orçamentos (${cliente.orcamentos?.length ?? 0})`}
                    </button>
                  ))}
                </div>

                {abaPedidos === 'pedidos' && (
                  <div className="itens-lista">
                    {(cliente.pedidos ?? []).length === 0 ? (
                      <p style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                        Nenhum pedido
                      </p>
                    ) : (
                      (cliente.pedidos ?? []).map((p) => (
                        <div key={p.id} className="item-linha" style={{ gridTemplateColumns: '90px 1fr 100px 90px' }}>
                          <span className="pedido-numero">{p.protocolo}</span>
                          <StatusBadge status={mapStatusRealParaDashboard(p.status)} tamanho="sm" />
                          <span className="pedido-valor">{formatCurrency(p.valor_total)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
                            {formatDate(p.criado_em)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {abaPedidos === 'orcamentos' && (
                  <div className="itens-lista">
                    {(cliente.orcamentos ?? []).length === 0 ? (
                      <p style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                        Nenhum orçamento
                      </p>
                    ) : (
                      (cliente.orcamentos ?? []).map((o) => (
                        <div key={o.id} className="item-linha" style={{ gridTemplateColumns: '1fr 120px 100px 90px' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            {o.protocolo}
                          </span>
                          <StatusOrcBadge status={o.status} tamanho="sm" />
                          <span className="pedido-valor">{formatCurrency(o.valor_total)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
                            {formatDate(o.criado_em)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
