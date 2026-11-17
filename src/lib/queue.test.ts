import { describe, expect, it } from 'vitest'
import { applyFilters, countByTab, rowsForTab, sortRows, type QueueRow } from './queue'

function row(partial: Partial<QueueRow>): QueueRow {
  return {
    id: crypto.randomUUID(),
    full_name: 'Lead',
    company_name: null,
    country: 'ES',
    whatsapp: '34600111222',
    stage: 'NEW',
    queue_status: 'NEW',
    owner_id: null,
    next_step: null,
    next_step_at: null,
    last_contact_at: null,
    lead_type_id: 't1',
    lead_type_name: 'Tipo',
    needs_completion: false,
    created_at: '2026-11-15T10:00:00Z',
    is_overdue: false,
    missing_next_step: true,
    whatsapp_status: 'UNVERIFIED',
    pending_delivery_confirmation: false,
    ...partial,
  }
}

const rows = [
  row({ full_name: 'Ana', owner_id: 'me' }),
  row({ full_name: 'Bia', owner_id: null }),
  row({ full_name: 'Caio', owner_id: 'other', queue_status: 'IN_PROGRESS', is_overdue: true, country: 'BR' }),
  row({ full_name: 'Duda', owner_id: 'me', queue_status: 'AWAITING_REPLY', is_overdue: true, lead_type_id: 't2' }),
]

describe('Minha fila', () => {
  it('conta por situação e soma os atrasados à parte', () => {
    expect(countByTab(rows)).toEqual({ NEW: 2, TO_REPLY: 0, IN_PROGRESS: 1, AWAITING_REPLY: 1, OVERDUE: 2 })
  })

  it('Atrasados reúne leads de qualquer situação', () => {
    expect(rowsForTab(rows, 'OVERDUE').map((r) => r.full_name)).toEqual(['Caio', 'Duda'])
  })

  it('ordena por data de entrada: padrão do mais antigo para o mais recente; pode inverter ou usar o próximo passo', () => {
    const list = [
      row({ full_name: 'Nova', created_at: '2026-11-16T10:00:00Z', next_step_at: '2026-11-17T09:00:00Z' }),
      row({ full_name: 'Antiga', created_at: '2026-11-01T10:00:00Z', next_step_at: null }),
      row({ full_name: 'Meio', created_at: '2026-11-10T10:00:00Z', next_step_at: '2026-11-16T09:00:00Z' }),
    ]
    expect(rowsForTab(list, 'NEW').map((r) => r.full_name)).toEqual(['Antiga', 'Meio', 'Nova'])
    expect(sortRows(list, 'NEWEST').map((r) => r.full_name)).toEqual(['Nova', 'Meio', 'Antiga'])
    expect(sortRows(list, 'NEXT_STEP').map((r) => r.full_name)).toEqual(['Meio', 'Nova', 'Antiga'])
  })

  it('filtra por responsável (todos, sem responsável ou a usuária), país e tipo', () => {
    const names = (filtered: QueueRow[]) => filtered.map((r) => r.full_name)
    expect(names(applyFilters(rows, { owner: 'ALL', country: '', leadTypeId: '' }))).toEqual(['Ana', 'Bia', 'Caio', 'Duda'])
    expect(names(applyFilters(rows, { owner: 'me', country: '', leadTypeId: '' }))).toEqual(['Ana', 'Duda'])
    expect(names(applyFilters(rows, { owner: 'other', country: '', leadTypeId: '' }))).toEqual(['Caio'])
    expect(names(applyFilters(rows, { owner: 'NONE', country: '', leadTypeId: '' }))).toEqual(['Bia'])
    expect(names(applyFilters(rows, { owner: 'ALL', country: 'BR', leadTypeId: '' }))).toEqual(['Caio'])
    expect(names(applyFilters(rows, { owner: 'ALL', country: '', leadTypeId: 't2' }))).toEqual(['Duda'])
  })
})
