#!/usr/bin/env python3
"""Gera o SQL de carga do histórico de leads exportado da Chronos (CSV).

Uso:
    python3 -I scripts/chronos_import/generate_sql.py <entrada.csv> <saida.sql> <relatorio.md>

O CSV contém dados pessoais reais: entrada, saída e relatório NUNCA vão para o repositório.
O SQL gerado roda no SQL Editor do Supabase, somente no projeto de teste até a validação.
É idempotente: cada lead tem external_id 'chronos-<hash>' e uma segunda execução não duplica nada.

Regras de mapeamento: decisões do Atila em 16/11/2026 (ver especificação, seção "Carga do histórico").
"""
import csv
import hashlib
import re
import sys
from collections import Counter
from datetime import datetime

SKIP_NAMES = {'teste', 'testr', 'isabela pahins (profissional)'}
SEGMENTS = {'odonto', 'ondoto', 'cidadania', 'estética', 'estetica'}
LEAD_TYPE = 'Gestão de tráfego pago (Meta e Google)'

# Código do país pelo prefixo do telefone e quantidade total de dígitos aceita
PHONE_RULES = [
    ('351', 'PT', {12}),
    ('353', 'IE', {12}),
    ('55', 'BR', {12, 13}),
    ('34', 'ES', {11}),
    ('44', 'GB', {12}),
]

REASON_FAKE = 'Lead falso, teste ou duplicado'
REASON_OUT_OF_ICP = 'Fora do perfil (porte ou faturamento)'
REASON_NO_REPLY = 'Sem resposta após 3 tentativas'
REASON_REJECTED = 'Rejeitou a proposta'
REASON_OTHER = 'Outro motivo'

# Etapa da Chronos -> (etapa do lead, motivo, oportunidade a criar)
STAGES = {
    'Retomar contato': ('RECONTACT', None, None),
    'Abordado': ('CONTACTED', None, None),
    'No show': ('NO_SHOW', None, None),
    'Possível fake': ('DISQUALIFIED', REASON_FAKE, None),
    'Lead falso': ('DISQUALIFIED', REASON_FAKE, None),
    'Fora do ICP': ('DISQUALIFIED', REASON_OUT_OF_ICP, None),
    'Desqualificado': ('DISQUALIFIED', REASON_OTHER, None),
    'Perdido (sem retorno)': ('DISQUALIFIED', REASON_NO_REPLY, None),
    'Rejeitou oferta': ('DISQUALIFIED', REASON_REJECTED, None),
    # Decisão 2, opção B: só os abertos viram oportunidade; o valor é preenchido depois
    'Proposta enviada': ('NEW', None, 'PROPOSAL_SENT'),
    'Follow-up': ('NEW', None, 'FOLLOW_UP'),
}

EUR_COUNTRIES = {'ES', 'PT', 'IE', 'GB'}  # GB em EUR: decisão de 16/11/2026 (a Bless cobra em euro)


def q(value):
    if value is None:
        return 'null'
    return "'" + str(value).replace("'", "''") + "'"


def parse_phone(raw):
    digits = re.sub(r'\D', '', raw or '')
    if not digits:
        return None, None, None
    for prefix, country, lengths in PHONE_RULES:
        if digits.startswith(prefix):
            if len(digits) in lengths:
                return digits, country, None
            return None, country, digits
    return None, None, digits


def parse_instagram(raw):
    value = (raw or '').strip()
    if not value:
        return None
    handle = re.sub(r'^https?://(www\.)?instagram\.com/', '', value, flags=re.I).strip('/').lstrip('@')
    if not re.fullmatch(r'[A-Za-z0-9._]{2,30}', handle):
        return None
    if re.search(r'\.(com|br|es|pt)$', handle, re.I) or handle.strip('.') == '':
        return None
    return handle


def parse_email(raw):
    value = (raw or '').strip().lower()
    return value if re.fullmatch(r'[^@\s]+@[^@\s]+\.[a-z]{2,}', value) else None


def parse_datetime(raw):
    raw = (raw or '').strip()
    if not raw:
        return None
    return datetime.strptime(raw, '%d/%m/%Y %H:%M').strftime('%Y-%m-%d %H:%M')


def ts(local):
    # Decisão 3: horário de Brasília, gravado em UTC
    return 'null' if local is None else f"(timestamp {q(local)} at time zone 'America/Sao_Paulo')"


def source_of(row):
    origin = row['Origem'].strip().lower()
    utm_source = row['UTM Source'].strip().lower()
    utm_medium = row['UTM Medium'].strip().lower()
    if origin == 'manual' or origin.startswith('conhecido'):
        return 'Indicação'
    if utm_source in ('ig', 'fb') and utm_medium == 'paid':
        return 'Meta Ads'
    return 'Orgânico'


def owner_of(row):
    name = row['Responsável'].strip().lower()
    if name.startswith('janaina'):
        return 'JANA'
    if name.startswith('isabela'):
        return 'ISA'
    return None


