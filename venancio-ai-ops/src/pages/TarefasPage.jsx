import { useState, useEffect, useCallback } from 'react'
import { tarefasService } from '@/services/tarefas.service'
import { useFuncionarios } from '@/hooks/useFuncionarios'
import { NovaTarefaModal } from '@/components/tarefas/NovaTarefaModal'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/contexts/AppContext'
import { formatDateTime } from '@/utils/formatters'

const FILTROS = [
  { valor: 'pendente',  label: 'Pendentes' },
  { valor: 'concluida', label: 'Concluídas' },
  { valor: null,        label: 'Todas' },
]

function TarefaCard({ tarefa, funcionarios, onConcluir, onReatribuir }) {
  const pendente = tarefa.status === 'pendente'
  const [reatribuindo, setReatribuindo] = useState(false)

  async function handleReatribuir(e) {
    const novoId = e.target.value
    if (!novoId || novoId === tarefa.responsavel_id) return
    setReatribuindo(true)
    try {
      await onReatribuir(tarefa.id, novoId)
    } finally {
      setReatribuindo(false)
    }
  }

  return (
    <div className={`tarefa-card ${!pendente ? 'tarefa-card--concluida' : ''}`}>
      <div className="tarefa-card-topo">
        <p className="tarefa-card-descricao">{tarefa.descricao}</p>
        <span className={`tag ${pendente ? 'tag--aviso' : 'tag--sucesso'}`}>
          {pendente ? '⏳ Pendente' : '✅ Concluída'}
        </span>
      </div>

      <div className="tarefa-card-meta">
        <span>👤 {tarefa.responsavel?.nome ?? '—'}</span>
        <span>📅 {formatDateTime(tarefa.data_execucao)}</span>
        {tarefa.pedidos && <span>📦 {tarefa.pedidos.protocolo}</span>}
      </div>

      {pendente ? (
        <div className="tarefa-card-acoes">
          <select
            className="input input-sm"
            defaultValue=""
            onChange={handleReatribuir}
            disabled={reatribuindo}
          >
            <option value="" disabled>Reatribuir para...</option>
            {funcionarios.filter((f) => f.id !== tarefa.responsavel_id).map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => onConcluir(tarefa.id)}>
            ✓ Concluir
          </button>
        </div>
      ) : (
        <p className="tarefa-card-concluido-em">Concluída em {formatDateTime(tarefa.concluido_em)}</p>
      )}
    </div>
  )
}

/**
 * RF-03: tarefas internas com prazo e responsável, atribuídas pelo operador
 * a um funcionário (separador/entregador). Telas 21-23 do bundle de design.
 */
export function TarefasPage() {
  const [tarefas, setTarefas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [filtroIdx, setFiltroIdx] = useState(0)
  const [modalAberto, setModalAberto] = useState(false)
  const { dados: funcionarios } = useFuncionarios({ ativo: true })
  const { toast } = useToast()

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const status = FILTROS[filtroIdx].valor
      const dados = await tarefasService.listar(status ? { status } : {})
      setTarefas(dados)
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
      channel = tarefasService.subscribe(() => carregar())
    } catch {
      channel = null
    }
    return () => {
      try { channel?.unsubscribe() } catch { /* ignora */ }
    }
  }, [carregar])

  async function handleConcluir(tarefaId) {
    try {
      await tarefasService.concluir(tarefaId)
      toast.sucesso('Tarefa concluída.')
      await carregar()
    } catch (err) {
      toast.erro('Erro ao concluir tarefa: ' + err.message)
    }
  }

  async function handleReatribuir(tarefaId, novoResponsavelId) {
    try {
      await tarefasService.reatribuir(tarefaId, novoResponsavelId)
      toast.sucesso('Tarefa reatribuída.')
      await carregar()
    } catch (err) {
      toast.erro('Erro ao reatribuir tarefa: ' + err.message)
    }
  }

  const pendentesCount = tarefas.filter((t) => t.status === 'pendente').length

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Tarefas Agendadas</h1>
          <p className="page-descricao">Tarefas internas com prazo, atribuídas a um funcionário</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={carregar}>↺ Atualizar</button>
          <button className="btn btn-primary" onClick={() => setModalAberto(true)}>+ Nova Tarefa</button>
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
              {f.valor === 'pendente' && pendentesCount > 0 && (
                <span style={{ marginLeft: 6 }}>({pendentesCount})</span>
              )}
            </button>
          ))}
        </div>
        <div className="section-contagem">{tarefas.length} tarefa(s)</div>
      </div>

      {carregando ? (
        <div className="card"><LoadingSpinner mensagem="Carregando tarefas..." /></div>
      ) : erro ? (
        <div className="card"><ErrorState titulo="Erro ao carregar tarefas" detalhe={erro.message} onRetry={carregar} /></div>
      ) : tarefas.length === 0 ? (
        <div className="card">
          <EmptyState
            icone="🗓️"
            titulo={FILTROS[filtroIdx].valor === 'pendente' ? 'Nenhuma tarefa pendente' : 'Nenhuma tarefa encontrada'}
            descricao='Clique em "+ Nova Tarefa" para agendar uma.'
            acao={{ label: '+ Nova Tarefa', onClick: () => setModalAberto(true) }}
          />
        </div>
      ) : (
        <div className="tarefa-lista">
          {tarefas.map((t) => (
            <TarefaCard
              key={t.id}
              tarefa={t}
              funcionarios={funcionarios}
              onConcluir={handleConcluir}
              onReatribuir={handleReatribuir}
            />
          ))}
        </div>
      )}

      {modalAberto && (
        <NovaTarefaModal
          onFechar={() => setModalAberto(false)}
          onCriada={carregar}
        />
      )}
    </div>
  )
}
