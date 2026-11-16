import { describe, expect, it } from 'vitest'
import { renderTemplate, whatsappLink } from './leadDetail'
import { ruleErrorFrom } from './pipeline'

describe('Iniciar conversa', () => {
  it('preenche as variáveis da mensagem modelo', () => {
    expect(renderTemplate('Olá {nome}, aqui é {responsavel} sobre a {empresa}.', { firstName: 'Ana', company: 'Café Ana', owner: 'Isa' })).toBe(
      'Olá Ana, aqui é Isa sobre a Café Ana.',
    )
  })

  it('monta o link oficial do WhatsApp com a mensagem codificada', () => {
    expect(whatsappLink('34600111222', 'Olá Ana & cia')).toBe('https://wa.me/34600111222?text=Ol%C3%A1%20Ana%20%26%20cia')
    expect(whatsappLink('34600111222', '')).toBe('https://wa.me/34600111222')
  })
})

describe('erros das regras do banco', () => {
  it('reconhece o código levantado pela função', () => {
    expect(ruleErrorFrom({ message: 'DISQUALIFICATION_REASON_REQUIRED' }, ['DISQUALIFICATION_REASON_REQUIRED'], 'UNKNOWN')).toBe(
      'DISQUALIFICATION_REASON_REQUIRED',
    )
    expect(ruleErrorFrom({ message: 'qualquer coisa' }, ['LEAD_READ_ONLY'], 'UNKNOWN')).toBe('UNKNOWN')
  })
})
