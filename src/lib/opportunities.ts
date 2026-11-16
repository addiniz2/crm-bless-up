import { ruleErrorFrom } from './pipeline'
import { supabase } from './supabase'

export const OPPORTUNITY_STAGES = ['PROPOSAL_SENT', 'FOLLOW_UP', 'WON', 'LOST'] as const
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number]
export const CURRENCIES = ['EUR', 'BRL'] as const
export type Currency = (typeof CURRENCIES)[number]
export const ACCOUNT_KINDS = ['ORGANIZATION', 'PERSON'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export type OpportunityCard = {
  id: string
  stage: OpportunityStage
  monthly_value: number | null
  currency: Currency
  expected_close_date: string | null
  owner_id: string | null
  closed_at: string | null
  created_at: string
  account_id: string
  account_name: string
  country: string
  is_customer: boolean
  contact_name: string | null
  source_lead_id: string | null
  source_lead_name: string | null
  loss_reason_name: string | null
  is_late: boolean
}

export type CurrencyTotal = { currency: Currency; count: number; value: number }
export type OpportunityIndicators = { open: CurrencyTotal[]; won_this_month: CurrencyTotal[] }

export type ConvertError = 'LEAD_NOT_CONVERTIBLE' | 'LEAD_INCOMPLETE' | 'INVALID_CURRENCY' | 'LEAD_NOT_FOUND' | 'UNKNOWN'
export type OpportunityError = 'LOSS_REASON_REQUIRED' | 'OPPORTUNITY_CLOSED' | 'OPPORTUNITY_NOT_FOUND' | 'UNKNOWN'

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  return supabase
}

export async function listOpportunities(): Promise<OpportunityCard[]> {
  const { data, error } = await client().from('opportunity_board').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as OpportunityCard[]
}

export async function getOpportunityIndicators(): Promise<OpportunityIndicators> {
  const { data, error } = await client().rpc('opportunity_indicators')
  if (error) throw error
  return data as OpportunityIndicators
}

// Conversão tudo ou nada, feita pela função do banco.
export async function convertLead(input: {
  leadId: string
  accountName: string
  accountKind: AccountKind
  monthlyValue: string
  currency: Currency
  expectedCloseDate: string
}): Promise<{ opportunityId?: string; error?: ConvertError }> {
  const { data, error } = await client().rpc('convert_lead', {
    p_lead_id: input.leadId,
    p_account_name: input.accountName,
    p_account_kind: input.accountKind,
    p_monthly_value: input.monthlyValue === '' ? null : Number(input.monthlyValue),
    p_currency: input.currency,
    p_expected_close_date: input.expectedCloseDate || null,
  })
  if (error) {
    return { error: ruleErrorFrom<ConvertError>(error, ['LEAD_NOT_CONVERTIBLE', 'LEAD_INCOMPLETE', 'INVALID_CURRENCY', 'LEAD_NOT_FOUND'], 'UNKNOWN') }
  }
  return { opportunityId: (data as { opportunity_id: string }).opportunity_id }
}

export async function changeOpportunityStage(id: string, stage: OpportunityStage, reasonId?: string): Promise<OpportunityError | null> {
  const { error } = await client().rpc('change_opportunity_stage', {
    p_opportunity_id: id,
    p_stage: stage,
    p_reason_id: reasonId ?? null,
  })
  return error ? ruleErrorFrom<OpportunityError>(error, ['LOSS_REASON_REQUIRED', 'OPPORTUNITY_CLOSED', 'OPPORTUNITY_NOT_FOUND'], 'UNKNOWN') : null
}

export function formatMoney(value: number | null, currency: Currency, locale: string): string {
  if (value === null) return '—'
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
}
