\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111','isa@x'),('22222222-2222-2222-2222-222222222222','out@x');
insert into public.app_user (id, full_name, email) values ('11111111-1111-1111-1111-111111111111','Isa','isa@x');
grant select, insert, update on all tables in schema public to authenticated;
insert into public.lead_type (id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','Empresa');
insert into public.reason (id,kind,name) values ('bbbbbbbb-0000-0000-0000-000000000001','DISQUALIFICATION','Sem fit'),('bbbbbbbb-0000-0000-0000-000000000002','LOSS','Preço');

-- usuária ativa
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.lead (id, full_name, whatsapp, country, lead_type_id, company_name, owner_id)
values ('cccccccc-0000-0000-0000-000000000001','Ana','34600111222','ES','aaaaaaaa-0000-0000-0000-000000000001','Café Ana','11111111-1111-1111-1111-111111111111');
select created_by is not null as audit_ok from public.lead;

do $$ begin
  begin update public.lead set stage='CONTACTED'; raise exception 'FALHA: etapa mudou direto';
  exception when others then if sqlerrm <> 'STAGE_CHANGE_NOT_ALLOWED' then raise; end if; end;
  begin perform public.change_lead_stage('cccccccc-0000-0000-0000-000000000001','DISQUALIFIED'); raise exception 'FALHA: sem motivo';
  exception when others then if sqlerrm <> 'DISQUALIFICATION_REASON_REQUIRED' then raise; end if; end;
end $$;

select public.change_lead_stage('cccccccc-0000-0000-0000-000000000001','MEETING_SCHEDULED');
insert into public.activity (lead_id, kind, body) values ('cccccccc-0000-0000-0000-000000000001','CALL','ligação');
select public.convert_lead('cccccccc-0000-0000-0000-000000000001', null, 'ORGANIZATION', 450.00, 'EUR') ->> 'opportunity_id' as opp \gset
select stage, converted_account_id is not null as linked from public.lead;
select count(*) as activities_on_account from public.activity where account_id is not null;

do $$ begin
  begin update public.lead set notes='x'; raise exception 'FALHA: lead convertido editável';
  exception when others then if sqlerrm <> 'LEAD_READ_ONLY' then raise; end if; end;
end $$;

select public.change_opportunity_stage(:'opp', 'WON');
select a.is_customer, a.customer_since is not null as since, c.monthly_fee, c.currency from public.account a join public.customer_profile c on c.account_id=a.id;
select entity, field, from_value, to_value from public.stage_history where field='stage' order by changed_at, entity;

-- pessoa logada que não é usuária do CRM
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select count(*) as visible_to_outsider from public.lead;
do $$ begin
  begin insert into public.lead (full_name, needs_completion) values ('X', true); raise exception 'FALHA: intruso gravou';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- visitante anônimo
set role anon;
do $$ begin
  begin perform count(*) from public.lead; raise exception 'FALHA: anon leu';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- BU-07: normalização e duplicados
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.lead (id, full_name, whatsapp, email, country, lead_type_id)
values ('cccccccc-0000-0000-0000-000000000002','  Bia  ','+55 (11) 98888-7777',' Bia@Mail.COM ','BR','aaaaaaaa-0000-0000-0000-000000000001');
do $$ declare r public.lead%rowtype; begin
  select * into r from public.lead where id='cccccccc-0000-0000-0000-000000000002';
  if r.whatsapp <> '5511988887777' or r.email <> 'bia@mail.com' or r.full_name <> 'Bia' then
    raise exception 'FALHA: normalização (%, %, %)', r.whatsapp, r.email, r.full_name; end if;
  if (select count(*) from public.find_lead_duplicates('0055 11 98888 7777', null)) <> 1 then raise exception 'FALHA: duplicado por WhatsApp'; end if;
  if (select count(*) from public.find_lead_duplicates(null, 'BIA@mail.com')) <> 1 then raise exception 'FALHA: duplicado por e-mail'; end if;
  if (select count(*) from public.find_lead_duplicates('34600111222', null)) <> 0 then raise exception 'FALHA: lead convertido contado como duplicado'; end if;
  if (select count(*) from public.find_lead_duplicates('5511988887777', null, 'cccccccc-0000-0000-0000-000000000002')) <> 0 then raise exception 'FALHA: exclusão do próprio lead'; end if;
  begin
    insert into public.lead (full_name, whatsapp, country, lead_type_id) values ('Sem pais', '5511911112222', null, 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FALHA: lead manual sem país aceito';
  exception when check_violation then null; end;
  begin
    insert into public.lead (full_name, whatsapp, country, lead_type_id) values ('Curto', '123', 'BR', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FALHA: WhatsApp curto aceito';
  exception when check_violation then null; end;
end $$;
select count(*) as origens from public.lead_source;

-- BU-28/29: faixa de faturamento e tamanho do WhatsApp por país
do $$ begin
  begin
    insert into public.lead (full_name, whatsapp, country, lead_type_id, revenue_band) values ('Faixa', '34600111333', 'ES', 'aaaaaaaa-0000-0000-0000-000000000001', 'Até 5 mil');
    raise exception 'FALHA: faixa como rótulo aceita';
  exception when check_violation then null; end;
  begin
    insert into public.lead (full_name, whatsapp, country, lead_type_id) values ('ES curto', '3460011122', 'ES', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FALHA: WhatsApp espanhol com 8 dígitos aceito';
  exception when check_violation then null; end;
  begin
    insert into public.lead (full_name, whatsapp, country, lead_type_id) values ('BR longo', '55119888877776', 'BR', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FALHA: WhatsApp brasileiro com 12 dígitos aceito';
  exception when check_violation then null; end;
end $$;
insert into public.lead (full_name, whatsapp, country, lead_type_id, revenue_band, meta_is_organic, meta_raw)
values ('Faixa ok', '351912345678', 'ES', 'aaaaaaaa-0000-0000-0000-000000000001', 'FROM_4K_TO_7K', false, '{"id":"1"}');
select count(*) as tipos_iniciais from public.lead_type where name <> 'Empresa';

-- BU-08: fila
update public.lead set next_step_at = now() - interval '1 hour', queue_status = 'IN_PROGRESS' where id = 'cccccccc-0000-0000-0000-000000000002';
do $$ begin
  if not (select is_overdue from public.lead_queue where id = 'cccccccc-0000-0000-0000-000000000002') then raise exception 'FALHA: atrasado'; end if;
  if exists (select 1 from public.lead_queue where id = 'cccccccc-0000-0000-0000-000000000001') then raise exception 'FALHA: convertido na fila'; end if;
  if not exists (select 1 from public.stage_history where entity_id = 'cccccccc-0000-0000-0000-000000000002' and field = 'queue_status' and to_value = 'IN_PROGRESS') then
    raise exception 'FALHA: histórico da situação'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform count(*) from public.lead_queue; raise exception 'FALHA: anon leu a fila';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin
  if (select count(*) from public.lead_queue) <> 0 then raise exception 'FALHA: intruso vê a fila'; end if;
end $$;
reset role;

-- BU-09/BU-10: contato, Iniciar conversa e indicadores
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.lead (id, full_name, whatsapp, country, lead_type_id)
values ('cccccccc-0000-0000-0000-000000000003','Caio','34611222333','ES','aaaaaaaa-0000-0000-0000-000000000001');
do $$ declare r public.lead%rowtype; begin
  begin perform public.register_activity('cccccccc-0000-0000-0000-000000000003','CALL','  '); raise exception 'FALHA: contato sem texto';
  exception when others then if sqlerrm <> 'ACTIVITY_BODY_REQUIRED' then raise; end if; end;
  begin perform public.register_activity('cccccccc-0000-0000-0000-000000000003','CALL','ok','Ligar'); raise exception 'FALHA: próximo passo sem data';
  exception when others then if sqlerrm <> 'NEXT_STEP_DATE_REQUIRED' then raise; end if; end;

  perform public.register_activity('cccccccc-0000-0000-0000-000000000003','NOTE','só uma nota');
  select * into r from public.lead where id='cccccccc-0000-0000-0000-000000000003';
  if r.queue_status <> 'NEW' or r.last_contact_at is not null then raise exception 'FALHA: nota contou como contato'; end if;

  perform public.register_activity('cccccccc-0000-0000-0000-000000000003','CALL','Falei com o Caio','Enviar proposta', now() + interval '1 day');
  select * into r from public.lead where id='cccccccc-0000-0000-0000-000000000003';
  if r.queue_status <> 'IN_PROGRESS' or r.last_contact_at is null or r.next_step <> 'Enviar proposta' then raise exception 'FALHA: contato'; end if;

  perform public.register_conversation_started('cccccccc-0000-0000-0000-000000000003','Olá Caio');
  if (select count(*) from public.activity where lead_id='cccccccc-0000-0000-0000-000000000003') <> 3 then raise exception 'FALHA: atividades'; end if;

  begin perform public.register_activity('cccccccc-0000-0000-0000-000000000001','CALL','x'); raise exception 'FALHA: contato em lead convertido';
  exception when others then if sqlerrm <> 'LEAD_READ_ONLY' then raise; end if; end;

  if (public.lead_indicators() ->> 'converted_this_month')::int < 1 then raise exception 'FALHA: indicador convertidos'; end if;
end $$;
select public.lead_indicators() as indicadores;

-- Confirmação de envio do Iniciar conversa
do $$ declare r public.lead%rowtype; v_id uuid; begin
  select id into v_id from public.activity where lead_id='cccccccc-0000-0000-0000-000000000003' and delivery_status='PENDING';
  select * into r from public.lead where id='cccccccc-0000-0000-0000-000000000003';
  if r.queue_status <> 'IN_PROGRESS' then raise exception 'FALHA: situação mudou antes da confirmação'; end if;
  if not (select pending_delivery_confirmation from public.lead_queue where id='cccccccc-0000-0000-0000-000000000003') then raise exception 'FALHA: pendente na fila'; end if;

  begin perform public.confirm_conversation(v_id, false); raise exception 'FALHA: não enviada sem motivo';
  exception when others then if sqlerrm <> 'NOT_SENT_REASON_REQUIRED' then raise; end if; end;

  perform public.confirm_conversation(v_id, true);
  select * into r from public.lead where id='cccccccc-0000-0000-0000-000000000003';
  if r.queue_status <> 'AWAITING_REPLY' or r.whatsapp_status <> 'VALID' or r.next_step <> 'Enviar proposta' then raise exception 'FALHA: confirmação enviada'; end if;
  begin perform public.confirm_conversation(v_id, true); raise exception 'FALHA: confirmou duas vezes';
  exception when others then if sqlerrm <> 'ALREADY_CONFIRMED' then raise; end if; end;

  v_id := public.register_conversation_started('cccccccc-0000-0000-0000-000000000003', null);
  perform public.confirm_conversation(v_id, false, 'INVALID_NUMBER');
  if (select whatsapp_status from public.lead where id='cccccccc-0000-0000-0000-000000000003') <> 'INVALID' then raise exception 'FALHA: número inválido'; end if;
  begin perform public.register_conversation_started('cccccccc-0000-0000-0000-000000000003', null); raise exception 'FALHA: conversa com número inválido';
  exception when others then if sqlerrm <> 'WHATSAPP_MARKED_INVALID' then raise; end if; end;

  update public.lead set whatsapp = '34611222444' where id='cccccccc-0000-0000-0000-000000000003';
  if (select whatsapp_status from public.lead where id='cccccccc-0000-0000-0000-000000000003') <> 'UNVERIFIED' then raise exception 'FALHA: número corrigido'; end if;
  if (select count(*) from public.reason where kind='DISQUALIFICATION') < 10 then raise exception 'FALHA: motivos'; end if;
end $$;
reset role;

-- BU-11: quadro e indicadores por moeda
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$ declare v jsonb; v_opp uuid; begin
  v := public.convert_lead('cccccccc-0000-0000-0000-000000000003', 'Caio Ltda', 'ORGANIZATION', 300, 'EUR');
  v := public.convert_lead('cccccccc-0000-0000-0000-000000000002', null, 'PERSON', 1500, 'BRL');
  v_opp := (v ->> 'opportunity_id')::uuid;
  if (select contact_id from public.opportunity where id = v_opp) is not null then raise exception 'FALHA: pessoa física com contato'; end if;
  if (select count(*) from public.opportunity_board) < 3 then raise exception 'FALHA: quadro'; end if;
  v := public.opportunity_indicators();
  if jsonb_array_length(v -> 'open') <> 2 then raise exception 'FALHA: moedas misturadas %', v; end if;
  begin perform public.change_opportunity_stage(v_opp, 'LOST'); raise exception 'FALHA: perda sem motivo';
  exception when others then if sqlerrm <> 'LOSS_REASON_REQUIRED' then raise; end if; end;
  begin
    update public.opportunity set monthly_value = -1 where id = v_opp;
    raise exception 'FALHA: valor negativo';
  exception when check_violation then null; end;
end $$;
select public.opportunity_indicators() as indicadores_oportunidade;
reset role;

-- BU-12: clientes
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$ declare v jsonb; begin
  if (select count(*) from public.customer_list) < 1 then raise exception 'FALHA: lista de clientes'; end if;
  v := public.customer_indicators();
  if (v ->> 'active_customers')::int < 1 then raise exception 'FALHA: clientes ativos'; end if;
  if (select count(*) from public.reason where kind = 'LOSS') < 7 then raise exception 'FALHA: motivos de perda'; end if;
end $$;
select public.customer_indicators() as indicadores_clientes;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin
  if (select count(*) from public.customer_list) <> 0 then raise exception 'FALHA: intruso vê clientes'; end if;
end $$;
reset role;

-- BU-14: entrada de leads da Meta (roda como a Edge Function, sem RLS)
do $$ declare v uuid; v2 uuid; r public.lead%rowtype; begin
  v := public.ingest_meta_lead(
    '{"id":"9001","created_time":"2026-11-15T10:00:00+0000","ad_id":"A1","form_id":"F1",
      "campaign_name":"Campanha Odonto","platform":"ig","is_organic":false,
      "custom_disclaimer_responses":[{"checkbox_key":"optional_1","is_checked":"1"}],
      "field_data":[{"name":"full_name","values":["Marta López"]},{"name":"phone_number","values":["+34 600 999 888"]},
                    {"name":"email","values":["Marta@Example.es"]},{"name":"faturamento_mensal","values":["from_4k_to_7k"]},
                    {"name":"qual_servico","values":["tráfego"]}]}'::jsonb,
    '{"leadgen_id":"9001","page_id":"P1","form_id":"F1","adgroup_id":"G1","ad_id":"A1","created_time":1794780000}'::jsonb);
  select * into r from public.lead where id = v;
  if r.whatsapp <> '34600999888' or r.country <> 'ES' or r.email <> 'marta@example.es' or r.revenue_band <> 'FROM_4K_TO_7K'
     or r.capture_channel <> 'INSTANT_FORM' or r.meta_adset_id <> 'G1' or r.meta_page_id <> 'P1' or r.meta_platform <> 'ig'
     or r.meta_is_organic is distinct from false or r.form_answers -> 'qual_servico' ->> 0 <> 'tráfego' or r.meta_raw is null then
    raise exception 'FALHA: mapeamento da Meta %', row_to_json(r); end if;
  if not r.needs_completion then raise exception 'FALHA: sem tipo deveria pedir para completar'; end if;
  if (select lead_type_id from public.meta_form where form_id = 'F1') is not null then raise exception 'FALHA: formulário novo'; end if;

  v2 := public.ingest_meta_lead('{"id":"9001","field_data":[]}'::jsonb, '{}'::jsonb);
  if v2 <> v or (select count(*) from public.lead where meta_lead_id = '9001') <> 1 then raise exception 'FALHA: lead_id duplicado'; end if;

  update public.meta_form set lead_type_id = 'aaaaaaaa-0000-0000-0000-000000000001', default_country = 'BR' where form_id = 'F1';
  v := public.ingest_meta_lead('{"id":"9002","form_id":"F1","field_data":[{"name":"full_name","values":["<test lead: dummy data for full_name>"]},
    {"name":"phone_number","values":["123"]}]}'::jsonb, '{"page_id":"P1"}'::jsonb);
  select * into r from public.lead where id = v;
  if r.whatsapp is not null or not r.needs_completion or not r.is_test or r.country <> 'BR' or r.lead_type_id is null then
    raise exception 'FALHA: lead de teste / número inválido %', row_to_json(r); end if;
end $$;

-- Busca rápida
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$ begin
  if not exists (select 1 from public.search_leads('marta lopez')) then raise exception 'FALHA: busca sem acento'; end if;
  if not exists (select 1 from public.search_leads('600 999')) then raise exception 'FALHA: busca por telefone'; end if;
  if not exists (select 1 from public.search_leads('BIA@MAIL')) then raise exception 'FALHA: busca por e-mail'; end if;
  if exists (select 1 from public.search_leads('a')) then raise exception 'FALHA: termo curto'; end if;
end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin
  if exists (select 1 from public.search_leads('marta')) then raise exception 'FALHA: intruso na busca'; end if;
end $$;
reset role;

-- 20261116000010: qualquer país ISO, Instagram, MQL e motivos do histórico
do $$ begin
  insert into public.lead (full_name, country, instagram_handle, is_mql, needs_completion)
  values ('Portugal OK', 'PT', 'clinica.exemplo', true, true);
  begin
    insert into public.lead (full_name, country, needs_completion) values ('País por extenso', 'Portugal', true);
    raise exception 'FALHA: país fora do padrão ISO aceito';
  exception when check_violation then null; end;
  begin
    insert into public.lead (full_name, instagram_handle, needs_completion) values ('Insta URL', 'https://instagram.com/x', true);
    raise exception 'FALHA: Instagram com URL aceito';
  exception when check_violation then null; end;
  if (select count(*) from public.reason where kind = 'DISQUALIFICATION' and name in ('Rejeitou a proposta', 'Outro motivo')) <> 2 then
    raise exception 'FALHA: motivos do histórico';
  end if;
end $$;

-- 20261116000011: formulários do site
do $$
declare
  v jsonb;
  v_sub uuid;
  r public.lead%rowtype;
begin
  if public.site_form_public('ESPANHA') ->> 'currency' <> 'EUR' then raise exception 'FALHA: formulário público'; end if;
  if public.site_form_public('nao-existe') is not null then raise exception 'FALHA: formulário inexistente'; end if;

  begin
    perform public.site_form_start('espanha', '{"full_name":"Ana","instagram_handle":"ana@gmail.com","whatsapp":"34600111222"}');
    raise exception 'FALHA: Instagram inválido aceito';
  exception when raise_exception then
    if sqlerrm <> 'INSTAGRAM_INVALID' then raise; end if;
  end;
  begin
    perform public.site_form_start('espanha', '{"full_name":"Ana","instagram_handle":"ana.loja","whatsapp":"3460011"}');
    raise exception 'FALHA: telefone curto aceito';
  exception when raise_exception then
    if sqlerrm <> 'WHATSAPP_INVALID' then raise; end if;
  end;

  v := public.site_form_start('espanha',
    '{"full_name":"Ana Form","instagram_handle":"https://instagram.com/Ana.Loja/","whatsapp":"+351 912 345 678"}',
    '{"utm_source":"ig","utm_medium":"paid","fbp":"fb.1.1.1","cookie_consent":true,"events":{"FirstInteraction":"ev-1"}}');
  v_sub := (v ->> 'submissionId')::uuid;
  select * into r from public.lead where form_submission_id = v_sub;
  if r.country <> 'PT' or r.instagram_handle <> 'ana.loja' or r.capture_channel <> 'WEBSITE' or r.needs_completion
     or r.lead_source_id <> (select id from public.lead_source where name = 'Meta Ads')
     or r.form_answers -> 'events' ->> 'FirstInteraction' <> 'ev-1' then
    raise exception 'FALHA: lead do formulário (início) %', row_to_json(r);
  end if;

  begin
    perform public.site_form_finish(v_sub, '{"revenue_band":"FROM_4K_TO_7K","ad_budget_fit":"NO"}');
    raise exception 'FALHA: faixa de investimento exigida para quem respondeu Não';
  exception when raise_exception then
    if sqlerrm <> 'ANSWER_MISSING' then raise; end if;
  end;
  begin
    perform public.site_form_finish(v_sub, '{"revenue_band":"MUITO","ad_budget_fit":"YES"}');
    raise exception 'FALHA: opção inexistente aceita';
  exception when raise_exception then
    if sqlerrm <> 'ANSWER_INVALID' then raise; end if;
  end;

  v := public.site_form_finish(v_sub, '{"revenue_band":"UP_TO_4K","ad_budget_fit":"YES"}', '{"LeadMQL":"ev-3"}');
  select * into r from public.lead where form_submission_id = v_sub;
  if (v ->> 'isMql')::boolean is not true or r.is_mql is not true or r.revenue_band <> 'UP_TO_4K'
     or r.ad_budget_fit is not true or r.form_completed_at is null or r.form_answers -> 'events' ->> 'LeadMQL' <> 'ev-3' then
    raise exception 'FALHA: MQL com faturamento baixo e Sim ao investimento';
  end if;
  begin
    perform public.site_form_finish(v_sub, '{"revenue_band":"UP_TO_4K","ad_budget_fit":"YES"}');
    raise exception 'FALHA: envio repetido aceito';
  exception when raise_exception then
    if sqlerrm <> 'SUBMISSION_ALREADY_COMPLETED' then raise; end if;
  end;

  v := public.site_form_start('brasil', '{"full_name":"Beto","instagram_handle":"@beto","whatsapp":"5511987654321"}');
  v := public.site_form_finish((v ->> 'submissionId')::uuid,
    '{"revenue_band":"ABOVE_15K","ad_budget_fit":"NO","ad_budget_range":"BUDGET_HIGH"}');
  if (v ->> 'isMql')::boolean is not false then raise exception 'FALHA: Não ao investimento não é MQL'; end if;
end $$;

set role anon;
do $$ begin
  perform public.site_form_start('espanha', '{}');
  raise exception 'FALHA: visitante chamou a função do formulário direto';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 20261116000012: fila de eventos para a Meta
do $$
declare
  v_ana uuid := (select id from public.lead where full_name = 'Ana Form');
  v_beto uuid := (select id from public.lead where full_name = 'Beto');
  v_reason uuid := (select id from public.reason where kind = 'DISQUALIFICATION' limit 1);
  r record;
  n integer;
begin
  if not exists (select 1 from public.meta_event where lead_id = v_ana and event_name = 'FirstInteraction' and event_id = 'ev-1') then
    raise exception 'FALHA: FirstInteraction com o mesmo ID do Pixel';
  end if;
  if not exists (select 1 from public.meta_event where lead_id = v_ana and event_name = 'LeadMQL' and event_id = 'ev-3') then
    raise exception 'FALHA: LeadMQL';
  end if;
  if not exists (select 1 from public.meta_event where lead_id = v_ana and event_name = 'SubmitScheduled') then
    raise exception 'FALHA: SubmitScheduled';
  end if;
  if exists (select 1 from public.meta_event where lead_id = v_beto and event_name = 'LeadMQL') then
    raise exception 'FALHA: LeadMQL para quem não é qualificado';
  end if;
  if exists (select 1 from public.meta_event e join public.lead l on l.id = e.lead_id where l.site_form_id is null) then
    raise exception 'FALHA: evento para lead que não veio do formulário';
  end if;

  perform set_config('crm.stage_change', 'on', true);
  update public.lead set stage = 'DISQUALIFIED', disqualification_reason_id = v_reason where id = v_beto;
  perform set_config('crm.stage_change', 'off', true);
  if not exists (select 1 from public.meta_event where lead_id = v_beto and event_name = 'FakeLead' and action_source = 'website') then
    raise exception 'FALHA: FakeLead ao desqualificar';
  end if;

  -- evento velho expira em vez de ser enviado
  perform public.enqueue_meta_event(v_beto, 'SubmitScheduled', 'velho-123456', now() - interval '8 days');

  select count(*) into n from public.claim_meta_events(50);
  if n <> 6 then raise exception 'FALHA: lote esperado 6, veio %', n; end if;
  if (select status from public.meta_event where event_id = 'velho-123456') <> 'EXPIRED' then raise exception 'FALHA: expiração'; end if;
  if exists (select 1 from public.claim_meta_events(50)) then raise exception 'FALHA: lote pego duas vezes'; end if;

  select * into r from public.meta_event where event_id = 'ev-1';
  perform public.complete_meta_event(r.id, false, '{"error":{"message":"x"}}', 'HTTP 500');
  select * into r from public.meta_event where event_id = 'ev-1';
  if r.status <> 'PENDING' or r.next_attempt_at <= now() or r.last_error <> 'HTTP 500' then raise exception 'FALHA: nova tentativa'; end if;

  select * into r from public.meta_event where event_id = 'ev-3';
  perform public.complete_meta_event(r.id, true, '{"events_received":1}');
  if (select status from public.meta_event where id = r.id) <> 'SENT' then raise exception 'FALHA: enviado'; end if;

  update public.meta_event set attempts = 8 where event_id = 'ev-1';
  perform public.complete_meta_event((select id from public.meta_event where event_id = 'ev-1'), false, null, 'HTTP 400');
  if (select status from public.meta_event where event_id = 'ev-1') <> 'FAILED' then raise exception 'FALHA: desistir após 8'; end if;
end $$;

set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$ begin
  perform public.retry_meta_event((select id from public.meta_event where event_id = 'ev-1'));
  if (select status from public.meta_event where event_id = 'ev-1') <> 'PENDING' then raise exception 'FALHA: reenvio manual'; end if;
  begin
    perform public.claim_meta_events(1);
    raise exception 'FALHA: usuária chamou o envio direto';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin
  if exists (select 1 from public.meta_event) then raise exception 'FALHA: intruso vê eventos'; end if;
end $$;
reset role;

select 'TODOS_OS_TESTES_OK' as resultado;
