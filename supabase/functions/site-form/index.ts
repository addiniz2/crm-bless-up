// Formulário público do site (BU-19). A página do formulário só fala com esta função;
// a função chama o banco com a chave de serviço (variável automática do Supabase, nunca no navegador).
// GET  ?slug=espanha                       -> definição pública do formulário
// POST {action:'start', slug, answers, tracking, website}   -> cria o lead (tela de contato)
// POST {action:'finish', submissionId, answers, events}      -> completa o lead
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clientIpFrom, corsHeaders, errorCode, isAllowedOrigin, isBot, sanitizeEvents, sanitizeTracking } from '../_shared/siteForm.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
})

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (origin && !isAllowedOrigin(origin)) return json({ error: 'FORBIDDEN' }, 403, origin)

  try {
    if (request.method === 'GET') {
      const slug = new URL(request.url).searchParams.get('slug') ?? ''
      const { data, error } = await supabase.rpc('site_form_public', { p_slug: slug })
      if (error) throw error
      return data ? json(data, 200, origin) : json({ error: 'FORM_NOT_FOUND' }, 404, origin)
    }

    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}

    if (body.action === 'start') {
      // Robô recebe uma resposta normal, mas nada é gravado.
      if (isBot(body)) return json({ submissionId: crypto.randomUUID() }, 200, origin)
      const tracking = sanitizeTracking(body.tracking, clientIpFrom(request.headers), request.headers.get('user-agent'))
      const { data, error } = await supabase.rpc('site_form_start', {
        p_slug: String(body.slug ?? ''),
        p_answers: answers,
        p_tracking: tracking,
      })
      if (error) return json({ error: errorCode(error.message) }, 400, origin)
      return json(data, 200, origin)
    }

    if (body.action === 'finish') {
      const { data, error } = await supabase.rpc('site_form_finish', {
        p_submission_id: String(body.submissionId ?? ''),
        p_answers: answers,
        p_events: sanitizeEvents(body.events),
      })
      if (error) return json({ error: errorCode(error.message) }, 400, origin)
      return json(data, 200, origin)
    }

    return json({ error: 'UNKNOWN' }, 400, origin)
  } catch (error) {
    console.error('falha no formulário do site', String(error))
    return json({ error: 'UNKNOWN' }, 500, origin)
  }
})
