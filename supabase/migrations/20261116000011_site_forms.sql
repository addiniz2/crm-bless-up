-- BU-19: formulários do site (motor configurável) — decisões de 16/11/2026.
-- * A página pública fala só com a Edge Function site-form; as funções abaixo só rodam com service_role.
-- * Formulário = configuração (etapas, perguntas, opções com códigos, regra de MQL, textos, moeda).
-- * Dois momentos: ao concluir a tela de contato o lead já nasce (evento FirstInteraction);
--   ao concluir o formulário, as respostas completam o mesmo lead (SubmitScheduled e, se for o caso, LeadMQL).
-- * MQL: respondeu Sim ao investimento mínimo (o faturamento não altera).

-- 1. Faixas de faturamento novas (mesmos códigos para EUR e BRL; o rótulo segue a moeda)
alter table public.lead drop constraint if exists lead_revenue_band_check;

-- Faixas antigas (só dados de demonstração e testes) passam a "Não informado"
select set_config('crm.stage_change', 'on', true);
update public.lead set revenue_band = 'NOT_INFORMED'
where revenue_band in ('UP_TO_5K', 'FROM_5K_TO_10K', 'FROM_10K_TO_20K', 'ABOVE_20K');
select set_config('crm.stage_change', 'off', true);

alter table public.lead add constraint lead_revenue_band_check check (
  revenue_band is null
  or revenue_band in ('UP_TO_4K', 'FROM_4K_TO_7K', 'FROM_7K_TO_10K', 'FROM_10K_TO_15K', 'ABOVE_15K', 'NOT_INFORMED')
);
comment on column public.lead.revenue_band is
  'Faturamento mensal. Moeda pelo país (BR em BRL; Europa em EUR). UP_TO_4K, FROM_4K_TO_7K, FROM_7K_TO_10K, FROM_10K_TO_15K, ABOVE_15K, NOT_INFORMED';

-- 2. Respostas de investimento e vínculo com o formulário
alter table public.lead
  add column ad_budget_fit boolean,
  add column ad_budget_range text check (ad_budget_range in ('BUDGET_HIGH', 'BUDGET_MID', 'BUDGET_LOW')),
  add column site_form_id uuid,
  add column form_submission_id uuid unique,
  add column form_completed_at timestamptz;

comment on column public.lead.ad_budget_fit is 'Respondeu Sim (true) ou Não (false) ao investimento mínimo em anúncios';
comment on column public.lead.ad_budget_range is
  'Quanto investiria, para quem respondeu Não: BUDGET_HIGH (200-300 €/mês), BUDGET_MID (150-200), BUDGET_LOW (<150); em BRL os valores equivalentes';

