import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { pedidosService } from '@/services/pedidos.service'
import { funcionariosService } from '@/services/funcionarios.service'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatCurrency, formatDate, formatPhone } from '@/utils/formatters'
import { TIPOS_OBSERVACAO_ITEM } from '@/utils/constants'
import { useToast } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'

const LABEL_TIPO = Object.fromEntries(TIPOS_OBSERVACAO_ITEM.map((t) => [t.value, t.label]))

export function FichaSeparacaoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { operador } = useAuth()

  const [pedido, setPedido] = useState(null)
  const [itens, setItens] = useState([])
  const [funcionariosSeparacao, setFuncionariosSeparacao] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [salvandoResponsavel, setSalvandoResponsavel] = useState(false)
  const obsTimers = useRef({})

  // Retorna a Promise (não só dispara) pra handleImprimir poder encadear
  // "busca de novo, ENTÃO imprime" — ver comentário na Fase 4 abaixo.
  const carregar = useCallback(() => {
    setCarregando(true)
    return Promise.all([
      pedidosService.buscarPorId(id),
      funcionariosService.listarPorPapel('separacao'),
    ])
      .then(([p, funcionarios]) => {
        setPedido(p)
        setItens(p.itens_pedido ?? [])
        setFuncionariosSeparacao(funcionarios)
      })
      .catch((err) => toast.erro('Erro ao carregar ficha: ' + err.message))
      .finally(() => setCarregando(false))
  }, [id, toast])

  useEffect(() => { carregar() }, [carregar])

  async function handleResponsavelChange(funcionarioId) {
    setSalvandoResponsavel(true)
    try {
      await pedidosService.atribuirResponsavel(pedido.id, 'separacao', funcionarioId || null, operador?.id ?? null)
      const funcionario = funcionariosSeparacao.find((f) => f.id === funcionarioId)
      setPedido((p) => ({ ...p, responsavel_separacao: funcionario ? { id: funcionario.id, nome: funcionario.nome } : null }))
      toast.sucesso('Responsável atualizado.')
    } catch (err) {
      toast.erro('Erro ao atribuir responsável: ' + err.message)
    } finally {
      setSalvandoResponsavel(false)
    }
  }

  async function handleTipoChange(item, tipo) {
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, tipo_observacao: tipo } : i)))
    try {
      await pedidosService.atualizarItemFicha(item.id, { tipo_observacao: tipo })
    } catch (err) {
      toast.erro('Erro ao salvar tipo: ' + err.message)
    }
  }

  function handleObsChange(item, valor) {
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, observacao: valor } : i)))
    clearTimeout(obsTimers.current[item.id])
    obsTimers.current[item.id] = setTimeout(async () => {
      try {
        await pedidosService.atualizarItemFicha(item.id, { observacao: valor })
      } catch (err) {
        toast.erro('Erro ao salvar observação: ' + err.message)
      }
    }, 600)
  }

  async function handleToggleSeparado(item) {
    const novoValor = !item.separado
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, separado: novoValor } : i)))
    try {
      await pedidosService.marcarItemSeparado(item.id, novoValor)
    } catch (err) {
      setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, separado: item.separado } : i)))
      toast.erro('Erro ao marcar item: ' + err.message)
    }
  }

  function handleSalvar() {
    // Flush observações pendentes (debounce) na hora.
    Object.values(obsTimers.current).forEach((t) => clearTimeout(t))
    itens.forEach((item) => {
      pedidosService.atualizarItemFicha(item.id, { observacao: item.observacao ?? null }).catch(() => {})
    })
    toast.sucesso('Ficha salva.')
  }

  // Fase 4 (18/09/2026): a ficha impressa tem que sempre refletir o estado
  // ATUAL do pedido, nunca um snapshot antigo — se a aba ficou aberta um
  // tempo (outro operador mexeu no pedido nesse meio tempo, por exemplo),
  // o que já estava carregado em memória pode estar desatualizado. Busca
  // de novo antes de imprimir, em vez de confiar no estado já carregado;
  // requestAnimationFrame garante que o print só dispara depois que o
  // re-render com os dados novos já aconteceu.
  function handleImprimir() {
    carregar().then(() => {
      requestAnimationFrame(() => window.print())
    })
  }

  if (carregando) {
    return (
      <div className="page">
        <LoadingSpinner mensagem="Carregando ficha de separação..." />
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="page">
        <p>Pedido não encontrado.</p>
      </div>
    )
  }

  const total = itens.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0)
  const nomeResponsavel = pedido.responsavel_separacao?.nome ?? '—'

  return (
    <div className="page ficha-page">
      <div className="ficha-header-back no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/pedidos')}>← Pedidos</button>
        <h1 className="page-titulo" style={{ marginBottom: 0 }}>Ficha de Separação</h1>
      </div>

      {/* Cabeçalho — versão impressa (texto simples, sem controles interativos) */}
      <div className="ficha-print-only" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Ficha de Separação</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Venâncio Papelaria</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px', marginTop: 16, fontSize: 13 }}>
          <div><b>Pedido:</b> {pedido.protocolo}{pedido.sequencia ? ` (${pedido.sequencia})` : ''}</div>
          <div><b>Data:</b> {formatDate(pedido.criado_em)}</div>
          <div><b>Cliente:</b> {pedido.clientes?.nome ?? '—'}</div>
          <div><b>Telefone:</b> {formatPhone(pedido.clientes?.telefone)}</div>
          <div><b>Responsável:</b> {nomeResponsavel}</div>
        </div>
      </div>

      {/* Cabeçalho — versão de tela (editável) */}
      <div className="ficha-header-grid ficha-print-hide">
        <div>
          <div className="ficha-header-label">PEDIDO</div>
          <div className="ficha-header-valor">{pedido.sequencia || pedido.protocolo}</div>
        </div>
        <div>
          <div className="ficha-header-label">CLIENTE</div>
          <div className="ficha-header-valor" style={{ fontSize: 14 }}>{pedido.clientes?.nome ?? '—'}</div>
          <div className="ficha-header-sub">{formatPhone(pedido.clientes?.telefone)}</div>
        </div>
        <div>
          <div className="ficha-header-label">DATA</div>
          <div className="ficha-header-valor" style={{ fontSize: 14 }}>{formatDate(pedido.criado_em)}</div>
        </div>
        <div>
          <div className="ficha-header-label">RESPONSÁVEL</div>
          <select
            className="input input-sm"
            style={{ marginTop: 4, width: '100%' }}
            value={pedido.responsavel_separacao?.id ?? ''}
            onChange={(e) => handleResponsavelChange(e.target.value)}
            disabled={salvandoResponsavel}
          >
            <option value="">— Selecionar —</option>
            {funcionariosSeparacao.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="ficha-tabela">
        <div className="ficha-tabela-head ficha-print-hide">
          <div>PRODUTO</div><div>QTD</div><div>UNIT.</div><div>TIPO</div><div>OBSERVAÇÃO</div><div style={{ textAlign: 'center' }}>SEP.</div>
        </div>
        {itens.length === 0 ? (
          <p className="texto-vazio" style={{ padding: 16 }}>Nenhum item registrado</p>
        ) : (
          itens.map((item) => (
            <div key={item.id} className="ficha-tabela-linha">
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.nome_item}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{item.quantidade}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{formatCurrency(item.valor_unitario)}</div>

              <div className="ficha-print-hide">
                <select
                  className="input input-sm"
                  value={item.tipo_observacao ?? 'padrao'}
                  onChange={(e) => handleTipoChange(item, e.target.value)}
                >
                  {TIPOS_OBSERVACAO_ITEM.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="ficha-print-only">{LABEL_TIPO[item.tipo_observacao] ?? 'Padrão'}</div>

              <div className="ficha-print-hide">
                <input
                  className="input input-sm"
                  value={item.observacao ?? ''}
                  onChange={(e) => handleObsChange(item, e.target.value)}
                  placeholder="Observação..."
                />
              </div>
              <div className="ficha-print-only">{item.observacao || '—'}</div>

              <div className="ficha-print-hide" style={{ textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={item.separado ?? false}
                  onChange={() => handleToggleSeparado(item)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>
              <div className="ficha-print-only" style={{ textAlign: 'center' }}>{item.separado ? '✓' : ''}</div>
            </div>
          ))
        )}
        <div className="ficha-tabela-footer">
          <div style={{ fontSize: 17, fontWeight: 800 }}>Total: {formatCurrency(total)}</div>
          <div className="no-print" style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSalvar}>Salvar</button>
            <button className="btn btn-ghost" onClick={handleImprimir}>Imprimir</button>
          </div>
        </div>
      </div>
    </div>
  )
}
