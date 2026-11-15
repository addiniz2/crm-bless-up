-- CRM Bless Up: modelo de dados do núcleo (BU-02/BU-03)
-- Regras: UUID, exclusão lógica, auditoria em toda tabela, códigos (não rótulos), RLS em tudo.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

create or replace function public.set_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usuárias
-- ---------------------------------------------------------------------------

create table public.app_user (
  id uuid primary key references auth.users (id),
  full_name text not null,
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Só usuárias cadastradas e ativas enxergam dados.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_user u
    where u.id = auth.uid() and u.active
  );
$$;

-- ---------------------------------------------------------------------------
-- Listas configuráveis
-- ---------------------------------------------------------------------------

create table public.lead_type (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.lead_source (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.reason (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('DISQUALIFICATION', 'LOSS')),
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.message_template (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text not null check (language in ('pt-BR', 'es-ES')),
  body text not null,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------------------
-- Conta, contato
-- ---------------------------------------------------------------------------

create table public.account (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'ORGANIZATION' check (kind in ('ORGANIZATION', 'PERSON')),
  country text not null check (country in ('ES', 'BR')),
  is_customer boolean not null default false,
  customer_since date,
  owner_id uuid references public.app_user (id),
  source_lead_id uuid,
  external_id text unique,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.contact (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.account (id),
  full_name text not null,
  whatsapp text,
  email text,
  job_title text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------------------
-- Lead
-- ---------------------------------------------------------------------------

create table public.lead (
  id uuid primary key default gen_random_uuid(),

  -- Contato
  full_name text not null,
  company_name text,
  whatsapp text check (whatsapp is null or whatsapp ~ '^[1-9][0-9]{7,14}$'),
  email text,
  country text check (country in ('ES', 'BR')),

  -- Negócio
  lead_type_id uuid references public.lead_type (id),
  lead_source_id uuid references public.lead_source (id),
  capture_channel text not null default 'MANUAL' check (capture_channel in (
    'WEBSITE', 'INSTANT_FORM', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM_DIRECT', 'PHONE_CALL', 'MANUAL', 'IMPORT'
  )),
  revenue_band text,
  main_goal text check (main_goal in ('MORE_CUSTOMERS', 'BRAND', 'ORGANIZE_MARKETING', 'TRAIN_TEAM')),
  how_found text,
  notes text,
  fit text check (fit in ('HIGH', 'MEDIUM', 'LOW')),

  -- Funil (etapa) e fila (situação): campos separados
  stage text not null default 'NEW' check (stage in (
    'NEW', 'CONTACTED', 'RECONTACT', 'MEETING_SCHEDULED', 'NO_SHOW', 'DISQUALIFIED', 'CONVERTED'
  )),
  queue_status text not null default 'NEW' check (queue_status in (
    'NEW', 'TO_REPLY', 'IN_PROGRESS', 'AWAITING_REPLY'
  )),
  owner_id uuid references public.app_user (id),
  next_step text,
  next_step_at timestamptz,
  last_contact_at timestamptz,
  disqualification_reason_id uuid references public.reason (id),

  -- Conversão
  converted_at timestamptz,
  converted_account_id uuid references public.account (id),
  converted_opportunity_id uuid,

  -- Qualidade dos dados
  needs_completion boolean not null default false,
  is_test boolean not null default false,

  -- Atribuição (UTMs e identificadores de clique, sem hash)
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  fbclid text,
  fbc text,
  fbp text,
  gclid text,
  ctwa_clid text,
  meta_lead_id text unique,
  meta_form_id text,
  meta_ad_id text,
  meta_campaign_id text,
  page_url text,
  client_ip inet,
  user_agent text,
  cookie_consent boolean,
  form_answers jsonb,

  external_id text unique,
  anonymized_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,

  -- Lead de entrada manual precisa de WhatsApp, país e tipo; leads da Meta podem chegar incompletos
  constraint lead_required_fields check (
    needs_completion or anonymized_at is not null
    or (whatsapp is not null and country is not null and lead_type_id is not null)
  ),
  constraint lead_disqualification_reason check (
    stage <> 'DISQUALIFIED' or disqualification_reason_id is not null
  )
);

create index lead_stage_idx on public.lead (stage) where deleted_at is null;
create index lead_owner_idx on public.lead (owner_id) where deleted_at is null;
create index lead_next_step_idx on public.lead (next_step_at) where deleted_at is null;
create index lead_whatsapp_idx on public.lead (whatsapp);
create index lead_email_idx on public.lead (lower(email));

-- ---------------------------------------------------------------------------
-- Oportunidade e carteira de clientes
-- ---------------------------------------------------------------------------

create table public.opportunity (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.account (id),
  contact_id uuid references public.contact (id),
  stage text not null default 'PROPOSAL_SENT' check (stage in ('PROPOSAL_SENT', 'FOLLOW_UP', 'WON', 'LOST')),
  monthly_value numeric(15, 2),
  currency text not null check (currency in ('EUR', 'BRL')),
  expected_close_date date,
  owner_id uuid references public.app_user (id),
  loss_reason_id uuid references public.reason (id),
  source_lead_id uuid references public.lead (id),
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint opportunity_loss_reason check (stage <> 'LOST' or loss_reason_id is not null)
);

alter table public.lead
  add constraint lead_converted_opportunity_fk
  foreign key (converted_opportunity_id) references public.opportunity (id);
alter table public.account
  add constraint account_source_lead_fk
  foreign key (source_lead_id) references public.lead (id);

create table public.customer_profile (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.account (id),
  monthly_fee numeric(15, 2),
  currency text not null check (currency in ('EUR', 'BRL')),
  start_date date,
  renewal_date date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'CANCELLATION_NOTICE', 'CANCELLED')),
  health_score integer check (health_score between 0 and 100),
  health_signals jsonb not null default '[]'::jsonb,
  owner_id uuid references public.app_user (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------------------
-- Atividades e histórico
-- ---------------------------------------------------------------------------

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.lead (id),
  account_id uuid references public.account (id),
  opportunity_id uuid references public.opportunity (id),
  kind text not null check (kind in (
    'CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE', 'PAUSE', 'CANCELLATION_NOTICE', 'SYSTEM'
  )),
  body text,
  occurred_at timestamptz not null default now(),
  next_step text,
  next_step_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint activity_has_parent check (num_nonnulls(lead_id, account_id, opportunity_id) > 0)
);

create index activity_lead_idx on public.activity (lead_id, occurred_at desc);
create index activity_account_idx on public.activity (account_id, occurred_at desc);

create table public.stage_history (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('LEAD', 'OPPORTUNITY')),
  entity_id uuid not null,
  field text not null default 'stage' check (field in ('stage', 'queue_status', 'owner_id')),
  from_value text,
  to_value text,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index stage_history_entity_idx on public.stage_history (entity, entity_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Gatilhos de auditoria
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'app_user', 'lead_type', 'lead_source', 'reason', 'message_template', 'account', 'contact',
    'lead', 'opportunity', 'customer_profile', 'activity', 'stage_history'
  ] loop
    execute format(
      'create trigger %I_audit before insert or update on public.%I for each row execute function public.set_audit_fields()',
      t, t
    );
  end loop;
end;
$$;

-- Histórico automático de mudança de responsável e de situação do lead
create or replace function public.log_lead_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    insert into public.stage_history (entity, entity_id, field, from_value, to_value)
    values ('LEAD', new.id, 'owner_id', old.owner_id::text, new.owner_id::text);
  end if;
  if new.queue_status is distinct from old.queue_status then
    insert into public.stage_history (entity, entity_id, field, from_value, to_value)
    values ('LEAD', new.id, 'queue_status', old.queue_status, new.queue_status);
  end if;
  return new;
end;
$$;

create trigger lead_log_changes after update on public.lead
for each row execute function public.log_lead_changes();

-- Etapa só muda pelas funções abaixo (exceção: a própria função grava com a flag de sessão)
create or replace function public.guard_stage_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage
     and coalesce(current_setting('crm.stage_change', true), '') <> 'on' then
    raise exception 'STAGE_CHANGE_NOT_ALLOWED' using hint = 'use change_lead_stage / change_opportunity_stage / convert_lead';
  end if;
  if tg_table_name = 'lead' and old.stage = 'CONVERTED'
     and coalesce(current_setting('crm.stage_change', true), '') <> 'on' then
    raise exception 'LEAD_READ_ONLY';
  end if;
  return new;
end;
$$;

create trigger lead_guard_stage before update on public.lead
for each row execute function public.guard_stage_change();
create trigger opportunity_guard_stage before update on public.opportunity
for each row execute function public.guard_stage_change();

-- ---------------------------------------------------------------------------
-- Regras de negócio (transações únicas)
-- ---------------------------------------------------------------------------

create or replace function public.change_lead_stage(p_lead_id uuid, p_stage text, p_reason_id uuid default null)
returns void
language plpgsql
set search_path = ''
as $$
declare v_old text;
begin
  if p_stage in ('CONVERTED') then
    raise exception 'USE_CONVERT_LEAD';
  end if;

  select stage into v_old from public.lead
  where id = p_lead_id and deleted_at is null
  for update;

  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if v_old = 'CONVERTED' then raise exception 'LEAD_READ_ONLY'; end if;
  if v_old = p_stage then return; end if;
  if p_stage = 'DISQUALIFIED' and p_reason_id is null then
    raise exception 'DISQUALIFICATION_REASON_REQUIRED';
  end if;

  perform set_config('crm.stage_change', 'on', true);
  update public.lead
     set stage = p_stage,
         disqualification_reason_id = case when p_stage = 'DISQUALIFIED' then p_reason_id else null end
   where id = p_lead_id;
  perform set_config('crm.stage_change', 'off', true);

  insert into public.stage_history (entity, entity_id, field, from_value, to_value)
  values ('LEAD', p_lead_id, 'stage', v_old, p_stage);
end;
$$;

-- Converter: tudo ou nada. Cria conta, contato (se organização) e oportunidade,
-- leva as atividades do lead para a conta e deixa o lead somente leitura.
create or replace function public.convert_lead(
  p_lead_id uuid,
  p_account_name text,
  p_account_kind text,
  p_monthly_value numeric,
  p_currency text,
  p_expected_close_date date default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lead public.lead%rowtype;
  v_account_id uuid;
  v_contact_id uuid;
  v_opportunity_id uuid;
begin
  select * into v_lead from public.lead
  where id = p_lead_id and deleted_at is null
  for update;

  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if v_lead.stage in ('CONVERTED', 'DISQUALIFIED') then raise exception 'LEAD_NOT_CONVERTIBLE'; end if;
  if v_lead.needs_completion or v_lead.country is null then raise exception 'LEAD_INCOMPLETE'; end if;
  if p_currency not in ('EUR', 'BRL') then raise exception 'INVALID_CURRENCY'; end if;

  insert into public.account (name, kind, country, owner_id, source_lead_id)
  values (coalesce(nullif(trim(p_account_name), ''), v_lead.company_name, v_lead.full_name),
          p_account_kind, v_lead.country, v_lead.owner_id, v_lead.id)
  returning id into v_account_id;

  if p_account_kind = 'ORGANIZATION' then
    insert into public.contact (account_id, full_name, whatsapp, email)
    values (v_account_id, v_lead.full_name, v_lead.whatsapp, v_lead.email)
    returning id into v_contact_id;
  end if;

  insert into public.opportunity (account_id, contact_id, monthly_value, currency, expected_close_date, owner_id, source_lead_id)
  values (v_account_id, v_contact_id, p_monthly_value, p_currency, p_expected_close_date, v_lead.owner_id, v_lead.id)
  returning id into v_opportunity_id;

  update public.activity set account_id = v_account_id
  where lead_id = v_lead.id and account_id is null;

  perform set_config('crm.stage_change', 'on', true);
  update public.lead
     set stage = 'CONVERTED',
         converted_at = now(),
         converted_account_id = v_account_id,
         converted_opportunity_id = v_opportunity_id
   where id = v_lead.id;
  perform set_config('crm.stage_change', 'off', true);

  insert into public.stage_history (entity, entity_id, field, from_value, to_value)
  values ('LEAD', v_lead.id, 'stage', v_lead.stage, 'CONVERTED'),
         ('OPPORTUNITY', v_opportunity_id, 'stage', null, 'PROPOSAL_SENT');

  return jsonb_build_object('account_id', v_account_id, 'contact_id', v_contact_id, 'opportunity_id', v_opportunity_id);
end;
$$;

-- Ganho transforma a conta em cliente (cliente desde = primeira venda) e abre a ficha da carteira.
create or replace function public.change_opportunity_stage(p_opportunity_id uuid, p_stage text, p_reason_id uuid default null)
returns void
language plpgsql
set search_path = ''
as $$
declare v_opp public.opportunity%rowtype;
begin
  select * into v_opp from public.opportunity
  where id = p_opportunity_id and deleted_at is null
  for update;

  if not found then raise exception 'OPPORTUNITY_NOT_FOUND'; end if;
  if v_opp.stage in ('WON', 'LOST') then raise exception 'OPPORTUNITY_CLOSED'; end if;
  if v_opp.stage = p_stage then return; end if;
  if p_stage = 'LOST' and p_reason_id is null then raise exception 'LOSS_REASON_REQUIRED'; end if;

  perform set_config('crm.stage_change', 'on', true);
  update public.opportunity
     set stage = p_stage,
         loss_reason_id = case when p_stage = 'LOST' then p_reason_id else null end,
         closed_at = case when p_stage in ('WON', 'LOST') then now() else null end
   where id = p_opportunity_id;
  perform set_config('crm.stage_change', 'off', true);

  insert into public.stage_history (entity, entity_id, field, from_value, to_value)
  values ('OPPORTUNITY', p_opportunity_id, 'stage', v_opp.stage, p_stage);

  if p_stage = 'WON' then
    update public.account
       set is_customer = true,
           customer_since = coalesce(customer_since, current_date)
     where id = v_opp.account_id;

    insert into public.customer_profile (account_id, monthly_fee, currency, start_date, owner_id)
    values (v_opp.account_id, v_opp.monthly_value, v_opp.currency, current_date, v_opp.owner_id)
    on conflict (account_id) do update
      set status = 'ACTIVE', monthly_fee = excluded.monthly_fee, currency = excluded.currency;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: nada sem login de usuária ativa. Sem DELETE (exclusão é lógica).
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'app_user', 'lead_type', 'lead_source', 'reason', 'message_template', 'account', 'contact',
    'lead', 'opportunity', 'customer_profile', 'activity', 'stage_history'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_member())', t, t);
    if t <> 'stage_history' then
      execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_member())', t, t);
      execute format('create policy %I_update on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())', t, t);
    end if;
  end loop;
end;
$$;

-- O histórico só é gravado pelas funções e gatilhos, que rodam com a permissão de quem chama.
create policy stage_history_insert on public.stage_history
  for insert to authenticated with check (public.is_member());

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.is_member() to authenticated;
grant execute on function public.change_lead_stage(uuid, text, uuid) to authenticated;
grant execute on function public.convert_lead(uuid, text, text, numeric, text, date) to authenticated;
grant execute on function public.change_opportunity_stage(uuid, text, uuid) to authenticated;
