import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context'

// Quem chega pelo link de recuperação vai sempre para a página de nova senha,
// mesmo que o Supabase tenha devolvido a pessoa para a página inicial.
export function RecoveryRedirect() {
  const { recovering } = useAuth()
  const { pathname } = useLocation()
  if (recovering && pathname !== '/nova-senha') return <Navigate to="/nova-senha" replace />
  return null
}
