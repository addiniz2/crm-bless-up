import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SearchPage } from './SearchPage'

const api = vi.hoisted(() => ({ searchLeads: vi.fn() }))
vi.mock('../lib/search', () => api)

describe('busca rápida', () => {
  it('busca depois de 2 caracteres e leva à ficha', async () => {
    api.searchLeads.mockResolvedValue([
      { id: 'l1', full_name: 'Lucía Fernández', company_name: 'Clínica Dental', whatsapp: '34600000101', email: null, stage: 'NEW', owner_id: null, converted_opportunity_id: null },
    ])
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/busca']}>
        <Routes>
          <Route path="/busca" element={<SearchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Digite pelo menos 2 letras ou 4 números.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nome, empresa, e-mail ou WhatsApp'), 'lucia')
    const link = await screen.findByRole('link', { name: /Lucía Fernández/ })
    expect(link).toHaveAttribute('href', '/leads/l1')
    expect(link).toHaveTextContent('+34 600 000 101')
    expect(api.searchLeads).toHaveBeenLastCalledWith('lucia')
  })
})
