// Webhook leadgen da Meta (BU-14).
// GET: verificação da assinatura do webhook. POST: valida X-Hub-Signature-256, lê cada lead na Graph API
// e grava pelo ingest_meta_lead (regras no banco). Segredos só nas variáveis da função:
// META_APP_SECRET, META_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN, META_GRAPH_VERSION (opcional).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { LEAD_FIELDS, OPTIONAL_LEAD_FIELDS, isValidSignature, leadgenChanges, verificationChallenge, type LeadgenChange } from '../_shared/meta.ts'

const graphVersion = Deno.env.get('META_GRAPH_VERSION') ?? 'v25.0'
const pageToken = Deno.env.get('META_PAGE_ACCESS_TOKEN') ?? ''

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
})

async function graph(path: string, fields: string): Promise<Record<string, unknown>> {
  const url = `https://graph.facebook.com/${graphVersion}/${path}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(pageToken)}`
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(`GRAPH_ERROR ${response.status}: ${JSON.stringify(data?.error ?? data)}`)
  return data
}

async function processChange(change: LeadgenChange) {
  const lead = await graph(change.leadgen_id, LEAD_FIELDS)
  // Campos extras: cada um à parte, para um campo não disponível não derrubar a leitura.
  for (const field of OPTIONAL_LEAD_FIELDS) {
    try {
      Object.assign(lead, await graph(change.leadgen_id, field))
    } catch (error) {
      console.warn('campo opcional indisponível', field, String(error))
    }
  }
  const { data, error } = await supabase.rpc('ingest_meta_lead', { p_lead: lead, p_change: change })
  if (error) throw new Error(`INGEST_ERROR: ${error.message}`)
  console.log('lead da Meta gravado', change.leadgen_id, data)
}

Deno.serve(async (request) => {
  const url = new URL(request.url)

  if (request.method === 'GET') {
    const challenge = verificationChallenge(url.searchParams, Deno.env.get('META_VERIFY_TOKEN') ?? '')
    return challenge ? new Response(challenge, { status: 200 }) : new Response('forbidden', { status: 403 })
  }

  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const rawBody = await request.text()
  const valid = await isValidSignature(rawBody, request.headers.get('x-hub-signature-256'), Deno.env.get('META_APP_SECRET') ?? '')
  if (!valid) return new Response('invalid signature', { status: 401 })

  const changes = leadgenChanges(JSON.parse(rawBody))
  const failures: string[] = []
  for (const change of changes) {
    try {
      await processChange(change)
    } catch (error) {
      console.error('falha ao gravar lead da Meta', change.leadgen_id, String(error))
      failures.push(change.leadgen_id)
    }
  }

  // Sempre 200 depois de validar a assinatura: a Meta desativa o webhook após falhas seguidas.
  // Lead que falhou aqui é recuperado pela sincronização de hora em hora (BU-16).
  if (failures.length) console.error('leads a recuperar pela sincronização', failures)
  return new Response('ok', { status: 200 })
})
