import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Só a URL do projeto e a chave publicável ficam no navegador.
// A proteção dos dados é feita pela RLS no banco; a chave secreta nunca vem para cá.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Lido antes de o cliente do Supabase limpar o endereço. Os links de recuperação de senha (type=recovery)
// e de convite (type=invite) levam à página de criar senha.
export const openedFromRecoveryLink =
  typeof window !== 'undefined' && /(^|[#&?])type=(recovery|invite)(&|$)/.test(window.location.hash)

// Link de e-mail vencido ou já usado: o Supabase devolve error_code no endereço e não cria sessão.
export const authLinkFailed =
  typeof window !== 'undefined' && /(^|[#&?])error_code=/.test(window.location.hash + window.location.search)

export const isSupabaseConfigured = Boolean(url && publishableKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
