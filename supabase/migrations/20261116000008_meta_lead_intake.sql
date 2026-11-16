-- BU-14 (preparação): entrada de leads dos formulários instantâneos da Meta.
-- A Edge Function meta-leadgen-webhook valida a assinatura da Meta, lê o lead na Graph API
-- e chama ingest_meta_lead. Toda a regra de mapeamento fica aqui, no banco.

-- Formulários instantâneos conhecidos e sua configuração (tela do BU-15).
create table public.meta_form (
  id uuid primary key default gen_random_uuid(),
  form_id text not null unique,
  page_id text,
  name text,
  lead_type_id uuid references public.lead_type (id),
  default_country text check (default_country in ('ES', 'BR')),
  default_owner_id uuid references public.app_user (id),
  active boolean not null default true,
  last_lead_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create trigger meta_form_audit before insert or update on public.meta_form
for each row execute function public.set_audit_fields();

alter table public.meta_form enable row level security;
create policy meta_form_select on public.meta_form for select to authenticated using (public.is_member());
create policy meta_form_insert on public.meta_form for insert to authenticated with check (public.is_member());
create policy meta_form_update on public.meta_form for update to authenticated using (public.is_member()) with check (public.is_member());

-- Primeiro valor de uma resposta do formulário (field_data: [{name, values: [...]}]).
create or replace function public.meta_answer(p_answers jsonb, variadic p_keys text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(trim(p_answers -> k ->> 0), '')
  from unnest(p_keys) with ordinality as x (k, pos)
  where nullif(trim(p_answers -> k ->> 0), '') is not null
  order by pos
  limit 1;
$$;

-- p_lead: resposta da Graph API para o lead (id, created_time, ad_id, form_id, field_data, ...).
-- p_change: o "value" do webhook leadgen (leadgen_id, page_id, form_id, adgroup_id, ad_id, created_time).
-- Regras (especificação, seção 4.7): canal INSTANT_FORM, origem Meta Ads, tipo do formulário,
-- situação Novo; dado faltando não impede a entrada (fica "completar dados"); mesmo lead_id não duplica.
create or replace function public.ingest_meta_lead(p_lead jsonb, p_change jsonb default '{}'::jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_meta_lead_id text := coalesce(p_lead ->> 'id', p_change ->> 'leadgen_id');
  v_form_id text := coalesce(p_lead ->> 'form_id', p_change ->> 'form_id');
  v_existing uuid;
  v_answers jsonb;
  v_form public.meta_form%rowtype;
  v_full_name text;
  v_whatsapp text;
  v_country text;
  v_revenue text;
  v_goal text;
  v_is_test boolean;
  v_lead_id uuid;
begin
  if v_meta_lead_id is null then raise exception 'META_LEAD_ID_REQUIRED'; end if;

  select id into v_existing from public.lead where meta_lead_id = v_meta_lead_id;
  if found then return v_existing; end if;

  -- Respostas como objeto: nome da pergunta -> lista de valores.
  select coalesce(jsonb_object_agg(f ->> 'name', f -> 'values'), '{}'::jsonb)
    into v_answers
    from jsonb_array_elements(coalesce(p_lead -> 'field_data', '[]'::jsonb)) f;

  -- Formulário novo fica registrado para configurar o tipo de lead depois.
  if v_form_id is not null then
    insert into public.meta_form (form_id, page_id)
    values (v_form_id, p_change ->> 'page_id')
    on conflict (form_id) do nothing;
    select * into v_form from public.meta_form where form_id = v_form_id;
  end if;

  v_full_name := coalesce(
    public.meta_answer(v_answers, 'full_name'),
    nullif(trim(concat_ws(' ', public.meta_answer(v_answers, 'first_name'), public.meta_answer(v_answers, 'last_name'))), ''),
    'Lead da Meta'
  );

  v_whatsapp := public.normalize_whatsapp(public.meta_answer(v_answers, 'whatsapp_number', 'phone_number', 'work_phone_number'));
  -- Número fora das regras do banco entra vazio (fica nas respostas) para o lead não se perder.
  if v_whatsapp is not null and not (
    v_whatsapp ~ '^[1-9][0-9]{7,14}$'
    and (
      (v_whatsapp like '34%' and length(v_whatsapp) = 11)
      or (v_whatsapp like '55%' and length(v_whatsapp) in (12, 13))
      or (v_whatsapp not like '34%' and v_whatsapp not like '55%')
    )
  ) then
    v_whatsapp := null;
  end if;

  v_country := upper(public.meta_answer(v_answers, 'country'));
  if v_country not in ('ES', 'BR') then v_country := null; end if;
  v_country := coalesce(
    v_country,
    v_form.default_country,
    case when v_whatsapp like '34%' then 'ES' when v_whatsapp like '55%' then 'BR' end
  );

  v_revenue := upper(public.meta_answer(v_answers, 'faturamento_mensal', 'revenue_band'));
  if v_revenue not in ('UP_TO_5K', 'FROM_5K_TO_10K', 'FROM_10K_TO_20K', 'ABOVE_20K', 'NOT_INFORMED') then v_revenue := null; end if;

  v_goal := upper(public.meta_answer(v_answers, 'objetivo_principal', 'main_goal'));
  if v_goal not in ('MORE_CUSTOMERS', 'BRAND', 'ORGANIZE_MARKETING', 'TRAIN_TEAM') then v_goal := null; end if;

  -- A Ferramenta de teste de Lead Ads preenche as respostas com "<test lead: ...>".
  select exists (
    select 1 from jsonb_each(v_answers) a, jsonb_array_elements_text(a.value) val
    where val like '<test lead%'
  ) into v_is_test;

  insert into public.lead (
    full_name, company_name, whatsapp, email, country,
    lead_type_id, lead_source_id, capture_channel, revenue_band, main_goal,
    stage, queue_status, owner_id, needs_completion, is_test, form_answers,
    meta_lead_id, meta_form_id, meta_form_name, meta_page_id, meta_ad_id, meta_ad_name,
    meta_adset_id, meta_adset_name, meta_campaign_id, meta_campaign_name, meta_platform,
    meta_is_organic, meta_created_at, meta_consents, meta_raw
  )
  values (
    v_full_name,
    public.meta_answer(v_answers, 'company_name'),
    v_whatsapp,
    public.meta_answer(v_answers, 'email', 'work_email'),
    v_country,
    v_form.lead_type_id,
    (select id from public.lead_source where name = 'Meta Ads' and deleted_at is null limit 1),
    'INSTANT_FORM',
    v_revenue,
    v_goal,
    'NEW',
    'NEW',
    v_form.default_owner_id,
    (v_whatsapp is null or v_country is null or v_form.lead_type_id is null),
    v_is_test,
    v_answers,
    v_meta_lead_id,
    v_form_id,
    v_form.name,
    p_change ->> 'page_id',
    coalesce(p_lead ->> 'ad_id', p_change ->> 'ad_id'),
    p_lead ->> 'ad_name',
    coalesce(p_lead ->> 'adset_id', p_change ->> 'adgroup_id'),
    p_lead ->> 'adset_name',
    p_lead ->> 'campaign_id',
    p_lead ->> 'campaign_name',
    p_lead ->> 'platform',
    case p_lead ->> 'is_organic' when 'true' then true when '1' then true when 'false' then false when '0' then false end,
    coalesce((p_lead ->> 'created_time')::timestamptz, to_timestamp((p_change ->> 'created_time')::bigint)),
    p_lead -> 'custom_disclaimer_responses',
    jsonb_build_object('lead', p_lead, 'webhook', p_change)
  )
  on conflict (meta_lead_id) do nothing
  returning id into v_lead_id;

  if v_lead_id is null then
    select id into v_lead_id from public.lead where meta_lead_id = v_meta_lead_id;
  end if;

  if v_form_id is not null then
    update public.meta_form set last_lead_at = now() where form_id = v_form_id;
  end if;

  return v_lead_id;
end;
$$;

-- Só a Edge Function (chave secreta, papel service_role) grava leads da Meta.
revoke execute on function public.ingest_meta_lead(jsonb, jsonb) from anon, authenticated, public;
revoke execute on function public.meta_answer(jsonb, text[]) from anon, public;
grant execute on function public.ingest_meta_lead(jsonb, jsonb) to service_role;
grant execute on function public.meta_answer(jsonb, text[]) to authenticated, service_role;
