-- Motivos de perda aprovados em 15/11/2026 e BU-12: lista básica de clientes.

insert into public.reason (kind, name, sort_order)
select 'LOSS', v.name, v.sort_order
from (values
  ('Preço acima do orçamento', 1),
  ('Escolheu outra agência', 2),
  ('Decidiu fazer internamente', 3),
  ('Adiou ou cancelou o projeto', 4),
  ('Parou de responder', 5),
  ('Não aprovou a proposta (escopo ou formato)', 6),
  ('Outro motivo', 7)
) as v (name, sort_order)
where not exists (
  select 1 from public.reason r where r.kind = 'LOSS' and r.name = v.name and r.deleted_at is null
);

create view public.customer_list
with (security_invoker = true)
as
select
  a.id as account_id,
  a.name,
  a.kind,
  a.country,
  a.customer_since,
  a.source_lead_id,
  p.id as profile_id,
  p.monthly_fee,
  p.currency,
  p.status,
  p.start_date,
  p.renewal_date,
  p.health_score,
  p.owner_id,
  c.full_name as contact_name,
  c.whatsapp as contact_whatsapp
from public.account a
join public.customer_profile p on p.account_id = a.id and p.deleted_at is null
left join lateral (
  select ct.full_name, ct.whatsapp from public.contact ct
  where ct.account_id = a.id and ct.deleted_at is null
  order by ct.created_at
  limit 1
) c on true
where a.deleted_at is null and a.is_customer;

revoke all on public.customer_list from anon, public;
grant select on public.customer_list to authenticated;

-- Clientes ativos e mensalidade recorrente por moeda (ativos e com aviso de cancelamento ainda pagam).
create or replace function public.customer_indicators()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'active_customers', (
      select count(*) from public.customer_profile p
      join public.account a on a.id = p.account_id and a.deleted_at is null
      where p.deleted_at is null and p.status in ('ACTIVE', 'CANCELLATION_NOTICE')
    ),
    'monthly_revenue', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'count', n, 'value', total) order by currency)
      from (
        select p.currency, count(*) as n, coalesce(sum(p.monthly_fee), 0) as total
        from public.customer_profile p
        join public.account a on a.id = p.account_id and a.deleted_at is null
        where p.deleted_at is null and p.status in ('ACTIVE', 'CANCELLATION_NOTICE')
        group by p.currency
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.customer_indicators() from anon, public;
grant execute on function public.customer_indicators() to authenticated;
