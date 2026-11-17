import { describe, expect, it } from 'vitest'
import { buildServerEvent, isAuthorizedDispatch, sha256, splitName, type ClaimedEvent } from './capi'

const base: ClaimedEvent = {
  id: 'e1',
  event_name: 'LeadMQL',
  event_id: 'ev-123',
  event_time: '2026-11-16T22:00:00Z',
  action_source: 'website',
  lead_id: 'lead-1',
  full_name: 'Ana Maria Lima',
  whatsapp: '351912345678',
  email: null,
  country: 'PT',
  fbp: 'fb.1.1.2',
  fbc: null,
  client_ip: '2.2.2.2',
  user_agent: 'Mozilla',
  page_url: 'https://forms.blessupmkt.com/f/espanha',
  pixel_id: '1636124017934576',
}

describe('API de Conversões: montagem do evento', () => {
  it('SHA-256 em hexadecimal minúsculo', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('nome: primeiro e último termo, minúsculos e sem pontuação', () => {
    expect(splitName('Ana Maria Lima')).toEqual({ fn: 'ana', ln: 'lima' })
    expect(splitName('José')).toEqual({ fn: 'josé', ln: null })
    expect(splitName(null)).toEqual({ fn: null, ln: null })
  })

  it('evento do site: dados pessoais criptografados; IP, navegador e fbp em claro; mesmo event_id', async () => {
    const event = await buildServerEvent(base)
    expect(event).toMatchObject({
      event_name: 'LeadMQL',
      event_id: 'ev-123',
      event_time: 1794866400,
      action_source: 'website',
      event_source_url: 'https://forms.blessupmkt.com/f/espanha',
    })
    const user = event.user_data as Record<string, unknown>
    expect(user.ph).toEqual([await sha256('351912345678')])
    expect(user.country).toEqual([await sha256('pt')])
    expect(user.client_ip_address).toBe('2.2.2.2')
    expect(user.client_user_agent).toBe('Mozilla')
    expect(user.fbp).toBe('fb.1.1.2')
    expect(user.fbc).toBeUndefined()
    expect(JSON.stringify(event)).not.toContain('351912345678')
  })

  it('Fake Lead é evento do site (aparece em Eventos de teste), com a origem CRM nos dados', async () => {
    const event = await buildServerEvent({ ...base, event_name: 'FakeLead' })
    expect(event.action_source).toBe('website')
    expect(event.event_source_url).toBe('https://forms.blessupmkt.com/f/espanha')
    expect(event.custom_data).toEqual({ lead_event_source: 'CRM Bless Up' })
  })

  it('só o cron com o segredo certo dispara o envio', () => {
    expect(isAuthorizedDispatch('segredo-123', 'segredo-123')).toBe(true)
    expect(isAuthorizedDispatch('segredo-124', 'segredo-123')).toBe(false)
    expect(isAuthorizedDispatch(null, 'segredo-123')).toBe(false)
    expect(isAuthorizedDispatch('', '')).toBe(false)
  })
})
