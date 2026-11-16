-- Dados de demonstração do CRM Bless Up
-- RODAR SOMENTE NO PROJETO crm-bless-up-test (SQL Editor). Nunca em produção.
--
-- Carrega 18 leads fictícios em etapas diferentes, atribuídos a Atila, Jana, Isa e sem responsável,
-- com contatos, próximos passos (alguns atrasados), 1 desqualificado e 2 convertidos
-- (um virou cliente, outro está em Follow-up).
-- Todos ficam marcados com external_id 'demo-NN' e podem ser removidos com remove_demo_data.sql.
--
-- ATENÇÃO: os números de WhatsApp são fictícios mas podem pertencer a alguém.
-- Não envie mensagens a esses leads. Para testar o Iniciar conversa, preencha v_test_whatsapp
-- abaixo com um número seu (só dígitos, com código do país) e todos os leads usarão esse número.

do $$
declare
  v_test_whatsapp text := null; -- ex.: '5511999999999'
  v_atila uuid := (select id from public.app_user where full_name = 'Atila' limit 1);
  v_jana uuid := (select id from public.app_user where full_name = 'Jana' limit 1);
  v_isa uuid := (select id from public.app_user where full_name = 'Isa' limit 1);
  v_reason uuid := (select id from public.reason where kind = 'DISQUALIFICATION' and name = 'Sem orçamento para investir' and deleted_at is null limit 1);
  v_result jsonb;
