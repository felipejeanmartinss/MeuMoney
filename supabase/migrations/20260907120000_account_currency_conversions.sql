-- Store the exact amount received by the destination account so transfers can
-- also represent currency conversions without floating-point exchange rates.

alter table public.transfers
  add column destination_amount_minor bigint,
  add column destination_currency char(3);

update public.transfers
set destination_amount_minor = amount_minor,
    destination_currency = currency
where destination_account_id is not null;

alter table public.transfers
  add constraint transfers_destination_amount_valid check (
    (
      destination_account_id is null
      and destination_amount_minor is null
      and destination_currency is null
    )
    or (
      destination_account_id is not null
      and destination_amount_minor between 1 and 9007199254740991
      and destination_currency in ('BRL', 'USD', 'EUR')
      and (
        destination_currency <> currency
        or destination_amount_minor = amount_minor
      )
    )
  );

create or replace function private.normalize_transfer_destination_money()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account_currency char(3);
begin
  if new.destination_account_id is null then
    new.destination_amount_minor := null;
    new.destination_currency := null;
    return new;
  end if;

  select accounts.currency into account_currency
  from public.accounts
  where accounts.id = new.destination_account_id
    and accounts.user_id = new.user_id;

  if account_currency is null then
    raise exception 'invalid_transfer_account' using errcode = '23503';
  end if;

  new.destination_currency := account_currency;

  if new.destination_amount_minor is null then
    if new.currency <> account_currency then
      raise exception 'transfer_currency_conversion_amount_required'
        using errcode = '23514';
    end if;
    new.destination_amount_minor := new.amount_minor;
  elsif tg_op = 'UPDATE' then
    if old.destination_account_id is not null
      and old.destination_currency = old.currency
      and old.destination_amount_minor = old.amount_minor
      and new.destination_amount_minor = old.destination_amount_minor
      and new.currency = account_currency then
      -- Legacy same-currency update functions do not know the destination field.
      new.destination_amount_minor := new.amount_minor;
    end if;
  end if;

  if new.currency = account_currency
    and new.destination_amount_minor <> new.amount_minor then
    raise exception 'same_currency_transfer_amount_mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_transfer_destination_money()
from public, anon, authenticated;

create trigger transfers_normalize_destination_money
before insert or update of destination_account_id, amount_minor, currency,
  destination_amount_minor, destination_currency
on public.transfers
for each row execute procedure private.normalize_transfer_destination_money();

