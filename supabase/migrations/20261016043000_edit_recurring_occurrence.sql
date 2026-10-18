-- Edit one generated occurrence without changing its recurrence key or future rules.
-- The transaction balance/reconciliation triggers apply in this same statement.
create or replace function private.update_recurring_occurrence(
  target_transaction_id uuid,
  target_description text,
  target_amount_minor bigint,
  target_transaction_date date,
  target_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(target_description, ''))) not between 1 and 180
    or target_amount_minor not between 1 and 9007199254740991
    or target_transaction_date is null
    or char_length(coalesce(target_notes, '')) > 1000 then
    raise exception 'invalid_recurring_occurrence' using errcode = '23514';
  end if;
  update public.transactions
  set description = trim(target_description),
      amount_minor = target_amount_minor,
      transaction_date = target_transaction_date,
      notes = nullif(trim(target_notes), '')
  where id = target_transaction_id
    and user_id = current_user_id
    and is_active
    and origin_type = 'system'
    and recurring_transaction_id is not null
    and not exists (
      select 1 from public.investment_cash_flows flow
      where flow.transaction_id = target_transaction_id
        or flow.source_transaction_id = target_transaction_id
    );
  if not found then
    raise exception 'recurring_occurrence_not_found' using errcode = 'P0002';
  end if;
  return target_transaction_id;
end;
$$;

create or replace function public.update_recurring_occurrence(
  target_transaction_id uuid,
  target_description text,
  target_amount_minor bigint,
  target_transaction_date date,
  target_notes text
) returns uuid language sql security invoker set search_path = '' as $$
  select private.update_recurring_occurrence(
    target_transaction_id, target_description, target_amount_minor,
    target_transaction_date, target_notes
  );
$$;

revoke all on function private.update_recurring_occurrence(uuid, text, bigint, date, text)
from public, anon, authenticated;
grant execute on function private.update_recurring_occurrence(uuid, text, bigint, date, text)
to authenticated;
revoke all on function public.update_recurring_occurrence(uuid, text, bigint, date, text)
from public, anon;
grant execute on function public.update_recurring_occurrence(uuid, text, bigint, date, text)
to authenticated;
