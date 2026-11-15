-- BU-28/BU-29 e preparação do BU-14 (decisões de 15/11/2026)
-- 1. Faixa de faturamento MENSAL em lista fechada; a moeda segue o país do lead (BR em R$, ES em €).
-- 2. Tamanho do WhatsApp conferido para Espanha (+34) e Brasil (+55).
-- 3. Todos os campos que a Meta gera automaticamente passam a ser guardados no lead.
-- 4. Tipos de lead iniciais (proposta aprovada; editáveis em Configurações).

-- A migration ajusta dados antigos; libera a trava de etapa só nesta transação.
select set_config('crm.stage_change', 'on', true);

-- 1. Faixa de faturamento
update public.lead
   set revenue_band = null
 where revenue_band is not null
   and revenue_band not in ('UP_TO_5K', 'FROM_5K_TO_10K', 'FROM_10K_TO_20K', 'ABOVE_20K', 'NOT_INFORMED');

alter table public.lead
  add constraint lead_revenue_band_check check (
    revenue_band is null
    or revenue_band in ('UP_TO_5K', 'FROM_5K_TO_10K', 'FROM_10K_TO_20K', 'ABOVE_20K', 'NOT_INFORMED')
  );

comment on column public.lead.revenue_band is
  'Faturamento mensal. Moeda pelo país: BR em BRL, ES em EUR. UP_TO_5K, FROM_5K_TO_10K, FROM_10K_TO_20K, ABOVE_20K, NOT_INFORMED';

-- 2. WhatsApp: Espanha = 34 + 9 dígitos; Brasil = 55 + DDD + 8 ou 9 dígitos.
-- NOT VALID: vale para leads novos e alterados, sem barrar registros antigos.
alter table public.lead
  add constraint lead_whatsapp_country_length check (
    whatsapp is null
    or (whatsapp like '34%' and length(whatsapp) = 11)
    or (whatsapp like '55%' and length(whatsapp) in (12, 13))
    or (whatsapp not like '34%' and whatsapp not like '55%')
  ) not valid;

-- 3. Campos gerados pela Meta (webhook leadgen e leitura do lead na Graph API)
alter table public.lead
  add column meta_page_id text,
  add column meta_adset_id text,
  add column meta_adset_name text,
  add column meta_ad_name text,
  add column meta_campaign_name text,
  add column meta_form_name text,
  add column meta_platform text,
  add column meta_is_organic boolean,
  add column meta_created_at timestamptz,
  add column meta_consents jsonb,
  add column meta_raw jsonb;

comment on column public.lead.meta_raw is
  'Resposta completa da Meta (webhook e leitura do lead), guardada sem alteração para não perder nenhum campo';
comment on column public.lead.meta_consents is 'custom_disclaimer_responses: caixas de consentimento e se foram marcadas';

-- 4. Tipos de lead iniciais
insert into public.lead_type (name, sort_order)
select v.name, v.sort_order
from (values
  ('Gestão de tráfego pago (Meta e Google)', 1),
  ('Social media e conteúdo', 2),
  ('Branding e identidade visual', 3),
  ('Site e landing page', 4),
  ('Consultoria e planejamento de marketing', 5),
  ('Treinamento de equipe', 6),
  ('Ainda não sabe / outro', 7)
) as v (name, sort_order)
where not exists (select 1 from public.lead_type t where t.name = v.name and t.deleted_at is null);

select set_config('crm.stage_change', 'off', true);