create or replace function private.create_account_transfer(
  source_account_id uuid,
  destination_account_id uuid,
  source_amount_minor bigint,
  destination_amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text default null,
  transfer_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  source_currency char(3);
  target_currency char(3);
  new_transfer_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if source_account_id = destination_account_id then
    raise exception 'transfer_accounts_must_differ' using errcode = '23514';
  end if;
  if source_amount_minor not between 1 and 9007199254740991
    or destination_amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_transfer_amount' using errcode = '23514';
  end if;
  if transfer_description is not null
    and char_length(trim(transfer_description)) > 180 then
    raise exception 'invalid_transfer_description' using errcode = '23514';
  end if;
  if transfer_notes is not null and char_length(transfer_notes) > 1000 then
    raise exception 'invalid_transfer_notes' using errcode = '23514';
  end if;

  select accounts.currency into source_currency
  from public.accounts
  where accounts.id = source_account_id
    and accounts.user_id = current_user_id
    and accounts.archived_at is null;

  select accounts.currency into target_currency
  from public.accounts
  where accounts.id = destination_account_id
    and accounts.user_id = current_user_id
    and accounts.archived_at is null;

  if source_currency is null or target_currency is null then
    raise exception 'invalid_transfer_account' using errcode = '23503';
  end if;
  if source_currency = target_currency
    and source_amount_minor <> destination_amount_minor then
    raise exception 'same_currency_transfer_amount_mismatch'
      using errcode = '23514';
  end if;

  insert into public.transfers (
    user_id,
    source_account_id,
    destination_account_id,
    destination_credit_card_id,
    amount_minor,
    currency,
    destination_amount_minor,
    destination_currency,
    transaction_date,
    status,
    description,
    notes
  ) values (
    current_user_id,
    source_account_id,
    destination_account_id,
    null,
    source_amount_minor,
    source_currency,
    destination_amount_minor,
    target_currency,
    transaction_date,
    transfer_status,
    nullif(trim(transfer_description), ''),
    nullif(trim(transfer_notes), '')
  )
  returning id into new_transfer_id;

  insert into public.transfer_entries (
    transfer_id,
    user_id,
    account_id,
    direction,
    amount_minor,
    currency,
    transaction_date,
    status
  ) values
    (
      new_transfer_id,
      current_user_id,
      source_account_id,
      'outflow',
      source_amount_minor,
      source_currency,
      transaction_date,
      transfer_status
    ),
    (
      new_transfer_id,
      current_user_id,
      destination_account_id,
      'inflow',
      destination_amount_minor,
      target_currency,
      transaction_date,
      transfer_status
    );

  return new_transfer_id;
end;
$$;

create or replace function private.update_account_transfer(
  target_transfer_id uuid,
  source_account_id uuid,
  destination_account_id uuid,
  source_amount_minor bigint,
  destination_amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text default null,
  transfer_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  source_currency char(3);
  target_currency char(3);
  transfer_is_active boolean;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if source_account_id = destination_account_id then
    raise exception 'transfer_accounts_must_differ' using errcode = '23514';
  end if;
  if source_amount_minor not between 1 and 9007199254740991
    or destination_amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_transfer_amount' using errcode = '23514';
  end if;
  if transfer_description is not null
    and char_length(trim(transfer_description)) > 180 then
    raise exception 'invalid_transfer_description' using errcode = '23514';
  end if;
  if transfer_notes is not null and char_length(transfer_notes) > 1000 then
    raise exception 'invalid_transfer_notes' using errcode = '23514';
  end if;

  select transfers.is_active into transfer_is_active
  from public.transfers
  where transfers.id = target_transfer_id
    and transfers.user_id = current_user_id
  for update;
  if not found then
    raise exception 'transfer_not_found' using errcode = 'P0002';
  end if;

  select accounts.currency into source_currency
  from public.accounts
  where accounts.id = source_account_id
    and accounts.user_id = current_user_id
    and accounts.archived_at is null;

  select accounts.currency into target_currency
  from public.accounts
  where accounts.id = destination_account_id
    and accounts.user_id = current_user_id
    and accounts.archived_at is null;

  if source_currency is null or target_currency is null then
    raise exception 'invalid_transfer_account' using errcode = '23503';
  end if;
  if source_currency = target_currency
    and source_amount_minor <> destination_amount_minor then
    raise exception 'same_currency_transfer_amount_mismatch'
      using errcode = '23514';
  end if;

  update public.transfers
  set source_account_id = update_account_transfer.source_account_id,
      destination_account_id = update_account_transfer.destination_account_id,
      destination_credit_card_id = null,
      amount_minor = source_amount_minor,
      currency = source_currency,
      destination_amount_minor = update_account_transfer.destination_amount_minor,
      destination_currency = target_currency,
      transaction_date = update_account_transfer.transaction_date,
      status = transfer_status,
      description = nullif(trim(transfer_description), ''),
      notes = nullif(trim(transfer_notes), '')
  where id = target_transfer_id
    and user_id = current_user_id;

  insert into public.transfer_entries (
    transfer_id,
    user_id,
    account_id,
    direction,
    amount_minor,
    currency,
    transaction_date,
    status,
    is_active
  ) values
    (
      target_transfer_id,
      current_user_id,
      source_account_id,
      'outflow',
      source_amount_minor,
      source_currency,
      transaction_date,
      transfer_status,
      transfer_is_active
    ),
    (
      target_transfer_id,
      current_user_id,
      destination_account_id,
      'inflow',
      destination_amount_minor,
      target_currency,
      transaction_date,
      transfer_status,
      transfer_is_active
    )
  on conflict (transfer_id, direction) do update
  set account_id = excluded.account_id,
      amount_minor = excluded.amount_minor,
      currency = excluded.currency,
      transaction_date = excluded.transaction_date,
      status = excluded.status,
      is_active = excluded.is_active;

  return true;
end;
$$;

revoke all on function private.create_account_transfer(
  uuid, uuid, bigint, bigint, date, public.transaction_status, text, text
) from public, anon, authenticated;
revoke all on function private.update_account_transfer(
  uuid, uuid, uuid, bigint, bigint, date, public.transaction_status, text, text
) from public, anon, authenticated;
grant execute on function private.create_account_transfer(
  uuid, uuid, bigint, bigint, date, public.transaction_status, text, text
) to authenticated;
grant execute on function private.update_account_transfer(
  uuid, uuid, uuid, bigint, bigint, date, public.transaction_status, text, text
) to authenticated;

create or replace function public.create_account_transfer(
  source_account_id uuid,
  destination_account_id uuid,
  source_amount_minor bigint,
  destination_amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text default null,
  transfer_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_account_transfer(
    source_account_id,
    destination_account_id,
    source_amount_minor,
    destination_amount_minor,
    transaction_date,
    transfer_status,
    transfer_description,
    transfer_notes
  );
$$;

create or replace function public.update_account_transfer(
  target_transfer_id uuid,
  source_account_id uuid,
  destination_account_id uuid,
  source_amount_minor bigint,
  destination_amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text default null,
  transfer_notes text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_account_transfer(
    target_transfer_id,
    source_account_id,
    destination_account_id,
    source_amount_minor,
    destination_amount_minor,
    transaction_date,
    transfer_status,
    transfer_description,
    transfer_notes
  );
$$;

revoke all on function public.create_account_transfer(
  uuid, uuid, bigint, bigint, date, public.transaction_status, text, text
) from public, anon;
revoke all on function public.update_account_transfer(
  uuid, uuid, uuid, bigint, bigint, date, public.transaction_status, text, text
) from public, anon;
grant execute on function public.create_account_transfer(
  uuid, uuid, bigint, bigint, date, public.transaction_status, text, text
) to authenticated;
grant execute on function public.update_account_transfer(
  uuid, uuid, uuid, bigint, bigint, date, public.transaction_status, text, text
) to authenticated;

drop trigger if exists transfers_preserve_investment_links
on public.transfers;
create trigger transfers_preserve_investment_links
before update of source_account_id, destination_account_id,
  destination_credit_card_id, amount_minor, currency,
  destination_amount_minor, destination_currency, transaction_date,
  status, is_active
on public.transfers
for each row execute procedure private.prevent_linked_investment_transfer_change();

comment on column public.transfers.amount_minor is
'Exact amount debited from the source account, stored in source-currency minor units.';
comment on column public.transfers.currency is
'Source account currency captured when the transfer is created.';
comment on column public.transfers.destination_amount_minor is
'Exact amount credited to an account destination, stored in destination-currency minor units; null for card payments.';
comment on column public.transfers.destination_currency is
'Destination account currency captured when the transfer is created; null for card payments.';
