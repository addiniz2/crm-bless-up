import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/context'
import type { QueueRow } from '../lib/queue'
import { QueuePage } from './QueuePage'

const api = vi.hoisted(() => ({
  listQueue: vi.fn(),
  listUsers: vi.fn(),
  listLeadTypes: vi.fn(),
  registerActivity: vi.fn(),
  listTemplates: vi.fn(),
}))
vi.mock('../lib/queue', async (original) => ({ ...(await original<typeof import('../lib/queue')>()), listQueue: api.listQueue, listUsers: api.listUsers }))
vi.mock('../lib/leads', async (original) => ({ ...(await original<typeof import('../lib/leads')>()), listLeadTypes: api.listLeadTypes }))
vi.mock('../lib/leadDetail', async (original) => ({
  ...(await original<typeof import('../lib/leadDetail')>()),
  registerActivity: api.registerActivity,
  listTemplates: api.listTemplates,
}))

const row: QueueRow = {
  id: 'l1',
  full_name: 'Ana Martínez',
  company_name: 'Café Ana',
  country: 'ES',
  whatsapp: '34600111222',
  stage: 'NEW',
  queue_status: 'NEW',
  owner_id: null,
  next_step: null,
  next_step_at: null,
  last_contact_at: null,
  lead_type_id: 't1',
  lead_type_name: 'Site e landing page',
  needs_completion: false,
  created_at: '2026-11-15T10:00:00Z',
  is_overdue: false,
  missing_next_step: true,
  whatsapp_status: 'UNVERIFIED',
  pending_delivery_confirmation: false,
}

const auth = { session: { user: { id: 'u1' } }, loading: false, recovering: false } as unknown as AuthState

function renderPage() {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <QueuePage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('Minha fila: ações rápidas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listQueue.mockResolvedValue([row, { ...row, id: 'l2', full_name: 'Bruno Lima', whatsapp_status: 'INVALID' }])
    api.listUsers.mockResolvedValue([{ id: 'u1', full_name: 'Atila' }])
    api.listLeadTypes.mockResolvedValue([])
    api.listTemplates.mockResolvedValue([])
    api.registerActivity.mockResolvedValue(null)
  })

  it('registra contato direto da linha, sem abrir a ficha', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Registrar contato com Ana Martínez' }))
    await user.type(screen.getByLabelText('O que aconteceu'), 'Liguei')
    await user.click(screen.getByRole('button', { name: 'Salvar contato' }))
    expect(api.registerActivity).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'l1', kind: 'CALL', body: 'Liguei' }))
    expect(api.listQueue).toHaveBeenCalledTimes(2)
  })

  it('bloqueia Iniciar conversa quando o WhatsApp está marcado como inválido', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: 'Iniciar conversa com Ana Martínez' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Iniciar conversa com Bruno Lima' })).toBeDisabled()
  })
})
