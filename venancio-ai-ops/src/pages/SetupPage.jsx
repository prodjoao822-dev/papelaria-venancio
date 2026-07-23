export function SetupPage() {
  return (
    <div className="setup-page">
      <div className="setup-card">
        <div className="setup-logo">🏪</div>
        <h1 className="setup-titulo">Venâncio AI Operations</h1>
        <p className="setup-subtitulo">Configure o Supabase para iniciar o sistema</p>

        <div className="setup-passos">
          <div className="setup-passo">
            <div className="setup-passo-num">1</div>
            <div className="setup-passo-info">
              <strong>Crie um projeto no Supabase</strong>
              <span>Acesse supabase.com e crie um novo projeto gratuito</span>
            </div>
          </div>

          <div className="setup-passo">
            <div className="setup-passo-num">2</div>
            <div className="setup-passo-info">
              <strong>Execute a migration SQL</strong>
              <span>
                No SQL Editor do Supabase, execute o arquivo:
                <code className="setup-code">supabase/migrations/001_schema_inicial.sql</code>
              </span>
            </div>
          </div>

          <div className="setup-passo">
            <div className="setup-passo-num">3</div>
            <div className="setup-passo-info">
              <strong>Crie o arquivo .env</strong>
              <span>Na raiz do projeto, crie o arquivo .env com:</span>
              <pre className="setup-pre">{`VITE_SUPABASE_URL=https://SEU_ID.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key`}</pre>
              <span className="setup-hint">
                📍 Credenciais em: Supabase Dashboard → Project Settings → API
              </span>
            </div>
          </div>

          <div className="setup-passo">
            <div className="setup-passo-num">4</div>
            <div className="setup-passo-info">
              <strong>Reinicie o servidor</strong>
              <span>
                Pare o <code className="setup-inline">npm run dev</code> e execute novamente
              </span>
            </div>
          </div>
        </div>

        <div className="setup-footer">
          <p>Dúvidas? Consulte o <strong>README.md</strong> do projeto.</p>
        </div>
      </div>

      <style>{`
        .setup-page {
          min-height: 100vh;
          background: #EEF0F4;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: 'Inter', sans-serif;
        }
        .setup-card {
          background: white;
          border-radius: 16px;
          padding: 40px;
          max-width: 560px;
          width: 100%;
          box-shadow: 0 10px 25px rgba(0,0,0,0.10);
          border: 1px solid #E2E6EC;
        }
        .setup-logo {
          font-size: 48px;
          text-align: center;
          margin-bottom: 16px;
        }
        .setup-titulo {
          font-size: 22px;
          font-weight: 700;
          color: #111827;
          text-align: center;
          margin-bottom: 4px;
        }
        .setup-subtitulo {
          font-size: 14px;
          color: #6B7280;
          text-align: center;
          margin-bottom: 32px;
        }
        .setup-passos {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .setup-passo {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }
        .setup-passo-num {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #2563EB;
          color: white;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .setup-passo-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }
        .setup-passo-info strong {
          font-size: 14px;
          color: #111827;
        }
        .setup-passo-info span {
          font-size: 13px;
          color: #4B5563;
          line-height: 1.5;
        }
        .setup-code {
          display: block;
          font-family: monospace;
          font-size: 12px;
          background: #F3F4F6;
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid #E2E6EC;
          color: #2563EB;
          margin-top: 6px;
        }
        .setup-pre {
          font-family: monospace;
          font-size: 12px;
          background: #1C2333;
          color: #A5F3FC;
          padding: 12px 14px;
          border-radius: 8px;
          margin-top: 6px;
          white-space: pre;
          line-height: 1.6;
        }
        .setup-inline {
          font-family: monospace;
          font-size: 12px;
          background: #F3F4F6;
          padding: 2px 5px;
          border-radius: 4px;
          border: 1px solid #E2E6EC;
          color: #2563EB;
        }
        .setup-hint {
          font-size: 12px !important;
          color: #D97706 !important;
          margin-top: 4px;
        }
        .setup-footer {
          margin-top: 28px;
          padding-top: 16px;
          border-top: 1px solid #E2E6EC;
          text-align: center;
          font-size: 13px;
          color: #6B7280;
        }
      `}</style>
    </div>
  )
}
