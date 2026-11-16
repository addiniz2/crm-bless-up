-- Remove os dados de demonstração (external_id 'demo-NN') e tudo o que nasceu deles.
-- RODAR SOMENTE NO PROJETO crm-bless-up-test. Exclusão física de dados fictícios de teste;
-- dados reais nunca são apagados assim (regra do projeto: exclusão lógica).

do $$
declare
  v_leads uuid[];
  v_accounts uuid[];
  v_opportunities uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_leads from public.lead where external_id like 'demo-%';
  select coalesce(array_agg(id), '{}') into v_accounts from public.account where source_lead_id = any (v_leads);
  select coalesce(array_agg(id), '{}') into v_opportunities from public.opportunity where account_id = any (v_accounts);

  perform set_config('crm.stage_change', 'on', true);

  delete from public.activity
   where lead_id = any (v_leads) or account_id = any (v_accounts) or opportunity_id = any (v_opportunities);
  update public.lead set converted_account_id = null, converted_opportunity_id = null where id = any (v_leads);
  delete from public.customer_profile where account_id = any (v_accounts);
  delete from public.opportunity where id = any (v_opportunities);
  delete from public.contact where account_id = any (v_accounts);
  update public.account set source_lead_id = null where id = any (v_accounts);
  delete from public.account where id = any (v_accounts);
  delete from public.stage_history where entity_id = any (v_leads) or entity_id = any (v_opportunities);
  delete from public.lead where id = any (v_leads);

  perform set_config('crm.stage_change', 'off', true);
end;
$$;

select count(*) as leads_de_demonstracao_restantes from public.lead where external_id like 'demo-%';
