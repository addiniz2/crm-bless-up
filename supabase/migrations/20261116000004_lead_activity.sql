-- BU-09 e BU-10: indicadores do funil, registro de contato e Iniciar conversa.
-- Regras da especificação funcional, seção 5 (itens 5, 6 e 7), aplicadas no banco.

-- Registrar contato: tipo e texto obrigatórios; próximo passo com data.
-- O primeiro contato tira o lead de "Novo" e passa para "Em andamento".
-- Nota não conta como contato: não muda último contato nem situação.
create or replace function public.register_activity(
  p_lead_id uuid,
  p_kind text,
  p_body text,
  p_next_step text default null,
  p_next_step_at timestamptz default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_lead public.lead%rowtype;
  v_activity_id uuid;
  v_next_step text := nullif(trim(coalesce(p_next_step, '')), '');
  v_is_contact boolean := p_kind <> 'NOTE';
begin
  select * into v_lead from public.lead where id = p_lead_id and deleted_at is null for update;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if v_lead.stage = 'CONVERTED' then raise exception 'LEAD_READ_ONLY'; end if;
  if p_kind not in ('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE') then raise exception 'INVALID_ACTIVITY_KIND'; end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then raise exception 'ACTIVITY_BODY_REQUIRED'; end if;
  if v_next_step is not null and p_next_step_at is null then raise exception 'NEXT_STEP_DATE_REQUIRED'; end if;

  insert into public.activity (lead_id, kind, body, next_step, next_step_at)
  values (p_lead_id, p_kind, trim(p_body), v_next_step, p_next_step_at)
  returning id into v_activity_id;

  update public.lead
     set last_contact_at = case when v_is_contact then now() else last_contact_at end,
         -- Contato novo substitui o próximo passo (vazio = alerta "sem próximo passo");
         -- nota só altera o próximo passo se ele vier preenchido.
         next_step = case when v_is_contact or p_next_step_at is not null then v_next_step else next_step end,
         next_step_at = case when v_is_contact or p_next_step_at is not null then p_next_step_at else next_step_at end,
         queue_status = case when v_is_contact and queue_status = 'NEW' then 'IN_PROGRESS' else queue_status end
   where id = p_lead_id;

  return v_activity_id;
end;
$$;

-- Iniciar conversa: exige WhatsApp; registra o contato e muda a situação para "Aguardando retorno".
create or replace function public.register_conversation_started(p_lead_id uuid, p_message text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_lead public.lead%rowtype;
  v_activity_id uuid;
begin
  select * into v_lead from public.lead where id = p_lead_id and deleted_at is null for update;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if v_lead.stage = 'CONVERTED' then raise exception 'LEAD_READ_ONLY'; end if;
  if v_lead.whatsapp is null then raise exception 'WHATSAPP_REQUIRED'; end if;

  insert into public.activity (lead_id, kind, body)
  values (p_lead_id, 'WHATSAPP', nullif(trim(coalesce(p_message, '')), ''))
  returning id into v_activity_id;

  update public.lead
     set last_contact_at = now(),
         queue_status = 'AWAITING_REPLY'
   where id = p_lead_id;

  return v_activity_id;
end;
$$;

-- Indicadores do funil de leads (seção 4.2). Semana e mês contados em UTC.
create or replace function public.lead_indicators()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'in_funnel', count(*) filter (where stage not in ('DISQUALIFIED', 'CONVERTED')),
    'new_this_week', count(*) filter (where created_at >= date_trunc('week', now())),
    'meetings_scheduled', count(*) filter (where stage = 'MEETING_SCHEDULED'),
    'converted_this_month', count(*) filter (where converted_at >= date_trunc('month', now()))
  )
  from public.lead
  where deleted_at is null and is_test = false;
$$;

revoke execute on function public.register_activity(uuid, text, text, text, timestamptz) from anon, public;
revoke execute on function public.register_conversation_started(uuid, text) from anon, public;
revoke execute on function public.lead_indicators() from anon, public;
grant execute on function public.register_activity(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.register_conversation_started(uuid, text) to authenticated;
grant execute on function public.lead_indicators() to authenticated;
