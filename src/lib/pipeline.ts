import { supabase } from './supabase'
import type { ListItem } from './leads'

// Etapas do funil de lead em ordem (colunas do kanban). Desqualificado e Convertido saem do funil.
export const BOARD_STAGES = ['NEW', 'CONTACTED', 'RECONTACT', 'MEETING_SCHEDULED', 'NO_SHOW'] as const
export type BoardStage = (typeof BOARD_STAGES)[number]

export type Indicators = {
  in_funnel: number
  new_this_week: number
  meetings_scheduled: number
  converted_this_month: number
}

export type StageError =
  | 'DISQUALIFICATION_REASON_REQUIRED'
  | 'LEAD_READ_ONLY'
  | 'USE_CONVERT_LEAD'
  | 'LEAD_NOT_FOUND'
  | 'UNKNOWN'

const KNOWN_ERRORS: StageError[] = ['DISQUALIFICATION_REASON_REQUIRED', 'LEAD_READ_ONLY', 'USE_CONVERT_LEAD', 'LEAD_NOT_FOUND']

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  return supabase
}

// As funções do banco levantam o código da regra como mensagem de erro.
export function ruleErrorFrom<T extends string>(error: { message?: string }, known: T[], fallback: T): T {
  return known.find((code) => error.message?.includes(code)) ?? fallback
}

export async function getIndicators(): Promise<Indicators> {
  const { data, error } = await client().rpc('lead_indicators')
  if (error) throw error
  return data as Indicators
}

export async function changeLeadStage(leadId: string, stage: string, reasonId?: string): Promise<StageError | null> {
  const { error } = await client().rpc('change_lead_stage', {
    p_lead_id: leadId,
    p_stage: stage,
    p_reason_id: reasonId ?? null,
  })
  return error ? ruleErrorFrom(error, KNOWN_ERRORS, 'UNKNOWN') : null
}

export async function listReasons(kind: 'DISQUALIFICATION' | 'LOSS'): Promise<ListItem[]> {
  const { data, error } = await client()
    .from('reason')
    .select('id, name')
    .eq('kind', kind)
    .eq('active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('name')
  if (error) throw error
  return data
}
