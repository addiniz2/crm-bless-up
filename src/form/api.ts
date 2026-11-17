import type { Answers, PublicForm, Tracking } from './logic'

// A página do formulário fala só com a Edge Function site-form (regra 3 do projeto).
const base = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''}/functions/v1/site-form`
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? ''

export class FormApiError extends Error {}

async function call<T>(init?: RequestInit, query = ''): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${base}${query}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', apikey: publishableKey },
    })
  } catch {
    throw new FormApiError('NETWORK')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new FormApiError(typeof data?.error === 'string' ? data.error : 'UNKNOWN')
  return data as T
}

export function getForm(slug: string): Promise<PublicForm> {
  return call<PublicForm>(undefined, `?slug=${encodeURIComponent(slug)}`)
}

export function startSubmission(slug: string, answers: Answers, tracking: Tracking, honeypot: string) {
  return call<{ submissionId: string }>({
    method: 'POST',
    body: JSON.stringify({ action: 'start', slug, answers, tracking, website: honeypot }),
  })
}

export function finishSubmission(submissionId: string, answers: Answers, events: Record<string, string>) {
  return call<{ isMql: boolean | null }>({
    method: 'POST',
    body: JSON.stringify({ action: 'finish', submissionId, answers, events }),
  })
}
