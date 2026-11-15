-- BU-07: cadastro de lead
-- Normaliza WhatsApp e e-mail no próprio banco (vale para tela, formulário do site, Meta e CSV),
-- verifica duplicados e carrega as origens propostas na especificação (editáveis depois em Configurações).

create or replace function public.normalize_whatsapp(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Só dígitos, sem zeros à esquerda (0034… vira 34…). Vazio vira nulo.
  select nullif(ltrim(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '0'), '');
$$;

create or replace function public.normalize_lead_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name := trim(new.full_name);
  new.company_name := nullif(trim(coalesce(new.company_name, '')), '');
  new.whatsapp := public.normalize_whatsapp(new.whatsapp);
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  return new;
end;
$$;

create trigger lead_normalize before insert or update on public.lead
for each row execute function public.normalize_lead_fields();

-- Duplicado: mesmo WhatsApp ou mesmo e-mail de um lead ativo (não excluído, não desqualificado, não convertido).
-- Roda com a permissão de quem chama, então a RLS continua valendo.
create or replace function public.find_lead_duplicates(p_whatsapp text, p_email text, p_exclude_id uuid default null)
returns table (id uuid, full_name text, company_name text, stage text, owner_id uuid)
language sql
stable
set search_path = ''
as $$
  select l.id, l.full_name, l.company_name, l.stage, l.owner_id
  from public.lead l
  where l.deleted_at is null
    and l.stage not in ('DISQUALIFIED', 'CONVERTED')
    and (p_exclude_id is null or l.id <> p_exclude_id)
    and (
      (public.normalize_whatsapp(p_whatsapp) is not null and l.whatsapp = public.normalize_whatsapp(p_whatsapp))
      or (nullif(lower(trim(coalesce(p_email, ''))), '') is not null and lower(l.email) = lower(trim(p_email)))
    )
  order by l.created_at desc
  limit 5;
$$;

revoke execute on function public.normalize_whatsapp(text) from anon, public;
revoke execute on function public.find_lead_duplicates(text, text, uuid) from anon, public;
grant execute on function public.normalize_whatsapp(text) to authenticated;
grant execute on function public.find_lead_duplicates(text, text, uuid) to authenticated;

-- Origens propostas na especificação funcional (seção 6). Nomes são dados editáveis, não códigos.
insert into public.lead_source (name, sort_order)
select v.name, v.sort_order
from (values ('Meta Ads', 1), ('Google Ads', 2), ('Indicação', 3), ('Orgânico', 4)) as v (name, sort_order)
where not exists (select 1 from public.lead_source s where s.name = v.name);
