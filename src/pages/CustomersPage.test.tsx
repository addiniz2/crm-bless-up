import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomerRow } from '../lib/customers'
import { CustomersPage } from './CustomersPage'

const api = vi.hoisted(() => ({ listCustomers: vi.fn(), getCustomerIndicators: vi.fn(), listUsers: vi.fn() }))
vi.mock('../lib/customers', async (original) => ({ ...(await original<typeof import('../lib/customers')>()), ...api }))
vi.mock('../lib/queue', async (original) => ({ ...(await original<typeof import('../lib/queue')>()), listUsers: api.listUsers }))

const base: CustomerRow = {
  account_id: 'a1',
  name: 'Café Ana',
  kind: 'ORGANIZATION',
  country: 'ES',
  customer_since: '2026-11-15',
  source_lead_id: 'l1',
  profile_id: 'p1',
  monthly_fee: 450,
  currency: 'EUR',
  status: 'ACTIVE',
  start_date: '2026-11-15',
  renewal_date: null,
  health_score: null,
  owner_id: 'u1',
  contact_name: 'Ana',
  contact_whatsapp: null,
}

describe('clientes', () => {
  beforeEach(() => {
    api.listCustomers.mockResolvedValue([base, { ...base, account_id: 'a2', profile_id: 'p2', name: 'Loja Bia', country: 'BR', currency: 'BRL', monthly_fee: 2000, status: 'PAUSED' }])
    api.getCustomerIndicators.mockResolvedValue({
      active_customers: 1,
      monthly_revenue: [{ currency: 'EUR', count: 1, value: 450 }],
    })
    api.listUsers.mockResolvedValue([{ id: 'u1', full_name: 'Atila' }])
  })

  it('mostra mensalidade com a moeda de cada cliente e filtra por situação', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Café Ana')).toBeInTheDocument()
    expect(screen.getByText(/R\$\s?2\.000,00/)).toBeInTheDocument()
    expect(screen.getByText(/€\s?450,00\/mês · 1 cliente$/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Situação'), 'PAUSED')
    expect(screen.queryByText('Café Ana')).not.toBeInTheDocument()
    expect(screen.getByText('Loja Bia')).toBeInTheDocument()
  })
})
