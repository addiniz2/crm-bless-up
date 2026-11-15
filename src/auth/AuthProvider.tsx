import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext, type AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const value: AuthState = {
    session,
    loading,
    async signIn(email, password) {
      if (!supabase) return false
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return !error
    },
    async signOut() {
      await supabase?.auth.signOut()
    },
    async requestPasswordReset(email) {
      if (!supabase) return false
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/nova-senha`,
      })
      return !error
    },
    async updatePassword(password) {
      if (!supabase) return false
      const { error } = await supabase.auth.updateUser({ password })
      return !error
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
