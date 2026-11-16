-- Busca rápida de leads (experiência): por nome, empresa, e-mail ou WhatsApp.
-- Sem diferenciar maiúsculas e acentos; telefone comparado só pelos dígitos.
-- Inclui convertidos e desqualificados, para achar qualquer pessoa que já falou com a Bless.

create extension if not exists unaccent with schema extensions;
-- Dicionário com esquema explícito: as funções rodam com search_path vazio.

create or replace function public.search_leads(p_term text)
returns table (
  id uuid,
  full_name text,
  company_name text,
  whatsapp text,
  email text,
  stage text,
  owner_id uuid,
  converted_opportunity_id uuid
)
language sql
stable
set search_path = ''
as $$
  with term as (
    select
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, trim(coalesce(p_term, '')))) as text_term,
      regexp_replace(coalesce(p_term, ''), '[^0-9]', '', 'g') as digits
  )
  select l.id, l.full_name, l.company_name, l.whatsapp, l.email, l.stage, l.owner_id, l.converted_opportunity_id
  from public.lead l, term
  where l.deleted_at is null
    and length(term.text_term) >= 2
    and (
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, l.full_name)) like '%' || term.text_term || '%'
      or lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(l.company_name, ''))) like '%' || term.text_term || '%'
      or lower(coalesce(l.email, '')) like '%' || term.text_term || '%'
      or (length(term.digits) >= 4 and l.whatsapp like '%' || term.digits || '%')
    )
  order by
    (l.stage in ('DISQUALIFIED', 'CONVERTED')),
    l.created_at desc
  limit 20;
$$;

revoke execute on function public.search_leads(text) from anon, public;
grant execute on function public.search_leads(text) to authenticated;
