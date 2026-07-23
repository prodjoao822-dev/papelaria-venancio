import { useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const TITULOS = {
  '/':              { pai: 'Visão Geral',  atual: 'Dashboard de Operações' },
  '/pedidos':       { pai: 'Operações',    atual: 'Pedidos'                },
  '/logistica':     { pai: 'Operações',    atual: 'Logística'              },
  '/atendimento':   { pai: 'Operações',    atual: 'Atendimento'            },
  '/clientes':      { pai: 'Cadastros',    atual: 'Clientes'               },
  '/orcamentos':    { pai: 'Cadastros',    atual: 'Orçamentos'             },
  '/catalogo':      { pai: 'Cadastros',    atual: 'Catálogo de Produtos'   },
  '/relatorios':    { pai: 'Sistema',      atual: 'Relatórios'             },
  '/configuracoes': { pai: 'Sistema',      atual: 'Configurações'          },
}

export function Header({ onToggleSidebar }) {
  const location = useLocation()
  const { operador, logout } = useAuth()
  const info = TITULOS[location.pathname] ?? { pai: 'Venâncio', atual: 'AI Operations' }

  const agora = new Date()
  const data = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(agora)

  return (
    <header className="app-header">
      <div className="app-header-esquerda">
        <button
          className="header-menu-btn"
          onClick={onToggleSidebar}
          aria-label="Abrir menu"
        >
          ☰
        </button>

        <div className="header-breadcrumb">
          <span className="header-breadcrumb-pai">{info.pai}</span>
          <span className="header-breadcrumb-sep">/</span>
          <span className="header-breadcrumb-atual">{info.atual}</span>
        </div>
      </div>

      <div className="header-search">
        <span className="header-search-icone">🔍</span>
        <input
          className="header-search-input"
          type="text"
          placeholder="Buscar pedidos, clientes..."
          aria-label="Busca global"
        />
      </div>

      <div className="app-header-direita">
        <span className="app-header-data">{data}</span>

        <div className="header-divider" />

        <button className="header-icon-btn" title="Notificações">
          🔔
          <span className="header-notif-badge" />
        </button>

        <button className="header-icon-btn" title="Ajuda">
          ❓
        </button>

        {operador && (
          <>
            <div className="header-divider" />
            <span className="app-header-data" title={operador.papel}>{operador.nome}</span>
            <button className="header-icon-btn" title="Sair" onClick={logout}>
              🚪
            </button>
          </>
        )}
      </div>
    </header>
  )
}
