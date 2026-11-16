-- Preparação para a carga do histórico da Chronos (CSV de 11/11/2026) e para os formulários do site.
-- Decisões de 16/11/2026 (Atila):
--   * qualquer país é aceito (código ISO de 2 letras); país europeu usa EUR, Brasil usa BRL;
--   * @ do Instagram passa a ser campo do lead;
--   * "lead qualificado (MQL)" é um campo próprio: sim/não/desconhecido;
--   * motivos novos para o histórico: "Rejeitou a proposta" e "Outro motivo".

-- 1. País: ISO 3166-1 alfa-2 (ex.: BR, ES, PT, IE, GB)
alter table public.lead drop constraint if exists lead_country_check;
alter table public.lead add constraint lead_country_check check (country ~ '^[A-Z]{2}$');

alter table public.account drop constraint if exists account_country_check;
alter table public.account add constraint account_country_check check (country ~ '^[A-Z]{2}$');

alter table public.meta_form drop constraint if exists meta_form_default_country_check;
alter table public.meta_form add constraint meta_form_default_country_check check (default_country ~ '^[A-Z]{2}$');

-- 2. Instagram e qualificação
alter table public.lead
  add column instagram_handle text check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  add column is_mql boolean;

comment on column public.lead.instagram_handle is 'Usuário do Instagram, sem @ e sem URL';
comment on column public.lead.is_mql is
  'Lead qualificado (MQL). Regra do formulário: respondeu Sim ao investimento mínimo. Null = não avaliado';

-- 3. Motivos de desqualificação usados pelo histórico
insert into public.reason (kind, name, sort_order)
select 'DISQUALIFICATION', v.name, v.sort_order
from (values ('Rejeitou a proposta', 11), ('Outro motivo', 12)) as v (name, sort_order)
where not exists (
  select 1 from public.reason r where r.kind = 'DISQUALIFICATION' and r.name = v.name
);
