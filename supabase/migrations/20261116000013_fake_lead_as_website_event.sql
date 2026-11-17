-- Fake Lead passa a ser evento do site (action_source = website), como os demais eventos do formulário.
-- Motivo (16/11/2026): o lead nasce no formulário do site; system_generated é o formato do
-- "Conversion Leads" para formulário instantâneo da Meta (não usado hoje) e não aparece na
-- ferramenta "Eventos de teste" do canal Site, o que impedia validar o envio.
create or replace function public.lead_meta_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.site_form_id is null then return new; end if;

  if tg_op = 'INSERT' then
    perform public.enqueue_meta_event(new.id, 'FirstInteraction',
      new.form_answers -> 'events' ->> 'FirstInteraction', new.created_at);
    return new;
  end if;

  if old.form_completed_at is null and new.form_completed_at is not null then
    perform public.enqueue_meta_event(new.id, 'SubmitScheduled',
      new.form_answers -> 'events' ->> 'SubmitScheduled', new.form_completed_at);
    if new.is_mql then
      perform public.enqueue_meta_event(new.id, 'LeadMQL',
        new.form_answers -> 'events' ->> 'LeadMQL', new.form_completed_at);
    end if;
  end if;

  -- Desqualificado no CRM (qualquer motivo) = Fake Lead (só existe pelo servidor)
  if new.stage = 'DISQUALIFIED' and old.stage is distinct from 'DISQUALIFIED' then
    perform public.enqueue_meta_event(new.id, 'FakeLead', null, now(), 'website');
  end if;
  return new;
end;
$$;
