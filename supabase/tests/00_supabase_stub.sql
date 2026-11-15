create schema auth; create schema extensions;
create role anon; create role authenticated; create role service_role;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, insert, update on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
