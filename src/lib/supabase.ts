import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Só a URL do projeto e a chave publicável ficam no navegador.
// A proteção dos dados é feita pela RLS no banco; a chave secreta nunca vem para cá.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Lido antes de o cliente do Supabase limpar o endereço: o link de recuperação de senha traz type=recovery.
export const openedFromRecoveryLink =
  typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash)

export const isSupabaseConfigured = Boolean(url && publishableKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
