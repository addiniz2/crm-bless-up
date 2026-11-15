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

select 'TODOS_OS_TESTES_OK' as resultado;
