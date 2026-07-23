import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from '@/contexts/AppContext'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { ToastContainer } from '@/components/ui/Toast'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { PedidosPage } from '@/pages/PedidosPage'
import { ClientesPage } from '@/pages/ClientesPage'
import { CatalogPage } from '@/pages/CatalogPage'
import { ConfigPage } from '@/pages/ConfigPage'
import { OrcamentosPage } from '@/pages/OrcamentosPage'
import { LogisticaPage } from '@/pages/LogisticaPage'
import { AtendimentoPage } from '@/pages/AtendimentoPage'
import { RelatoriosPage } from '@/pages/RelatoriosPage'
import { ConsultasPage } from '@/pages/ConsultasPage'
import { ProductMemoryPage } from '@/pages/ProductMemoryPage'
import { DemandPage } from '@/pages/DemandPage'
import { SetupPage } from '@/pages/SetupPage'
import { supabaseConfigurado } from '@/supabase/client'

function RequireAuth({ children }) {
  const { session, carregando } = useAuth()
  if (carregando) return <LoadingSpinner mensagem="Carregando sessão..." />
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  if (!supabaseConfigurado) {
    return <SetupPage />
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index              element={<DashboardPage />} />
              <Route path="pedidos"     element={<PedidosPage />} />
              <Route path="logistica"   element={<LogisticaPage />} />
              <Route path="atendimento" element={<AtendimentoPage />} />
              <Route path="clientes"    element={<ClientesPage />} />
              <Route path="orcamentos"  element={<OrcamentosPage />} />
              <Route path="catalogo"    element={<CatalogPage />} />
              <Route path="memoria-ia"  element={<ProductMemoryPage />} />
              <Route path="demanda"     element={<DemandPage />} />
              <Route path="relatorios"  element={<RelatoriosPage />} />
              <Route path="consultas"   element={<ConsultasPage />} />
              <Route path="configuracoes" element={<ConfigPage />} />
            </Route>
          </Routes>
          <ToastContainer />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
