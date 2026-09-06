-- Keep investment positions synchronized with their cash flows and expose
-- explicit, owner-scoped deletion operations for financial history.

alter table public.investment_cash_flows
add column position_value_delta_minor bigint not null default 0,
add column position_cost_delta_minor bigint not null default 0,
add column position_quantity_delta numeric(30, 12) not null default 0;

alter table public.investment_cash_flows
add constraint investment_cash_flows_value_delta_safe check (
  position_value_delta_minor between -9007199254740991 and 9007199254740991
),
add constraint investment_cash_flows_cost_delta_safe check (
  position_cost_delta_minor between -9007199254740991 and 9007199254740991
),
add constraint investment_cash_flows_quantity_delta_safe check (
  position_quantity_delta between -999999999999999999 and 999999999999999999
);

create or replace function private.apply_investment_position_effect(
  target_position_id uuid,
  target_user_id uuid,
  target_cash_flow_type public.investment_cash_flow_type,
  target_amount_minor bigint,
  target_quantity numeric,
  target_cash_flow_date date
)
returns table (
  value_delta_minor bigint,
  cost_delta_minor bigint,
  quantity_delta numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  position_record public.investment_positions%rowtype;
  redeemed_cost_minor bigint := 0;
begin
  select * into position_record
  from public.investment_positions
  where id = target_position_id
    and user_id = target_user_id
    and is_active
  for update;

  if not found then
    raise exception 'invalid_investment_position' using errcode = '23503';
  end if;

  if target_amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_investment_amount' using errcode = '23514';
  end if;
  if target_quantity is not null and target_quantity <= 0 then
    raise exception 'invalid_investment_quantity' using errcode = '23514';
  end if;

  if target_cash_flow_type = 'contribution' then
    value_delta_minor := target_amount_minor;
    cost_delta_minor := target_amount_minor;
    quantity_delta := coalesce(target_quantity, 0);
  elsif target_cash_flow_type = 'redemption' then
    if target_amount_minor > position_record.current_value_minor then
      raise exception 'investment_redemption_exceeds_position'
        using errcode = '23514';
    end if;
    if target_quantity is not null
      and target_quantity > position_record.quantity then
      raise exception 'investment_redemption_exceeds_quantity'
        using errcode = '23514';
    end if;

    if target_amount_minor = position_record.current_value_minor then
      redeemed_cost_minor := position_record.accumulated_cost_minor;
    elsif position_record.current_value_minor > 0 then
      redeemed_cost_minor := least(
        position_record.accumulated_cost_minor,
        round(
          position_record.accumulated_cost_minor::numeric
          * target_amount_minor::numeric
          / position_record.current_value_minor::numeric
        )::bigint
      );
    end if;

    value_delta_minor := -target_amount_minor;
    cost_delta_minor := -redeemed_cost_minor;
    quantity_delta := case
      when target_quantity is not null then -target_quantity
      when target_amount_minor = position_record.current_value_minor
        then -position_record.quantity
      else 0
    end;
  else
    value_delta_minor := 0;
    cost_delta_minor := 0;
    quantity_delta := 0;
  end if;

  update public.investment_positions
  set current_value_minor = current_value_minor + value_delta_minor,
      accumulated_cost_minor = accumulated_cost_minor + cost_delta_minor,
      quantity = quantity + quantity_delta,
      position_date = greatest(position_date, target_cash_flow_date)
  where id = target_position_id
    and user_id = target_user_id;

  return next;
end;
$$;

revoke all on function private.apply_investment_position_effect(
  uuid, uuid, public.investment_cash_flow_type, bigint, numeric, date
) from public, anon, authenticated;

create or replace function private.create_investment_account_entry(
  target_account_id uuid,
  target_position_id uuid,
  target_event_type text,
  target_description text,
  target_amount_minor bigint,
  target_quantity numeric,
  target_transaction_date date,
  target_notes text default null,
  target_create_position boolean default false,
  target_new_institution text default null,
  target_new_investment_class public.investment_class default null,
  target_new_investment_type text default null,
  target_new_asset_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  account_record public.accounts%rowtype;
  position_record public.investment_positions%rowtype;
  target_transaction_type public.transaction_kind;
  target_cash_flow_type public.investment_cash_flow_type;
  target_income_type public.investment_income_type;
  effect_record record;
  new_transaction_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_event_type not in (
    'contribution', 'redemption', 'interest_on_capital',
    'dividend', 'bonus', 'other'
  ) then
    raise exception 'invalid_investment_event_type' using errcode = '23514';
  end if;
  if target_amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_investment_amount' using errcode = '23514';
  end if;
  if target_transaction_date > current_date then
    raise exception 'future_investment_cash_flow' using errcode = '22007';
  end if;
  if char_length(trim(target_description)) not between 1 and 180 then
    raise exception 'invalid_investment_description' using errcode = '23514';
  end if;
  if target_notes is not null and char_length(target_notes) > 1000 then
    raise exception 'invalid_investment_notes' using errcode = '23514';
  end if;

  select * into account_record
  from public.accounts
  where id = target_account_id
    and user_id = current_user_id
    and type = 'investment'
    and archived_at is null
  for update;
  if not found then
    raise exception 'invalid_investment_account' using errcode = '23503';
  end if;

  if target_create_position then
    if target_event_type <> 'contribution'
      or target_position_id is not null then
      raise exception 'invalid_new_investment_position'
        using errcode = '23514';
    end if;
    if char_length(trim(coalesce(target_new_institution, ''))) not between 1 and 120
      or char_length(trim(coalesce(target_new_asset_name, ''))) not between 1 and 160
      or target_new_investment_class is null
      or target_new_investment_type is null then
      raise exception 'invalid_new_investment_position'
        using errcode = '23514';
    end if;

    insert into public.investment_positions (
      user_id, institution, investment_class, investment_type, asset_name,
      currency, quantity, accumulated_cost_minor, current_value_minor,
      position_date, context, history_is_complete, notes
    ) values (
      current_user_id, trim(target_new_institution),
      target_new_investment_class, target_new_investment_type,
      trim(target_new_asset_name), account_record.currency,
      0, 0, 0, target_transaction_date, account_record.context, true,
      nullif(trim(target_notes), '')
    ) returning * into position_record;
  else
    select * into position_record
    from public.investment_positions
    where id = target_position_id
      and user_id = current_user_id
      and is_active
    for update;
    if not found then
      raise exception 'invalid_investment_position' using errcode = '23503';
    end if;
  end if;
  if position_record.currency <> account_record.currency
    or position_record.context <> account_record.context then
    raise exception 'investment_account_mismatch' using errcode = '23514';
  end if;

  if target_event_type = 'contribution' then
    target_transaction_type := 'expense';
    target_cash_flow_type := 'contribution';
    target_income_type := null;
  elsif target_event_type = 'redemption' then
    target_transaction_type := 'income';
    target_cash_flow_type := 'redemption';
    target_income_type := null;
  else
    target_transaction_type := 'income';
    target_cash_flow_type := 'income';
    target_income_type := target_event_type::public.investment_income_type;
  end if;

  select * into effect_record
  from private.apply_investment_position_effect(
    position_record.id,
    current_user_id,
    target_cash_flow_type,
    target_amount_minor,
    target_quantity,
    target_transaction_date
  );

  insert into public.transactions (
    user_id, account_id, category_id, transaction_type, description,
    amount_minor, transaction_date, status, notes, is_active,
    origin_type, origin_id
  ) values (
    current_user_id, target_account_id, null, target_transaction_type,
    trim(target_description), target_amount_minor, target_transaction_date,
    'completed', nullif(trim(target_notes), ''), true,
    'investment'::text::public.transaction_origin_type, position_record.id
  ) returning id into new_transaction_id;

  insert into public.investment_cash_flows (
    position_id, user_id, cash_flow_type, income_type, transaction_id,
    amount_minor, quantity, cash_flow_date, notes,
    position_value_delta_minor, position_cost_delta_minor,
    position_quantity_delta
  ) values (
    position_record.id, current_user_id, target_cash_flow_type,
    target_income_type, new_transaction_id, target_amount_minor,
    target_quantity, target_transaction_date, nullif(trim(target_notes), ''),
    effect_record.value_delta_minor, effect_record.cost_delta_minor,
    effect_record.quantity_delta
  );

  return new_transaction_id;
end;
$$;

create or replace function private.create_investment_cash_flow(
  target_position_id uuid,
  target_cash_flow_type public.investment_cash_flow_type,
  target_amount_minor bigint,
  target_quantity numeric,
  target_cash_flow_date date,
  target_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  effect_record record;
  new_cash_flow_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_cash_flow_date > current_date then
    raise exception 'future_investment_cash_flow' using errcode = '22007';
  end if;
  if target_notes is not null and char_length(target_notes) > 1000 then
    raise exception 'invalid_investment_notes' using errcode = '23514';
  end if;

  select * into effect_record
  from private.apply_investment_position_effect(
    target_position_id,
    current_user_id,
    target_cash_flow_type,
    target_amount_minor,
    target_quantity,
    target_cash_flow_date
  );

  insert into public.investment_cash_flows (
    position_id, user_id, cash_flow_type, amount_minor, quantity,
    cash_flow_date, notes, position_value_delta_minor,
    position_cost_delta_minor, position_quantity_delta
  ) values (
    target_position_id, current_user_id, target_cash_flow_type,
    target_amount_minor, target_quantity, target_cash_flow_date,
    nullif(trim(target_notes), ''), effect_record.value_delta_minor,
    effect_record.cost_delta_minor, effect_record.quantity_delta
  ) returning id into new_cash_flow_id;

  return new_cash_flow_id;
end;
$$;

create or replace function public.create_investment_cash_flow(
  target_position_id uuid,
  target_cash_flow_type public.investment_cash_flow_type,
  target_amount_minor bigint,
  target_quantity numeric,
  target_cash_flow_date date,
  target_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_investment_cash_flow(
    target_position_id,
    target_cash_flow_type,
    target_amount_minor,
    target_quantity,
    target_cash_flow_date,
    target_notes
  );
$$;

-- A transfer already affects the investment account balance. Linking it to a
-- position must therefore create only the portfolio cash flow, not a second
-- account transaction.
create or replace function private.link_investment_transfer_entry(
  target_account_id uuid,
  target_transfer_entry_id uuid,
  target_position_id uuid,
  target_event_type text,
  target_quantity numeric,
  target_notes text default null,
  target_create_position boolean default false,
  target_new_institution text default null,
  target_new_investment_class public.investment_class default null,
  target_new_investment_type text default null,
  target_new_asset_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  entry_record public.transfer_entries%rowtype;
  transfer_record public.transfers%rowtype;
  account_record public.accounts%rowtype;
  position_record public.investment_positions%rowtype;
  target_cash_flow_type public.investment_cash_flow_type;
  target_income_type public.investment_income_type;
  effect_record record;
  new_cash_flow_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_event_type not in (
    'contribution', 'redemption', 'interest_on_capital',
    'dividend', 'bonus', 'other'
  ) then
    raise exception 'invalid_investment_event_type' using errcode = '23514';
  end if;
  if target_notes is not null and char_length(target_notes) > 1000 then
    raise exception 'invalid_investment_notes' using errcode = '23514';
  end if;

  select * into entry_record
  from public.transfer_entries
  where id = target_transfer_entry_id
    and user_id = current_user_id
    and account_id = target_account_id
    and status = 'completed'
    and is_active
    and transaction_date <= current_date
  for update;
  if not found then
    raise exception 'invalid_investment_transfer_entry' using errcode = '23503';
  end if;

  select * into transfer_record
  from public.transfers
  where id = entry_record.transfer_id
    and user_id = current_user_id
    and status = 'completed'
    and is_active
  for update;
  if not found then
    raise exception 'invalid_investment_transfer_entry' using errcode = '23503';
  end if;

  select * into account_record
  from public.accounts
  where id = target_account_id
    and user_id = current_user_id
    and type = 'investment'
    and archived_at is null
  for update;
  if not found then
    raise exception 'invalid_investment_account' using errcode = '23503';
  end if;

  if (target_event_type = 'contribution' and entry_record.direction <> 'inflow')
    or (target_event_type <> 'contribution' and entry_record.direction <> 'outflow') then
    raise exception 'investment_transfer_direction_mismatch' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.investment_cash_flows flow
    where flow.user_id = current_user_id
      and flow.source_transfer_id = transfer_record.id
      and flow.source_account_id = target_account_id
  ) then
    raise exception 'investment_transfer_already_linked' using errcode = '23505';
  end if;

  if target_create_position then
    if target_event_type <> 'contribution' or target_position_id is not null
      or char_length(trim(coalesce(target_new_institution, ''))) not between 1 and 120
      or char_length(trim(coalesce(target_new_asset_name, ''))) not between 1 and 160
      or target_new_investment_class is null
      or target_new_investment_type is null then
      raise exception 'invalid_new_investment_position' using errcode = '23514';
    end if;
    insert into public.investment_positions (
      user_id, institution, investment_class, investment_type, asset_name,
      currency, quantity, accumulated_cost_minor, current_value_minor,
      position_date, context, history_is_complete, notes
    ) values (
      current_user_id, trim(target_new_institution), target_new_investment_class,
      target_new_investment_type, trim(target_new_asset_name),
      account_record.currency, 0, 0, 0, entry_record.transaction_date,
      account_record.context, true, nullif(trim(target_notes), '')
    ) returning * into position_record;
  else
    select * into position_record
    from public.investment_positions
    where id = target_position_id
      and user_id = current_user_id
      and is_active
    for update;
    if not found then
      raise exception 'invalid_investment_position' using errcode = '23503';
    end if;
  end if;
  if position_record.currency <> account_record.currency
    or position_record.context <> account_record.context then
    raise exception 'investment_account_mismatch' using errcode = '23514';
  end if;

  if target_event_type = 'contribution' then
    target_cash_flow_type := 'contribution';
    target_income_type := null;
  elsif target_event_type = 'redemption' then
    target_cash_flow_type := 'redemption';
    target_income_type := null;
  else
    target_cash_flow_type := 'income';
    target_income_type := target_event_type::public.investment_income_type;
  end if;

  select * into effect_record
  from private.apply_investment_position_effect(
    position_record.id, current_user_id, target_cash_flow_type,
    entry_record.amount_minor, target_quantity, entry_record.transaction_date
  );

  insert into public.investment_cash_flows (
    position_id, user_id, cash_flow_type, income_type, transaction_id,
    source_transfer_id, source_account_id, amount_minor, quantity,
    cash_flow_date, notes, position_value_delta_minor,
    position_cost_delta_minor, position_quantity_delta
  ) values (
    position_record.id, current_user_id, target_cash_flow_type,
    target_income_type, null, transfer_record.id, target_account_id,
    entry_record.amount_minor, target_quantity, entry_record.transaction_date,
    nullif(trim(target_notes), ''), effect_record.value_delta_minor,
    effect_record.cost_delta_minor, effect_record.quantity_delta
  ) returning id into new_cash_flow_id;

  return new_cash_flow_id;
end;
$$;

create or replace function private.delete_investment_cash_flow(
  target_cash_flow_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  flow_record public.investment_cash_flows%rowtype;
  position_record public.investment_positions%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into flow_record
  from public.investment_cash_flows
  where id = target_cash_flow_id
    and user_id = current_user_id;
  if not found then
    raise exception 'investment_cash_flow_not_found' using errcode = 'P0002';
  end if;

  select * into position_record
  from public.investment_positions
  where id = flow_record.position_id
    and user_id = current_user_id
  for update;
  if not found then
    raise exception 'invalid_investment_position' using errcode = '23503';
  end if;

  select * into flow_record
  from public.investment_cash_flows
  where id = target_cash_flow_id
    and user_id = current_user_id
  for update;
  if not found then
    raise exception 'investment_cash_flow_not_found' using errcode = 'P0002';
  end if;

  if position_record.current_value_minor - flow_record.position_value_delta_minor < 0
    or position_record.accumulated_cost_minor - flow_record.position_cost_delta_minor < 0
    or position_record.quantity - flow_record.position_quantity_delta < 0 then
    raise exception 'investment_cash_flow_reversal_conflict'
      using errcode = '23514';
  end if;

  update public.investment_positions
  set current_value_minor = current_value_minor
        - flow_record.position_value_delta_minor,
      accumulated_cost_minor = accumulated_cost_minor
        - flow_record.position_cost_delta_minor,
      quantity = quantity - flow_record.position_quantity_delta
  where id = position_record.id
    and user_id = current_user_id;

  if flow_record.transaction_id is not null then
    delete from public.transactions
    where id = flow_record.transaction_id
      and user_id = current_user_id;
    if not found then
      raise exception 'investment_transaction_not_found' using errcode = 'P0002';
    end if;
  else
    delete from public.investment_cash_flows
    where id = flow_record.id
      and user_id = current_user_id;
  end if;

  return position_record.id;
end;
$$;

create or replace function public.delete_investment_cash_flow(
  target_cash_flow_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.delete_investment_cash_flow(target_cash_flow_id);
$$;

create or replace function private.delete_investment_position(
  target_position_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform 1
  from public.investment_positions
  where id = target_position_id
    and user_id = current_user_id
  for update;
  if not found then
    raise exception 'invalid_investment_position' using errcode = 'P0002';
  end if;

  delete from public.transactions transaction_row
  using public.investment_cash_flows flow
  where flow.position_id = target_position_id
    and flow.user_id = current_user_id
    and flow.transaction_id = transaction_row.id
    and transaction_row.user_id = current_user_id;

  delete from public.investment_positions
  where id = target_position_id
    and user_id = current_user_id;

  return true;
end;
$$;

create or replace function public.delete_investment_position(
  target_position_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.delete_investment_position(target_position_id);
$$;

drop policy if exists "investment_cash_flows_owner_insert"
on public.investment_cash_flows;
revoke insert on table public.investment_cash_flows from authenticated;
revoke insert (
  position_id,
  user_id,
  cash_flow_type,
  amount_minor,
  quantity,
  cash_flow_date,
  notes
) on table public.investment_cash_flows from authenticated;

revoke all on function private.create_investment_cash_flow(
  uuid, public.investment_cash_flow_type, bigint, numeric, date, text
) from public, anon, authenticated;
grant execute on function private.create_investment_cash_flow(
  uuid, public.investment_cash_flow_type, bigint, numeric, date, text
) to authenticated;
revoke all on function public.create_investment_cash_flow(
  uuid, public.investment_cash_flow_type, bigint, numeric, date, text
) from public, anon;
grant execute on function public.create_investment_cash_flow(
  uuid, public.investment_cash_flow_type, bigint, numeric, date, text
) to authenticated;

revoke all on function private.delete_investment_cash_flow(uuid)
from public, anon, authenticated;
grant execute on function private.delete_investment_cash_flow(uuid)
to authenticated;
revoke all on function public.delete_investment_cash_flow(uuid)
from public, anon;
grant execute on function public.delete_investment_cash_flow(uuid)
to authenticated;

revoke all on function private.delete_investment_position(uuid)
from public, anon, authenticated;
grant execute on function private.delete_investment_position(uuid)
to authenticated;
revoke all on function public.delete_investment_position(uuid)
from public, anon;
grant execute on function public.delete_investment_position(uuid)
to authenticated;

drop policy if exists "transfers_owner_delete" on public.transfers;
create policy "transfers_owner_delete"
on public.transfers
for delete
to authenticated
using ((select auth.uid()) = user_id);
grant delete on table public.transfers to authenticated;

create or replace function public.validate_net_worth_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or new.user_id <> current_user_id then
    raise exception 'net_worth_item_user_mismatch' using errcode = '42501';
  end if;
  if new.valuation_date > current_date then
    raise exception 'future_net_worth_valuation' using errcode = '22007';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'net_worth_item_owner_is_immutable' using errcode = '42501';
    end if;
    if new.currency <> old.currency then
      raise exception 'net_worth_item_currency_is_immutable' using errcode = '23514';
    end if;
    if new.kind <> old.kind then
      raise exception 'net_worth_item_kind_is_immutable' using errcode = '23514';
    end if;
    if (
      new.current_value_minor <> old.current_value_minor
      or new.valuation_date <> old.valuation_date
    ) and new.valuation_date < old.valuation_date
      and current_setting('app.allow_net_worth_rollback', true) is distinct from 'on'
    then
      raise exception 'net_worth_valuation_date_cannot_go_backwards'
        using errcode = '22007';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.delete_net_worth_valuation(
  target_valuation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  valuation_record public.net_worth_valuations%rowtype;
  item_record public.net_worth_items%rowtype;
  replacement_record public.net_worth_valuations%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into valuation_record
  from public.net_worth_valuations
  where id = target_valuation_id
    and user_id = current_user_id
  for update;
  if not found then
    raise exception 'net_worth_valuation_not_found' using errcode = 'P0002';
  end if;

  select * into item_record
  from public.net_worth_items
  where id = valuation_record.item_id
    and user_id = current_user_id
  for update;
  if not found then
    raise exception 'net_worth_item_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.net_worth_valuations
    where item_id = item_record.id
      and user_id = current_user_id
      and id <> valuation_record.id
  ) then
    raise exception 'last_net_worth_valuation' using errcode = '23514';
  end if;

  delete from public.net_worth_valuations
  where id = valuation_record.id
    and user_id = current_user_id;

  if item_record.valuation_date = valuation_record.valuation_date then
    select * into replacement_record
    from public.net_worth_valuations
    where item_id = item_record.id
      and user_id = current_user_id
    order by valuation_date desc, created_at desc
    limit 1;

    perform set_config('app.allow_net_worth_rollback', 'on', true);
    update public.net_worth_items
    set current_value_minor = replacement_record.value_minor,
        valuation_date = replacement_record.valuation_date
    where id = item_record.id
      and user_id = current_user_id;
  end if;

  return item_record.id;
end;
$$;

create or replace function public.delete_net_worth_valuation(
  target_valuation_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.delete_net_worth_valuation(target_valuation_id);
$$;

create or replace function private.delete_net_worth_item(
  target_item_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.financing_contracts
    where net_worth_item_id = target_item_id
      and user_id = current_user_id
  ) then
    raise exception 'managed_financing_item' using errcode = '23503';
  end if;

  delete from public.net_worth_items
  where id = target_item_id
    and user_id = current_user_id;
  if not found then
    raise exception 'net_worth_item_not_found' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

create or replace function public.delete_net_worth_item(
  target_item_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.delete_net_worth_item(target_item_id);
$$;

revoke all on function private.delete_net_worth_valuation(uuid)
from public, anon, authenticated;
grant execute on function private.delete_net_worth_valuation(uuid)
to authenticated;
revoke all on function public.delete_net_worth_valuation(uuid)
from public, anon;
grant execute on function public.delete_net_worth_valuation(uuid)
to authenticated;

revoke all on function private.delete_net_worth_item(uuid)
from public, anon, authenticated;
grant execute on function private.delete_net_worth_item(uuid)
to authenticated;
revoke all on function public.delete_net_worth_item(uuid)
from public, anon;
grant execute on function public.delete_net_worth_item(uuid)
to authenticated;

comment on column public.investment_cash_flows.position_value_delta_minor is
'Efeito aplicado ao valor atual da posicao; usado para reversao exata.';
comment on column public.investment_cash_flows.position_cost_delta_minor is
'Efeito aplicado ao custo acumulado da posicao; usado para reversao exata.';
comment on column public.investment_cash_flows.position_quantity_delta is
'Efeito aplicado a quantidade da posicao; usado para reversao exata.';
