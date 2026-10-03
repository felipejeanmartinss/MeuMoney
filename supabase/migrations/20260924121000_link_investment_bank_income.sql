-- A bank income can be associated with a position without creating a second
-- bank transaction. Unlike transaction_id, this source is never deleted when
-- the investment cash-flow association is removed.
alter table public.investment_cash_flows
add column source_transaction_id uuid references public.transactions(id) on delete restrict;

alter table public.investment_cash_flows
add constraint investment_cash_flows_single_source check (
  source_transaction_id is null or (
    transaction_id is null and source_transfer_id is null and source_account_id is null
  )
);

create unique index investment_cash_flows_source_transaction_unique_idx
on public.investment_cash_flows (source_transaction_id)
where source_transaction_id is not null;

create or replace function public.protect_linked_investment_bank_income()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.investment_cash_flows
    where source_transaction_id = old.id) then
    raise exception 'investment_source_must_be_unlinked_first' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger protect_linked_investment_bank_income_update
before update of account_id, amount_minor, transaction_date, status, is_active,
  transaction_type, origin_type on public.transactions
for each row when (
  old.account_id is distinct from new.account_id or
  old.amount_minor is distinct from new.amount_minor or
  old.transaction_date is distinct from new.transaction_date or
  old.status is distinct from new.status or
  old.is_active is distinct from new.is_active or
  old.transaction_type is distinct from new.transaction_type or
  old.origin_type is distinct from new.origin_type
) execute function public.protect_linked_investment_bank_income();

revoke all on function public.protect_linked_investment_bank_income()
from public, anon, authenticated;

create or replace function private.link_investment_bank_income(
  target_position_id uuid,
  target_transaction_id uuid,
  target_income_type public.investment_income_type,
  target_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  source_record public.transactions%rowtype;
  source_account public.accounts%rowtype;
  position_record public.investment_positions%rowtype;
  effect_record record;
  new_cash_flow_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_income_type is null or char_length(coalesce(target_notes, '')) > 1000 then
    raise exception 'invalid_investment_income' using errcode = '23514';
  end if;
  select * into source_record from public.transactions
  where id = target_transaction_id and user_id = current_user_id
    and origin_type = 'manual' and transaction_type = 'income'
    and status = 'completed' and is_active and transaction_date <= current_date
  for update;
  if not found then
    raise exception 'invalid_investment_source_transaction' using errcode = '23503';
  end if;
  select * into source_account from public.accounts
  where id = source_record.account_id and user_id = current_user_id
    and archived_at is null and type <> 'credit_card';
  if not found then
    raise exception 'invalid_investment_source_account' using errcode = '23503';
  end if;
  select * into position_record from public.investment_positions
  where id = target_position_id and user_id = current_user_id and is_active
  for update;
  if not found or position_record.currency <> source_account.currency
    or position_record.context <> source_account.context then
    raise exception 'investment_source_account_mismatch' using errcode = '23514';
  end if;
  if exists (select 1 from public.investment_cash_flows
    where source_transaction_id = target_transaction_id) then
    raise exception 'investment_source_already_linked' using errcode = '23505';
  end if;
  select * into effect_record from private.apply_investment_position_effect(
    target_position_id, current_user_id, 'income', source_record.amount_minor,
    null, source_record.transaction_date
  );
  insert into public.investment_cash_flows (
    position_id, user_id, cash_flow_type, income_type, transaction_id,
    source_transaction_id, amount_minor, quantity, cash_flow_date, notes,
    position_value_delta_minor, position_cost_delta_minor, position_quantity_delta
  ) values (
    target_position_id, current_user_id, 'income', target_income_type, null,
    source_record.id, source_record.amount_minor, null, source_record.transaction_date,
    nullif(trim(target_notes), ''), effect_record.value_delta_minor,
    effect_record.cost_delta_minor, effect_record.quantity_delta
  ) returning id into new_cash_flow_id;
  return new_cash_flow_id;
end;
$$;

create or replace function public.link_investment_bank_income(
  target_position_id uuid,
  target_transaction_id uuid,
  target_income_type public.investment_income_type,
  target_notes text default null
) returns uuid language sql security invoker set search_path = '' as $$
  select private.link_investment_bank_income(
    target_position_id, target_transaction_id, target_income_type, target_notes
  );
$$;

revoke all on function private.link_investment_bank_income(
  uuid, uuid, public.investment_income_type, text
) from public, anon, authenticated;
grant execute on function private.link_investment_bank_income(
  uuid, uuid, public.investment_income_type, text
) to authenticated;
revoke all on function public.link_investment_bank_income(
  uuid, uuid, public.investment_income_type, text
) from public, anon;
grant execute on function public.link_investment_bank_income(
  uuid, uuid, public.investment_income_type, text
) to authenticated;
