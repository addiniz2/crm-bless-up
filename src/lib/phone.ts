// Máscara do WhatsApp por país (BU-28). Só ajuda a digitar e a ler:
// o banco recebe e guarda apenas dígitos com o código do país, e é ele quem valida.

export const PHONE_COUNTRIES = ['ES', 'BR', 'OTHER'] as const
export type PhoneCountry = (typeof PHONE_COUNTRIES)[number]

export const DIAL_CODE: Record<Exclude<PhoneCountry, 'OTHER'>, string> = { ES: '34', BR: '55' }

const MAX_NATIONAL_DIGITS: Record<PhoneCountry, number> = { ES: 9, BR: 11, OTHER: 15 }

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

// Espanha: 600 111 222 · Brasil: (11) 98888-7777 ou (11) 3333-4444 · Outro: só dígitos, com código do país
export function formatNational(country: PhoneCountry, value: string): string {
  const digits = onlyDigits(value).slice(0, MAX_NATIONAL_DIGITS[country])
  if (country === 'ES') {
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join(' ')
  }
  if (country === 'BR') {
    if (digits.length <= 2) return digits.length ? `(${digits}` : ''
    const area = digits.slice(0, 2)
    const rest = digits.slice(2)
    const split = rest.length > 8 ? 5 : 4
    const first = rest.slice(0, split)
    const second = rest.slice(split)
    return `(${area}) ${first}${second ? `-${second}` : ''}`
  }
  return digits
}

// País do lead -> máscara do telefone (países sem máscara própria usam "Outro": dígitos com código do país).
export function phoneCountryOf(country: string): PhoneCountry {
  return country === 'ES' || country === 'BR' ? country : 'OTHER'
}

// Junta código do país e número nacional no formato que o banco grava.
export function composeWhatsapp(country: PhoneCountry, national: string): string {
  const digits = onlyDigits(national)
  if (!digits) return ''
  return country === 'OTHER' ? digits : `${DIAL_CODE[country]}${digits.replace(/^0+/, '')}`
}

// Para exibir um número já gravado (ex.: na ficha e nas listas).
export function formatStoredWhatsapp(stored: string | null): string {
  if (!stored) return ''
  for (const country of ['ES', 'BR'] as const) {
    const code = DIAL_CODE[country]
    if (stored.startsWith(code)) return `+${code} ${formatNational(country, stored.slice(code.length))}`
  }
  return `+${stored}`
}
