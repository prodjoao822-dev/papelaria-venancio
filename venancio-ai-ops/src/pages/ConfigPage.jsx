import { APP_NAME, APP_VERSION, N8N_WEBHOOK_BASE, EVOLUTION_API_URL } from '@/utils/constants'

export function ConfigPage() {
  return (
    <div className="page">
      <div className="config-grid">
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
              nome="Evolution API (WhatsApp)"
              descricao={EVOLUTION_API_URL ?? 'Não configurado'}
              ativo={!!EVOLUTION_API_URL}
              dica="Configure VITE_EVOLUTION_API_URL no .env"
            />
            <IntegracaoItem
              nome="OpenAI / IA"
              descricao="Configurado no AI Service (Node.js separado)"
              ativo={false}
              dica="Configure no serviço ai-service/"
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
            <ModuloItem nome="Integração WhatsApp" status="preparado" />
            <ModuloItem nome="IA + LangChain" status="preparado" />
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
            <li>Configure o n8n com os workflows da pasta <code>automation/</code></li>
            <li>Configure a Evolution API para receber mensagens WhatsApp</li>
            <li>Deploy do <code>ai-service/</code> (Node.js) no servidor</li>
            <li>Configure VITE_N8N_WEBHOOK_BASE e VITE_EVOLUTION_API_URL</li>
          </ol>
        </div>
      </div>
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
