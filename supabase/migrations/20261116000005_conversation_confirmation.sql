-- Decisões de 15/11/2026
-- 1. Motivos de desqualificação iniciais (lista aprovada; editáveis em Configurações).
-- 2. Iniciar conversa com confirmação de envio: o CRM não vê o WhatsApp, então a usuária confirma
--    se a mensagem foi enviada. Sem confirmação, o envio fica pendente e aparece na fila e na ficha.
--    Número errado ou sem WhatsApp marca o WhatsApp do lead como inválido até ser corrigido.

select set_config('crm.stage_change', 'on', true);

-- 1. Motivos de desqualificação
insert into public.reason (kind, name, sort_order)
select 'DISQUALIFICATION', v.name, v.sort_order
from (values
  ('Sem orçamento para investir', 1),
  ('Fora do perfil (porte ou faturamento)', 2),
  ('Não é quem decide e não indicou quem decide', 3),
  ('Sem necessidade ou interesse real', 4),
  ('Já contratou outra agência ou tem equipe própria', 5),
  ('Fora da área de atuação (país ou região)', 6),
  ('Não é cliente: procura emprego, parceria ou quer vender algo', 7),
  ('Contato inválido (WhatsApp ou e-mail errado)', 8),
  ('Sem resposta após 3 tentativas', 9),
  ('Lead falso, teste ou duplicado', 10)
) as v (name, sort_order)
where not exists (
  select 1 from public.reason r where r.kind = 'DISQUALIFICATION' and r.name = v.name and r.deleted_at is null
);

-- 2. Confirmação de envio
alter table public.activity
  add column delivery_status text check (delivery_status in ('PENDING', 'SENT', 'NOT_SENT')),
  add column not_sent_reason text check (not_sent_reason in ('INVALID_NUMBER', 'NO_WHATSAPP', 'OTHER')),
  add column delivery_confirmed_at timestamptz,
  add column delivery_confirmed_by uuid,
  add constraint activity_not_sent_reason check (delivery_status = 'NOT_SENT' or not_sent_reason is null);

alter table public.lead
  add column whatsapp_status text not null default 'UNVERIFIED'
    check (whatsapp_status in ('UNVERIFIED', 'VALID', 'INVALID'));

-- Número alterado volta a "não verificado".
create or replace function public.reset_whatsapp_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.whatsapp is distinct from old.whatsapp and new.whatsapp_status is not distinct from old.whatsapp_status then
    new.whatsapp_status := 'UNVERIFIED';
  end if;
  return new;
end;
$$;

create trigger lead_reset_whatsapp_status before update on public.lead
for each row execute function public.reset_whatsapp_status();

-- Iniciar conversa agora só registra a tentativa (pendente). Situação e último contato mudam na confirmação.
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
  if v_lead.whatsapp_status = 'INVALID' then raise exception 'WHATSAPP_MARKED_INVALID'; end if;

  insert into public.activity (lead_id, kind, body, delivery_status)
  values (p_lead_id, 'WHATSAPP', nullif(trim(coalesce(p_message, '')), ''), 'PENDING')
  returning id into v_activity_id;

  return v_activity_id;
end;
$$;

create or replace function public.confirm_conversation(p_activity_id uuid, p_sent boolean, p_not_sent_reason text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_activity public.activity%rowtype;
begin
  select * into v_activity from public.activity
  where id = p_activity_id and deleted_at is null and kind = 'WHATSAPP'
  for update;

  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  if v_activity.delivery_status is distinct from 'PENDING' then raise exception 'ALREADY_CONFIRMED'; end if;
  if not p_sent and p_not_sent_reason is null then raise exception 'NOT_SENT_REASON_REQUIRED'; end if;

  update public.activity
     set delivery_status = case when p_sent then 'SENT' else 'NOT_SENT' end,
         not_sent_reason = case when p_sent then null else p_not_sent_reason end,
         delivery_confirmed_at = now(),
         delivery_confirmed_by = auth.uid()
   where id = p_activity_id;

  if p_sent then
    update public.lead
       set last_contact_at = greatest(coalesce(last_contact_at, v_activity.occurred_at), v_activity.occurred_at),
           queue_status = 'AWAITING_REPLY',
           whatsapp_status = 'VALID'
     where id = v_activity.lead_id and stage <> 'CONVERTED';
  elsif p_not_sent_reason in ('INVALID_NUMBER', 'NO_WHATSAPP') then
    update public.lead
       set whatsapp_status = 'INVALID'
     where id = v_activity.lead_id and stage <> 'CONVERTED';
  end if;
end;
$$;

revoke execute on function public.confirm_conversation(uuid, boolean, text) from anon, public;
grant execute on function public.confirm_conversation(uuid, boolean, text) to authenticated;

-- Fila: WhatsApp inválido e envio pendente de confirmação (colunas novas no fim da visão).
create or replace view public.lead_queue
with (security_invoker = true)
as
select
  l.id,
  l.full_name,
  l.company_name,
  l.country,
  l.whatsapp,
  l.stage,
  l.queue_status,
  l.owner_id,
  l.next_step,
  l.next_step_at,
  l.last_contact_at,
  l.lead_type_id,
  t.name as lead_type_name,
  l.needs_completion,
  l.created_at,
  (l.next_step_at is not null and l.next_step_at < now()) as is_overdue,
  (l.next_step_at is null) as missing_next_step,
  l.whatsapp_status,
  exists (
    select 1 from public.activity a
    where a.lead_id = l.id and a.deleted_at is null and a.delivery_status = 'PENDING'
  ) as pending_delivery_confirmation
from public.lead l
left join public.lead_type t on t.id = l.lead_type_id
where l.deleted_at is null
  and l.is_test = false
  and l.stage not in ('DISQUALIFIED', 'CONVERTED');

select set_config('crm.stage_change', 'off', true);
