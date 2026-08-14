import { useState, useEffect, useCallback } from 'react'
import { produtosService } from '@/services/produtos.service'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/contexts/AppContext'

function LookupColumn({ titulo, singular, itens, carregando, onAdicionar, onRenomear, onExcluir, onMesclar }) {
  const [novoNome, setNovoNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [editandoNome, setEditandoNome] = useState('')
  const [excluindo, setExcluindo] = useState(null)
  const [mesclandoId, setMesclandoId] = useState(null)
  const [destinoMesclagem, setDestinoMesclagem] = useState('')
  const [mesclando, setMesclando] = useState(false)

  async function handleAdicionar() {
    if (!novoNome.trim()) return
    setSalvando(true)
    try {
      await onAdicionar(novoNome.trim())
      setNovoNome('')
    } catch { /* toast já mostrado pelo chamador */ } finally {
      setSalvando(false)
    }
  }

  function iniciarEdicao(item) {
    setEditandoId(item.id)
    setEditandoNome(item.nome)
  }

  async function confirmarEdicao(item) {
    if (!editandoNome.trim()) { setEditandoId(null); return }
    try {
      await onRenomear(item.id, editandoNome.trim())
    } catch { /* toast já mostrado pelo chamador */ } finally {
      setEditandoId(null)
    }
  }

  async function confirmarExclusao() {
    const item = excluindo
    setExcluindo(null)
    try {
      await onExcluir(item.id)
    } catch { /* toast já mostrado pelo chamador */ }
  }

  function iniciarMesclagem(item) {
    setMesclandoId(item.id)
    setDestinoMesclagem('')
  }

  async function confirmarMesclagem(item) {
    if (!destinoMesclagem) return
    setMesclando(true)
    try {
      await onMesclar(item.id, destinoMesclagem)
      setMesclandoId(null)
    } catch { /* toast já mostrado pelo chamador */ } finally {
      setMesclando(false)
    }
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="section-titulo" style={{ marginBottom: 14, display: 'block' }}>{titulo}</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="input"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder={`Nova ${singular.toLowerCase()}…`}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdicionar())}
        />
        <button className="btn btn-primary btn-sm" onClick={handleAdicionar} disabled={salvando || !novoNome.trim()}>
          + Adicionar
        </button>
      </div>

      {carregando ? (
        <LoadingSpinner mensagem="Carregando..." />
      ) : itens.length === 0 ? (
        <EmptyState icone="🏷️" titulo={`Nenhuma ${singular.toLowerCase()} cadastrada`} descricao="Adicione a primeira acima." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {itens.map((item) => (
            <div key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 4px' }}>
                {editandoId === item.id ? (
                  <>
                    <input
                      className="input input-sm"
                      style={{ flex: 1 }}
                      value={editandoNome}
                      onChange={(e) => setEditandoNome(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && confirmarEdicao(item)}
                      autoFocus
                    />
                    <button className="btn btn-ghost btn-xs" onClick={() => confirmarEdicao(item)} title="Salvar">✓</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setEditandoId(null)} title="Cancelar">✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{item.nome}</span>
                    <button className="btn btn-ghost btn-xs" onClick={() => iniciarEdicao(item)} title="Renomear">✏️</button>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => (mesclandoId === item.id ? setMesclandoId(null) : iniciarMesclagem(item))}
                      title={`Mesclar com outra ${singular.toLowerCase()} duplicada`}
                    >
                      🔀
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setExcluindo(item)} title="Excluir">🗑</button>
                  </>
                )}
              </div>

              {mesclandoId === item.id && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 4px 10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    Mover todos os produtos de "{item.nome}" para:
                  </span>
                  <select
                    className="input input-sm"
                    style={{ maxWidth: 200 }}
                    value={destinoMesclagem}
                    onChange={(e) => setDestinoMesclagem(e.target.value)}
                  >
                    <option value="">— Selecionar —</option>
                    {itens.filter((i) => i.id !== item.id).map((i) => (
                      <option key={i.id} value={i.id}>{i.nome}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-warning btn-xs"
                    disabled={!destinoMesclagem || mesclando}
                    onClick={() => confirmarMesclagem(item)}
                  >
                    {mesclando ? 'Mesclando...' : `Confirmar — apaga "${item.nome}"`}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        visivel={!!excluindo}
        titulo={`Excluir ${singular.toLowerCase()}?`}
        descricao={`Tem certeza que deseja excluir "${excluindo?.nome}"? Produtos que usam essa ${singular.toLowerCase()} impedem a exclusão.`}
        perigo
        onConfirmar={confirmarExclusao}
        onCancelar={() => setExcluindo(null)}
      />
    </div>
  )
}

export function MarcasCategoriasPage() {
  const [marcas, setMarcas] = useState([])
  const [categorias, setCategorias] = useState([])
  const [carregando, setCarregando] = useState(true)
  const { toast } = useToast()

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [m, c] = await Promise.all([
        produtosService.listarMarcasDetalhado(),
        produtosService.listarCategoriasDetalhado(),
      ])
      setMarcas(m)
      setCategorias(c)
    } catch (err) {
      toast.erro('Erro ao carregar: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => { carregar() }, [carregar])

  async function executar(fn, mensagemSucesso) {
    try {
      await fn()
      toast.sucesso(mensagemSucesso)
      await carregar()
    } catch (err) {
      toast.erro(err.message)
      throw err
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-info">
          <h1 className="page-titulo">Marcas & Categorias</h1>
          <p className="page-descricao">Gerencie as listas usadas para organizar e filtrar o catálogo</p>
        </div>
        <div className="page-header-acoes">
          <button className="btn btn-ghost btn-sm" onClick={carregar}>↺ Atualizar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <LookupColumn
          titulo="Marcas"
          singular="Marca"
          itens={marcas}
          carregando={carregando}
          onAdicionar={(nome) => executar(() => produtosService.criarMarca(nome), 'Marca criada.')}
          onRenomear={(id, nome) => executar(() => produtosService.renomearMarca(id, nome), 'Marca atualizada.')}
          onExcluir={(id) => executar(() => produtosService.excluirMarca(id), 'Marca excluída.')}
          onMesclar={(origemId, destinoId) => executar(() => produtosService.mesclarMarca(origemId, destinoId), 'Marcas mescladas.')}
        />
        <LookupColumn
          titulo="Categorias"
          singular="Categoria"
          itens={categorias}
          carregando={carregando}
          onAdicionar={(nome) => executar(() => produtosService.criarCategoria(nome), 'Categoria criada.')}
          onRenomear={(id, nome) => executar(() => produtosService.renomearCategoria(id, nome), 'Categoria atualizada.')}
          onExcluir={(id) => executar(() => produtosService.excluirCategoria(id), 'Categoria excluída.')}
          onMesclar={(origemId, destinoId) => executar(() => produtosService.mesclarCategoria(origemId, destinoId), 'Categorias mescladas.')}
        />
      </div>
    </div>
  )
}
