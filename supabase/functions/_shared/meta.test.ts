import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isValidSignature, leadgenChanges, verificationChallenge } from './meta'

describe('webhook da Meta', () => {
  const secret = 'app-secret-de-teste'
  const body = JSON.stringify({ object: 'page', entry: [] })
  const valid = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

  it('aceita só a assinatura feita com o App Secret sobre o corpo exato', async () => {
    expect(await isValidSignature(body, valid, secret)).toBe(true)
    expect(await isValidSignature(`${body} `, valid, secret)).toBe(false)
    expect(await isValidSignature(body, valid, 'outro-segredo')).toBe(false)
    expect(await isValidSignature(body, null, secret)).toBe(false)
    expect(await isValidSignature(body, valid, '')).toBe(false)
  })

  it('responde o challenge só com o token certo', () => {
    const ok = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '123' })
    expect(verificationChallenge(ok, 'tok')).toBe('123')
    expect(verificationChallenge(ok, 'errado')).toBeNull()
    expect(verificationChallenge(ok, '')).toBeNull()
  })

  it('extrai só as mudanças leadgen', () => {
    const payload = {
      object: 'page',
      entry: [
        {
          id: 'P1',
          changes: [
            { field: 'leadgen', value: { leadgen_id: 'L1', page_id: 'P1', form_id: 'F1' } },
            { field: 'feed', value: { post_id: 'x' } },
          ],
        },
      ],
    }
    expect(leadgenChanges(payload)).toEqual([{ leadgen_id: 'L1', page_id: 'P1', form_id: 'F1' }])
    expect(leadgenChanges({ object: 'user' })).toEqual([])
  })
})
