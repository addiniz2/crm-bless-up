// Formulário público do site (BU-19): tipos da configuração e regras de tela.
// Os textos de conteúdo (perguntas, opções) vêm da configuração do formulário no banco;
// os textos da interface (botões, avisos, erros) vêm de src/locales.

export type ChoiceOption = { code: string; label: string }
export type FormField = {
  key: string
  type: 'text' | 'instagram' | 'phone' | 'choice'
  label: string
  description?: string
  required?: boolean
  options?: ChoiceOption[]
}
export type FormStep = { id: string; fields: FormField[]; showIf?: { key: string; equals: string } }
export type FormDefinition = {
  intro?: { title: string; bullets?: string[]; note?: string }
  steps: FormStep[]
  mql?: { key: string; equals: string }
  thanks: { title: string; body: string }
  privacyUrl?: string
}
export type PublicForm = {
  slug: string
  language: string
  currency: 'EUR' | 'BRL'
  defaultCountry: string
  metaPixelId: string | null
  definition: FormDefinition
}
export type Answers = Record<string, string>

// Nomes dos eventos combinados com a Bless em 16/11/2026 (Fase 1; os de agenda ficam para a Fase 2)
export const EVENTS = {
  formView: 'FormView',
  firstInteraction: 'FirstInteraction',
  submit: 'SubmitScheduled',
  mql: 'LeadMQL',
} as const

export function visibleSteps(definition: FormDefinition, answers: Answers): FormStep[] {
  return definition.steps.filter((step) => !step.showIf || answers[step.showIf.key] === step.showIf.equals)
}

// Telefone: código do país escolhido + número; o banco recebe só dígitos
export const DIAL_CODES: { country: string; dial: string }[] = [
  { country: 'ES', dial: '34' },
  { country: 'PT', dial: '351' },
  { country: 'BR', dial: '55' },
  { country: 'IE', dial: '353' },
  { country: 'GB', dial: '44' },
  { country: 'FR', dial: '33' },
  { country: 'IT', dial: '39' },
  { country: 'DE', dial: '49' },
  { country: 'CH', dial: '41' },
  { country: 'NL', dial: '31' },
  { country: 'BE', dial: '32' },
  { country: 'LU', dial: '352' },
  { country: 'AT', dial: '43' },
]

export function dialOf(country: string): string {
  return DIAL_CODES.find((item) => item.country === country)?.dial ?? '34'
}

export function composePhone(dial: string, national: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '')
  return digits ? `${dial}${digits}` : ''
}

export function isContactComplete(step: FormStep, answers: Answers): boolean {
  return step.fields.every((field) => !field.required || (answers[field.key] ?? '').trim() !== '')
}

// Parâmetros de campanha na URL do anúncio
const URL_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'] as const

export type Tracking = Record<string, string | boolean | Record<string, string>>

export function readTracking(href: string, cookies: string, consent: boolean): Tracking {
  const url = new URL(href)
  const tracking: Tracking = { page_url: `${url.origin}${url.pathname}`, cookie_consent: consent }
  for (const key of URL_KEYS) {
    const value = url.searchParams.get(key)
    if (value) tracking[key] = value
  }
  // Cookies da Meta só com o aceite do visitante
  if (consent) {
    const fbp = cookieValue(cookies, '_fbp')
    const fbc = cookieValue(cookies, '_fbc')
    if (fbp) tracking.fbp = fbp
    if (fbc) tracking.fbc = fbc
    else if (typeof tracking.fbclid === 'string') tracking.fbc = `fb.1.${Date.now()}.${tracking.fbclid}`
  }
  return tracking
}

function cookieValue(cookies: string, name: string): string | null {
  const match = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

export function newEventId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

// Escolha de cookies lembrada só neste navegador (pode falhar em modo privado: aí pergunta de novo)
const CONSENT_KEY = 'bless-form-consent'
export function savedConsent(): boolean | null {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY)
    return value === 'yes' ? true : value === 'no' ? false : null
  } catch {
    return null
  }
}
export function saveConsent(value: boolean): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value ? 'yes' : 'no')
  } catch {
    // sem armazenamento: a escolha vale só para esta visita
  }
}

// Endereço do formulário: /f/<slug>
export function slugFromPath(pathname: string): string {
  return pathname.replace(/^\/f\//, '').replace(/\/.*$/, '').toLowerCase()
}
