import { useState } from 'react'
import { funcionariosService } from '@/services/funcionarios.service'
import { separadorAdminService } from '@/services/separadorAdmin.service'
import { useFuncionarios } from '@/hooks/useFuncionarios'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/contexts/AppContext'
import { PAPEIS_FUNCIONARIO } from '@/utils/constants'

// ── Modal de Funcionário (criar / editar) ──────────────────────────────────────

function FuncionarioModal({ funcionario, onSalvar, onFechar }) {
  const isEdicao = !!funcionario?.id
  const [nome, setNome] = useState(funcionario?.nome ?? '')
  const [papeis, setPapeis] = useState(funcionario?.papeis ?? [])
  const [ativo, setAtivo] = useState(funcionario?.ativo ?? true)
  const [codigoFuncionario, setCodigoFuncionario] = useState(funcionario?.codigo_funcionario ?? '')
  const [salvando, setSalvando] = useState(false)
  const [gerandoPin, setGerandoPin] = useState(false)
  const [pinGerado, setPinGerado] = useState(null)
  const { toast } = useToast()

  // Login (código + PIN) é exigido por qualquer papel com app mobile —
  // hoje Separador e Entregador (mesmo endpoint de login no bot, ver
  // separadorAuthController.js: aceita 'separacao' OU 'entrega'). Um
  // funcionário só de outro papel futuro sem app não precisa disso.
  const precisaLogin = papeis.includes('separacao') || papeis.includes('entrega')

  function togglePapel(valor) {
    setPapeis((p) => (p.includes(valor) ? p.filter((v) => v !== valor) : [...p, valor]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nome.trim()) return toast.aviso('Nome é obrigatório.')
    if (papeis.length === 0) return toast.aviso('Selecione ao menos um papel.')
    if (precisaLogin && codigoFuncionario && codigoFuncionario.trim().length < 2) {
      return toast.aviso('Código de funcionário precisa ter ao menos 2 caracteres.')
    }

    setSalvando(true)
    try {
      await onSalvar({
        nome: nome.trim(),
        papeis,
        ...(isEdicao ? { ativo } : {}),
        ...(precisaLogin ? { codigo_funcionario: codigoFuncionario.trim() || null } : {}),
      })
      toast.sucesso(isEdicao ? 'Funcionário atualizado.' : 'Funcionário criado.')
      onFechar()
    } catch (err) {
      toast.erro(err.message ?? 'Erro ao salvar funcionário.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleGerarPin() {
    if (!codigoFuncionario.trim()) {
      return toast.aviso('Defina e salve um código de funcionário antes de gerar o PIN.')
    }
    if (codigoFuncionario.trim() !== (funcionario?.codigo_funcionario ?? '')) {
      return toast.aviso('Salve o código de funcionário primeiro (clique em "Salvar Alterações").')
    }
    setGerandoPin(true)
    try {
      const novoPin = separadorAdminService.gerarPin()
      await separadorAdminService.resetarPin(funcionario.id, novoPin)
      setPinGerado(novoPin)
      toast.sucesso('PIN gerado — anote e entregue ao separador. Não será mostrado de novo.')
    } catch (err) {
      toast.erro('Erro ao gerar PIN: ' + err.message)
    } finally {
      setGerandoPin(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-titulo">{isEdicao ? 'Editar Funcionário' : 'Novo Funcionário'}</h2>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-grupo form-grupo--full">
              <label className="form-label">Nome *</label>
              <input
                autoFocus
                className="input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Camila Souza"
              />
            </div>

            <div className="form-grupo form-grupo--full">
              <label className="form-label">Papéis *</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                {PAPEIS_FUNCIONARIO.map((p) => (
                  <label key={p.value} className="form-label-check">
                    <input
                      type="checkbox"
                      checked={papeis.includes(p.value)}
                      onChange={() => togglePapel(p.value)}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>

            {isEdicao && (
              <div className="form-grupo form-grupo--full">
                <label className="form-label-check">
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={(e) => setAtivo(e.target.checked)}
                  />
                  Funcionário ativo (aparece nos dropdowns de atribuição)
                </label>
              </div>
            )}

            {isEdicao && precisaLogin && (
              <div className="form-grupo form-grupo--full">
                <label className="form-label">Login do App Mobile (código + PIN)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input"
                    style={{ maxWidth: 200 }}
                    placeholder="Código (ex: sep01)"
                    value={codigoFuncionario}
                    onChange={(e) => setCodigoFuncionario(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleGerarPin}
                    disabled={gerandoPin}
                  >
                    {gerandoPin ? 'Gerando...' : '🔑 Gerar/Resetar PIN'}
                  </button>
                </div>
                <p className="form-hint">
                  Código de login que o funcionário digita no app (Separador ou Entregador). O PIN é
                  gerado por aqui (nunca pelo próprio funcionário) e só é mostrado uma vez.
                </p>
                {pinGerado && (
                  <div className="estado-erro estado-erro--compacto" style={{ borderColor: 'var(--success)', background: 'rgba(47,168,90,0.1)', marginTop: 8 }}>
                    <strong>PIN gerado: {pinGerado}</strong>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Anote e entregue ao funcionário agora — não será exibido de novo.</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onFechar} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : isEdicao ? '💾 Salvar Alterações' : '+ Criar Funcionário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────────

const LABEL_PAPEL = Object.fromEntries(PAPEIS_FUNCIONARIO.map((p) => [p.value, p.label]))

export function FuncionariosPage() {
  const { dados: funcionarios, carregando, carregar } = useFuncionarios()
  const [modalAberto, setModalAberto] = useState(false)
  const [funcionarioEditar, setFuncionarioEditar] = useState(null)
  const { toast } = useToast()

  async function handleSalvar(dados) {
    if (funcionarioEditar?.id) {
      await funcionariosService.atualizar(funcionarioEditar.id, dados)
    } else {
      await funcionariosService.criar(dados)
    }
    await carregar()
  }

  async function handleToggleAtivo(funcionario) {
    try {
      await funcionariosService.toggleAtivo(funcionario.id)
      toast.sucesso(funcionario.ativo ? 'Funcionário desativado.' : 'Funcionário ativado.')
      await carregar()
    } catch (err) {
      toast.erro(err.message ?? 'Erro ao alterar funcionário.')
    }
  }

  function abrirEdicao(funcionario) {
    setFuncionarioEditar(funcionario)
    setModalAberto(true)
  }

  function abrirNovo() {
    setFuncionarioEditar(null)
    setModalAberto(true)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Funcionários</h1>
          <p className="page-descricao">Equipe de separação e entrega — sem login, atribuídos direto no pedido</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={carregar}>↺ Atualizar</button>
          <button className="btn btn-primary" onClick={abrirNovo}>+ Novo Funcionário</button>
        </div>
      </div>

      <div className="card">
        {carregando ? (
          <LoadingSpinner mensagem="Carregando funcionários..." />
        ) : funcionarios.length === 0 ? (
          <EmptyState
            icone="🧑‍🤝‍🧑"
            titulo="Nenhum funcionário cadastrado"
            descricao='Clique em "+ Novo Funcionário" para começar.'
          />
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="tabela-th">Nome</th>
                  <th className="tabela-th">Papéis</th>
                  <th className="tabela-th">Status</th>
                  <th className="tabela-th"></th>
                </tr>
              </thead>
              <tbody>
                {funcionarios.map((f) => (
                  <tr key={f.id} className={`tabela-row ${!f.ativo ? 'tabela-row--inativo' : ''}`}>
                    <td className="tabela-cell">
                      <strong>{f.nome}</strong>
                    </td>
                    <td className="tabela-cell">
                      <div className="tags-lista">
                        {(f.papeis ?? []).length > 0 ? (
                          f.papeis.map((p) => (
                            <span key={p} className="tag tag--info">{LABEL_PAPEL[p] ?? p}</span>
                          ))
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="tabela-cell">
                      <span className={`tag ${f.ativo ? 'tag--sucesso' : 'tag--neutro'}`}>
                        {f.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="tabela-cell tabela-cell--acoes">
                      <button
                        className="btn btn-ghost btn-xs"
                        title="Editar funcionário"
                        onClick={() => abrirEdicao(f)}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        title={f.ativo ? 'Desativar' : 'Ativar'}
                        onClick={() => handleToggleAtivo(f)}
                      >
                        {f.ativo ? '⏸' : '▶'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalAberto && (
        <FuncionarioModal
          funcionario={funcionarioEditar}
          onSalvar={handleSalvar}
          onFechar={() => { setModalAberto(false); setFuncionarioEditar(null) }}
        />
      )}
    </div>
  )
}
