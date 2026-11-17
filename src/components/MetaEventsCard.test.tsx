import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './Toast'
import { MetaEventsCard } from './MetaEventsCard'

const api = vi.hoisted(() => ({ listMetaEvents: vi.fn(), retryMetaEvent: vi.fn() }))
vi.mock('../lib/leadDetail', async (original) => ({ ...(await original<typeof import('../lib/leadDetail')>()), ...api }))

describe('eventos enviados à Meta na ficha', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra situação de cada evento e reenvia o que falhou', async () => {
    api.listMetaEvents.mockResolvedValue([
      { id: 'e1', event_name: 'LeadMQL', event_time: '2026-11-16T22:00:00Z', status: 'SENT', attempts: 1, sent_at: '2026-11-16T22:01:00Z', last_error: null },
      { id: 'e2', event_name: 'FakeLead', event_time: '2026-11-16T23:00:00Z', status: 'FAILED', attempts: 8, sent_at: null, last_error: 'HTTP 400: token inválido' },
    ])
    api.retryMetaEvent.mockResolvedValue('OK')
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <MetaEventsCard leadId="l1" formatDate={(v) => v} />
      </ToastProvider>,
    )
    expect(await screen.findByText('Lead qualificado (MQL)')).toBeInTheDocument()
    expect(screen.getByText('Enviado')).toBeInTheDocument()
    expect(screen.getByText('Falhou')).toBeInTheDocument()
    expect(screen.getByText('HTTP 400: token inválido')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reenviar' }))
    expect(api.retryMetaEvent).toHaveBeenCalledWith('e2')
    expect(await screen.findByText('Evento colocado de novo na fila.')).toBeInTheDocument()
  })
})
