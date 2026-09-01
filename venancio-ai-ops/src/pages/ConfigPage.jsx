import { useState, useEffect, useCallback } from 'react'
import { APP_NAME, APP_VERSION, N8N_WEBHOOK_BASE, BOT_API_URL } from '@/utils/constants'
import { operadoresService } from '@/services/operadores.service'
import { useToast } from '@/contexts/AppContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function ConfigPage() {
  return (
    <div className="page">
      <div className="config-grid">
        <OperadoresCard />
        {/* Status das integrações */}
        <div className="card">
          <h3 className="card-titulo">Status das Integrações</h3>
          <div className="config-lista">
            <IntegracaoItem
              nome="Supabase"
              descricao="Banco de dados e realtime"
              ativo={true}
              obrigatorio
            />
            <IntegracaoItem
              nome="n8n Webhooks"
              descricao={N8N_WEBHOOK_BASE ?? 'Não configurado'}
              ativo={!!N8N_WEBHOOK_BASE}
              dica="Configure VITE_N8N_WEBHOOK_BASE no .env"
            />
            <IntegracaoItem
              nome="Envio de WhatsApp (via JS Bot)"
              descricao={BOT_API_URL ?? 'Não configurado'}
              ativo={!!BOT_API_URL}
              dica="Configure VITE_BOT_API_URL no .env — a credencial da Evolution API fica só no JS Bot, nunca no dashboard"
            />
            <IntegracaoItem
              nome="IA (Agentes n8n)"
              descricao={N8N_WEBHOOK_BASE ? 'Agente de Vendas + Agente de Orçamento via n8n' : 'Não configurado'}
              ativo={!!N8N_WEBHOOK_BASE}
              dica="A IA roda como workflows n8n chamados direto pelo JS Bot — configure VITE_N8N_WEBHOOK_BASE"
            />
          </div>
        </div>

        {/* Status dos módulos */}
        <div className="card">
          <h3 className="card-titulo">Módulos do Sistema</h3>
          <div className="config-lista">
            <ModuloItem nome="Dashboard Operacional" status="ativo" />
            <ModuloItem nome="Gestão de Pedidos" status="ativo" />
            <ModuloItem nome="Realtime (Supabase)" status="ativo" />
            <ModuloItem nome="Integração WhatsApp" status={BOT_API_URL ? 'ativo' : 'preparado'} />
            <ModuloItem nome="IA (Agentes n8n)" status={N8N_WEBHOOK_BASE ? 'ativo' : 'preparado'} />
            <ModuloItem nome="Multiagentes" status="futuro" />
            <ModuloItem nome="App Mobile / APK" status="futuro" />
            <ModuloItem nome="Notificações Push" status="futuro" />
          </div>
        </div>

        {/* Informações do sistema */}
        <div className="card">
          <h3 className="card-titulo">Sistema</h3>
          <div className="config-lista">
            <div className="config-item">
              <span className="config-item-label">Versão</span>
              <span className="config-item-valor">{APP_VERSION}</span>
            </div>
            <div className="config-item">
              <span className="config-item-label">App</span>
              <span className="config-item-valor">{APP_NAME}</span>
            </div>
            <div className="config-item">
              <span className="config-item-label">Frontend</span>
              <span className="config-item-valor">React + Vite</span>
            </div>
            <div className="config-item">
              <span className="config-item-label">Backend</span>
              <span className="config-item-valor">Supabase (PostgreSQL)</span>
            </div>
            <div className="config-item">
              <span className="config-item-label">Realtime</span>
              <span className="config-item-valor">Supabase Realtime (WebSocket)</span>
            </div>
            <div className="config-item">
              <span className="config-item-label">Orquestração</span>
              <span className="config-item-valor">n8n</span>
            </div>
          </div>
        </div>

        {/* Próximos passos */}
        <div className="card">
          <h3 className="card-titulo">Próximos Passos</h3>
          <ol className="config-passos">
            <li>Configure o <code>.env</code> com credenciais do Supabase</li>
            <li>Execute a migration SQL no dashboard do Supabase</li>
            <li>Execute o seed de produtos (opcional)</li>
            <li>Importe os workflows do Agente de Vendas e do Agente de Orçamento no n8n</li>
            <li>Configure a Evolution API para receber e enviar mensagens WhatsApp</li>
            <li>Deploy do JS Bot (<code>chatbot/papelaria-bot/</code>), que fala direto com os agentes n8n e com a Evolution API</li>
            <li>Configure VITE_N8N_WEBHOOK_BASE e VITE_BOT_API_URL (URL pública do JS Bot)</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

// Gestão de login por código+PIN dos outros operadores (01/09/2026) — ao
// lado do e-mail/senha do dono, que continua como está. Não gateamos por
// papel no client (mesmo padrão de FuncionariosPage.jsx): o backend recusa
// com 403 se quem chama não for admin, e o toast mostra o erro.
function OperadoresCard() {
  const { toast } = useToast()
  const [operadores, setOperadores] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nome, setNome] = useState('')
  const [codigo, setCodigo] = useState('')
  const [papel, setPapel] = useState('operador')
  const [salvando, setSalvando] = useState(false)
  const [pinGerado, setPinGerado] = useState(null) // { operadorId, pin } — só na tela, nunca persistido aqui

  const carregar = useCallback(() => {
    setCarregando(true)
    operadoresService.listar()
      .then(setOperadores)
      .catch((err) => toast.erro('Erro ao carregar operadores: ' + err.message))
      .finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function handleCriar(e) {
    e.preventDefault()
    if (!/^\d{4}$/.test(codigo)) return toast.aviso('Código precisa ter exatamente 4 dígitos.')
    setSalvando(true)
    try {
      const pin = operadoresService.gerarPin()
      const novo = await operadoresService.criarComCodigo({ nome: nome.trim(), codigo, pin, papel })
      setPinGerado({ operadorId: novo.id, pin })
      setNome('')
      setCodigo('')
      setPapel('operador')
      setMostrarForm(false)
      toast.sucesso('Operador cadastrado — anote o PIN abaixo, não será mostrado de novo.')
      carregar()
    } catch (err) {
      toast.erro('Erro ao cadastrar operador: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  async function handleResetarPin(operador) {
    const pin = operadoresService.gerarPin()
    try {
      await operadoresService.resetarPin(operador.id, pin)
      setPinGerado({ operadorId: operador.id, pin })
      toast.sucesso('PIN gerado — anote e entregue ao operador. Não será mostrado de novo.')
    } catch (err) {
      toast.erro('Erro ao gerar PIN: ' + err.message)
    }
  }

  async function handleToggleAtivo(operador) {
    try {
      await operadoresService.atualizarAtivo(operador.id, !operador.ativo)
      carregar()
    } catch (err) {
      toast.erro('Erro ao atualizar operador: ' + err.message)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="card-titulo">Operadores (login por código)</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Novo Operador'}
        </button>
      </div>
      <p className="config-item-desc" style={{ marginBottom: 12 }}>
        Sua própria conta continua por e-mail/senha. Cadastre aqui os demais operadores da equipe
        pra entrarem por código de 4 dígitos + PIN de 6 (mesmo formato do Separador no app).
      </p>

      {mostrarForm && (
        <form onSubmit={handleCriar} className="config-lista" style={{ marginBottom: 12 }}>
          <div className="form-grid form-grid--2">
            <div className="form-grupo">
              <label className="form-label">Nome *</label>
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <div className="form-grupo">
              <label className="form-label">Código (4 dígitos) *</label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={4}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4))}
                required
              />
            </div>
            <div className="form-grupo">
              <label className="form-label">Papel</label>
              <select className="input" value={papel} onChange={(e) => setPapel(e.target.value)}>
                <option value="operador">Operador</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
            {salvando ? 'Cadastrando...' : 'Cadastrar e gerar PIN'}
          </button>
        </form>
      )}

      {carregando ? (
        <LoadingSpinner mensagem="Carregando operadores..." />
      ) : (
        <div className="config-lista">
          {operadores.map((op) => (
            <div key={op.id} className="config-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="config-item-label">{op.nome}</span>
                  <span className="config-item-desc">
                    {op.codigo ? `Código ${op.codigo} · ${op.papel}` : `${op.papel} · e-mail/senha`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`tag ${op.ativo ? 'tag--sucesso' : 'tag--neutro'}`}>
                    {op.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  {op.codigo && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleResetarPin(op)}>
                      🔑 Resetar PIN
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => handleToggleAtivo(op)}>
                    {op.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
              {pinGerado?.operadorId === op.id && (
                <div className="estado-erro estado-erro--compacto" style={{ borderColor: 'var(--success)', background: 'rgba(47,168,90,0.1)', marginTop: 8 }}>
                  <strong>PIN gerado: {pinGerado.pin}</strong>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Anote e entregue ao operador agora — não será exibido de novo.</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IntegracaoItem({ nome, descricao, ativo, obrigatorio, dica }) {
  return (
    <div className="config-item config-item--integracao">
      <div className="config-item-info">
        <span className="config-item-label">{nome}</span>
        <span className="config-item-desc">{descricao}</span>
        {dica && !ativo && <span className="config-item-dica">💡 {dica}</span>}
      </div>
      <span className={`tag ${ativo ? 'tag--sucesso' : obrigatorio ? 'tag--perigo' : 'tag--neutro'}`}>
        {ativo ? 'Ativo' : obrigatorio ? 'Necessário' : 'Inativo'}
      </span>
    </div>
  )
}

function ModuloItem({ nome, status }) {
  const cfg = {
    ativo: { label: 'Ativo', cls: 'tag--sucesso' },
    preparado: { label: 'Preparado', cls: 'tag--aviso' },
    futuro: { label: 'Futuro', cls: 'tag--neutro' },
  }
  const c = cfg[status] ?? cfg.futuro
  return (
    <div className="config-item">
      <span className="config-item-label">{nome}</span>
      <span className={`tag ${c.cls}`}>{c.label}</span>
    </div>
  )
}
