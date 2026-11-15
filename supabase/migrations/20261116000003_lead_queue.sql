-- BU-08: Minha fila
-- Visão com os leads ativos e as regras da fila calculadas no banco:
-- atrasado = data do próximo passo já passou; sem próximo passo = alerta em "Em andamento".
-- security_invoker: a visão respeita a RLS de quem consulta.

create view public.lead_queue
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
  (l.next_step_at is null) as missing_next_step
from public.lead l
left join public.lead_type t on t.id = l.lead_type_id
where l.deleted_at is null
  and l.is_test = false
  and l.stage not in ('DISQUALIFIED', 'CONVERTED');

revoke all on public.lead_queue from anon, public;
grant select on public.lead_queue to authenticated;