begin
  if v_atila is null or v_jana is null or v_isa is null then
    raise exception 'Cadastre antes as usuárias Atila, Jana e Isa em public.app_user (full_name exatamente assim).';
  end if;
  if exists (select 1 from public.lead where external_id like 'demo-%') then
    raise exception 'Os dados de demonstração já foram carregados. Rode remove_demo_data.sql antes de carregar de novo.';
  end if;

  -- Libera a trava de etapa só nesta transação, para criar leads já em etapas avançadas.
  perform set_config('crm.stage_change', 'on', true);

  insert into public.lead (
    external_id, full_name, company_name, whatsapp, email, country, lead_type_id, lead_source_id,
    capture_channel, revenue_band, main_goal, stage, queue_status, owner_id,
    next_step, next_step_at, last_contact_at, whatsapp_status, created_at, notes
  )
  select
    v.ext, v.full_name, v.company, coalesce(v_test_whatsapp, v.whatsapp), v.email, v.country,
    (select id from public.lead_type where name = v.type_name and deleted_at is null limit 1),
    (select id from public.lead_source where name = v.source_name and deleted_at is null limit 1),
    v.channel, v.revenue, v.goal, v.stage, v.queue,
    case v.owner when 'A' then v_atila when 'J' then v_jana when 'I' then v_isa end,
    v.next_step,
    case when v.next_days is null then null else now() + make_interval(hours => (v.next_days * 24)::int) end,
    case when v.contact_days is null then null else now() - make_interval(days => v.contact_days) end,
    case when v.contact_days is null then 'UNVERIFIED' else 'VALID' end,
    now() - make_interval(days => v.created_days),
    'Lead de demonstração (fictício). Não enviar mensagens.'
  from (values
    -- ext,      nome,                 empresa,                whatsapp,         e-mail,                        país, tipo,                                        origem,       canal,             faturamento,        objetivo,             etapa,               situação,         resp, próximo passo,                 dias p/ próx., último contato (dias atrás), criado (dias atrás)
    ('demo-01', 'Lucía Fernández',     'Clínica Dental Sonrisa', '34600000101', 'lucia@exemplo.es',            'ES', 'Gestão de tráfego pago (Meta e Google)',     'Meta Ads',   'INSTANT_FORM',    'FROM_10K_TO_20K',  'MORE_CUSTOMERS',     'NEW',               'NEW',            null, null,                          null,  null, 0),
    ('demo-02', 'Marcos Oliveira',     'Oliveira Arquitetura',   '5511900000102', 'marcos@exemplo.com.br',     'BR', 'Site e landing page',                        'Google Ads', 'WEBSITE',         'FROM_5K_TO_10K',   'MORE_CUSTOMERS',     'NEW',               'NEW',            null, null,                          null,  null, 1),
    ('demo-03', 'Carmen Ruiz',         'Estética Carmen',        '34600000103', null,                          'ES', 'Social media e conteúdo',                    'Meta Ads',   'INSTANT_FORM',    'UP_TO_5K',         'BRAND',              'NEW',               'NEW',            'J',  null,                          null,  null, 0),
    ('demo-04', 'Rafael Costa',        null,                     '5521900000104', 'rafael@exemplo.com.br',     'BR', 'Consultoria e planejamento de marketing',    'Orgânico',   'INSTAGRAM_DIRECT','NOT_INFORMED',     'ORGANIZE_MARKETING', 'NEW',               'TO_REPLY',       'I',  'Responder dúvida sobre preços', 0.2,   null, 1),
    ('demo-05', 'Javier Morales',      'Morales Abogados',       '34600000105', 'javier@exemplo.es',           'ES', 'Branding e identidade visual',               'Indicação',  'WHATSAPP',        'ABOVE_20K',        'BRAND',              'NEW',               'NEW',            'A',  null,                          null,  null, 2),
    ('demo-06', 'Patrícia Lima',       'Studio Pilates Lima',    '5511900000106', 'patricia@exemplo.com.br',   'BR', 'Gestão de tráfego pago (Meta e Google)',     'Meta Ads',   'INSTANT_FORM',    'FROM_5K_TO_10K',   'MORE_CUSTOMERS',     'CONTACTED',         'AWAITING_REPLY', 'J',  'Cobrar retorno da proposta',  2,     1,    4),
    ('demo-07', 'Andrés Gil',          'Gil Fisioterapia',       '34600000107', null,                          'ES', 'Gestão de tráfego pago (Meta e Google)',     'Meta Ads',   'INSTANT_FORM',    'FROM_10K_TO_20K',  'MORE_CUSTOMERS',     'CONTACTED',         'IN_PROGRESS',    'I',  'Ligar para entender a operação', -1,  3,    5),
    ('demo-08', 'Fernanda Rocha',      'Rocha Imóveis',          '5531900000108', 'fernanda@exemplo.com.br',   'BR', 'Site e landing page',                        'Google Ads', 'WEBSITE',         'ABOVE_20K',        'MORE_CUSTOMERS',     'CONTACTED',         'IN_PROGRESS',    'A',  null,                          null,  2,    6),
    ('demo-09', 'Elena Navarro',       'Navarro Moda',           '34600000109', 'elena@exemplo.es',            'ES', 'Social media e conteúdo',                    'Orgânico',   'INSTAGRAM_DIRECT','FROM_5K_TO_10K',   'BRAND',              'CONTACTED',         'TO_REPLY',       null, null,                          null,  1,    3),
    ('demo-10', 'Bruno Almeida',       'Almeida Contabilidade',  '5511900000110', null,                          'BR', 'Treinamento de equipe',                      'Indicação',  'PHONE_CALL',      'FROM_10K_TO_20K',  'TRAIN_TEAM',         'RECONTACT',         'IN_PROGRESS',    'J',  'Retomar em janeiro',           30,    10,   20),
    ('demo-11', 'Sofía Martín',        'Café Martín',            '34600000111', 'sofia@exemplo.es',            'ES', 'Ainda não sabe / outro',                     'Meta Ads',   'INSTANT_FORM',    'UP_TO_5K',         'MORE_CUSTOMERS',     'RECONTACT',         'AWAITING_REPLY', 'A',  'Nova tentativa pelo WhatsApp', -2,    7,    15),
    ('demo-12', 'Juliana Martins',     'Martins Odontologia',    '5541900000112', 'juliana@exemplo.com.br',    'BR', 'Gestão de tráfego pago (Meta e Google)',     'Meta Ads',   'INSTANT_FORM',    'ABOVE_20K',        'MORE_CUSTOMERS',     'MEETING_SCHEDULED', 'IN_PROGRESS',    'I',  'Reunião de diagnóstico',       1,     2,    8),
    ('demo-13', 'Pablo Sánchez',       'Sánchez Reformas',       '34600000113', 'pablo@exemplo.es',            'ES', 'Site e landing page',                        'Google Ads', 'WEBSITE',         'FROM_10K_TO_20K',  'MORE_CUSTOMERS',     'MEETING_SCHEDULED', 'IN_PROGRESS',    'A',  'Apresentar proposta',          3,     1,    9),
    ('demo-14', 'Camila Duarte',       'Duarte Nutrição',        '5511900000114', null,                        'BR', 'Social media e conteúdo',                    'Orgânico',   'WHATSAPP',        'FROM_5K_TO_10K',   'BRAND',              'MEETING_SCHEDULED', 'IN_PROGRESS',    'J',  'Reunião online',               -0.5,  4,    10),
    ('demo-15', 'Diego Herrera',       'Herrera Seguros',        '34600000115', 'diego@exemplo.es',            'ES', 'Consultoria e planejamento de marketing',    'Indicação',  'PHONE_CALL',      'ABOVE_20K',        'ORGANIZE_MARKETING', 'NO_SHOW',           'TO_REPLY',       'I',  'Remarcar reunião',             0.5,   5,    12),
    ('demo-16', 'Thiago Nunes',        null,                     '5511900000116', null,                        'BR', 'Ainda não sabe / outro',                     'Meta Ads',   'INSTANT_FORM',    'UP_TO_5K',         null,                 'CONTACTED',         'IN_PROGRESS',    null, null,                          null,  6,    14),
    ('demo-17', 'Laura Gómez',         'Gómez Estética',         '34600000117', 'laura@exemplo.es',            'ES', 'Gestão de tráfego pago (Meta e Google)',     'Meta Ads',   'INSTANT_FORM',    'FROM_10K_TO_20K',  'MORE_CUSTOMERS',     'MEETING_SCHEDULED', 'IN_PROGRESS',    'A',  null,                          null,  3,    18),
    ('demo-18', 'Gustavo Pereira',     'Pereira Advocacia',      '5511900000118', 'gustavo@exemplo.com.br',    'BR', 'Site e landing page',                        'Google Ads', 'WEBSITE',         'ABOVE_20K',        'MORE_CUSTOMERS',     'MEETING_SCHEDULED', 'IN_PROGRESS',    'J',  null,                          null,  2,    16)
  ) as v (ext, full_name, company, whatsapp, email, country, type_name, source_name, channel, revenue, goal, stage, queue, owner,
          next_step, next_days, contact_days, created_days);

  -- Um contato na linha do tempo de cada lead já abordado
  insert into public.activity (lead_id, kind, body, occurred_at, next_step, next_step_at)
  select l.id, 'WHATSAPP', 'Primeiro contato pelo WhatsApp (demonstração).', l.last_contact_at, l.next_step, l.next_step_at
  from public.lead l
  where l.external_id like 'demo-%' and l.last_contact_at is not null;

  -- Histórico de etapa para quem já saiu de Novo
  insert into public.stage_history (entity, entity_id, field, from_value, to_value, changed_at, changed_by)
  select 'LEAD', l.id, 'stage', 'NEW', l.stage, l.last_contact_at, l.owner_id
  from public.lead l
  where l.external_id like 'demo-%' and l.stage <> 'NEW';

  perform set_config('crm.stage_change', 'off', true);

  -- 1 desqualificado (passa pela função do banco)
  perform public.change_lead_stage((select id from public.lead where external_id = 'demo-16'), 'DISQUALIFIED', v_reason);

  -- 2 convertidos: um vira cliente, o outro fica em Follow-up
  v_result := public.convert_lead((select id from public.lead where external_id = 'demo-17'), 'Gómez Estética', 'ORGANIZATION', 650, 'EUR', (current_date + 7));
  perform public.change_opportunity_stage((v_result ->> 'opportunity_id')::uuid, 'WON');

  v_result := public.convert_lead((select id from public.lead where external_id = 'demo-18'), 'Pereira Advocacia', 'ORGANIZATION', 3500, 'BRL', (current_date + 10));
  perform public.change_opportunity_stage((v_result ->> 'opportunity_id')::uuid, 'FOLLOW_UP');
end;
$$;

select stage, count(*) from public.lead where external_id like 'demo-%' group by stage order by stage;
