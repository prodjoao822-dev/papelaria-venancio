import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { APP_NAME } from '@/utils/constants'
import { useKpis } from '@/hooks/usePedidos'
import { STATUS } from '@/utils/status'
import { operationalQueriesService } from '@/services/operational-queries.service'
import { demandIntelligenceService } from '@/services/demand-intelligence.service'

function useConsultasPendentes() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let mounted = true
    let channel = null

    async function buscar() {
      try {
        const n = await operationalQueriesService.contarPendentes()
        if (mounted) setCount(n)
      } catch { /* sem Supabase */ }
    }

    buscar()

    try {
      channel = operationalQueriesService.subscribe(() => buscar())
    } catch { channel = null }

    return () => {
      mounted = false
      try { channel?.unsubscribe() } catch { /* ignora */ }
    }
  }, [])

  return count
}

function useAlertasDemanda() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let mounted = true
    let channel = null

    async function buscar() {
      try {
        const n = await demandIntelligenceService.contarAlertasNovos()
        if (mounted) setCount(n)
      } catch { /* sem Supabase */ }
    }

    buscar()

    try {
      channel = demandIntelligenceService.subscribeAlertas(() => buscar())
    } catch { channel = null }

    return () => {
      mounted = false
      try { channel?.unsubscribe() } catch { /* ignora */ }
    }
  }, [])

  return count
}

const NAV_OPERACOES = [
  { to: '/',            label: 'Dashboard',     icone: '◈',  exact: true },
  { to: '/pedidos',     label: 'Pedidos',       icone: '📦', badgeKey: 'pedidosAtivos' },
  { to: '/logistica',   label: 'Logística',     icone: '🛵' },
  { to: '/atendimento', label: 'Atendimento',   icone: '💬', badgeKey: 'atendimentos', badgeAlerta: true },
  { to: '/consultas',   label: 'Consultas IA',  icone: '❓', badgeKey: 'consultas',    badgeAlerta: true },
]

const NAV_CATALOGO = [
  { to: '/catalogo',    label: 'Catálogo',      icone: '🏷️' },
  { to: '/memoria-ia',  label: 'Memória IA',    icone: '🧠' },
  { to: '/demanda',     label: 'Demanda',        icone: '📈', badgeKey: 'alertasDemanda', badgeAlerta: true },
]

const NAV_CADASTROS = [
  { to: '/clientes',    label: 'Clientes',      icone: '👥' },
  { to: '/orcamentos',  label: 'Orçamentos',    icone: '📋' },
]

const NAV_SISTEMA = [
  { to: '/relatorios',    label: 'Relatórios',    icone: '📊' },
  { to: '/configuracoes', label: 'Configurações', icone: '⚙️' },
]

export function Sidebar({ aberta, onFechar }) {
  const { kpis }             = useKpis()
  const consultasPendentes   = useConsultasPendentes()
  const alertasDemanda       = useAlertasDemanda()

  const pedidosAtivos =
    (kpis?.contadores?.[STATUS.NOVO_PEDIDO]           ?? 0) +
    (kpis?.contadores?.[STATUS.AGUARDANDO_CONFIRMACAO] ?? 0) +
    (kpis?.contadores?.[STATUS.EM_SEPARACAO]           ?? 0) +
    (kpis?.contadores?.[STATUS.SEPARADO]               ?? 0) +
    (kpis?.contadores?.[STATUS.PRONTO_RETIRADA]        ?? 0) +
    (kpis?.contadores?.[STATUS.SAIU_ENTREGA]           ?? 0)

  const badges = {
    pedidosAtivos:  pedidosAtivos    || null,
    atendimentos:   null,
    consultas:      consultasPendentes || null,
    alertasDemanda: alertasDemanda   || null,
  }

  return (
    <>
      {aberta && <div className="sidebar-overlay" onClick={onFechar} />}
      <aside className={`sidebar ${aberta ? 'sidebar--aberta' : ''}`}>

        <div className="sidebar-logo">
          <div className="sidebar-logo-marca">🏪</div>
          <div className="sidebar-logo-info">
            <span className="sidebar-logo-nome">{APP_NAME}</span>
            <span className="sidebar-logo-subtitulo">Central Operacional</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-nav-grupo">Operações</p>
          {NAV_OPERACOES.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              badge={item.badgeKey ? badges[item.badgeKey] : null}
              badgeAlerta={item.badgeAlerta}
              onClick={onFechar}
            />
          ))}

          <p className="sidebar-nav-grupo">Catálogo & IA</p>
          {NAV_CATALOGO.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              badge={item.badgeKey ? badges[item.badgeKey] : null}
              badgeAlerta={item.badgeAlerta}
              onClick={onFechar}
            />
          ))}

          <p className="sidebar-nav-grupo">Cadastros</p>
          {NAV_CADASTROS.map((item) => (
            <NavItem key={item.to} item={item} onClick={onFechar} />
          ))}

          <p className="sidebar-nav-grupo">Sistema</p>
          {NAV_SISTEMA.map((item) => (
            <NavItem key={item.to} item={item} onClick={onFechar} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-operador">
            <div className="sidebar-footer-avatar">OP</div>
            <div className="sidebar-footer-info">
              <span className="sidebar-footer-nome">Operador 01</span>
              <span className="sidebar-footer-cargo">Sede Logística</span>
            </div>
            <div className="sidebar-footer-status" title="Conectado" />
          </div>
        </div>

      </aside>
    </>
  )
}

function NavItem({ item, badge, badgeAlerta, onClick }) {
  return (
    <NavLink
      to={item.to}
      end={item.exact}
      className={({ isActive }) =>
        `sidebar-nav-item ${isActive ? 'sidebar-nav-item--ativo' : ''}`
      }
      onClick={onClick}
    >
      <span className="sidebar-nav-icone">{item.icone}</span>
      <span className="sidebar-nav-label">{item.label}</span>
      {badge != null && badge > 0 && (
        <span className={`sidebar-badge ${badgeAlerta ? 'sidebar-badge--alerta' : ''}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}
