import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AuthState = {
  session: Session | null
  loading: boolean
  // Verdadeiro quando a pessoa chegou pelo link de recuperação e ainda não salvou a nova senha.
  recovering: boolean
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<boolean>
  updatePassword: (password: string) => Promise<boolean>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
