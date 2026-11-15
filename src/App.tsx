import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RecoveryRedirect } from './auth/RecoveryRedirect'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
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
            <Route index element={<PlaceholderPage page="queue" />} />
            <Route path="leads" element={<PlaceholderPage page="leads" />} />
            <Route path="oportunidades" element={<PlaceholderPage page="opportunities" />} />
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
