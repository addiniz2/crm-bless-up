import { describe, expect, it } from 'vitest'
import { clientIpFrom, corsHeaders, errorCode, isAllowedOrigin, isBot, sanitizeEvents, sanitizeTracking } from './siteForm'

describe('borda do formulário do site', () => {
  it('aceita só as origens da Bless e do CRM', () => {
    expect(isAllowedOrigin('https://forms.blessupmkt.com')).toBe(true)
    expect(isAllowedOrigin('https://teste.crm-bless-up.pages.dev')).toBe(true)
    expect(isAllowedOrigin('https://crm-bless-up.pages.dev')).toBe(true)
    expect(isAllowedOrigin('https://crm-bless-up.pages.dev.evil.com')).toBe(false)
    expect(isAllowedOrigin('https://evil.com')).toBe(false)
    expect(corsHeaders('https://evil.com')['Access-Control-Allow-Origin']).toBe('https://forms.blessupmkt.com')
  })

  it('traduz só erros conhecidos do banco', () => {
    expect(errorCode('WHATSAPP_INVALID')).toBe('WHATSAPP_INVALID')
    expect(errorCode('duplicate key value violates unique constraint')).toBe('UNKNOWN')
  })

  it('guarda só campos de rastreio conhecidos; IP e navegador vêm do servidor', () => {
    const tracking = sanitizeTracking(
      { utm_source: ' ig ', client_ip: '1.1.1.1', is_mql: true, cookie_consent: true, events: { FormView: 'abc12345-1', 'x y': 'bad' } },
      '2.2.2.2',
      'Mozilla',
    )
    expect(tracking).toEqual({
      utm_source: 'ig',
      cookie_consent: true,
      events: { FormView: 'abc12345-1' },
      client_ip: '2.2.2.2',
      user_agent: 'Mozilla',
    })
  })

  it('descarta IDs de evento malformados', () => {
    expect(sanitizeEvents({ LeadMQL: '<script>' })).toEqual({})
  })

  it('pega o primeiro IP encaminhado', () => {
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '3.3.3.3, 10.0.0.1' }))).toBe('3.3.3.3')
  })

  it('campo escondido preenchido indica robô', () => {
    expect(isBot({ website: 'http://spam' })).toBe(true)
    expect(isBot({ website: '' })).toBe(false)
  })
})
