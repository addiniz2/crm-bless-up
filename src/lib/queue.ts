import type { Country } from './leads'
import { supabase } from './supabase'

export const QUEUE_STATUSES = ['NEW', 'TO_REPLY', 'IN_PROGRESS', 'AWAITING_REPLY'] as const
export type QueueStatus = (typeof QUEUE_STATUSES)[number]
export const QUEUE_TABS = [...QUEUE_STATUSES, 'OVERDUE'] as const
export type QueueTab = (typeof QUEUE_TABS)[number]

export type QueueRow = {
  id: string
  full_name: string
  company_name: string | null
  country: Country | null
  whatsapp: string | null
  stage: string
  queue_status: QueueStatus
  owner_id: string | null
  next_step: string | null
  next_step_at: string | null
  last_contact_at: string | null
  lead_type_id: string | null
  lead_type_name: string | null
  needs_completion: boolean
  created_at: string
  is_overdue: boolean
  missing_next_step: boolean
}

export type AppUser = { id: string; full_name: string }

export type OwnerFilter = 'ALL' | 'ME' | 'OTHERS' | 'NONE'
export type QueueFilters = { owner: OwnerFilter; country: Country | ''; leadTypeId: string }

function client() {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')
  return supabase
}

export async function listQueue(): Promise<QueueRow[]> {
  const { data, error } = await client()
    .from('lead_queue')
    .select('*')
    .order('next_step_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as QueueRow[]
}

export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await client().from('app_user').select('id, full_name').eq('active', true).order('full_name')
  if (error) throw error
  return data
}

// Situação e responsável mudam por update direto; o banco registra cada mudança no histórico.
export async function setQueueStatus(leadId: string, status: QueueStatus) {
  const { error } = await client().from('lead').update({ queue_status: status }).eq('id', leadId)
  if (error) throw error
}

export async function setOwner(leadId: string, ownerId: string | null) {
  const { error } = await client().from('lead').update({ owner_id: ownerId }).eq('id', leadId)
  if (error) throw error
}

// Filtragem de apresentação sobre o que o banco já calculou (atrasado, sem próximo passo).
export function applyFilters(rows: QueueRow[], filters: QueueFilters, me: string): QueueRow[] {
  return rows.filter((row) => {
    if (filters.owner === 'ME' && row.owner_id !== me) return false
    if (filters.owner === 'OTHERS' && (row.owner_id === null || row.owner_id === me)) return false
    if (filters.owner === 'NONE' && row.owner_id !== null) return false
    if (filters.country && row.country !== filters.country) return false
    if (filters.leadTypeId && row.lead_type_id !== filters.leadTypeId) return false
    return true
  })
}

export function rowsForTab(rows: QueueRow[], tab: QueueTab): QueueRow[] {
  const inTab = tab === 'OVERDUE' ? rows.filter((row) => row.is_overdue) : rows.filter((row) => row.queue_status === tab)
  // Sem responsável primeiro, para as duas verem.
  return [...inTab].sort((a, b) => Number(a.owner_id !== null) - Number(b.owner_id !== null))
}

export function countByTab(rows: QueueRow[]): Record<QueueTab, number> {
  const counts = Object.fromEntries(QUEUE_TABS.map((tab) => [tab, 0])) as Record<QueueTab, number>
  for (const row of rows) {
    counts[row.queue_status] += 1
    if (row.is_overdue) counts.OVERDUE += 1
  }
  return counts
}
