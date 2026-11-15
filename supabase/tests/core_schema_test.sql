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
select 'TODOS_OS_TESTES_OK' as resultado;
