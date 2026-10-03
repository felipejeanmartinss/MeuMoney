-- Keep the original recurrence occurrence distinct from its editable posting date.
alter table public.transactions add column scheduled_date date;

update public.transactions
set scheduled_date = transaction_date
where recurring_transaction_id is not null;

alter table public.transactions add constraint recurring_transaction_scheduled_date_required
check (recurring_transaction_id is null or scheduled_date is not null);

drop index public.transactions_recurring_occurrence_unique_idx;
create unique index transactions_recurring_occurrence_unique_idx
on public.transactions (recurring_transaction_id, scheduled_date)
where recurring_transaction_id is not null;

create or replace function private.generate_recurring_transactions(target_until date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  recurrence_record public.recurring_transactions%rowtype;
  occurrence_date date;
  generated_count integer := 0;
  inserted_count integer;
  iteration_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_until is null then
    raise exception 'generation_date_required' using errcode = '22004';
  end if;
  for recurrence_record in
    select recurrence.* from public.recurring_transactions recurrence
    where recurrence.user_id = current_user_id and recurrence.is_active
      and recurrence.next_occurrence <= target_until
    order by recurrence.next_occurrence, recurrence.id for update skip locked
  loop
    if not exists (select 1 from public.accounts where id = recurrence_record.account_id
      and user_id = current_user_id and archived_at is null) then
      raise exception 'invalid_recurring_transaction_account' using errcode = '23503';
    end if;
    if not exists (select 1 from public.categories where id = recurrence_record.category_id
      and user_id = current_user_id and kind = recurrence_record.transaction_type
      and archived_at is null) then
      raise exception 'invalid_recurring_transaction_category' using errcode = '23503';
    end if;
    occurrence_date := recurrence_record.next_occurrence;
    iteration_count := 0;
    while occurrence_date <= target_until and
      (recurrence_record.end_date is null or occurrence_date <= recurrence_record.end_date)
    loop
      iteration_count := iteration_count + 1;
      if iteration_count > 10000 then
        raise exception 'recurring_transaction_generation_limit' using errcode = '54000';
      end if;
      insert into public.transactions (
        user_id, account_id, category_id, transaction_type, description,
        amount_minor, transaction_date, scheduled_date, status, notes,
        is_active, origin_type, origin_id, recurring_transaction_id
      ) values (
        current_user_id, recurrence_record.account_id, recurrence_record.category_id,
        recurrence_record.transaction_type, recurrence_record.description,
        recurrence_record.amount_minor, occurrence_date, occurrence_date, 'pending',
        recurrence_record.notes, true, 'system', recurrence_record.id,
        recurrence_record.id
      ) on conflict (recurring_transaction_id, scheduled_date)
        where recurring_transaction_id is not null do nothing;
      get diagnostics inserted_count = row_count;
      generated_count := generated_count + inserted_count;
      occurrence_date := public.recurrence_next_date(
        recurrence_record.start_date, occurrence_date, recurrence_record.frequency
      );
    end loop;
    update public.recurring_transactions
    set next_occurrence = occurrence_date,
        is_active = case when end_date is not null and occurrence_date > end_date
          then false else is_active end,
        ended_at = case when end_date is not null and occurrence_date > end_date
          then coalesce(ended_at, now()) else ended_at end
    where id = recurrence_record.id;
  end loop;
  return generated_count;
end;
$$;

create or replace function private.generate_recurring_transactions_reviewed(
  target_until date, review_overrides jsonb default '[]'::jsonb
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  review_item jsonb;
  target_recurring_id uuid;
  occurrence_date date;
  reviewed_date date;
  reviewed_amount bigint;
  generated_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(review_overrides, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_recurrence_review' using errcode = '22023';
  end if;
  for review_item in select value from jsonb_array_elements(coalesce(review_overrides, '[]'::jsonb)) loop
    begin
      target_recurring_id := (review_item ->> 'recurringId')::uuid;
      occurrence_date := (review_item ->> 'scheduledDate')::date;
      reviewed_date := (review_item ->> 'transactionDate')::date;
      reviewed_amount := (review_item ->> 'amountMinor')::bigint;
    exception when others then
      raise exception 'invalid_recurrence_review' using errcode = '22023';
    end;
    if reviewed_amount <= 0 or reviewed_date is null or occurrence_date is null
      or occurrence_date > target_until then
      raise exception 'invalid_recurrence_review' using errcode = '23514';
    end if;
    perform 1 from public.recurring_transactions recurrences
    where recurrences.id = target_recurring_id and recurrences.user_id = current_user_id
      and recurrences.is_active and not recurrences.is_amount_fixed
      and recurrences.next_occurrence = occurrence_date for update;
    if not found then
      raise exception 'invalid_recurrence_review' using errcode = '23514';
    end if;
  end loop;
  generated_count := private.generate_recurring_transactions(target_until);
  for review_item in select value from jsonb_array_elements(coalesce(review_overrides, '[]'::jsonb)) loop
    target_recurring_id := (review_item ->> 'recurringId')::uuid;
    occurrence_date := (review_item ->> 'scheduledDate')::date;
    reviewed_date := (review_item ->> 'transactionDate')::date;
    reviewed_amount := (review_item ->> 'amountMinor')::bigint;
    update public.transactions transactions
    set transaction_date = reviewed_date, amount_minor = reviewed_amount
    where transactions.user_id = current_user_id
      and transactions.recurring_transaction_id = target_recurring_id
      and transactions.scheduled_date = occurrence_date
      and transactions.origin_type = 'system'
      and transactions.status = 'pending' and transactions.is_active;
    if not found then
      raise exception 'recurrence_review_target_not_found' using errcode = 'P0002';
    end if;
  end loop;
  return generated_count;
end;
$$;

create or replace function private.generate_one_recurring_transaction(
  target_recurring_id uuid, target_transaction_date date, target_amount_minor bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  recurrence_record public.recurring_transactions%rowtype;
  generated_id uuid;
  next_date date;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into recurrence_record from public.recurring_transactions
  where id = target_recurring_id and user_id = current_user_id and is_active
  for update;
  if not found then
    raise exception 'invalid_recurring_transaction' using errcode = '23503';
  end if;
  if recurrence_record.end_date is not null
    and recurrence_record.next_occurrence > recurrence_record.end_date then
    raise exception 'recurrence_ended' using errcode = '23514';
  end if;
  if target_transaction_date is null or target_amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_recurrence_review' using errcode = '23514';
  end if;
  if not exists (select 1 from public.accounts where id = recurrence_record.account_id
    and user_id = current_user_id and archived_at is null) or not exists (
    select 1 from public.categories where id = recurrence_record.category_id
    and user_id = current_user_id and kind = recurrence_record.transaction_type
    and archived_at is null
  ) then
    raise exception 'invalid_recurring_transaction_target' using errcode = '23503';
  end if;
  insert into public.transactions (
    user_id, account_id, category_id, transaction_type, description, amount_minor,
    transaction_date, scheduled_date, status, notes, is_active, origin_type,
    origin_id, recurring_transaction_id
  ) values (
    current_user_id, recurrence_record.account_id, recurrence_record.category_id,
    recurrence_record.transaction_type, recurrence_record.description,
    recurrence_record.amount_minor, recurrence_record.next_occurrence,
    recurrence_record.next_occurrence,
    'pending', recurrence_record.notes, true, 'system', recurrence_record.id,
    recurrence_record.id
  ) on conflict (recurring_transaction_id, scheduled_date)
    where recurring_transaction_id is not null do nothing
  returning id into generated_id;
  if generated_id is null then
    raise exception 'recurrence_occurrence_already_generated' using errcode = '23505';
  end if;
  update public.transactions set amount_minor = target_amount_minor,
    transaction_date = target_transaction_date where id = generated_id;
  next_date := public.recurrence_next_date(
    recurrence_record.start_date, recurrence_record.next_occurrence,
    recurrence_record.frequency
  );
  update public.recurring_transactions set next_occurrence = next_date,
    is_active = case when end_date is not null and next_date > end_date
      then false else is_active end,
    ended_at = case when end_date is not null and next_date > end_date
      then coalesce(ended_at, now()) else ended_at end
  where id = target_recurring_id;
  return generated_id;
end;
$$;

create or replace function public.generate_one_recurring_transaction(
  target_recurring_id uuid, target_transaction_date date, target_amount_minor bigint
) returns uuid language sql security invoker set search_path = '' as $$
  select private.generate_one_recurring_transaction(
    target_recurring_id, target_transaction_date, target_amount_minor
  );
$$;

create or replace function private.update_automatic_transaction_date(
  target_transaction_id uuid, target_transaction_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_transaction_date is null then
    raise exception 'transaction_date_required' using errcode = '22004';
  end if;
  update public.transactions set transaction_date = target_transaction_date
  where id = target_transaction_id and user_id = current_user_id and is_active
    and origin_type in ('system', 'credit_card_invoice_payment')
    and status in ('pending', 'completed');
  if not found then
    raise exception 'automatic_transaction_not_found' using errcode = 'P0002';
  end if;
  return target_transaction_id;
end;
$$;

create or replace function public.update_automatic_transaction_date(
  target_transaction_id uuid, target_transaction_date date
) returns uuid language sql security invoker set search_path = '' as $$
  select private.update_automatic_transaction_date(
    target_transaction_id, target_transaction_date
  );
$$;

-- Confirm a pending recurrence against an actual bank entry, preserving its
-- scheduled occurrence key and avoiding a second transaction in the account.
create or replace function private.confirm_recurring_transaction(
  target_transaction_id uuid, target_account_id uuid,
  target_transaction_type public.transaction_kind, target_category_id uuid,
  target_description text, target_amount_minor bigint, target_transaction_date date,
  target_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  pending_record public.transactions%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into pending_record from public.transactions
  where id = target_transaction_id and user_id = current_user_id
    and account_id = target_account_id and origin_type = 'system'
    and transaction_type = target_transaction_type and category_id = target_category_id
    and recurring_transaction_id is not null and status = 'pending' and is_active
  for update;
  if not found then
    raise exception 'recurrence_forecast_not_found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(target_description, ''))) not between 1 and 160
    or target_amount_minor not between 1 and 9007199254740991
    or target_transaction_date is null or abs(target_transaction_date - pending_record.transaction_date) > 14
    or abs(target_amount_minor - pending_record.amount_minor) > greatest(500, pending_record.amount_minor / 5)
    or char_length(coalesce(target_notes, '')) > 1000 then
    raise exception 'recurrence_match_not_similar' using errcode = '23514';
  end if;
  update public.transactions set description = trim(target_description),
    amount_minor = target_amount_minor, transaction_date = target_transaction_date,
    notes = nullif(trim(target_notes), ''), status = 'completed'
  where id = target_transaction_id;
  return target_transaction_id;
end;
$$;

create or replace function public.confirm_recurring_transaction(
  target_transaction_id uuid, target_account_id uuid,
  target_transaction_type public.transaction_kind, target_category_id uuid,
  target_description text, target_amount_minor bigint, target_transaction_date date,
  target_notes text
) returns uuid language sql security invoker set search_path = '' as $$
  select private.confirm_recurring_transaction(
    target_transaction_id, target_account_id, target_transaction_type,
    target_category_id, target_description,
    target_amount_minor, target_transaction_date, target_notes
  );
$$;

revoke all on function private.generate_one_recurring_transaction(uuid, date, bigint)
from public, anon, authenticated;
revoke all on function private.update_automatic_transaction_date(uuid, date)
from public, anon, authenticated;
revoke all on function private.confirm_recurring_transaction(uuid, uuid, public.transaction_kind, uuid, text, bigint, date, text)
from public, anon, authenticated;
grant execute on function private.generate_one_recurring_transaction(uuid, date, bigint)
to authenticated;
grant execute on function private.update_automatic_transaction_date(uuid, date)
to authenticated;
grant execute on function private.confirm_recurring_transaction(uuid, uuid, public.transaction_kind, uuid, text, bigint, date, text)
to authenticated;
revoke all on function public.generate_one_recurring_transaction(uuid, date, bigint)
from public, anon;
revoke all on function public.update_automatic_transaction_date(uuid, date)
from public, anon;
revoke all on function public.confirm_recurring_transaction(uuid, uuid, public.transaction_kind, uuid, text, bigint, date, text)
from public, anon;
grant execute on function public.generate_one_recurring_transaction(uuid, date, bigint)
to authenticated;
grant execute on function public.update_automatic_transaction_date(uuid, date)
to authenticated;
grant execute on function public.confirm_recurring_transaction(uuid, uuid, public.transaction_kind, uuid, text, bigint, date, text)
to authenticated;
