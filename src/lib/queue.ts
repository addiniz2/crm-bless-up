import { cached } from './cache'
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
  is_important: boolean
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
  whatsapp_status: 'UNVERIFIED' | 'VALID' | 'INVALID'
  pending_delivery_confirmation: boolean
}

export type AppUser = { id: string; full_name: string }

// 'ALL' = todos, 'NONE' = sem responsável, ou o id da usuária.
export type OwnerFilter = 'ALL' | 'NONE' | (string & {})
export type QueueFilters = { owner: OwnerFilter; country: Country | ''; leadTypeId: string; importantOnly: boolean }

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

export function listUsers(): Promise<AppUser[]> {
  return cached('app_user', loadUsers)
}

async function loadUsers(): Promise<AppUser[]> {
  const { data, error } = await client().from('app_user').select('id, full_name').eq('active', true).order('full_name')
  if (error) throw error
  return data
}

// Situação e responsável mudam por update direto; o banco registra cada mudança no histórico.
export async function setQueueStatus(leadId: string, status: QueueStatus) {
  const { error } = await client().from('lead').update({ queue_status: status }).eq('id', leadId)
  if (error) throw error
}

export async function setLeadImportant(leadId: string, value: boolean) {
  const { error } = await client().from('lead').update({ is_important: value }).eq('id', leadId)
  if (error) throw error
}

export async function setOwner(leadId: string, ownerId: string | null) {
  const { error } = await client().from('lead').update({ owner_id: ownerId }).eq('id', leadId)
  if (error) throw error
}

// Filtragem de apresentação sobre o que o banco já calculou (atrasado, sem próximo passo).
export function applyFilters<T extends Pick<QueueRow, 'owner_id' | 'country' | 'lead_type_id' | 'is_important'>>(rows: T[], filters: QueueFilters): T[] {
  return rows.filter((row) => {
    if (filters.importantOnly && !row.is_important) return false
    if (filters.owner === 'NONE' && row.owner_id !== null) return false
    if (filters.owner !== 'ALL' && filters.owner !== 'NONE' && row.owner_id !== filters.owner) return false
    if (filters.country && row.country !== filters.country) return false
    if (filters.leadTypeId && row.lead_type_id !== filters.leadTypeId) return false
    return true
  })
}

// Ordem da fila (16/11/2026): sem responsável primeiro; dentro de cada grupo, por data de entrada
// (padrão do mais antigo para o mais recente), e a usuária pode trocar.
export const QUEUE_SORTS = ['OLDEST', 'NEWEST', 'NEXT_STEP'] as const
export type QueueSort = (typeof QUEUE_SORTS)[number]

function time(value: string | null): number {
  return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY
}

export function sortRows<T extends Pick<QueueRow, 'created_at' | 'next_step_at'>>(rows: T[], sort: QueueSort): T[] {
  return [...rows].sort((a, b) => {
    if (sort === 'NEWEST') return time(b.created_at) - time(a.created_at)
    if (sort === 'NEXT_STEP') return time(a.next_step_at) - time(b.next_step_at) || time(a.created_at) - time(b.created_at)
    return time(a.created_at) - time(b.created_at)
  })
}

// Sem responsável sempre primeiro (para as duas verem); dentro de cada grupo, a ordem escolhida.
export function rowsForTab(rows: QueueRow[], tab: QueueTab, sort: QueueSort = 'OLDEST'): QueueRow[] {
  const inTab = tab === 'OVERDUE' ? rows.filter((row) => row.is_overdue) : rows.filter((row) => row.queue_status === tab)
  const sorted = sortRows(inTab, sort)
  return [...sorted.filter((row) => row.owner_id === null), ...sorted.filter((row) => row.owner_id !== null)]
}

// Escolha de ordem lembrada neste navegador (sem armazenamento disponível, volta ao padrão)
const SORT_KEY = 'crm-queue-sort'
export function savedSort(): QueueSort {
  try {
    const value = window.localStorage.getItem(SORT_KEY)
    return (QUEUE_SORTS as readonly string[]).includes(value ?? '') ? (value as QueueSort) : 'OLDEST'
  } catch {
    return 'OLDEST'
  }
}
export function saveSort(sort: QueueSort): void {
  try {
    window.localStorage.setItem(SORT_KEY, sort)
  } catch {
    // ignora: a escolha vale só nesta visita
  }
}

export function countByTab(rows: QueueRow[]): Record<QueueTab, number> {
  const counts = Object.fromEntries(QUEUE_TABS.map((tab) => [tab, 0])) as Record<QueueTab, number>
  for (const row of rows) {
    counts[row.queue_status] += 1
    if (row.is_overdue) counts.OVERDUE += 1
  }
  return counts
}

export const NO_FILTERS: QueueFilters = { owner: 'ALL', country: '', leadTypeId: '', importantOnly: false }
