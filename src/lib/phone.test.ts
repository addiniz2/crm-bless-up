import { describe, expect, it } from 'vitest'
import { composeWhatsapp, formatNational, formatStoredWhatsapp } from './phone'

describe('máscara de WhatsApp', () => {
  it('Espanha: 3-3-3', () => {
    expect(formatNational('ES', '600111222')).toBe('600 111 222')
    expect(formatNational('ES', '6001')).toBe('600 1')
    expect(formatNational('ES', '6001112229999')).toBe('600 111 222')
  })

  it('Brasil: celular com 9 dígitos e fixo com 8', () => {
    expect(formatNational('BR', '11988887777')).toBe('(11) 98888-7777')
    expect(formatNational('BR', '1133334444')).toBe('(11) 3333-4444')
    expect(formatNational('BR', '11')).toBe('(11')
    expect(formatNational('BR', '119')).toBe('(11) 9')
  })

  it('outro país: só dígitos', () => {
    expect(formatNational('OTHER', '+351 912-345-678')).toBe('351912345678')
  })

  it('compõe o número que o banco grava', () => {
    expect(composeWhatsapp('ES', '600 111 222')).toBe('34600111222')
    expect(composeWhatsapp('BR', '(11) 98888-7777')).toBe('5511988887777')
    expect(composeWhatsapp('BR', '011 98888 7777')).toBe('5511988887777')
    expect(composeWhatsapp('OTHER', '+351 912 345 678')).toBe('351912345678')
    expect(composeWhatsapp('ES', '')).toBe('')
  })

  it('exibe número gravado', () => {
    expect(formatStoredWhatsapp('34600111222')).toBe('+34 600 111 222')
    expect(formatStoredWhatsapp('5511988887777')).toBe('+55 (11) 98888-7777')
    expect(formatStoredWhatsapp('351912345678')).toBe('+351912345678')
  })
})
