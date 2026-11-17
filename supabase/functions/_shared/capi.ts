// Montagem dos eventos da API de Conversões da Meta (BU-17).
// Regras da Meta: dados pessoais normalizados e criptografados com SHA-256; IP, navegador, fbp e fbc sem
// criptografia; event_time em segundos (UTC); event_id igual ao do Pixel para não contar em dobro.

export type ClaimedEvent = {
  id: string
  event_name: string
  event_id: string
  event_time: string
  action_source: string
  lead_id: string
  full_name: string | null
  whatsapp: string | null
  email: string | null
  country: string | null
  fbp: string | null
  fbc: string | null
  client_ip: string | null
  user_agent: string | null
  page_url: string | null
  pixel_id: string | null
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// Nome: minúsculas, sem pontuação; primeiro e último termo
export function splitName(fullName: string | null): { fn: string | null; ln: string | null } {
  const parts = (fullName ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  return { fn: parts[0] ?? null, ln: parts.length > 1 ? parts[parts.length - 1] : null }
}

export async function buildServerEvent(event: ClaimedEvent): Promise<Record<string, unknown>> {
  const { fn, ln } = splitName(event.full_name)
  const userData: Record<string, unknown> = { external_id: [await sha256(event.lead_id)] }
  if (event.whatsapp) userData.ph = [await sha256(event.whatsapp.replace(/\D/g, ''))]
  if (event.email) userData.em = [await sha256(event.email.trim().toLowerCase())]
  if (fn) userData.fn = [await sha256(fn)]
  if (ln) userData.ln = [await sha256(ln)]
  if (event.country) userData.country = [await sha256(event.country.toLowerCase())]
  if (event.client_ip) userData.client_ip_address = event.client_ip
  if (event.user_agent) userData.client_user_agent = event.user_agent
  if (event.fbp) userData.fbp = event.fbp
  if (event.fbc) userData.fbc = event.fbc

  const serverEvent: Record<string, unknown> = {
    event_name: event.event_name,
    event_time: Math.floor(new Date(event.event_time).getTime() / 1000),
    event_id: event.event_id,
    action_source: event.action_source,
    user_data: userData,
  }
  if (event.action_source === 'website' && event.page_url) serverEvent.event_source_url = event.page_url
  if (event.action_source === 'system_generated') {
    serverEvent.custom_data = { event_source: 'crm', lead_event_source: 'CRM Bless Up' }
  }
  return serverEvent
}

export function isAuthorizedDispatch(header: string | null, secret: string): boolean {
  if (!secret || !header || header.length !== secret.length) return false
  let diff = 0
  for (let i = 0; i < secret.length; i++) diff |= header.charCodeAt(i) ^ secret.charCodeAt(i)
  return diff === 0
}
