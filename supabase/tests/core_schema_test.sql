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
values ('Faixa ok', '351912345678', 'ES', 'aaaaaaaa-0000-0000-0000-000000000001', 'FROM_5K_TO_10K', false, '{"id":"1"}');
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
                    {"name":"email","values":["Marta@Example.es"]},{"name":"faturamento_mensal","values":["from_5k_to_10k"]},
                    {"name":"qual_servico","values":["tráfego"]}]}'::jsonb,
    '{"leadgen_id":"9001","page_id":"P1","form_id":"F1","adgroup_id":"G1","ad_id":"A1","created_time":1794780000}'::jsonb);
  select * into r from public.lead where id = v;
  if r.whatsapp <> '34600999888' or r.country <> 'ES' or r.email <> 'marta@example.es' or r.revenue_band <> 'FROM_5K_TO_10K'
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

select 'TODOS_OS_TESTES_OK' as resultado;
