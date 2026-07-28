begin;
select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'a@example.test', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'b@example.test', '', now(), now());

insert into public.accounts (
  id, user_id, name, type, context, currency, opening_balance_minor, opening_balance_date
) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Conta A', 'checking', 'personal', 'BRL', 0, current_date),
  ('22000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Conta B', 'checking', 'personal', 'BRL', 0, current_date);

insert into public.critical_operation_events (user_id, event_type, outcome)
values
  ('10000000-0000-0000-0000-000000000001', 'data_exported', 'success'),
  ('20000000-0000-0000-0000-000000000002', 'data_exported', 'success');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is((select count(*) from public.accounts), 1::bigint, 'user A sees one account');
select is((select name from public.accounts), 'Conta A', 'user A sees only own account');
select is((select count(*) from public.critical_operation_events), 1::bigint, 'user A sees one audit event');
select is((select user_id from public.critical_operation_events), '10000000-0000-0000-0000-000000000001'::uuid, 'user A sees own audit');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.accounts), 1::bigint, 'user B sees one account');
select is((select name from public.accounts), 'Conta B', 'user B sees only own account');
select is((select count(*) from public.critical_operation_events), 1::bigint, 'user B sees one audit event');
select throws_ok(
  $$ insert into public.critical_operation_events (user_id, event_type, outcome)
     values ('20000000-0000-0000-0000-000000000002', 'data_exported', 'success') $$,
  '42501',
  null,
  'authenticated users cannot forge audit events'
);

select * from finish();
rollback;