def build(rows):
    leads, skipped, notes_report = [], [], []
    for line, row in enumerate(rows, start=2):
        name = row['Nome'].strip()
        if name.lower() in SKIP_NAMES:
            skipped.append((line, name, 'registro de teste'))
            continue
        stage_label = row['Etapa'].strip()
        if stage_label not in STAGES:
            skipped.append((line, name, f'etapa desconhecida: {stage_label}'))
            continue
        stage, reason, opportunity = STAGES[stage_label]

        whatsapp, country, invalid_phone = parse_phone(row['Telefone'])
        notes = []
        company = row['Empresa'].strip() or None
        if company and company.lower() in SEGMENTS:
            notes.append(f'Segmento informado na Chronos: {company}')
            company = None
        if invalid_phone:
            notes.append(f'Telefone inválido na Chronos: {invalid_phone}')
            notes_report.append((line, name, f'telefone inválido ({invalid_phone}) — lead fica para completar'))
        raw_instagram = row['Instagram'].strip()
        instagram = parse_instagram(raw_instagram)
        if raw_instagram and not instagram:
            notes_report.append((line, name, 'Instagram descartado (não é um @ válido)'))
        tag = row['Tags'].strip()
        is_mql = {'LEAD MQL': True, 'DESQUALIFICADO': False, 'FORA DO ICP': False}.get(tag.upper())
        if tag and is_mql is None:
            notes.append(f'Tag na Chronos: {tag}')
        notes.append(f'Importado da Chronos. Etapa original: {stage_label}')

        created = parse_datetime(row['Criado em'])
        last_activity = parse_datetime(row['Última atividade'])
        key = '|'.join([name.lower(), row['Criado em'].strip(), re.sub(r'\D', '', row['Telefone'])])
        leads.append({
            'external_id': 'chronos-' + hashlib.sha1(key.encode()).hexdigest()[:16],
            'full_name': name or '(sem nome)',
            'company_name': company,
            'email': parse_email(row['Email']),
            'whatsapp': whatsapp,
            'country': country,
            'instagram_handle': instagram,
            'source': source_of(row),
            'owner': owner_of(row),
            'stage': stage,
            'reason': reason,
            'opportunity': opportunity,
            'is_mql': is_mql,
            'notes': '\n'.join(notes),
            'utm': [row[f'UTM {k}'].strip() or None for k in ('Source', 'Medium', 'Campaign', 'Content', 'Term')],
            'created': created,
            'last_activity': last_activity,
            'stage_label': stage_label,
        })
    return leads, skipped, notes_report


def to_sql(leads):
    values = []
    for lead in leads:
        mql = 'null' if lead['is_mql'] is None else ('true' if lead['is_mql'] else 'false')
        values.append('  (' + ', '.join([
            q(lead['external_id']), q(lead['full_name']), q(lead['company_name']), q(lead['email']),
            q(lead['whatsapp']), q(lead['country']), q(lead['instagram_handle']), q(lead['source']),
            q(lead['owner']), q(lead['stage']), q(lead['reason']), q(lead['opportunity']), mql,
            q(lead['notes']), *[q(v) for v in lead['utm']], ts(lead['created']), ts(lead['last_activity']),
            q(lead['stage_label']),
        ]) + ')')

    return f"""-- Carga do histórico da Chronos — GERADO por scripts/chronos_import/generate_sql.py
-- CONTÉM DADOS PESSOAIS. Não versionar. Rodar no SQL Editor do projeto crm-bless-up-test.
-- Idempotente: pode rodar de novo sem duplicar (external_id 'chronos-...').
-- Não envia mensagens a ninguém; só grava no banco.

begin;

create temporary table chronos_row (
  external_id text, full_name text, company_name text, email text, whatsapp text, country text,
  instagram_handle text, source text, owner text, stage text, reason text, opportunity text,
  is_mql boolean, notes text, utm_source text, utm_medium text, utm_campaign text, utm_content text,
  utm_term text, created_at timestamptz, last_activity_at timestamptz, stage_label text
) on commit drop;

insert into chronos_row values
{',\n'.join(values)};

do $$
declare
  v_jana uuid := (select id from public.app_user where email = 'janaoliveira.mkt@gmail.com');
  v_isa uuid := (select id from public.app_user where email like 'isabelapahinsld@%' order by email limit 1);
  v_type uuid := (select id from public.lead_type where name = {q(LEAD_TYPE)} and deleted_at is null limit 1);
  v_row record;
  v_result jsonb;
  v_inserted int;
  v_converted int := 0;
begin
  if v_type is null then raise exception 'Tipo de lead "{LEAD_TYPE}" não encontrado'; end if;
  if v_jana is null then raise notice 'Usuária da Jana não encontrada: leads dela ficam sem responsável'; end if;
  if v_isa is null then raise notice 'Usuária da Isa não encontrada: leads dela ficam sem responsável'; end if;

  insert into public.lead (
    external_id, full_name, company_name, email, whatsapp, country, instagram_handle,
    lead_type_id, lead_source_id, capture_channel, owner_id, stage, queue_status,
    disqualification_reason_id, is_mql, notes, needs_completion,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    created_at, last_contact_at, revenue_band
  )
  select
    r.external_id, r.full_name, r.company_name, r.email, r.whatsapp, r.country, r.instagram_handle,
    v_type,
    (select s.id from public.lead_source s where s.name = r.source and s.deleted_at is null limit 1),
    'IMPORT',
    case r.owner when 'JANA' then v_jana when 'ISA' then v_isa end,
    r.stage,
    case when r.stage = 'DISQUALIFIED' then 'NEW' else 'IN_PROGRESS' end,
    (select x.id from public.reason x
      where x.kind = 'DISQUALIFICATION' and x.name = r.reason and x.deleted_at is null limit 1),
    r.is_mql, r.notes, (r.whatsapp is null or r.country is null),
    r.utm_source, r.utm_medium, r.utm_campaign, r.utm_content, r.utm_term,
    r.created_at, r.last_activity_at, 'NOT_INFORMED'
  from chronos_row r
  on conflict (external_id) do nothing;
  get diagnostics v_inserted = row_count;

  -- Registro na linha do tempo com a data da última atividade na Chronos (só para os recém-inseridos)
  insert into public.activity (lead_id, kind, body, occurred_at)
  select l.id, 'SYSTEM', 'Histórico importado da Chronos. Etapa original: ' || r.stage_label,
         coalesce(r.last_activity_at, r.created_at)
  from chronos_row r
  join public.lead l on l.external_id = r.external_id
  where not exists (
    select 1 from public.activity a
    where a.lead_id = l.id and a.kind = 'SYSTEM' and a.body like 'Histórico importado da Chronos%'
  );

  -- Propostas em aberto viram oportunidade (decisão 2, opção B), sem valor
  for v_row in
    select l.id, r.opportunity, l.company_name, l.country
    from chronos_row r
    join public.lead l on l.external_id = r.external_id
    where r.opportunity is not null and l.stage <> 'CONVERTED'
  loop
    v_result := public.convert_lead(
      v_row.id, null,
      case when v_row.company_name is null then 'PERSON' else 'ORGANIZATION' end,
      null,
      case when v_row.country = 'BR' then 'BRL' else 'EUR' end
    );
    if v_row.opportunity = 'FOLLOW_UP' then
      perform public.change_opportunity_stage((v_result ->> 'opportunity_id')::uuid, 'FOLLOW_UP');
    end if;
    v_converted := v_converted + 1;
  end loop;

  raise notice 'Leads novos: % de % no arquivo. Oportunidades criadas: %',
    v_inserted, (select count(*) from chronos_row), v_converted;
end;
$$;

commit;
"""


