import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FormApp from './FormApp'
import type { PublicForm } from './logic'

const api = vi.hoisted(() => ({
  getForm: vi.fn(),
  startSubmission: vi.fn(),
  finishSubmission: vi.fn(),
}))
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, ...api }
})
const pixel = vi.hoisted(() => ({ loadPixel: vi.fn(), trackEvent: vi.fn() }))
vi.mock('./pixel', () => pixel)

const form: PublicForm = {
  slug: 'espanha',
  language: 'pt-BR',
  currency: 'EUR',
  defaultCountry: 'ES',
  metaPixelId: '1636124017934576',
  definition: {
    intro: { title: 'Clientes prontos pra fechar', bullets: ['Anúncios segmentados'] },
    steps: [
      {
        id: 'contact',
        fields: [
          { key: 'full_name', type: 'text', label: 'Qual é o seu nome?', required: true },
          { key: 'instagram_handle', type: 'instagram', label: 'Qual é o @ da sua empresa?', required: true },
          { key: 'whatsapp', type: 'phone', label: 'Qual é o seu telefone?', required: true },
        ],
      },
      {
        id: 'budget',
        fields: [
          {
            key: 'ad_budget_fit',
            type: 'choice',
            label: 'Esse valor cabe no seu orçamento?',
            required: true,
            options: [
              { code: 'YES', label: 'Sim!' },
              { code: 'NO', label: 'Não!' },
            ],
          },
        ],
      },
      {
        id: 'budget_range',
        showIf: { key: 'ad_budget_fit', equals: 'NO' },
        fields: [
          {
            key: 'ad_budget_range',
            type: 'choice',
            label: 'Quanto investiria?',
            required: true,
            options: [{ code: 'BUDGET_LOW', label: 'Menos de 150 €/mês' }],
          },
        ],
      },
    ],
    mql: { key: 'ad_budget_fit', equals: 'YES' },
    thanks: { title: 'Recebemos seus dados!', body: 'Em breve entramos em contato.' },
  },
}

async function fillContact(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Começar' }))
  await user.type(screen.getByPlaceholderText('Digite sua resposta…'), 'Ana Lima')
  await user.type(screen.getByPlaceholderText('@suaempresa'), '@ana.loja')
  await user.selectOptions(screen.getByLabelText('Código do país'), '351')
  await user.type(screen.getByPlaceholderText('Digite seu telefone…'), '912 345 678')
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
}

describe('formulário do site', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    api.getForm.mockResolvedValue(form)
    api.startSubmission.mockResolvedValue({ submissionId: 'sub-1' })
  })

  it('cria o lead na tela de contato e marca MQL quem responde Sim', async () => {
    api.finishSubmission.mockResolvedValue({ isMql: true })
    const user = userEvent.setup()
    render(<FormApp slug="espanha" />)
    await user.click(await screen.findByRole('button', { name: 'Aceitar' }))
    expect(pixel.loadPixel).toHaveBeenCalledWith('1636124017934576')
    expect(pixel.trackEvent).toHaveBeenCalledWith('FormView', expect.any(String))

    await fillContact(user)
    expect(api.startSubmission).toHaveBeenCalledWith(
      'espanha',
      { full_name: 'Ana Lima', instagram_handle: '@ana.loja', whatsapp: '351912345678' },
      expect.objectContaining({ cookie_consent: true, events: expect.objectContaining({ FirstInteraction: expect.any(String) }) }),
      '',
    )
    expect(pixel.trackEvent).toHaveBeenCalledWith('FirstInteraction', expect.any(String))

    await user.click(await screen.findByRole('button', { name: /Sim!/ }))
    expect(api.finishSubmission).toHaveBeenCalledWith('sub-1', { ad_budget_fit: 'YES' }, expect.objectContaining({ SubmitScheduled: expect.any(String) }))
    expect(await screen.findByRole('heading', { name: 'Recebemos seus dados!' })).toBeInTheDocument()
    expect(pixel.trackEvent).toHaveBeenCalledWith('LeadMQL', expect.any(String))
  })

  it('quem responde Não vê a pergunta de quanto investiria; sem aceite, nenhum Pixel', async () => {
    api.finishSubmission.mockResolvedValue({ isMql: false })
    const user = userEvent.setup()
    render(<FormApp slug="espanha" />)
    await user.click(await screen.findByRole('button', { name: 'Recusar' }))
    await fillContact(user)
    await user.click(await screen.findByRole('button', { name: /Não!/ }))
    expect(await screen.findByText('Quanto investiria?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Menos de 150/ }))
    expect(api.finishSubmission).toHaveBeenCalledWith('sub-1', { ad_budget_fit: 'NO', ad_budget_range: 'BUDGET_LOW' }, expect.any(Object))
    expect(pixel.loadPixel).not.toHaveBeenCalled()
  })

  it('mostra o erro devolvido pelo servidor, traduzido', async () => {
    const { FormApiError } = await import('./api')
    api.startSubmission.mockRejectedValue(new FormApiError('WHATSAPP_INVALID'))
    const user = userEvent.setup()
    render(<FormApp slug="espanha" />)
    await fillContact(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Telefone inválido para o código do país escolhido')
  })

  it('campos vazios não chegam ao servidor', async () => {
    const user = userEvent.setup()
    render(<FormApp slug="espanha" />)
    await user.click(await screen.findByRole('button', { name: 'Começar' }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Preencha todos os campos obrigatórios')
    expect(api.startSubmission).not.toHaveBeenCalled()
  })
})
