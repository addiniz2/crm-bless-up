-- Marcador "Importante" em leads e oportunidades (pedido de 17/11/2026, MVP): um marcador só,
-- aplicado à mão pela equipe, visível nos cartões e na ficha e usado como filtro.
alter table public.lead add column is_important boolean not null default false;
alter table public.opportunity add column is_important boolean not null default false;
comment on column public.lead.is_important is 'Marcado como importante pela equipe (destaque visual e filtro)';
comment on column public.opportunity.is_important is 'Marcada como importante pela equipe (destaque visual e filtro)';

-- As views passam a trazer o marcador (coluna nova no fim, sem mudar as demais)
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
  ) as pending_delivery_confirmation,
  l.is_important
from public.lead l
left join public.lead_type t on t.id = l.lead_type_id
where l.deleted_at is null
  and l.is_test = false
  and l.stage not in ('DISQUALIFIED', 'CONVERTED');

create or replace view public.opportunity_board
with (security_invoker = true)
as
select
  o.id,
  o.stage,
  o.monthly_value,
  o.currency,
  o.expected_close_date,
  o.owner_id,
  o.closed_at,
  o.created_at,
  o.account_id,
  a.name as account_name,
  a.country,
  a.is_customer,
  o.contact_id,
  c.full_name as contact_name,
  o.source_lead_id,
  l.full_name as source_lead_name,
  r.name as loss_reason_name,
  (o.stage in ('PROPOSAL_SENT', 'FOLLOW_UP') and o.expected_close_date is not null and o.expected_close_date < current_date) as is_late,
  o.is_important
from public.opportunity o
join public.account a on a.id = o.account_id
left join public.contact c on c.id = o.contact_id
left join public.lead l on l.id = o.source_lead_id
left join public.reason r on r.id = o.loss_reason_id
where o.deleted_at is null and a.deleted_at is null;