-- 3. Formulários
create table public.site_form (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  active boolean not null default true,
  language text not null default 'pt-BR',
  currency text not null check (currency in ('EUR', 'BRL')),
  default_country text not null check (default_country ~ '^[A-Z]{2}$'),
  lead_type_id uuid references public.lead_type (id),
  lead_source_id uuid references public.lead_source (id),
  meta_pixel_id text check (meta_pixel_id ~ '^[0-9]{5,20}$'),
  definition jsonb not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.lead
  add constraint lead_site_form_fk foreign key (site_form_id) references public.site_form (id);

create trigger site_form_audit before insert or update on public.site_form
for each row execute function public.set_audit_fields();

alter table public.site_form enable row level security;
create policy site_form_select on public.site_form for select to authenticated using (public.is_member());
create policy site_form_insert on public.site_form for insert to authenticated with check (public.is_member());
create policy site_form_update on public.site_form for update to authenticated using (public.is_member()) with check (public.is_member());

-- 4. País pelo código do telefone (o lead do formulário informa só o telefone)
create or replace function public.country_from_whatsapp(p_whatsapp text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_whatsapp is null then null
    when p_whatsapp like '351%' then 'PT'
    when p_whatsapp like '352%' then 'LU'
    when p_whatsapp like '353%' then 'IE'
    when p_whatsapp like '55%' then 'BR'
    when p_whatsapp like '34%' then 'ES'
    when p_whatsapp like '44%' then 'GB'
    when p_whatsapp like '33%' then 'FR'
    when p_whatsapp like '39%' then 'IT'
    when p_whatsapp like '49%' then 'DE'
    when p_whatsapp like '41%' then 'CH'
    when p_whatsapp like '43%' then 'AT'
    when p_whatsapp like '31%' then 'NL'
    when p_whatsapp like '32%' then 'BE'
  end;
$$;

-- Normaliza o @ do Instagram (aceita @usuario, usuario ou URL do perfil)
create or replace function public.normalize_instagram(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when h ~ '^[A-Za-z0-9._]{1,30}$' then lower(h) end
  from (
    select trim(both '/' from regexp_replace(
      regexp_replace(trim(coalesce(p_value, '')), '^(https?://)?(www\.)?instagram\.com/', '', 'i'),
      '^@', '')) as h
  ) x;
$$;

-- Etapas visíveis de um formulário dado o conjunto de respostas (regra showIf: {key, equals})
create or replace function public.site_form_visible_fields(p_definition jsonb, p_answers jsonb)
returns setof jsonb
language sql
immutable
set search_path = ''
as $$
  select f.field
  from jsonb_array_elements(p_definition -> 'steps') with ordinality as s (step, step_no)
  cross join lateral jsonb_array_elements(s.step -> 'fields') as f (field)
  where s.step_no > 1
    and (s.step -> 'showIf' is null
         or p_answers ->> (s.step -> 'showIf' ->> 'key') = s.step -> 'showIf' ->> 'equals');
$$;

-- Versão pública (sem dados internos) para a página do formulário
create or replace function public.site_form_public(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', f.slug, 'language', f.language, 'currency', f.currency, 'defaultCountry', f.default_country,
    'metaPixelId', f.meta_pixel_id, 'definition', f.definition
  )
  from public.site_form f
  where f.slug = lower(p_slug) and f.active and f.deleted_at is null;
$$;

-- Tela de contato concluída: cria o lead. Erros devolvidos como código para a página traduzir.
create or replace function public.site_form_start(p_slug text, p_answers jsonb, p_tracking jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.site_form%rowtype;
  v_name text := nullif(trim(p_answers ->> 'full_name'), '');
  v_instagram text := public.normalize_instagram(p_answers ->> 'instagram_handle');
  v_whatsapp text := public.normalize_whatsapp(p_answers ->> 'whatsapp');
  v_country text;
  v_source uuid;
  v_submission uuid := gen_random_uuid();
  v_meta boolean;
begin
  select * into v_form from public.site_form
  where slug = lower(p_slug) and active and deleted_at is null;
  if not found then raise exception 'FORM_NOT_FOUND'; end if;

  if v_name is null or length(v_name) < 2 or length(v_name) > 120 then raise exception 'NAME_INVALID'; end if;
  if v_instagram is null then raise exception 'INSTAGRAM_INVALID'; end if;
  if v_whatsapp is null or length(v_whatsapp) < 8 or length(v_whatsapp) > 15 then raise exception 'WHATSAPP_INVALID'; end if;
  if (v_whatsapp like '34%' and length(v_whatsapp) <> 11)
     or (v_whatsapp like '55%' and length(v_whatsapp) not in (12, 13)) then
    raise exception 'WHATSAPP_INVALID';
  end if;

  v_country := coalesce(public.country_from_whatsapp(v_whatsapp), v_form.default_country);
  v_meta := lower(coalesce(p_tracking ->> 'utm_source', '')) in ('ig', 'fb', 'facebook', 'instagram', 'meta')
            or nullif(p_tracking ->> 'fbclid', '') is not null;
  v_source := case when v_meta
    then (select id from public.lead_source where name = 'Meta Ads' and deleted_at is null limit 1)
    else v_form.lead_source_id end;

  insert into public.lead (
    full_name, instagram_handle, whatsapp, country, lead_type_id, lead_source_id, capture_channel,
    site_form_id, form_submission_id, form_answers, needs_completion,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, fbc, fbp, gclid, page_url, client_ip, user_agent, cookie_consent
  ) values (
    v_name, v_instagram, v_whatsapp, v_country, v_form.lead_type_id, v_source, 'WEBSITE',
    v_form.id, v_submission,
    jsonb_build_object('form', v_form.slug, 'answers', p_answers - 'whatsapp',
                       'events', coalesce(p_tracking -> 'events', '{}'::jsonb)),
    v_form.lead_type_id is null,
    left(p_tracking ->> 'utm_source', 200), left(p_tracking ->> 'utm_medium', 200), left(p_tracking ->> 'utm_campaign', 200),
    left(p_tracking ->> 'utm_content', 200), left(p_tracking ->> 'utm_term', 200),
    left(p_tracking ->> 'fbclid', 500), left(p_tracking ->> 'fbc', 500), left(p_tracking ->> 'fbp', 200),
    left(p_tracking ->> 'gclid', 500), left(p_tracking ->> 'page_url', 1000),
    case when coalesce(p_tracking ->> 'client_ip', '') ~ '^[0-9a-fA-F:.]+$' then (p_tracking ->> 'client_ip')::inet end,
    left(p_tracking ->> 'user_agent', 500),
    (p_tracking ->> 'cookie_consent')::boolean
  );

  return jsonb_build_object('submissionId', v_submission);
end;
$$;

-- Formulário concluído: valida as respostas visíveis contra a definição e completa o lead.
create or replace function public.site_form_finish(p_submission_id uuid, p_answers jsonb, p_events jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.lead%rowtype;
  v_form public.site_form%rowtype;
  v_field jsonb;
  v_value text;
  v_is_mql boolean;
begin
  select * into v_lead from public.lead
  where form_submission_id = p_submission_id and deleted_at is null
  for update;
  if not found then raise exception 'SUBMISSION_NOT_FOUND'; end if;
  if v_lead.form_completed_at is not null then raise exception 'SUBMISSION_ALREADY_COMPLETED'; end if;
  if v_lead.created_at < now() - interval '24 hours' then raise exception 'SUBMISSION_EXPIRED'; end if;

  select * into v_form from public.site_form where id = v_lead.site_form_id;

  for v_field in select * from public.site_form_visible_fields(v_form.definition, p_answers) loop
    v_value := p_answers ->> (v_field ->> 'key');
    if v_value is null then
      if coalesce((v_field ->> 'required')::boolean, false) then raise exception 'ANSWER_MISSING'; end if;
    elsif v_field ->> 'type' = 'choice' and not exists (
      select 1 from jsonb_array_elements(v_field -> 'options') o where o ->> 'code' = v_value
    ) then
      raise exception 'ANSWER_INVALID';
    end if;
  end loop;

  v_is_mql := case when v_form.definition -> 'mql' is null then null
    else p_answers ->> (v_form.definition -> 'mql' ->> 'key') = v_form.definition -> 'mql' ->> 'equals' end;

  update public.lead set
    revenue_band = coalesce(p_answers ->> 'revenue_band', revenue_band),
    ad_budget_fit = case p_answers ->> 'ad_budget_fit' when 'YES' then true when 'NO' then false else ad_budget_fit end,
    ad_budget_range = case when p_answers ->> 'ad_budget_fit' = 'NO' then p_answers ->> 'ad_budget_range' end,
    is_mql = v_is_mql,
    form_completed_at = now(),
    form_answers = jsonb_set(
      jsonb_set(coalesce(form_answers, '{}'::jsonb), '{answers}',
                coalesce(form_answers -> 'answers', '{}'::jsonb) || p_answers),
      '{events}', coalesce(form_answers -> 'events', '{}'::jsonb) || coalesce(p_events, '{}'::jsonb))
  where id = v_lead.id;

  return jsonb_build_object('isMql', v_is_mql);
end;
$$;

revoke execute on function public.site_form_public(text) from anon, authenticated, public;
revoke execute on function public.site_form_start(text, jsonb, jsonb) from anon, authenticated, public;
revoke execute on function public.site_form_finish(uuid, jsonb, jsonb) from anon, authenticated, public;
grant execute on function public.site_form_public(text) to service_role;
grant execute on function public.site_form_start(text, jsonb, jsonb) to service_role;
grant execute on function public.site_form_finish(uuid, jsonb, jsonb) to service_role;

-- 5. Entrada pela Meta (BU-14, adiado) passa a conhecer as faixas e os países novos
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
  if v_country !~ '^[A-Z]{2}$' then v_country := null; end if;
  v_country := coalesce(
    v_country,
    v_form.default_country,
    case when v_whatsapp like '34%' then 'ES' when v_whatsapp like '55%' then 'BR' end
  );

  v_revenue := upper(public.meta_answer(v_answers, 'faturamento_mensal', 'revenue_band'));
  if v_revenue not in ('UP_TO_4K', 'FROM_4K_TO_7K', 'FROM_7K_TO_10K', 'FROM_10K_TO_15K', 'ABOVE_15K', 'NOT_INFORMED') then v_revenue := null; end if;

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

-- 6. Primeiros formulários (Form Shark da Chronos, simplificado). Textos de conteúdo ficam na configuração.
-- Valores em BRL provisórios até a homologação (PTAX ~6,17, arredondados).
insert into public.site_form (slug, name, currency, default_country, lead_type_id, lead_source_id, meta_pixel_id, definition)
select v.slug, v.name, v.currency, v.country,
  (select id from public.lead_type where name = 'Gestão de tráfego pago (Meta e Google)' limit 1),
  (select id from public.lead_source where name = 'Orgânico' limit 1),
  '1636124017934576', v.definition
from (values
  ('espanha', 'Empresário brasileiro na Europa (EUR)', 'EUR', 'ES', '{"intro": {"title": "Empresário brasileiro na Europa: clientes prontos pra fechar", "bullets": ["Mais visibilidade para sua marca", "Anúncios segmentados", "Filtro que qualifica o lead", "15+ anos de experiência em marketing"], "note": "Exclusivo para empresários brasileiros na Europa que já faturam acima de 4.000 €/mês e querem crescer com previsibilidade."}, "steps": [{"id": "contact", "fields": [{"key": "full_name", "type": "text", "label": "Qual é o seu nome?", "required": true}, {"key": "instagram_handle", "type": "instagram", "label": "Qual é o @ da sua empresa no Instagram?", "required": true}, {"key": "whatsapp", "type": "phone", "label": "Qual é o seu telefone (WhatsApp)?", "required": true}]}, {"id": "revenue", "fields": [{"key": "revenue_band", "type": "choice", "label": "Qual é o faturamento da sua empresa?", "required": true, "options": [{"code": "UP_TO_4K", "label": "Até 4.000 € por mês"}, {"code": "FROM_4K_TO_7K", "label": "De 4.000 € a 7.000 € por mês"}, {"code": "FROM_7K_TO_10K", "label": "De 7.000 € a 10.000 € por mês"}, {"code": "FROM_10K_TO_15K", "label": "De 10.000 € a 15.000 € por mês"}, {"code": "ABOVE_15K", "label": "Mais de 15.000 € por mês"}]}]}, {"id": "budget", "fields": [{"key": "ad_budget_fit", "type": "choice", "description": "Recomendamos um investimento mínimo de 10 €/dia (cerca de 300 €/mês) em anúncios.", "label": "Esse valor cabe no seu orçamento atual?", "required": true, "options": [{"code": "YES", "label": "Sim! Estou pronto para levar o meu negócio para o próximo nível."}, {"code": "NO", "label": "Não! Esse valor está acima do que posso investir agora."}]}]}, {"id": "budget_range", "showIf": {"key": "ad_budget_fit", "equals": "NO"}, "fields": [{"key": "ad_budget_range", "type": "choice", "description": "Sem problema! Pra sabermos se temos uma solução pro seu momento atual:", "label": "Quanto você conseguiria investir em anúncios agora?", "required": true, "options": [{"code": "BUDGET_HIGH", "label": "Entre 200 € e 300 €/mês"}, {"code": "BUDGET_MID", "label": "Entre 150 € e 200 €/mês"}, {"code": "BUDGET_LOW", "label": "Menos de 150 €/mês"}]}]}], "mql": {"key": "ad_budget_fit", "equals": "YES"}, "thanks": {"title": "Recebemos seus dados! 🚀", "body": "Em breve nossa equipe entra em contato pra falarmos sobre como escalar a captação de clientes.\n\nVamos crescer juntos!\nBless Up Marketing"}}'::jsonb),
  ('brasil', 'Empresário no Brasil (BRL)', 'BRL', 'BR', '{"intro": {"title": "Empresário: clientes prontos pra fechar", "bullets": ["Mais visibilidade para sua marca", "Anúncios segmentados", "Filtro que qualifica o lead", "15+ anos de experiência em marketing"], "note": "Exclusivo para empresários que já faturam acima de R$ 25.000/mês e querem crescer com previsibilidade."}, "steps": [{"id": "contact", "fields": [{"key": "full_name", "type": "text", "label": "Qual é o seu nome?", "required": true}, {"key": "instagram_handle", "type": "instagram", "label": "Qual é o @ da sua empresa no Instagram?", "required": true}, {"key": "whatsapp", "type": "phone", "label": "Qual é o seu telefone (WhatsApp)?", "required": true}]}, {"id": "revenue", "fields": [{"key": "revenue_band", "type": "choice", "label": "Qual é o faturamento da sua empresa?", "required": true, "options": [{"code": "UP_TO_4K", "label": "Até R$ 25.000 por mês"}, {"code": "FROM_4K_TO_7K", "label": "De R$ 25.000 a R$ 43.000 por mês"}, {"code": "FROM_7K_TO_10K", "label": "De R$ 43.000 a R$ 62.000 por mês"}, {"code": "FROM_10K_TO_15K", "label": "De R$ 62.000 a R$ 93.000 por mês"}, {"code": "ABOVE_15K", "label": "Mais de R$ 93.000 por mês"}]}]}, {"id": "budget", "fields": [{"key": "ad_budget_fit", "type": "choice", "description": "Recomendamos um investimento mínimo de R$ 60/dia (cerca de R$ 1.850/mês) em anúncios.", "label": "Esse valor cabe no seu orçamento atual?", "required": true, "options": [{"code": "YES", "label": "Sim! Estou pronto para levar o meu negócio para o próximo nível."}, {"code": "NO", "label": "Não! Esse valor está acima do que posso investir agora."}]}]}, {"id": "budget_range", "showIf": {"key": "ad_budget_fit", "equals": "NO"}, "fields": [{"key": "ad_budget_range", "type": "choice", "description": "Sem problema! Pra sabermos se temos uma solução pro seu momento atual:", "label": "Quanto você conseguiria investir em anúncios agora?", "required": true, "options": [{"code": "BUDGET_HIGH", "label": "Entre R$ 1.200 e R$ 1.850/mês"}, {"code": "BUDGET_MID", "label": "Entre R$ 900 e R$ 1.200/mês"}, {"code": "BUDGET_LOW", "label": "Menos de R$ 900/mês"}]}]}], "mql": {"key": "ad_budget_fit", "equals": "YES"}, "thanks": {"title": "Recebemos seus dados! 🚀", "body": "Em breve nossa equipe entra em contato pra falarmos sobre como escalar a captação de clientes.\n\nVamos crescer juntos!\nBless Up Marketing"}}'::jsonb)
) as v (slug, name, currency, country, definition)
on conflict (slug) do nothing;
