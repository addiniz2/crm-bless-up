import { supabase } from './supabase'

export type SearchResult = {
  id: string
  full_name: string
  company_name: string | null
  whatsapp: string | null
  email: string | null
  stage: string
  owner_id: string | null
  converted_opportunity_id: string | null
}

// Busca no banco (nome, empresa, e-mail ou dígitos do WhatsApp; sem diferenciar acentos).
export async function searchLeads(term: string): Promise<SearchResult[]> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  if (term.trim().length < 2) return []
  const { data, error } = await supabase.rpc('search_leads', { p_term: term })
  if (error) throw error
  return data as SearchResult[]
}
