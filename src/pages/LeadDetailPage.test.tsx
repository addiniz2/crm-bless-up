import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeadDetail } from '../lib/leadDetail'
import { LeadDetailPage } from './LeadDetailPage'

const api = vi.hoisted(() => ({
  getLead: vi.fn(),
  getTimeline: vi.fn(),
  listMetaEvents: vi.fn().mockResolvedValue([]),
  listTemplates: vi.fn(),
  registerActivity: vi.fn(),
  registerConversationStarted: vi.fn(),
  confirmConversation: vi.fn(),
  listUsers: vi.fn(),
  listReasons: vi.fn(),
  changeLeadStage: vi.fn(),
}))

vi.mock('../lib/leadDetail', async (original) => ({ ...(await original<typeof import('../lib/leadDetail')>()), ...api }))
vi.mock('../lib/queue', async (original) => ({ ...(await original<typeof import('../lib/queue')>()), listUsers: api.listUsers }))
vi.mock('../lib/pipeline', async (original) => ({
  ...(await original<typeof import('../lib/pipeline')>()),
  listReasons: api.listReasons,
  changeLeadStage: api.changeLeadStage,
}))

const lead = {
  id: 'l1',
  full_name: 'Ana Martínez',
  company_name: 'Café Ana',
  whatsapp: '34600111222',
  whatsapp_status: 'UNVERIFIED',
  email: null,
  country: 'ES',
  instagram_handle: 'clinica.exemplo',
  is_mql: true,
  ad_budget_fit: true,
  ad_budget_range: null,
  site_form_id: null,
  capture_channel: 'WHATSAPP',
  revenue_band: 'FROM_4K_TO_7K',
  main_goal: null,
  how_found: null,
  notes: null,
  stage: 'CONTACTED',
  queue_status: 'IN_PROGRESS',
  owner_id: 'u1',
  next_step: null,
  next_step_at: null,
  last_contact_at: null,
  created_at: '2026-11-15T10:00:00Z',
  created_by: 'u1',
  needs_completion: false,
  converted_opportunity_id: null,
  form_answers: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_term: null,
  utm_content: null,
  fbclid: null,
  gclid: null,
  ctwa_clid: null,
  page_url: null,
  meta_lead_id: null,
  meta_form_name: null,
  meta_campaign_name: null,
  meta_ad_name: null,
  meta_platform: null,
  meta_is_organic: null,
  lead_type: { name: 'Site e landing page' },
  lead_source: null,
  disqualification_reason: null,
} satisfies LeadDetail

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/leads/l1']}>
      <Routes>
        <Route path="/leads/:id" element={<LeadDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ficha do lead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listMetaEvents.mockResolvedValue([])
    api.getLead.mockResolvedValue(lead)
    api.getTimeline.mockResolvedValue([
      { type: 'change', id: 'h1', at: '2026-11-15T11:00:00Z', by: 'u1', field: 'stage', from: 'NEW', to: 'CONTACTED' },
    ])
    api.listUsers.mockResolvedValue([{ id: 'u1', full_name: 'Atila' }])
    api.listTemplates.mockResolvedValue([])
    api.listReasons.mockResolvedValue([])
  })

  it('mostra dados com rótulos traduzidos e a linha do tempo', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Ana Martínez' })).toBeInTheDocument()
    expect(screen.getByText('+34 600 111 222')).toBeInTheDocument()
    expect(screen.getByText('De 4.000 € a 7.000 €')).toBeInTheDocument()
    expect(screen.getByText('Etapa: Novo → Abordado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '@clinica.exemplo' })).toHaveAttribute('href', 'https://instagram.com/clinica.exemplo')
    expect(screen.getByText('Lead qualificado (MQL)').nextSibling).toHaveTextContent('Sim')
  })

  it('lead do formulário do site: sem [object Object]; mostra o formulário e só respostas extras', async () => {
    api.getLead.mockResolvedValue({
      ...lead,
      site_form_id: 'f1',
      form_answers: { form: 'espanha', events: { LeadMQL: 'ev-1' }, answers: { full_name: 'Ana', segmento: 'Odonto' } },
    })
    renderPage()
    expect(await screen.findByText('Formulário do site')).toBeInTheDocument()
    expect(screen.getByText('espanha')).toBeInTheDocument()
    expect(screen.getByText('Odonto')).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
  })

  it('registrar contato envia ao banco e mostra a regra que ele devolve', async () => {
    api.registerActivity.mockResolvedValue('NEXT_STEP_DATE_REQUIRED')
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Registrar contato' }))
    await user.type(screen.getByLabelText('O que aconteceu'), 'Liguei, pediu proposta')
    await user.type(screen.getByLabelText(/Próximo passo/), 'Enviar proposta')
    await user.click(screen.getByRole('button', { name: 'Salvar contato' }))

    expect(api.registerActivity).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'l1', kind: 'CALL', body: 'Liguei, pediu proposta', nextStep: 'Enviar proposta' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe a data e a hora do próximo passo.')
  })

  it('Iniciar conversa abre o link oficial, registra a tentativa e pede a confirmação do envio', async () => {
    api.registerConversationStarted.mockResolvedValue({ id: 'a9' })
    api.confirmConversation.mockResolvedValue(null)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Iniciar conversa' }))
    const link = await screen.findByRole('link', { name: 'Abrir WhatsApp' })
    expect(link).toHaveAttribute('href', 'https://wa.me/34600111222')
    await user.click(link)
    expect(api.registerConversationStarted).toHaveBeenCalledWith('l1', '')

    await user.click(await screen.findByRole('button', { name: 'Não foi enviada' }))
    await user.selectOptions(screen.getByLabelText('Por quê?'), 'NO_WHATSAPP')
    await user.click(screen.getByRole('button', { name: 'Não foi enviada' }))
    expect(api.confirmConversation).toHaveBeenCalledWith('a9', false, 'NO_WHATSAPP')
  })

  it('WhatsApp marcado como inválido bloqueia o Iniciar conversa e avisa', async () => {
    api.getLead.mockResolvedValue({ ...lead, whatsapp_status: 'INVALID' })
    renderPage()
    expect(await screen.findByRole('button', { name: 'Iniciar conversa' })).toBeDisabled()
    expect(screen.getByText(/Corrija o número para iniciar conversa/)).toBeInTheDocument()
  })

  it('desqualificar sem motivos cadastrados avisa', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Desqualificar' }))
    expect(await screen.findByText('Nenhum motivo de desqualificação cadastrado ainda.')).toBeInTheDocument()
  })
})
