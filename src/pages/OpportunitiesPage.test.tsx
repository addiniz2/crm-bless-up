import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpportunityCard } from '../lib/opportunities'
import { OpportunitiesPage } from './OpportunitiesPage'

const api = vi.hoisted(() => ({
  listOpportunities: vi.fn(),
  getOpportunityIndicators: vi.fn(),
  changeOpportunityStage: vi.fn(),
  listUsers: vi.fn(),
  listReasons: vi.fn(),
}))

vi.mock('../lib/opportunities', async (original) => ({
  ...(await original<typeof import('../lib/opportunities')>()),
  listOpportunities: api.listOpportunities,
  getOpportunityIndicators: api.getOpportunityIndicators,
  changeOpportunityStage: api.changeOpportunityStage,
}))
vi.mock('../lib/queue', async (original) => ({ ...(await original<typeof import('../lib/queue')>()), listUsers: api.listUsers }))
vi.mock('../lib/pipeline', async (original) => ({ ...(await original<typeof import('../lib/pipeline')>()), listReasons: api.listReasons }))

const card: OpportunityCard = {
  id: 'o1',
  stage: 'PROPOSAL_SENT',
  monthly_value: 450,
  is_important: false,
  currency: 'EUR',
  expected_close_date: null,
  owner_id: 'u1',
  closed_at: null,
  created_at: '2026-11-15T10:00:00Z',
  account_id: 'a1',
  account_name: 'Café Ana',
  country: 'ES',
  is_customer: false,
  contact_name: 'Ana Martínez',
  source_lead_id: 'l1',
  source_lead_name: 'Ana Martínez',
  loss_reason_name: null,
  is_late: false,
}

describe('oportunidades', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listOpportunities.mockResolvedValue([card])
    api.getOpportunityIndicators.mockResolvedValue({
      open: [
        { currency: 'BRL', count: 2, value: 3000 },
        { currency: 'EUR', count: 1, value: 450 },
      ],
      won_this_month: [],
    })
    api.listUsers.mockResolvedValue([{ id: 'u1', full_name: 'Atila' }])
    api.listReasons.mockResolvedValue([{ id: 'r1', name: 'Preço' }])
    api.changeOpportunityStage.mockResolvedValue(null)
  })

  it('mostra os totais em aberto separados por moeda', async () => {
    render(
      <MemoryRouter>
        <OpportunitiesPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/2 · R\$\s?3\.000,00\/mês/)).toBeInTheDocument()
    expect(screen.getByText(/1 · €\s?450,00\/mês/)).toBeInTheDocument()
  })

  it('Perdido pede o motivo antes de mudar a etapa', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <OpportunitiesPage />
      </MemoryRouter>,
    )
    await user.selectOptions((await screen.findAllByLabelText('Etapa de Café Ana'))[0], 'LOST')
    expect(api.changeOpportunityStage).not.toHaveBeenCalled()
    await user.selectOptions(await screen.findByLabelText('Motivo da perda'), 'r1')
    await user.click(screen.getByRole('button', { name: 'Marcar como perdida' }))
    expect(api.changeOpportunityStage).toHaveBeenCalledWith('o1', 'LOST', 'r1')
  })
})
