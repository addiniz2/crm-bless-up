-- Desempenho das regras de acesso (recomendação do Supabase, "RLS Performance and Best Practices"):
-- (select public.is_member()) é avaliado uma vez por consulta, em vez de uma vez por linha.
-- Mesma regra de segurança: só muda a forma como o banco a executa.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual = 'is_member()' or with_check = 'is_member()')
  loop
    if p.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on %I.%I using ((select public.is_member()))', p.policyname, p.schemaname, p.tablename);
    elsif p.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check ((select public.is_member()))', p.policyname, p.schemaname, p.tablename);
    elsif p.cmd in ('UPDATE', 'ALL') then
      execute format('alter policy %I on %I.%I using ((select public.is_member())) with check ((select public.is_member()))',
                     p.policyname, p.schemaname, p.tablename);
    end if;
  end loop;
end;
$$;
