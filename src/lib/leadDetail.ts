import { supabase } from './supabase'
import { ruleErrorFrom } from './pipeline'
import type { Country } from './leads'

export const ACTIVITY_KINDS = ['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export type LeadDetail = {
  id: string
  full_name: string
  company_name: string | null
  whatsapp: string | null
  email: string | null
  country: Country | null
  capture_channel: string
  revenue_band: string | null
  main_goal: string | null
  how_found: string | null
  notes: string | null
  stage: string
  queue_status: string
  owner_id: string | null
  next_step: string | null
  next_step_at: string | null
  last_contact_at: string | null
  created_at: string
  created_by: string | null
  needs_completion: boolean
  form_answers: Record<string, unknown> | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  fbclid: string | null
  gclid: string | null
  ctwa_clid: string | null
  page_url: string | null
  meta_lead_id: string | null
  meta_form_name: string | null
  meta_campaign_name: string | null
  meta_ad_name: string | null
  meta_platform: string | null
  meta_is_organic: boolean | null
  lead_type: { name: string } | null
  lead_source: { name: string } | null
  disqualification_reason: { name: string } | null
}

export type TimelineItem =
  | { type: 'activity'; id: string; at: string; by: string | null; kind: ActivityKind; body: string | null; nextStep: string | null; nextStepAt: string | null }
  | { type: 'change'; id: string; at: string; by: string | null; field: 'stage' | 'queue_status' | 'owner_id'; from: string | null; to: string | null }

export type Template = { id: string; name: string; language: string; body: string }

export type ActivityError =
  | 'ACTIVITY_BODY_REQUIRED'
  | 'NEXT_STEP_DATE_REQUIRED'
  | 'WHATSAPP_REQUIRED'
  | 'LEAD_READ_ONLY'
  | 'UNKNOWN'

const ACTIVITY_ERRORS: ActivityError[] = ['ACTIVITY_BODY_REQUIRED', 'NEXT_STEP_DATE_REQUIRED', 'WHATSAPP_REQUIRED', 'LEAD_READ_ONLY']

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  return supabase
}

export async function getLead(id: string): Promise<LeadDetail | null> {
  const { data, error } = await client()
    .from('lead')
    .select(
      '*, lead_type:lead_type_id (name), lead_source:lead_source_id (name), disqualification_reason:disqualification_reason_id (name)',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data as LeadDetail | null
}

export async function getTimeline(leadId: string): Promise<TimelineItem[]> {
  const [activities, changes] = await Promise.all([
    client()
      .from('activity')
      .select('id, kind, body, occurred_at, created_by, next_step, next_step_at')
      .eq('lead_id', leadId)
      .is('deleted_at', null),
    client().from('stage_history').select('id, field, from_value, to_value, changed_at, changed_by').eq('entity', 'LEAD').eq('entity_id', leadId),
  ])
  if (activities.error) throw activities.error
  if (changes.error) throw changes.error
  const items: TimelineItem[] = [
    ...activities.data.map((a) => ({
      type: 'activity' as const,
      id: a.id,
      at: a.occurred_at,
      by: a.created_by,
      kind: a.kind as ActivityKind,
      body: a.body,
      nextStep: a.next_step,
      nextStepAt: a.next_step_at,
    })),
    ...changes.data.map((c) => ({
      type: 'change' as const,
      id: c.id,
      at: c.changed_at,
      by: c.changed_by,
      field: c.field as 'stage' | 'queue_status' | 'owner_id',
      from: c.from_value,
      to: c.to_value,
    })),
  ]
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

export async function registerActivity(input: {
  leadId: string
  kind: ActivityKind
  body: string
  nextStep: string
  nextStepAt: string
}): Promise<ActivityError | null> {
  const { error } = await client().rpc('register_activity', {
    p_lead_id: input.leadId,
    p_kind: input.kind,
    p_body: input.body,
    p_next_step: input.nextStep || null,
    // O campo da tela vem no fuso local; o banco grava em UTC.
    p_next_step_at: input.nextStepAt ? new Date(input.nextStepAt).toISOString() : null,
  })
  return error ? ruleErrorFrom(error, ACTIVITY_ERRORS, 'UNKNOWN') : null
}

export async function registerConversationStarted(leadId: string, message: string): Promise<ActivityError | null> {
  const { error } = await client().rpc('register_conversation_started', { p_lead_id: leadId, p_message: message || null })
  return error ? ruleErrorFrom(error, ACTIVITY_ERRORS, 'UNKNOWN') : null
}

export async function listTemplates(): Promise<Template[]> {
  const { data, error } = await client()
    .from('message_template')
    .select('id, name, language, body')
    .eq('active', true)
    .is('deleted_at', null)
    .order('name')
  if (error) throw error
  return data
}

// Variáveis aceitas nas mensagens modelo: {nome}, {empresa}, {responsavel}.
export function renderTemplate(body: string, values: { firstName: string; company: string; owner: string }): string {
  return body
    .replaceAll('{nome}', values.firstName)
    .replaceAll('{empresa}', values.company)
    .replaceAll('{responsavel}', values.owner)
}

// Link oficial "clique para conversar" do WhatsApp.
export function whatsappLink(whatsapp: string, message: string): string {
  return message ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` : `https://wa.me/${whatsapp}`
}
