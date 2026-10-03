-- A transfer is never a categorized expense or income. Keep its recurrence
-- separate from recurring_transactions and create both ledger legs atomically.
create table public.recurring_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_account_id uuid not null references public.accounts(id) on delete cascade,
  destination_account_id uuid not null references public.accounts(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 180),
  amount_minor bigint not null check (amount_minor between 1 and 9007199254740991),
  destination_amount_minor bigint not null check (destination_amount_minor between 1 and 9007199254740991),
  frequency public.recurrence_frequency not null,
  start_date date not null,
  end_date date,
  next_occurrence date not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_account_id <> destination_account_id),
  check (next_occurrence >= start_date),
  check (end_date is null or end_date >= start_date)
);

create index recurring_transfers_user_next_idx on public.recurring_transfers
  (user_id, next_occurrence) where is_active and ended_at is null;
alter table public.recurring_transfers enable row level security;
create policy recurring_transfers_owner_select on public.recurring_transfers
  for select to authenticated using (user_id = (select auth.uid()));
create policy recurring_transfers_owner_insert on public.recurring_transfers
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.accounts a where a.id = source_account_id
      and a.user_id = (select auth.uid()) and a.archived_at is null)
    and exists (select 1 from public.accounts a where a.id = destination_account_id
      and a.user_id = (select auth.uid()) and a.archived_at is null)
  );
create policy recurring_transfers_owner_update on public.recurring_transfers
  for update to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.accounts a where a.id = source_account_id
      and a.user_id = (select auth.uid()) and a.archived_at is null)
    and exists (select 1 from public.accounts a where a.id = destination_account_id
      and a.user_id = (select auth.uid()) and a.archived_at is null)
  );
revoke all on public.recurring_transfers from anon, authenticated;
grant select, insert, update on public.recurring_transfers to authenticated;

alter table public.transfers
  add column recurring_transfer_id uuid references public.recurring_transfers(id) on delete restrict,
  add column scheduled_date date;
alter table public.transfers add constraint transfers_recurring_reference_consistency check (
  (recurring_transfer_id is null and scheduled_date is null)
  or (recurring_transfer_id is not null and scheduled_date is not null)
);
create unique index transfers_recurring_occurrence_idx on public.transfers
  (recurring_transfer_id, scheduled_date) where recurring_transfer_id is not null;

create or replace function private.generate_one_recurring_transfer(
  target_recurring_id uuid, target_transaction_date date,
  target_amount_minor bigint, target_destination_amount_minor bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  rule_row public.recurring_transfers%rowtype;
  created_id uuid;
  next_date date;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into rule_row from public.recurring_transfers
  where id = target_recurring_id and user_id = current_user_id
    and is_active and ended_at is null for update;
  if not found then raise exception 'invalid_recurring_transfer' using errcode = '23503'; end if;
  if target_transaction_date is null or target_amount_minor not between 1 and 9007199254740991
    or target_destination_amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_recurring_transfer_values' using errcode = '23514';
  end if;
  if rule_row.end_date is not null and rule_row.next_occurrence > rule_row.end_date then
    raise exception 'recurring_transfer_ended' using errcode = '23514';
  end if;
  created_id := private.create_account_transfer(
    rule_row.source_account_id, rule_row.destination_account_id,
    target_amount_minor, target_destination_amount_minor,
    target_transaction_date, 'pending', rule_row.description, rule_row.notes);
  update public.transfers set recurring_transfer_id = rule_row.id,
    scheduled_date = rule_row.next_occurrence where id = created_id and user_id = current_user_id;
  next_date := public.recurrence_next_date(
    rule_row.start_date, rule_row.next_occurrence, rule_row.frequency);
  update public.recurring_transfers set next_occurrence = next_date,
    is_active = case when end_date is not null and next_date > end_date then false else is_active end,
    ended_at = case when end_date is not null and next_date > end_date
      then coalesce(ended_at, now()) else ended_at end,
    updated_at = now()
  where id = rule_row.id;
  return created_id;
end;
$$;

create or replace function private.generate_recurring_transfers(target_until date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  rule_row public.recurring_transfers%rowtype;
  occurrence_date date;
  generated_count integer := 0;
  iteration_count integer;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if target_until is null then raise exception 'generation_date_required' using errcode = '22004'; end if;
  for rule_row in select * from public.recurring_transfers
    where user_id = current_user_id and is_active and ended_at is null
      and next_occurrence <= target_until
    order by next_occurrence, id for update skip locked
  loop
    occurrence_date := rule_row.next_occurrence;
    iteration_count := 0;
    while occurrence_date <= target_until and
      (rule_row.end_date is null or occurrence_date <= rule_row.end_date)
    loop
      iteration_count := iteration_count + 1;
      if iteration_count > 10000 then
        raise exception 'recurring_transfer_generation_limit' using errcode = '54000';
      end if;
      perform private.generate_one_recurring_transfer(rule_row.id,
        occurrence_date, rule_row.amount_minor, rule_row.destination_amount_minor);
      generated_count := generated_count + 1;
      occurrence_date := public.recurrence_next_date(rule_row.start_date,
        occurrence_date, rule_row.frequency);
    end loop;
  end loop;
  return generated_count;
end;
$$;

create or replace function public.generate_one_recurring_transfer(
  target_recurring_id uuid, target_transaction_date date,
  target_amount_minor bigint, target_destination_amount_minor bigint
) returns uuid language sql security invoker set search_path = '' as $$
  select private.generate_one_recurring_transfer(target_recurring_id,
    target_transaction_date, target_amount_minor, target_destination_amount_minor);
$$;

create or replace function public.generate_all_recurring_forecasts(
  target_until date, review_overrides jsonb default '[]'::jsonb
) returns integer language sql security invoker set search_path = '' as $$
  select private.generate_recurring_transactions_reviewed(target_until, review_overrides)
    + private.generate_recurring_transfers(target_until);
$$;

revoke all on function private.generate_one_recurring_transfer(uuid,date,bigint,bigint)
  from public, anon, authenticated;
revoke all on function private.generate_recurring_transfers(date)
  from public, anon, authenticated;
grant execute on function private.generate_one_recurring_transfer(uuid,date,bigint,bigint)
  to authenticated;
grant execute on function private.generate_recurring_transfers(date) to authenticated;
revoke all on function public.generate_one_recurring_transfer(uuid,date,bigint,bigint)
  from public, anon;
revoke all on function public.generate_all_recurring_forecasts(date,jsonb)
  from public, anon;
grant execute on function public.generate_one_recurring_transfer(uuid,date,bigint,bigint)
  to authenticated;
grant execute on function public.generate_all_recurring_forecasts(date,jsonb)
  to authenticated;
