-- BU-11: conversão e oportunidades
-- Quadro de oportunidades e indicadores sempre separados por moeda (nunca somar EUR com BRL).

alter table public.opportunity
  add constraint opportunity_monthly_value_positive check (monthly_value is null or monthly_value >= 0);

create view public.opportunity_board
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
  (o.stage in ('PROPOSAL_SENT', 'FOLLOW_UP') and o.expected_close_date is not null and o.expected_close_date < current_date) as is_late
from public.opportunity o
join public.account a on a.id = o.account_id
left join public.contact c on c.id = o.contact_id
left join public.lead l on l.id = o.source_lead_id
left join public.reason r on r.id = o.loss_reason_id
where o.deleted_at is null and a.deleted_at is null;

revoke all on public.opportunity_board from anon, public;
grant select on public.opportunity_board to authenticated;

-- Em aberto (Proposta enviada + Follow-up) e ganhas no mês, por moeda. Mês contado em UTC.
create or replace function public.opportunity_indicators()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'open', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'count', n, 'value', total) order by currency)
      from (
        select currency, count(*) as n, coalesce(sum(monthly_value), 0) as total
        from public.opportunity
        where deleted_at is null and stage in ('PROPOSAL_SENT', 'FOLLOW_UP')
        group by currency
      ) x
    ), '[]'::jsonb),
    'won_this_month', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'count', n, 'value', total) order by currency)
      from (
        select currency, count(*) as n, coalesce(sum(monthly_value), 0) as total
        from public.opportunity
        where deleted_at is null and stage = 'WON' and closed_at >= date_trunc('month', now())
        group by currency
      ) y
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.opportunity_indicators() from anon, public;
grant execute on function public.opportunity_indicators() to authenticated;
