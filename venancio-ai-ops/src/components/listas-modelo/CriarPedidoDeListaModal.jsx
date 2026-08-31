import { useState } from 'react'
import { listasModeloService } from '@/services/listasModelo.service'
import { clientesService } from '@/services/clientes.service'
import { useToast } from '@/contexts/AppContext'
import { formatCurrency } from '@/utils/formatters'

const FORMAS_ENTREGA = [
  { value: 'retirada',        label: 'Retirada na loja' },
  { value: 'entrega_propria', label: 'Entrega própria (pedido ≥ R$100)' },
  { value: 'uber_flash',      label: 'Uber Flash / Motoboy' },
]

// Cria um pedido de verdade a partir de uma lista modelo. Único dado que
// falta pro molde virar pedido é "de quem" — por isso o passo central
// daqui é achar/cadastrar o cliente, igual o NovoPedidoModal já faz.
export function CriarPedidoDeListaModal({ lista, onFechar, onCriado }) {
  const { toast } = useToast()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [formaEntrega, setFormaEntrega] = useState('retirada')
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  const [horario, setHorario] = useState('')
  const [salvando, setSalvando] = useState(false)

  const itens = lista.listas_modelo_itens ?? []
  const valorMinimoEntregaPropria = Number(lista.valor_total) < 100

  async function handleCriar() {
    if (!nome.trim()) { toast.aviso('Informe o nome do cliente.'); return }
    if (!telefone.trim()) { toast.aviso('Informe o telefone do cliente.'); return }
    if (formaEntrega === 'entrega_propria' && valorMinimoEntregaPropria) {
      toast.aviso('Entrega própria só é permitida a partir de R$100 — escolha retirada ou Uber Flash.')
      return
    }
    if (formaEntrega !== 'retirada' && !enderecoEntrega.trim()) {
      toast.aviso('Informe o endereço de entrega.')
      return
    }

    setSalvando(true)
    try {
      let cliente = await clientesService.buscarPorTelefone(telefone.trim())
      if (!cliente) {
        cliente = await clientesService.criarOuAtualizar(telefone.trim(), {
          nome: nome.trim(),
          // 'lista_modelo' não existe -- clientes_origem_check só aceita
          // 'whatsapp' ou 'manual'. Mesmo padrão do NovoPedidoModal/
          // NovoOrcamentoModal: cliente cadastrado pelo Operador no
          // dashboard é 'manual' (achado em produção 01/09).
          origem: 'manual',
        })
      }

      const pedido = await listasModeloService.criarPedido({
        listaModeloId: lista.id,
        clienteId: cliente.id,
        formaEntrega,
        enderecoEntrega: formaEntrega !== 'retirada' ? enderecoEntrega.trim() : null,
        horarioRetiradaDesejado: horario.trim() || null,
      })

      toast.sucesso(`Pedido ${pedido.protocolo} criado a partir da lista!`)
      onCriado?.(pedido)
    } catch (err) {
      toast.erro('Erro ao criar pedido: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-header-esquerda">
            <span style={{ fontSize: '22px' }}>🧾</span>
            <div>
              <h2 className="modal-titulo">Criar Pedido — {lista.ano}</h2>
              <p className="modal-subtitulo">{lista.escolas?.nome} · {itens.length} itens · {formatCurrency(lista.valor_total)}</p>
            </div>
          </div>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="modal-body">
          <div className="pedido-detalhe">
            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Cliente</p>
              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label">Nome *</label>
                  <input className="input" placeholder="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div className="form-grupo">
                  <label className="form-label">Telefone / WhatsApp *</label>
                  <input className="input" placeholder="+55 27 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                </div>
              </div>
              <p className="form-hint">Se já existir um cliente com esse telefone, o pedido é vinculado a ele — não duplica cadastro.</p>
            </div>

            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Entrega</p>
              <div className="form-grid form-grid--2">
                <div className="form-grupo">
                  <label className="form-label">Forma de Entrega</label>
                  <select className="input" value={formaEntrega} onChange={(e) => setFormaEntrega(e.target.value)}>
                    {FORMAS_ENTREGA.map((f) => (
                      <option key={f.value} value={f.value} disabled={f.value === 'entrega_propria' && valorMinimoEntregaPropria}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-grupo">
                  <label className="form-label">Horário desejado</label>
                  <input className="input" placeholder="Ex: hoje às 16h" value={horario} onChange={(e) => setHorario(e.target.value)} />
                </div>
                {formaEntrega !== 'retirada' && (
                  <div className="form-grupo form-grupo--full">
                    <label className="form-label">Endereço de Entrega *</label>
                    <input className="input" placeholder="Rua, número, bairro, cidade" value={enderecoEntrega} onChange={(e) => setEnderecoEntrega(e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            <div className="pedido-detalhe-secao">
              <p className="pedido-detalhe-titulo">Itens da lista ({itens.length})</p>
              <div className="itens-input-lista" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {itens.map((item) => (
                  <div key={item.id} className="item-input-linha" style={{ gridTemplateColumns: '1fr auto auto' }}>
                    <span>{item.produtos?.nome ?? item.descricao_livre}</span>
                    <span style={{ textAlign: 'center', color: 'var(--text-3)' }}>{item.quantidade}x</span>
                    <span style={{ textAlign: 'right' }}>{formatCurrency(item.valor_unitario)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <div className="itens-total-novo">
                  Total: <strong>{formatCurrency(lista.valor_total)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-purple" onClick={handleCriar} disabled={salvando}>
            {salvando ? (
              <><span className="spinner spinner--branco" style={{ width: 14, height: 14 }} /> Criando...</>
            ) : (
              '✓ Criar Pedido'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
