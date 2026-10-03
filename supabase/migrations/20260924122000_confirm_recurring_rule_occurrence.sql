-- Confirm a registered recurrence when its pending forecast has not been generated yet.
-- Generation and confirmation share one database transaction, so a failed match
-- cannot leave an extra pending entry or advance the recurrence cursor.
create or replace function private.confirm_recurring_rule_occurrence(
  target_recurring_id uuid, target_account_id uuid,
  target_transaction_type public.transaction_kind, target_category_id uuid,
  target_description text, target_amount_minor bigint, target_transaction_date date,
  target_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  recurrence_record public.recurring_transactions%rowtype;
  forecast_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into recurrence_record from public.recurring_transactions
  where id = target_recurring_id and user_id = current_user_id and is_active
  for update;
  if not found then
    raise exception 'invalid_recurring_transaction' using errcode = 'P0002';
  end if;
  if recurrence_record.account_id <> target_account_id
    or recurrence_record.category_id <> target_category_id
    or recurrence_record.transaction_type <> target_transaction_type
    or target_transaction_date is null
    or abs(target_transaction_date - recurrence_record.next_occurrence) > 14
    or target_amount_minor not between 1 and 9007199254740991
    or abs(target_amount_minor - recurrence_record.amount_minor)
      > greatest(500, recurrence_record.amount_minor / 5)
    or (recurrence_record.end_date is not null
      and recurrence_record.next_occurrence > recurrence_record.end_date) then
    raise exception 'recurrence_match_not_similar' using errcode = '23514';
  end if;

  select id into forecast_id from public.transactions
  where user_id = current_user_id and recurring_transaction_id = target_recurring_id
    and origin_type = 'system' and status = 'pending' and is_active
    and account_id = target_account_id and category_id = target_category_id
    and abs(transaction_date - target_transaction_date) <= 14
    and abs(amount_minor - target_amount_minor) <= greatest(500, amount_minor / 5)
  order by abs(transaction_date - target_transaction_date), scheduled_date
  limit 1 for update;

  if forecast_id is null then
    forecast_id := private.generate_one_recurring_transaction(
      target_recurring_id, target_transaction_date, target_amount_minor
    );
  end if;

  return private.confirm_recurring_transaction(
    forecast_id, target_account_id, target_transaction_type, target_category_id,
    target_description, target_amount_minor, target_transaction_date, target_notes
  );
end;
$$;

create or replace function public.confirm_recurring_rule_occurrence(
  target_recurring_id uuid, target_account_id uuid,
  target_transaction_type public.transaction_kind, target_category_id uuid,
  target_description text, target_amount_minor bigint, target_transaction_date date,
  target_notes text
) returns uuid language sql security invoker set search_path = '' as $$
  select private.confirm_recurring_rule_occurrence(
    target_recurring_id, target_account_id, target_transaction_type,
    target_category_id, target_description, target_amount_minor,
    target_transaction_date, target_notes
  );
$$;

revoke all on function private.confirm_recurring_rule_occurrence(
  uuid, uuid, public.transaction_kind, uuid, text, bigint, date, text
) from public, anon, authenticated;
grant execute on function private.confirm_recurring_rule_occurrence(
  uuid, uuid, public.transaction_kind, uuid, text, bigint, date, text
) to authenticated;
revoke all on function public.confirm_recurring_rule_occurrence(
  uuid, uuid, public.transaction_kind, uuid, text, bigint, date, text
) from public, anon;
grant execute on function public.confirm_recurring_rule_occurrence(
  uuid, uuid, public.transaction_kind, uuid, text, bigint, date, text
) to authenticated;

notify pgrst, 'reload schema';
