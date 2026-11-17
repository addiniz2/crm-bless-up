import { describe, expect, it } from 'vitest'
import { composePhone, dialOf, readTracking, slugFromPath, visibleSteps, type FormDefinition } from './logic'

const definition: FormDefinition = {
  steps: [
    { id: 'contact', fields: [] },
    { id: 'budget', fields: [] },
    { id: 'budget_range', showIf: { key: 'ad_budget_fit', equals: 'NO' }, fields: [] },
  ],
  thanks: { title: '', body: '' },
}

describe('formulário do site: regras de tela', () => {
  it('a pergunta de quanto investiria só aparece para quem respondeu Não', () => {
    expect(visibleSteps(definition, {}).map((s) => s.id)).toEqual(['contact', 'budget'])
    expect(visibleSteps(definition, { ad_budget_fit: 'NO' }).map((s) => s.id)).toEqual(['contact', 'budget', 'budget_range'])
  })

  it('telefone: código do país + dígitos, sem zero à esquerda', () => {
    expect(composePhone('351', '912 345 678')).toBe('351912345678')
    expect(composePhone('55', '(011) 98765-4321')).toBe('5511987654321')
    expect(composePhone('34', '')).toBe('')
    expect(dialOf('BR')).toBe('55')
  })

  it('rastreio: UTMs sempre; cookies da Meta só com aceite', () => {
    const href = 'https://forms.blessupmkt.com/f/espanha?utm_source=ig&utm_campaign=123&fbclid=ABC'
    const without = readTracking(href, '_fbp=fb.1.2.3', false)
    expect(without).toMatchObject({ utm_source: 'ig', utm_campaign: '123', fbclid: 'ABC', cookie_consent: false })
    expect(without.fbp).toBeUndefined()
    expect(without.page_url).toBe('https://forms.blessupmkt.com/f/espanha')
    const withConsent = readTracking(href, '_fbp=fb.1.2.3', true)
    expect(withConsent.fbp).toBe('fb.1.2.3')
    expect(String(withConsent.fbc)).toMatch(/^fb\.1\.\d+\.ABC$/)
  })

  it('o endereço /f/<slug> indica o formulário', () => {
    expect(slugFromPath('/f/Espanha')).toBe('espanha')
    expect(slugFromPath('/f/brasil/')).toBe('brasil')
  })
})
