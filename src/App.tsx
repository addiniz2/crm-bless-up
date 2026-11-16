import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RecoveryRedirect } from './auth/RecoveryRedirect'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { LeadDetailPage } from './pages/LeadDetailPage'
import { LeadsPage } from './pages/LeadsPage'
import { LoginPage } from './pages/LoginPage'
import { NewLeadPage } from './pages/NewLeadPage'
import { OpportunitiesPage } from './pages/OpportunitiesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { QueuePage } from './pages/QueuePage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

export function AppRoutes() {
  return (
    <>
      <RecoveryRedirect />
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/nova-senha" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<QueuePage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="leads/novo" element={<NewLeadPage />} />
            <Route path="leads/:id" element={<LeadDetailPage />} />
            <Route path="oportunidades" element={<OpportunitiesPage />} />
            <Route path="clientes" element={<PlaceholderPage page="customers" />} />
            <Route path="configuracoes" element={<PlaceholderPage page="settings" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
