// Regras de borda do formulário público do site (BU-19). As regras de negócio ficam no banco
// (site_form_start / site_form_finish); aqui só origem permitida, anti-robô e saneamento do rastreio.

const ALLOWED_ORIGINS = [
  /^https:\/\/forms\.blessupmkt\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?crm-bless-up\.pages\.dev$/,
  /^http:\/\/localhost:\d+$/,
]

export function isAllowedOrigin(origin: string | null): boolean {
  return Boolean(origin && ALLOWED_ORIGINS.some((rule) => rule.test(origin)))
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin! : 'https://forms.blessupmkt.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

// Códigos que o banco devolve e a página sabe traduzir. Qualquer outro vira UNKNOWN (sem vazar detalhe).
export const KNOWN_ERRORS = [
  'FORM_NOT_FOUND',
  'NAME_INVALID',
  'INSTAGRAM_INVALID',
  'WHATSAPP_INVALID',
  'ANSWER_MISSING',
  'ANSWER_INVALID',
  'SUBMISSION_NOT_FOUND',
  'SUBMISSION_ALREADY_COMPLETED',
  'SUBMISSION_EXPIRED',
] as const

export function errorCode(message: string | undefined): string {
  const found = KNOWN_ERRORS.find((code) => message?.includes(code))
  return found ?? 'UNKNOWN'
}

const TRACKING_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'fbc',
  'fbp',
  'gclid',
  'page_url',
] as const

// Só os campos conhecidos, como texto curto; IP e navegador vêm do servidor, nunca do corpo.
export function sanitizeTracking(input: unknown, clientIp: string | null, userAgent: string | null): Record<string, unknown> {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const tracking: Record<string, unknown> = {}
  for (const key of TRACKING_KEYS) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) tracking[key] = value.trim().slice(0, 1000)
  }
  tracking.cookie_consent = source.cookie_consent === true
  tracking.events = sanitizeEvents(source.events)
  if (clientIp) tracking.client_ip = clientIp
  if (userAgent) tracking.user_agent = userAgent.slice(0, 500)
  return tracking
}

// IDs de evento gerados no navegador (os mesmos do Pixel, para a API de Conversões não duplicar)
export function sanitizeEvents(input: unknown): Record<string, string> {
  const events: Record<string, string> = {}
  if (!input || typeof input !== 'object') return events
  for (const [name, id] of Object.entries(input as Record<string, unknown>)) {
    if (/^[A-Za-z]{3,40}$/.test(name) && typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id)) events[name] = id
  }
  return events
}

export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('cf-connecting-ip') || null
}

// Campo escondido: pessoa não vê nem preenche; robô costuma preencher.
export function isBot(body: Record<string, unknown>): boolean {
  return typeof body.website === 'string' && body.website.trim() !== ''
}
