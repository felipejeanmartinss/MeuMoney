-- Preserve the existing cash-account semantics for transfers linked to a
-- position: the transfer moves cash and the opposite investment entry turns
-- that cash into principal (or liquidates principal back into cash).

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
  new_transaction_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
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
    raise exception 'invalid_investment_transfer_entry'
      using errcode = '23503';
  end if;

  select * into transfer_record
  from public.transfers
  where id = entry_record.transfer_id
    and user_id = current_user_id
    and status = 'completed'
    and is_active
  for update;
  if not found then
    raise exception 'invalid_investment_transfer_entry'
      using errcode = '23503';
  end if;

  if (target_event_type = 'contribution' and entry_record.direction <> 'inflow')
    or (target_event_type <> 'contribution' and entry_record.direction <> 'outflow') then
    raise exception 'investment_transfer_direction_mismatch'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.investment_cash_flows flow
    where flow.user_id = current_user_id
      and flow.source_transfer_id = transfer_record.id
      and flow.source_account_id = target_account_id
  ) then
    raise exception 'investment_transfer_already_linked'
      using errcode = '23505';
  end if;

  new_transaction_id := private.create_investment_account_entry(
    target_account_id,
    target_position_id,
    target_event_type,
    coalesce(
      nullif(trim(transfer_record.description), ''),
      case
        when target_event_type = 'contribution' then 'Aplicação em investimento'
        when target_event_type = 'redemption' then 'Liquidação de investimento'
        when target_event_type = 'interest_on_capital' then 'Juros sobre capital'
        when target_event_type = 'dividend' then 'Dividendos'
        when target_event_type = 'bonus' then 'Bonificação em dinheiro'
        else 'Rendimento de investimento'
      end
    ),
    entry_record.amount_minor,
    target_quantity,
    entry_record.transaction_date,
    target_notes,
    target_create_position,
    target_new_institution,
    target_new_investment_class,
    target_new_investment_type,
    target_new_asset_name
  );

  update public.investment_cash_flows
  set source_transfer_id = transfer_record.id,
      source_account_id = target_account_id
  where user_id = current_user_id
    and transaction_id = new_transaction_id;

  if not found then
    raise exception 'investment_cash_flow_not_found' using errcode = 'P0002';
  end if;

  return new_transaction_id;
end;
$$;

revoke all on function private.link_investment_transfer_entry(
  uuid, uuid, uuid, text, numeric, text, boolean, text,
  public.investment_class, text, text
) from public, anon, authenticated;
grant execute on function private.link_investment_transfer_entry(
  uuid, uuid, uuid, text, numeric, text, boolean, text,
  public.investment_class, text, text
) to authenticated;
