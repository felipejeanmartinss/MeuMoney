-- Investment edits reverse the recorded position effect and apply the new one
-- in the same database transaction as their bank/transfer source.
create or replace function private.refresh_investment_position_date(
  target_position_id uuid, target_user_id uuid
) returns void language sql security definer set search_path = '' as $$
  update public.investment_positions position
  set position_date = greatest(
    coalesce(position.initial_position_date, position.position_date),
    coalesce((select max(snapshot.position_date)
      from public.investment_position_snapshots snapshot
      where snapshot.position_id = target_position_id
        and snapshot.user_id = target_user_id),
      coalesce(position.initial_position_date, position.position_date)),
    coalesce((select max(flow.cash_flow_date)
      from public.investment_cash_flows flow
      where flow.position_id = target_position_id
        and flow.user_id = target_user_id),
      coalesce(position.initial_position_date, position.position_date))
  )
  where position.id = target_position_id and position.user_id = target_user_id;
$$;

revoke all on function private.refresh_investment_position_date(uuid,uuid)
from public, anon, authenticated;

create or replace function private.update_investment_cash_flow(
  target_cash_flow_id uuid,
  target_amount_minor bigint,
  target_quantity numeric,
  target_cash_flow_date date,
  target_description text,
  target_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  flow_record public.investment_cash_flows%rowtype;
  position_record public.investment_positions%rowtype;
  effect_record record;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_amount_minor not between 1 and 9007199254740991
    or target_cash_flow_date is null or target_cash_flow_date > current_date
    or (target_quantity is not null and target_quantity <= 0)
    or char_length(coalesce(target_notes, '')) > 1000 then
    raise exception 'invalid_investment_cash_flow' using errcode = '23514';
  end if;

  select * into flow_record from public.investment_cash_flows
  where id = target_cash_flow_id and user_id = current_user_id for update;
  if not found then
    raise exception 'investment_cash_flow_not_found' using errcode = 'P0002';
  end if;
  if flow_record.source_transfer_id is not null then
    raise exception 'edit_linked_transfer_at_source' using errcode = '23514';
  end if;
  if (flow_record.transaction_id is not null or flow_record.source_transaction_id is not null)
    and char_length(trim(coalesce(target_description, ''))) not between 1 and 180 then
    raise exception 'invalid_investment_source_description' using errcode = '23514';
  end if;
  select * into position_record from public.investment_positions
  where id = flow_record.position_id and user_id = current_user_id
    and is_active for update;
  if not found then
    raise exception 'invalid_investment_position' using errcode = '23503';
  end if;
  if position_record.current_value_minor - flow_record.position_value_delta_minor < 0
    or position_record.accumulated_cost_minor - flow_record.position_cost_delta_minor < 0
    or position_record.quantity - flow_record.position_quantity_delta < 0 then
    raise exception 'investment_cash_flow_reversal_conflict' using errcode = '23514';
  end if;
  update public.investment_positions set
    current_value_minor = current_value_minor - flow_record.position_value_delta_minor,
    accumulated_cost_minor = accumulated_cost_minor - flow_record.position_cost_delta_minor,
    quantity = quantity - flow_record.position_quantity_delta
  where id = position_record.id and user_id = current_user_id;

  if flow_record.source_transaction_id is not null then
    -- The protective trigger blocks editing linked bank income. Detaching and
    -- reattaching inside this RPC keeps the source and cash flow indivisible.
    update public.investment_cash_flows set source_transaction_id = null
    where id = flow_record.id;
    update public.transactions set description = trim(target_description),
      amount_minor = target_amount_minor,
      transaction_date = target_cash_flow_date
    where id = flow_record.source_transaction_id and user_id = current_user_id
      and origin_type = 'manual' and transaction_type = 'income'
      and status = 'completed' and is_active;
    if not found then
      raise exception 'investment_source_not_found' using errcode = 'P0002';
    end if;
  elsif flow_record.transaction_id is not null then
    update public.transactions set description = trim(target_description),
      amount_minor = target_amount_minor,
      transaction_date = target_cash_flow_date
    where id = flow_record.transaction_id and user_id = current_user_id
      and origin_type = 'investment' and status = 'completed' and is_active;
    if not found then
      raise exception 'investment_transaction_not_found' using errcode = 'P0002';
    end if;
  end if;

  select * into effect_record from private.apply_investment_position_effect(
    flow_record.position_id, current_user_id, flow_record.cash_flow_type,
    target_amount_minor, target_quantity, target_cash_flow_date
  );
  update public.investment_cash_flows set
    amount_minor = target_amount_minor,
    quantity = target_quantity,
    cash_flow_date = target_cash_flow_date,
    notes = nullif(trim(target_notes), ''),
    source_transaction_id = flow_record.source_transaction_id,
    position_value_delta_minor = effect_record.value_delta_minor,
    position_cost_delta_minor = effect_record.cost_delta_minor,
    position_quantity_delta = effect_record.quantity_delta
  where id = flow_record.id and user_id = current_user_id;
  perform private.refresh_investment_position_date(flow_record.position_id, current_user_id);
  return flow_record.position_id;
end;
$$;

create or replace function public.update_investment_cash_flow(
  target_cash_flow_id uuid,
  target_amount_minor bigint,
  target_quantity numeric,
  target_cash_flow_date date,
  target_description text,
  target_notes text
) returns uuid language sql security invoker set search_path = '' as $$
  select private.update_investment_cash_flow(
    target_cash_flow_id, target_amount_minor, target_quantity,
    target_cash_flow_date, target_description, target_notes
  );
$$;

revoke all on function private.update_investment_cash_flow(uuid,bigint,numeric,date,text,text)
from public, anon, authenticated;
grant execute on function private.update_investment_cash_flow(uuid,bigint,numeric,date,text,text)
to authenticated;
revoke all on function public.update_investment_cash_flow(uuid,bigint,numeric,date,text,text)
from public, anon;
grant execute on function public.update_investment_cash_flow(uuid,bigint,numeric,date,text,text)
to authenticated;

-- A transfer can fund two positions. Reverse every linked effect, update both
-- transfer legs, then reapply each effect using its leg's new amount.
create or replace function private.update_linked_investment_transfer(
  target_transfer_id uuid,
  source_account_id uuid,
  destination_account_id uuid,
  source_amount_minor bigint,
  destination_amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text,
  transfer_notes text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  transfer_record public.transfers%rowtype;
  flow_record public.investment_cash_flows%rowtype;
  position_record public.investment_positions%rowtype;
  entry_record public.transfer_entries%rowtype;
  effect_record record;
  linked_rows jsonb;
  item jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into transfer_record from public.transfers
  where id = target_transfer_id and user_id = current_user_id for update;
  if not found then
    raise exception 'transfer_not_found' using errcode = 'P0002';
  end if;
  if not transfer_record.is_active or transfer_record.status <> 'completed'
    or transfer_status <> 'completed'
    or transfer_record.source_account_id is distinct from source_account_id
    or transfer_record.destination_account_id is distinct from destination_account_id then
    raise exception 'linked_investment_transfer_accounts_immutable' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', flow.id, 'account_id', flow.source_account_id) order by flow.id), '[]'::jsonb)
  into linked_rows from public.investment_cash_flows flow
  where flow.source_transfer_id = target_transfer_id and flow.user_id = current_user_id;
  if jsonb_array_length(linked_rows) = 0 then
    raise exception 'linked_investment_transfer_not_found' using errcode = 'P0002';
  end if;

  for item in select value from jsonb_array_elements(linked_rows) loop
    select * into flow_record from public.investment_cash_flows
    where id = (item->>'id')::uuid and user_id = current_user_id for update;
    select * into position_record from public.investment_positions
    where id = flow_record.position_id and user_id = current_user_id
      and is_active for update;
    if not found or position_record.current_value_minor - flow_record.position_value_delta_minor < 0
      or position_record.accumulated_cost_minor - flow_record.position_cost_delta_minor < 0
      or position_record.quantity - flow_record.position_quantity_delta < 0 then
      raise exception 'investment_cash_flow_reversal_conflict' using errcode = '23514';
    end if;
    update public.investment_positions set
      current_value_minor = current_value_minor - flow_record.position_value_delta_minor,
      accumulated_cost_minor = accumulated_cost_minor - flow_record.position_cost_delta_minor,
      quantity = quantity - flow_record.position_quantity_delta
    where id = flow_record.position_id and user_id = current_user_id;
    update public.investment_cash_flows set source_transfer_id = null,
      source_account_id = null where id = flow_record.id and user_id = current_user_id;
  end loop;

  perform private.update_account_transfer(
    target_transfer_id, source_account_id, destination_account_id,
    source_amount_minor, destination_amount_minor, transaction_date,
    transfer_status, transfer_description, transfer_notes
  );

  for item in select value from jsonb_array_elements(linked_rows) loop
    select * into flow_record from public.investment_cash_flows
    where id = (item->>'id')::uuid and user_id = current_user_id for update;
    select * into entry_record from public.transfer_entries
    where transfer_id = target_transfer_id and user_id = current_user_id
      and account_id = (item->>'account_id')::uuid and is_active
      and status = 'completed';
    if not found then
      raise exception 'investment_transfer_entry_not_found' using errcode = 'P0002';
    end if;
    select * into effect_record from private.apply_investment_position_effect(
      flow_record.position_id, current_user_id, flow_record.cash_flow_type,
      entry_record.amount_minor, flow_record.quantity, entry_record.transaction_date
    );
    update public.investment_cash_flows set
      source_transfer_id = target_transfer_id,
      source_account_id = (item->>'account_id')::uuid,
      amount_minor = entry_record.amount_minor,
      cash_flow_date = entry_record.transaction_date,
      position_value_delta_minor = effect_record.value_delta_minor,
      position_cost_delta_minor = effect_record.cost_delta_minor,
      position_quantity_delta = effect_record.quantity_delta
    where id = flow_record.id and user_id = current_user_id;
    perform private.refresh_investment_position_date(flow_record.position_id, current_user_id);
  end loop;
  return true;
end;
$$;

create or replace function public.update_linked_investment_transfer(
  target_transfer_id uuid,
  source_account_id uuid,
  destination_account_id uuid,
  source_amount_minor bigint,
  destination_amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text,
  transfer_notes text
) returns boolean language sql security invoker set search_path = '' as $$
  select private.update_linked_investment_transfer(
    target_transfer_id, source_account_id, destination_account_id,
    source_amount_minor, destination_amount_minor, transaction_date,
    transfer_status, transfer_description, transfer_notes
  );
$$;

revoke all on function private.update_linked_investment_transfer(
  uuid,uuid,uuid,bigint,bigint,date,public.transaction_status,text,text)
from public, anon, authenticated;
grant execute on function private.update_linked_investment_transfer(
  uuid,uuid,uuid,bigint,bigint,date,public.transaction_status,text,text)
to authenticated;
revoke all on function public.update_linked_investment_transfer(
  uuid,uuid,uuid,bigint,bigint,date,public.transaction_status,text,text)
from public, anon;
grant execute on function public.update_linked_investment_transfer(
  uuid,uuid,uuid,bigint,bigint,date,public.transaction_status,text,text)
to authenticated;
