import { composeWhatsapp, type PhoneCountry } from './phone'
import { supabase } from './supabase'

// Códigos gravados no banco. Os rótulos ficam em src/locales/pt-BR.json.
// Países mais comuns no cadastro; o banco aceita qualquer código ISO de 2 letras (16/11/2026).
export const COUNTRIES = ['ES', 'BR', 'PT', 'IE', 'GB'] as const
export const MANUAL_CHANNELS = ['WHATSAPP', 'INSTAGRAM_DIRECT', 'MESSENGER', 'PHONE_CALL', 'MANUAL'] as const
export const REVENUE_BANDS = ['UP_TO_4K', 'FROM_4K_TO_7K', 'FROM_7K_TO_10K', 'FROM_10K_TO_15K', 'ABOVE_15K', 'NOT_INFORMED'] as const
export const MAIN_GOALS = ['MORE_CUSTOMERS', 'BRAND', 'ORGANIZE_MARKETING', 'TRAIN_TEAM'] as const

export type Country = (typeof COUNTRIES)[number]

// A faixa de faturamento é mensal e a moeda segue o país do lead.
// Decisão de 16/11/2026: Brasil em BRL; países europeus em EUR (Reino Unido incluído, a Bless cobra em euro).
const EUR_COUNTRIES = new Set(['ES', 'PT', 'IE', 'GB', 'FR', 'IT', 'DE', 'NL', 'BE', 'LU', 'AT', 'CH'])
export function currencyOf(country: string | null): 'BRL' | 'EUR' | null {
  if (country === 'BR') return 'BRL'
  if (country && EUR_COUNTRIES.has(country)) return 'EUR'
  return null
}
export type ListItem = { id: string; name: string }

export type LeadDraft = {
  fullName: string
  phoneCountry: PhoneCountry
  phoneNational: string
  email: string
  country: Country | ''
  companyName: string
  leadTypeId: string
  revenueBand: string
  mainGoal: string
  leadSourceId: string
  captureChannel: string
  howFound: string
  notes: string
  assignToMe: boolean
}

export type Duplicate = { id: string; full_name: string; company_name: string | null; stage: string }

export type SaveError = 'WHATSAPP_INVALID' | 'REQUIRED_MISSING' | 'UNKNOWN'

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  return supabase
}

async function activeList(table: 'lead_type' | 'lead_source'): Promise<ListItem[]> {
  const { data, error } = await client()
    .from(table)
    .select('id, name')
    .eq('active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('name')
  if (error) throw error
  return data
}

export const listLeadTypes = () => activeList('lead_type')
export const listLeadSources = () => activeList('lead_source')

export async function findDuplicates(whatsapp: string, email: string): Promise<Duplicate[]> {
  const { data, error } = await client().rpc('find_lead_duplicates', {
    p_whatsapp: whatsapp || null,
    p_email: email || null,
  })
  if (error) throw error
  return data as Duplicate[]
}

// O banco normaliza e valida; aqui só traduzimos o erro do banco para uma chave de mensagem.
export function saveErrorFrom(error: { code?: string; message?: string }): SaveError {
  const message = error.message ?? ''
  if (message.includes('lead_whatsapp_check') || message.includes('lead_whatsapp_country_length')) return 'WHATSAPP_INVALID'
  if (message.includes('lead_required_fields') || error.code === '23502') return 'REQUIRED_MISSING'
  return 'UNKNOWN'
}

export async function createLead(draft: LeadDraft, userId: string): Promise<{ id?: string; error?: SaveError }> {
  const { data, error } = await client()
    .from('lead')
    .insert({
      full_name: draft.fullName,
      whatsapp: composeWhatsapp(draft.phoneCountry, draft.phoneNational),
      email: draft.email || null,
      country: draft.country || null,
      company_name: draft.companyName || null,
      lead_type_id: draft.leadTypeId || null,
      revenue_band: draft.revenueBand || null,
      main_goal: draft.mainGoal || null,
      lead_source_id: draft.leadSourceId || null,
      capture_channel: draft.captureChannel || 'MANUAL',
      how_found: draft.howFound || null,
      notes: draft.notes || null,
      owner_id: draft.assignToMe ? userId : null,
    })
    .select('id')
    .single()
  if (error) return { error: saveErrorFrom(error) }
  return { id: data.id }
}
