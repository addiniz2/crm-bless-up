// Envio da fila de eventos (tabela meta_event) para a API de Conversões da Meta (BU-17).
// Chamada a cada minuto pelo pg_cron (cabeçalho x-dispatch-secret, guardado no Vault).
// Segredos só nas variáveis da função: META_CAPI_TOKEN, CAPI_DISPATCH_SECRET,
// META_TEST_EVENT_CODE (opcional: no ambiente de teste, os eventos aparecem em "Testar eventos"),
// META_GRAPH_VERSION (opcional).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildServerEvent, isAuthorizedDispatch, type ClaimedEvent } from '../_shared/capi.ts'

const graphVersion = Deno.env.get('META_GRAPH_VERSION') ?? 'v25.0'
const token = Deno.env.get('META_CAPI_TOKEN') ?? ''
const testEventCode = Deno.env.get('META_TEST_EVENT_CODE') ?? ''

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
})

async function send(event: ClaimedEvent) {
  if (!event.pixel_id) throw new Error('PIXEL_NOT_CONFIGURED')
  const body: Record<string, unknown> = { data: [await buildServerEvent(event)] }
  if (testEventCode) body.test_event_code = testEventCode
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${event.pixel_id}/events?access_token=${encodeURIComponent(token)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, data, error: response.ok ? null : `HTTP ${response.status}: ${JSON.stringify(data?.error ?? data)}` }
}

Deno.serve(async (request) => {
  if (!isAuthorizedDispatch(request.headers.get('x-dispatch-secret'), Deno.env.get('CAPI_DISPATCH_SECRET') ?? '')) {
    return new Response('forbidden', { status: 403 })
  }
  if (!token) {
    console.error('META_CAPI_TOKEN não configurado: nada enviado')
    return new Response('not configured', { status: 503 })
  }

  const { data: events, error } = await supabase.rpc('claim_meta_events', { p_limit: 50 })
  if (error) {
    console.error('falha ao ler a fila', error.message)
    return new Response('error', { status: 500 })
  }

  let sent = 0
  for (const event of (events ?? []) as ClaimedEvent[]) {
    try {
      const result = await send(event)
      await supabase.rpc('complete_meta_event', {
        p_id: event.id,
        p_ok: result.ok,
        p_response: result.data,
        p_error: result.error,
      })
      if (result.ok) sent++
      else console.error('Meta recusou o evento', event.event_name, event.event_id, result.error)
    } catch (caught) {
      await supabase.rpc('complete_meta_event', { p_id: event.id, p_ok: false, p_response: null, p_error: String(caught) })
      console.error('falha ao enviar evento', event.event_id, String(caught))
    }
  }
  return new Response(JSON.stringify({ claimed: events?.length ?? 0, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
