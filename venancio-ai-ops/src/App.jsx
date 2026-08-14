import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from '@/contexts/AppContext'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SeparadorAuthProvider } from '@/contexts/SeparadorAuthContext'
import { Layout } from '@/components/layout/Layout'
import { ToastContainer } from '@/components/ui/Toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { PedidosPage } from '@/pages/PedidosPage'
import { FichaSeparacaoPage } from '@/pages/FichaSeparacaoPage'
import { SeparacaoPage } from '@/pages/SeparacaoPage'
import { ClientesPage } from '@/pages/ClientesPage'
import { CatalogPage } from '@/pages/CatalogPage'
import { MarcasCategoriasPage } from '@/pages/MarcasCategoriasPage'
import { ConfigPage } from '@/pages/ConfigPage'
import { OrcamentosPage } from '@/pages/OrcamentosPage'
import { FuncionariosPage } from '@/pages/FuncionariosPage'
import { LogisticaPage } from '@/pages/LogisticaPage'
import { AtendimentoPage } from '@/pages/AtendimentoPage'
import { RelatoriosPage } from '@/pages/RelatoriosPage'
import { ConsultasPage } from '@/pages/ConsultasPage'
import { ProductMemoryPage } from '@/pages/ProductMemoryPage'
import { DemandPage } from '@/pages/DemandPage'
import { SetupPage } from '@/pages/SetupPage'
import { SeparadorLoginPage } from '@/pages/SeparadorLoginPage'
import { SeparadorPainelPage } from '@/pages/SeparadorPainelPage'
import { SeparadorSolicitacaoPage } from '@/pages/SeparadorSolicitacaoPage'
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
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <SeparadorAuthProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                {/* Separador — identidade independente do Operador (ver
                    SeparadorAuthContext.jsx), por isso fora do RequireAuth/Layout
                    do Operador. Cada página abaixo faz o próprio guard de sessão. */}
                <Route path="/separador" element={<SeparadorLoginPage />} />
                <Route path="/separador/painel" element={<SeparadorPainelPage />} />
                <Route path="/separador/solicitacao/:id" element={<SeparadorSolicitacaoPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
                  <Route index              element={<DashboardPage />} />
                  <Route path="pedidos"     element={<PedidosPage />} />
                  <Route path="pedidos/:id/ficha" element={<FichaSeparacaoPage />} />
                  <Route path="separacao"   element={<SeparacaoPage />} />
                  <Route path="logistica"   element={<LogisticaPage />} />
                  <Route path="atendimento" element={<AtendimentoPage />} />
                  <Route path="clientes"    element={<ClientesPage />} />
                  <Route path="orcamentos"  element={<OrcamentosPage />} />
                  <Route path="funcionarios" element={<FuncionariosPage />} />
                  <Route path="catalogo"    element={<CatalogPage />} />
                  <Route path="marcas-categorias" element={<MarcasCategoriasPage />} />
                  <Route path="memoria-ia"  element={<ProductMemoryPage />} />
                  <Route path="demanda"     element={<DemandPage />} />
                  <Route path="relatorios"  element={<RelatoriosPage />} />
                  <Route path="consultas"   element={<ConsultasPage />} />
                  <Route path="configuracoes" element={<ConfigPage />} />
                </Route>
              </Routes>
              <ToastContainer />
            </SeparadorAuthProvider>
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
