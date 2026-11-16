import type { Currency, CurrencyTotal } from './opportunities'
import { supabase } from './supabase'

export const CUSTOMER_STATUSES = ['ACTIVE', 'PAUSED', 'CANCELLATION_NOTICE', 'CANCELLED'] as const
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]

export type CustomerRow = {
  account_id: string
  name: string
  kind: 'ORGANIZATION' | 'PERSON'
  country: 'ES' | 'BR'
  customer_since: string | null
  source_lead_id: string | null
  profile_id: string
  monthly_fee: number | null
  currency: Currency
  status: CustomerStatus
  start_date: string | null
  renewal_date: string | null
  health_score: number | null
  owner_id: string | null
  contact_name: string | null
  contact_whatsapp: string | null
}

export type CustomerIndicators = { active_customers: number; monthly_revenue: CurrencyTotal[] }

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  return supabase
}

export async function listCustomers(): Promise<CustomerRow[]> {
  const { data, error } = await client().from('customer_list').select('*').order('name')
  if (error) throw error
  return data as CustomerRow[]
}

export async function getCustomerIndicators(): Promise<CustomerIndicators> {
  const { data, error } = await client().rpc('customer_indicators')
  if (error) throw error
  return data as CustomerIndicators
}
