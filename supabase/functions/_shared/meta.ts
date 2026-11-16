// Funções puras usadas pela Edge Function do webhook da Meta.
// Sem dependências do Deno, para poderem ser testadas com o Vitest.

export type LeadgenChange = {
  leadgen_id: string
  page_id?: string
  form_id?: string
  adgroup_id?: string
  ad_id?: string
  created_time?: number
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Comparação em tempo constante para não vazar informação pela duração.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Cabeçalho X-Hub-Signature-256: "sha256=" + HMAC-SHA256 do corpo bruto com o App Secret.
export async function isValidSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith('sha256=') || !appSecret) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return safeEqual(`sha256=${toHex(signature)}`, header)
}

// Verificação da assinatura do webhook (GET): devolve o challenge só se o token conferir.
export function verificationChallenge(params: URLSearchParams, verifyToken: string): string | null {
  if (!verifyToken) return null
  if (params.get('hub.mode') !== 'subscribe') return null
  if (params.get('hub.verify_token') !== verifyToken) return null
  return params.get('hub.challenge')
}

// Extrai as mudanças "leadgen" do corpo do webhook (object: "page").
export function leadgenChanges(body: unknown): LeadgenChange[] {
  const payload = body as { object?: string; entry?: { changes?: { field?: string; value?: LeadgenChange }[] }[] }
  if (payload?.object !== 'page' || !Array.isArray(payload.entry)) return []
  return payload.entry
    .flatMap((entry) => entry.changes ?? [])
    .filter((change) => change.field === 'leadgen' && change.value?.leadgen_id)
    .map((change) => change.value as LeadgenChange)
}

// Campos documentados do lead na Graph API; os opcionais vão numa segunda leitura que pode falhar sem perder o lead.
export const LEAD_FIELDS = 'id,created_time,ad_id,form_id,field_data,custom_disclaimer_responses'
export const OPTIONAL_LEAD_FIELDS = ['ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', 'platform', 'is_organic']
