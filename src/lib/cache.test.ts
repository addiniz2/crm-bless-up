import { afterEach, describe, expect, it, vi } from 'vitest'
import { cached, clearAll, invalidatingFetch, peekSnapshot, saveSnapshot } from './cache'

describe('cache de sessão', () => {
  afterEach(() => {
    clearAll()
    vi.unstubAllGlobals()
  })

  it('dados de apoio: uma busca só enquanto válidos; falha não fica guardada', async () => {
    const loader = vi.fn().mockResolvedValue(['Jana'])
    expect(await cached('users', loader)).toEqual(['Jana'])
    expect(await cached('users', loader)).toEqual(['Jana'])
    expect(loader).toHaveBeenCalledTimes(1)

    const failing = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue(['ok'])
    await expect(cached('types', failing)).rejects.toThrow('rede')
    expect(await cached('types', failing)).toEqual(['ok'])
  })

  it('qualquer gravação descarta as listas guardadas; leitura não', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')))
    saveSnapshot('queue', [1, 2])
    await invalidatingFetch('https://x.supabase.co/rest/v1/lead_queue?select=*')
    await invalidatingFetch('https://x.supabase.co/rest/v1/rpc/lead_indicators', { method: 'POST' })
    expect(peekSnapshot('queue')).toEqual([1, 2])
    await invalidatingFetch('https://x.supabase.co/rest/v1/rpc/change_lead_stage', { method: 'POST' })
    expect(peekSnapshot('queue')).toBeNull()
    saveSnapshot('queue', [3])
    await invalidatingFetch('https://x.supabase.co/rest/v1/lead?id=eq.1', { method: 'PATCH' })
    expect(peekSnapshot('queue')).toBeNull()
  })
})
