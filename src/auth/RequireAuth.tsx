import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from './context'

export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()

  if (loading) {
    return <p className="p-6 text-muted">{t('app.loading')}</p>
  }
  if (!session) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