def report(leads, skipped, notes_report):
    lines = ['# Carga da Chronos — relatório de preparação', '',
             f'- Linhas no CSV: {len(leads) + len(skipped)}',
             f'- Leads a importar: {len(leads)}',
             f'- Linhas ignoradas: {len(skipped)}', '']
    lines += ['## Por etapa no CRM', '', '| Etapa | Motivo | Qtd. |', '|---|---|---|']
    for (stage, reason, opp), n in sorted(Counter((l['stage'], l['reason'], l['opportunity']) for l in leads).items(),
                                          key=lambda x: -x[1]):
        label = f'oportunidade {opp}' if opp else stage
        lines.append(f'| {label} | {reason or "—"} | {n} |')
    lines += ['', '## Por país', '', '| País | Qtd. |', '|---|---|']
    for country, n in Counter(l['country'] or 'sem telefone' for l in leads).most_common():
        lines.append(f'| {country} | {n} |')
    lines += ['', '## Por origem e responsável', '']
    lines.append('Origem: ' + ', '.join(f'{k} {v}' for k, v in Counter(l['source'] for l in leads).most_common()))
    lines.append('')
    lines.append('Responsável: ' + ', '.join(f'{k or "sem responsável"} {v}'
                                             for k, v in Counter(l['owner'] for l in leads).most_common()))
    lines.append('')
    lines.append(f'MQL: sim {sum(1 for l in leads if l["is_mql"] is True)}, '
                 f'não {sum(1 for l in leads if l["is_mql"] is False)}, '
                 f'não avaliado {sum(1 for l in leads if l["is_mql"] is None)}')
    lines.append(f'Para completar (sem WhatsApp válido ou sem país): '
                 f'{sum(1 for l in leads if not l["whatsapp"] or not l["country"])}')
    lines += ['', '## Linhas ignoradas', '', '| Linha | Nome | Motivo |', '|---|---|---|']
    lines += [f'| {a} | {b} | {c} |' for a, b, c in skipped]
    lines += ['', '## Ajustes', '', '| Linha | Nome | Ajuste |', '|---|---|---|']
    lines += [f'| {a} | {b} | {c} |' for a, b, c in notes_report]
    return '\n'.join(lines) + '\n'


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    leads, skipped, notes_report = build(rows)
    with open(sys.argv[2], 'w', encoding='utf-8') as handle:
        handle.write(to_sql(leads))
    with open(sys.argv[3], 'w', encoding='utf-8') as handle:
        handle.write(report(leads, skipped, notes_report))
    print(f'{len(leads)} leads, {len(skipped)} ignorados')


if __name__ == '__main__':
    main()
