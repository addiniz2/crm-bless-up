import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/context'
import { saveErrorFrom } from '../lib/leads'
import { NewLeadPage } from './NewLeadPage'

const api = vi.hoisted(() => ({
  listLeadTypes: vi.fn(),
  listLeadSources: vi.fn(),
  findDuplicates: vi.fn(),
  createLead: vi.fn(),
}))

vi.mock('../lib/leads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/leads')>()),
  ...api,
}))

const auth: AuthState = {
  session: { user: { id: 'user-1' } } as AuthState['session'],
  loading: false,
  recovering: false,
  signIn: async () => true,
  signOut: async () => {},
  requestPasswordReset: async () => true,
  updatePassword: async () => true,
}

function renderPage() {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/leads/novo']}>
        <Routes>
          <Route path="/leads/novo" element={<NewLeadPage />} />
          <Route path="/leads" element={<p>lista de leads</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

async function fillContact(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nome'), 'Ana')
  await user.selectOptions(screen.getByLabelText('País'), 'ES')
  await user.type(screen.getByLabelText('WhatsApp'), '600111222')
  expect(screen.getByLabelText('WhatsApp')).toHaveValue('600 111 222')
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
}

describe('cadastro de lead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listLeadTypes.mockResolvedValue([{ id: 'type-1', name: 'Gestão de tráfego' }])
    api.listLeadSources.mockResolvedValue([{ id: 'src-1', name: 'Indicação' }])
  })

  it('avisa quando já existe lead ativo com o mesmo WhatsApp ou e-mail', async () => {
    api.findDuplicates.mockResolvedValue([{ id: 'l1', full_name: 'Ana Souza', company_name: null, stage: 'CONTACTED' }])
    const user = userEvent.setup()
    renderPage()
    await fillContact(user)

    expect(await screen.findByText('Já existe lead ativo com este WhatsApp ou e-mail')).toBeInTheDocument()
    expect(api.findDuplicates).toHaveBeenCalledWith('34600111222', '')
    expect(screen.getByText(/Ana Souza/)).toHaveTextContent('Abordado')
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'É outra pessoa, continuar' }))
    expect(screen.getByText(/Passo 2 de 3/)).toBeInTheDocument()
  })

  it('percorre os 3 passos e envia o lead com códigos, não rótulos', async () => {
    api.findDuplicates.mockResolvedValue([])
    api.createLead.mockResolvedValue({ id: 'new-lead' })
    const user = userEvent.setup()
    renderPage()
    await fillContact(user)

    await screen.findByText(/Passo 2 de 3/)
    await user.selectOptions(screen.getByLabelText('Tipo de lead'), 'type-1')
    expect(screen.getByRole('option', { name: 'Até 5.000 €' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/Faturamento mensal/), 'FROM_5K_TO_10K')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await user.selectOptions(screen.getByLabelText('Canal de captação'), 'PHONE_CALL')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('lista de leads')).toBeInTheDocument()
    expect(api.createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        country: 'ES',
        phoneCountry: 'ES',
        phoneNational: '600 111 222',
        leadTypeId: 'type-1',
        revenueBand: 'FROM_5K_TO_10K',
        captureChannel: 'PHONE_CALL',
        assignToMe: true,
      }),
      'user-1',
    )
  })

  it('mostra o erro que o banco devolve', async () => {
    api.findDuplicates.mockResolvedValue([])
    api.createLead.mockResolvedValue({ error: 'WHATSAPP_INVALID' })
    const user = userEvent.setup()
    renderPage()
    await fillContact(user)
    await screen.findByText(/Passo 2 de 3/)
    await user.selectOptions(screen.getByLabelText('Tipo de lead'), 'type-1')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('WhatsApp inválido')
  })
})

describe('tradução de erros do banco', () => {
  it('reconhece as regras do banco', () => {
    expect(saveErrorFrom({ message: 'violates check constraint "lead_whatsapp_check"' })).toBe('WHATSAPP_INVALID')
    expect(saveErrorFrom({ message: 'violates check constraint "lead_required_fields"' })).toBe('REQUIRED_MISSING')
    expect(saveErrorFrom({ message: 'qualquer outra coisa' })).toBe('UNKNOWN')
  })
})
