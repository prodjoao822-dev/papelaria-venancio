import { useState } from 'react'
import { ocorrenciasService } from '@/services/ocorrencias.service'
import { useToast } from '@/contexts/AppContext'
import { getTipoOcorrenciaConfig, getStatusOcorrenciaConfig } from '@/utils/ocorrencias'
import { formatCurrency, formatDateTime, formatPhone } from '@/utils/formatters'

/**
 * Detalhe de uma ocorrência — se estiver aberta, permite resolver
 * (resolver_ocorrencia resolve o ator internamente). Mesmo padrão de
 * SolicitacaoDetalheModal.jsx (Separação): modal simples com ação inline.
 */
export function OcorrenciaDetalheModal({ ocorrencia, onFechar, onAtualizado }) {
  const { toast } = useToast()
  const [resolucao, setResolucao] = useState('')
  const [resolvendo, setResolvendo] = useState(false)

  const tipoCfg = getTipoOcorrenciaConfig(ocorrencia.tipo)
  const statusCfg = getStatusOcorrenciaConfig(ocorrencia.status)
  const aberta = ocorrencia.status === 'aberta'

  const criadoPor = ocorrencia.criado_por_tipo === 'operador'
    ? (ocorrencia.criado_por_operador?.nome ?? 'Operador')
    : (ocorrencia.criado_por_funcionario?.nome ?? 'Funcionário')

  const resolvidoPor = ocorrencia.resolvido_por_tipo === 'operador'
    ? ocorrencia.resolvido_por_operador?.nome
    : ocorrencia.resolvido_por_funcionario?.nome

  async function handleResolver() {
    if (!resolucao.trim()) return toast.aviso('Descreva como a ocorrência foi resolvida.')
    setResolvendo(true)
    try {
      await ocorrenciasService.resolver(ocorrencia.id, resolucao.trim())
      toast.sucesso('Ocorrência resolvida.')
      onAtualizado?.()
      onFechar()
    } catch (err) {
      toast.erro('Erro ao resolver ocorrência: ' + err.message)
    } finally {
      setResolvendo(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal modal--medio">
        <div className="modal-header">
          <h2 className="modal-titulo">{tipoCfg.icone} {tipoCfg.label}</h2>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-body">
          <div className="pedido-detalhe-secao">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="status-badge status-badge--md" style={{ color: statusCfg.cor, backgroundColor: statusCfg.bg, borderColor: statusCfg.borda }}>
                {statusCfg.icone} {statusCfg.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>
                {tipoCfg.grupo === 'pos_venda' ? 'Pós-venda' : 'Operacional'}
              </span>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-2)' }}>
              <div><strong>Pedido:</strong> {ocorrencia.pedidos?.protocolo ?? '—'} · {formatCurrency(ocorrencia.pedidos?.valor_total)}</div>
              <div><strong>Cliente:</strong> {ocorrencia.pedidos?.clientes?.nome ?? '—'} · {formatPhone(ocorrencia.pedidos?.clientes?.telefone)}</div>
              <div><strong>Aberta por:</strong> {criadoPor} em {formatDateTime(ocorrencia.criado_em)}</div>
            </div>
          </div>

          <div className="pedido-detalhe-secao">
            <div className="pedido-detalhe-titulo">Descrição</div>
            <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{ocorrencia.descricao}</p>
          </div>

          {!aberta && (
            <div className="pedido-detalhe-secao">
              <div className="pedido-detalhe-titulo">Resolução</div>
              <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{ocorrencia.resolucao_texto}</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                Resolvida por {resolvidoPor ?? '—'} em {formatDateTime(ocorrencia.resolvida_em)}
              </p>
            </div>
          )}

          {aberta && (
            <div className="pedido-detalhe-secao">
              <div className="pedido-detalhe-titulo">Resolver</div>
              <textarea
                className="input input-textarea"
                rows={3}
                value={resolucao}
                onChange={(e) => setResolucao(e.target.value)}
                placeholder="Como a ocorrência foi resolvida..."
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar}>Fechar</button>
          {aberta && (
            <button className="btn btn-primary" onClick={handleResolver} disabled={resolvendo}>
              {resolvendo ? 'Resolvendo...' : '✓ Resolver Ocorrência'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
