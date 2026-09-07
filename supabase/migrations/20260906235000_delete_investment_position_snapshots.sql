-- Allows an owner to remove a manual position update without leaving the
-- current position inconsistent with its remaining history.

create or replace function public.validate_investment_position()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or new.user_id <> current_user_id then
    raise exception 'investment_position_user_mismatch' using errcode = '42501';
  end if;

  if new.position_date > current_date then
    raise exception 'future_investment_position' using errcode = '22007';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'investment_position_owner_is_immutable'
        using errcode = '42501';
    end if;

    if new.currency <> old.currency then
      raise exception 'investment_position_currency_is_immutable'
        using errcode = '23514';
    end if;

    if (
      new.quantity <> old.quantity
      or new.accumulated_cost_minor <> old.accumulated_cost_minor
      or new.current_value_minor <> old.current_value_minor
      or new.position_date <> old.position_date
    ) and new.position_date < old.position_date and not exists (
      select 1
      from public.investment_position_snapshots snapshot_row
      where snapshot_row.position_id = old.id
        and snapshot_row.user_id = old.user_id
        and snapshot_row.position_date = new.position_date
        and snapshot_row.quantity = new.quantity
        and snapshot_row.accumulated_cost_minor
          = new.accumulated_cost_minor
        and snapshot_row.current_value_minor = new.current_value_minor
    ) then
      raise exception 'investment_position_date_cannot_go_backwards'
        using errcode = '22007';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.delete_investment_position_snapshot(
  target_snapshot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_position_id uuid;
  target_snapshot public.investment_position_snapshots%rowtype;
  previous_snapshot public.investment_position_snapshots%rowtype;
  initial_snapshot_id uuid;
  latest_snapshot_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select snapshot_row.position_id into target_position_id
  from public.investment_position_snapshots snapshot_row
  where snapshot_row.id = target_snapshot_id
    and snapshot_row.user_id = current_user_id;
  if not found then
    raise exception 'investment_snapshot_not_found' using errcode = 'P0002';
  end if;

  perform 1
  from public.investment_positions position_row
  where position_row.id = target_position_id
    and position_row.user_id = current_user_id
  for update;
  if not found then
    raise exception 'invalid_investment_position' using errcode = '23503';
  end if;

  select * into target_snapshot
  from public.investment_position_snapshots snapshot_row
  where snapshot_row.id = target_snapshot_id
    and snapshot_row.position_id = target_position_id
    and snapshot_row.user_id = current_user_id
  for update;
  if not found then
    raise exception 'investment_snapshot_not_found' using errcode = 'P0002';
  end if;

  select snapshot_row.id into initial_snapshot_id
  from public.investment_position_snapshots snapshot_row
  where snapshot_row.position_id = target_position_id
    and snapshot_row.user_id = current_user_id
  order by snapshot_row.position_date, snapshot_row.created_at, snapshot_row.id
  limit 1;
  if target_snapshot.id = initial_snapshot_id then
    raise exception 'investment_initial_snapshot_cannot_be_deleted'
      using errcode = '23514';
  end if;

  select snapshot_row.id into latest_snapshot_id
  from public.investment_position_snapshots snapshot_row
  where snapshot_row.position_id = target_position_id
    and snapshot_row.user_id = current_user_id
  order by snapshot_row.position_date desc,
    snapshot_row.created_at desc,
    snapshot_row.id desc
  limit 1;

  if target_snapshot.id = latest_snapshot_id then
    if exists (
      select 1
      from public.investment_cash_flows flow_row
      where flow_row.position_id = target_position_id
        and flow_row.user_id = current_user_id
        and flow_row.created_at > target_snapshot.created_at
    ) then
      raise exception 'investment_snapshot_has_later_cash_flows'
        using errcode = '23514';
    end if;

    select * into previous_snapshot
    from public.investment_position_snapshots snapshot_row
    where snapshot_row.position_id = target_position_id
      and snapshot_row.user_id = current_user_id
      and snapshot_row.id <> target_snapshot.id
    order by snapshot_row.position_date desc,
      snapshot_row.created_at desc,
      snapshot_row.id desc
    limit 1;
    if not found then
      raise exception 'investment_initial_snapshot_cannot_be_deleted'
        using errcode = '23514';
    end if;

    delete from public.investment_position_snapshots snapshot_row
    where snapshot_row.id = target_snapshot.id
      and snapshot_row.user_id = current_user_id;

    update public.investment_positions
    set quantity = previous_snapshot.quantity,
        accumulated_cost_minor = previous_snapshot.accumulated_cost_minor,
        current_value_minor = previous_snapshot.current_value_minor,
        position_date = previous_snapshot.position_date
    where id = target_position_id
      and user_id = current_user_id;
  else
    delete from public.investment_position_snapshots snapshot_row
    where snapshot_row.id = target_snapshot.id
      and snapshot_row.user_id = current_user_id;
  end if;

  return target_position_id;
end;
$$;

create or replace function public.delete_investment_position_snapshot(
  target_snapshot_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.delete_investment_position_snapshot(target_snapshot_id);
$$;

revoke all on function private.delete_investment_position_snapshot(uuid)
from public, anon, authenticated;
grant execute on function private.delete_investment_position_snapshot(uuid)
to authenticated;
revoke all on function public.delete_investment_position_snapshot(uuid)
from public, anon;
grant execute on function public.delete_investment_position_snapshot(uuid)
to authenticated;

revoke all on function public.validate_investment_position()
from public, anon, authenticated;

comment on function public.delete_investment_position_snapshot(uuid) is
  'Deletes an owned non-initial investment snapshot and restores the previous snapshot when deleting the current update.';
