-- BU-17/18: eventos do formulário do site enviados à Meta pela API de Conversões.
-- Decisões de 16/11/2026 (Atila): envio pelo servidor para todos os leads do formulário (com ou sem aceite
-- de cookies; os cookies da Meta só existem quando houve aceite); agendamento pelo método oficial do Supabase
-- (pg_cron + pg_net + Vault). Eventos: FirstInteraction, SubmitScheduled, LeadMQL e FakeLead.
-- O mesmo event_id do Pixel é usado aqui, para a Meta não contar em dobro.

create table public.meta_event (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.lead (id),
  event_name text not null check (event_name in ('FirstInteraction', 'SubmitScheduled', 'LeadMQL', 'FakeLead')),
  event_id text not null unique,
  event_time timestamptz not null,
  action_source text not null default 'website' check (action_source in ('website', 'system_generated')),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'EXPIRED')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  response jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index meta_event_pending_idx on public.meta_event (next_attempt_at) where status = 'PENDING';
create index meta_event_lead_idx on public.meta_event (lead_id);

create trigger meta_event_audit before insert or update on public.meta_event
for each row execute function public.set_audit_fields();

alter table public.meta_event enable row level security;
create policy meta_event_select on public.meta_event for select to authenticated using (public.is_member());

-- Enfileira (sem duplicar: o event_id é único)
create or replace function public.enqueue_meta_event(
  p_lead_id uuid, p_event_name text, p_event_id text, p_event_time timestamptz, p_action_source text default 'website'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.meta_event (lead_id, event_name, event_id, event_time, action_source)
  values (p_lead_id, p_event_name, coalesce(nullif(p_event_id, ''), gen_random_uuid()::text), p_event_time, p_action_source)
  on conflict (event_id) do nothing;
$$;
revoke execute on function public.enqueue_meta_event(uuid, text, text, timestamptz, text) from anon, authenticated, public;

-- Gatilhos: só leads que vieram do formulário do site
create or replace function public.lead_meta_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.site_form_id is null then return new; end if;

  if tg_op = 'INSERT' then
    perform public.enqueue_meta_event(new.id, 'FirstInteraction',
      new.form_answers -> 'events' ->> 'FirstInteraction', new.created_at);
    return new;
  end if;

  if old.form_completed_at is null and new.form_completed_at is not null then
    perform public.enqueue_meta_event(new.id, 'SubmitScheduled',
      new.form_answers -> 'events' ->> 'SubmitScheduled', new.form_completed_at);
    if new.is_mql then
      perform public.enqueue_meta_event(new.id, 'LeadMQL',
        new.form_answers -> 'events' ->> 'LeadMQL', new.form_completed_at);
    end if;
  end if;

  -- Desqualificado no CRM (qualquer motivo) = Fake Lead (só existe pelo servidor)
  if new.stage = 'DISQUALIFIED' and old.stage is distinct from 'DISQUALIFIED' then
    perform public.enqueue_meta_event(new.id, 'FakeLead', null, now(), 'system_generated');
  end if;
  return new;
end;
$$;

create trigger lead_meta_events_insert after insert on public.lead
for each row execute function public.lead_meta_events();
create trigger lead_meta_events_update after update on public.lead
for each row execute function public.lead_meta_events();

-- Envio (só a Edge Function, com service_role): pega um lote e marca como "enviando"
create or replace function public.claim_meta_events(p_limit integer default 50)
returns table (
  id uuid, event_name text, event_id text, event_time timestamptz, action_source text, attempts integer,
  lead_id uuid, full_name text, whatsapp text, email text, country text, fbp text, fbc text,
  client_ip text, user_agent text, page_url text, pixel_id text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A Meta recusa event_time com mais de 7 dias: esses ficam como expirados (com folga de 1 hora)
  update public.meta_event e set status = 'EXPIRED', last_error = 'EVENT_TIME_OLDER_THAN_7_DAYS'
  where e.status = 'PENDING' and e.event_time < now() - interval '7 days' + interval '1 hour';

  -- Envio interrompido no meio (função caiu): volta para a fila depois de 10 minutos
  update public.meta_event e set status = 'PENDING'
  where e.status = 'SENDING' and e.updated_at < now() - interval '10 minutes';

  return query
  with picked as (
    select e.id from public.meta_event e
    where e.status = 'PENDING' and e.next_attempt_at <= now() and e.deleted_at is null
    order by e.next_attempt_at
    limit p_limit
    for update skip locked
  ), updated as (
    update public.meta_event e set status = 'SENDING', attempts = e.attempts + 1
    from picked where e.id = picked.id
    returning e.*
  )
  select u.id, u.event_name, u.event_id, u.event_time, u.action_source, u.attempts,
         l.id, l.full_name, l.whatsapp, l.email, l.country, l.fbp, l.fbc,
         host(l.client_ip), l.user_agent, l.page_url, f.meta_pixel_id
  from updated u
  join public.lead l on l.id = u.lead_id
  left join public.site_form f on f.id = l.site_form_id;
end;
$$;

-- Resultado do envio: enviado, ou nova tentativa com espera crescente (até 8 tentativas)
create or replace function public.complete_meta_event(p_id uuid, p_ok boolean, p_response jsonb, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_attempts integer;
begin
  select attempts into v_attempts from public.meta_event where id = p_id;
  if p_ok then
    update public.meta_event set status = 'SENT', sent_at = now(), response = p_response, last_error = null where id = p_id;
  elsif v_attempts >= 8 then
    update public.meta_event set status = 'FAILED', response = p_response, last_error = left(p_error, 1000) where id = p_id;
  else
    update public.meta_event set
      status = 'PENDING',
      response = p_response,
      last_error = left(p_error, 1000),
      next_attempt_at = now() + (array[1, 5, 15, 60, 180, 360, 720, 1440])[v_attempts] * interval '1 minute'
    where id = p_id;
  end if;
end;
$$;

revoke execute on function public.claim_meta_events(integer) from anon, authenticated, public;
revoke execute on function public.complete_meta_event(uuid, boolean, jsonb, text) from anon, authenticated, public;
grant execute on function public.claim_meta_events(integer) to service_role;
grant execute on function public.complete_meta_event(uuid, boolean, jsonb, text) to service_role;

-- Reenvio manual pela equipe (evento que falhou e ainda está dentro dos 7 dias)
create or replace function public.retry_meta_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'NOT_ALLOWED'; end if;
  update public.meta_event set status = 'PENDING', attempts = 0, next_attempt_at = now()
  where id = p_id and status = 'FAILED' and event_time > now() - interval '7 days' + interval '1 hour';
  if not found then raise exception 'EVENT_NOT_RETRYABLE'; end if;
end;
$$;
revoke execute on function public.retry_meta_event(uuid) from anon, public;
grant execute on function public.retry_meta_event(uuid) to authenticated;

-- Agendamento a cada minuto (método oficial: pg_cron + pg_net, URL e chave no Vault, nunca no código).
-- Sem os itens 'project_url' e 'capi_dispatch_secret' no Vault, o agendamento roda e não faz nada.
-- Em bancos sem as extensões (testes locais), esta parte é pulada.
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.unschedule(jobid) from cron.job where jobname = 'meta-capi-dispatch';
    perform cron.schedule(
      'meta-capi-dispatch',
      '* * * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
                 || '/functions/v1/meta-capi-dispatch',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'capi_dispatch_secret')
          ),
          body := '{}'::jsonb
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
          and exists (select 1 from vault.decrypted_secrets where name = 'capi_dispatch_secret')
          and exists (select 1 from public.meta_event where status = 'PENDING' and next_attempt_at <= now());
      $job$
    );
  end if;
end;
$outer$;
