// Desempenho (16/11/2026): o banco fica em Frankfurt e cada consulta leva cerca de 1 s a partir do Brasil.
// 1) Dados de apoio que quase não mudam (usuárias, tipos, origens, motivos, mensagens) são buscados uma vez
//    a cada 5 minutos por sessão, em vez de a cada tela.
// 2) Listas abrem na hora com o último resultado desta sessão e se atualizam em seguida. Qualquer gravação
//    (inclusão, alteração ou ação) descarta esses resultados, para nunca mostrar algo que acabou de mudar.
// Tudo fica só na memória da aba: nada é gravado no navegador e tudo some ao sair.

const FIVE_MINUTES = 5 * 60 * 1000
const reference = new Map<string, { at: number; promise: Promise<unknown> }>()
const snapshots = new Map<string, unknown>()

export function cached<T>(key: string, loader: () => Promise<T>, ttlMs = FIVE_MINUTES): Promise<T> {
  const hit = reference.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>
  const promise = loader().catch((error) => {
    reference.delete(key)
    throw error
  })
  reference.set(key, { at: Date.now(), promise })
  return promise
}

export function peekSnapshot<T>(key: string): T | null {
  return (snapshots.get(key) as T | undefined) ?? null
}

export function saveSnapshot<T>(key: string, value: T): void {
  snapshots.set(key, value)
}

export function clearSnapshots(): void {
  snapshots.clear()
}

export function clearReference(prefix = ''): void {
  for (const key of [...reference.keys()]) if (key.startsWith(prefix)) reference.delete(key)
}

export function clearAll(): void {
  snapshots.clear()
  reference.clear()
}

// Usado pelo cliente do Supabase: toda requisição que não é leitura invalida as listas guardadas.
export function invalidatingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const isRead = method === 'GET' || method === 'HEAD'
  // Funções do banco (rpc) usam POST; as de leitura (indicadores, busca) não mudam dados.
  const isReadRpc = /\/rest\/v1\/rpc\/(lead_indicators|opportunity_indicators|customer_indicators|search_leads|find_lead_duplicates)\b/.test(url)
  if (!isRead && !isReadRpc && /\/rest\/v1\//.test(url)) {
    clearSnapshots()
    if (/\/rest\/v1\/(app_user|lead_type|lead_source|reason|message_template)\b/.test(url)) clearReference()
  }
  return fetch(input, init)
}
