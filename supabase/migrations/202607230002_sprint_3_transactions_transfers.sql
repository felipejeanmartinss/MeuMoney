do $$
begin
  create type public.transaction_status as enum ('pending', 'completed');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.transfer_direction as enum ('outflow', 'inflow');
exception
  when duplicate_object then null;
end;
$$;

alter table public.transactions
drop constraint if exists transactions_check;

alter table public.transactions
rename column kind to transaction_type;

alter table public.transactions
rename column occurred_on to transaction_date;

alter table public.transactions
drop column destination_account_id,
drop column currency,
drop column context,
add column status public.transaction_status not null default 'completed',
add column notes text,
add column is_active boolean not null default true;

alter table public.transactions
add constraint transactions_income_or_expense
check (transaction_type in ('income', 'expense')),
add constraint transactions_safe_positive_amount
check (amount_minor between 1 and 9007199254740991),
add constraint transactions_notes_length
check (notes is null or char_length(notes) <= 1000);

alter index if exists transactions_user_date_idx
rename to transactions_user_transaction_date_idx;

create index transactions_realized_balance_idx
on public.transactions (account_id, transaction_date)
where is_active and status = 'completed';

create or replace function public.validate_financial_transaction()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.user_id <> (select auth.uid()) then
    raise exception 'transaction_user_mismatch' using errcode = '42501';
  end if;

  if new.transaction_type not in ('income', 'expense') then
    raise exception 'invalid_transaction_type' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.accounts
    where id = new.account_id
      and user_id = new.user_id
  ) then
    raise exception 'invalid_transaction_account' using errcode = '23503';
  end if;

  if not exists (
    select 1
    from public.categories
    where id = new.category_id
      and user_id = new.user_id
      and kind = new.transaction_type
  ) then
    raise exception 'invalid_transaction_category' using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger transactions_validate_financial_data
before insert or update of user_id, account_id, category_id, transaction_type
on public.transactions
for each row execute procedure public.validate_financial_transaction();

drop policy if exists "transactions_owner_all" on public.transactions;
create policy "transactions_owner_select" on public.transactions
for select to authenticated
using ((select auth.uid()) = user_id);
create policy "transactions_owner_insert" on public.transactions
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "transactions_owner_update" on public.transactions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.transactions from anon, authenticated;
grant select on table public.transactions to authenticated;
grant insert (
  user_id,
  account_id,
  category_id,
  transaction_type,
  description,
  amount_minor,
  transaction_date,
  status,
  notes
) on table public.transactions to authenticated;
grant update (
  account_id,
  category_id,
  transaction_type,
  description,
  amount_minor,
  transaction_date,
  status,
  notes,
  is_active
) on table public.transactions to authenticated;

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_account_id uuid not null references public.accounts(id) on delete restrict,
  destination_account_id uuid not null references public.accounts(id) on delete restrict,
  amount_minor bigint not null
    check (amount_minor between 1 and 9007199254740991),
  currency char(3) not null
    check (currency in ('BRL', 'USD', 'EUR')),
  transaction_date date not null,
  status public.transaction_status not null default 'completed',
  description text
    check (
      description is null
      or char_length(trim(description)) between 1 and 180
    ),
  notes text check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_account_id <> destination_account_id)
);

create table public.transfer_entries (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  direction public.transfer_direction not null,
  amount_minor bigint not null
    check (amount_minor between 1 and 9007199254740991),
  currency char(3) not null
    check (currency in ('BRL', 'USD', 'EUR')),
  transaction_date date not null,
  status public.transaction_status not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transfer_id, direction)
);

create index transfers_user_date_idx
on public.transfers (user_id, transaction_date desc);

create index transfer_entries_realized_balance_idx
on public.transfer_entries (account_id, transaction_date)
where is_active and status = 'completed';

alter table public.transfers enable row level security;
alter table public.transfer_entries enable row level security;

create policy "transfers_owner_select" on public.transfers
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "transfer_entries_owner_select" on public.transfer_entries
for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.transfers from anon, authenticated;
revoke all on table public.transfer_entries from anon, authenticated;
grant select on table public.transfers to authenticated;
grant select on table public.transfer_entries to authenticated;

create trigger transfers_set_updated_at
before update on public.transfers
for each row execute procedure public.set_updated_at();

create trigger transfer_entries_set_updated_at
before update on public.transfer_entries
for each row execute procedure public.set_updated_at();

create or replace function public.validate_transfer_accounts(
  target_user_id uuid,
  source_id uuid,
  destination_id uuid
)
returns char(3)
language plpgsql
security definer set search_path = ''
as $$
declare
  source_currency char(3);
  destination_currency char(3);
begin
  if source_id = destination_id then
    raise exception 'transfer_accounts_must_differ' using errcode = '23514';
  end if;

  select currency into source_currency
  from public.accounts
  where id = source_id
    and user_id = target_user_id
    and archived_at is null;

  select currency into destination_currency
  from public.accounts
  where id = destination_id
    and user_id = target_user_id
    and archived_at is null;

  if source_currency is null or destination_currency is null then
    raise exception 'invalid_transfer_account' using errcode = '23503';
  end if;

  if source_currency <> destination_currency then
    raise exception 'transfer_currency_mismatch' using errcode = '23514';
  end if;

  return source_currency;
end;
$$;

create or replace function public.create_transfer(
  source_account_id uuid,
  destination_account_id uuid,
  amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text default null,
  transfer_notes text default null
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  transfer_currency char(3);
  new_transfer_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_transfer_amount' using errcode = '23514';
  end if;

  transfer_currency := public.validate_transfer_accounts(
    current_user_id,
    source_account_id,
    destination_account_id
  );

  insert into public.transfers (
    user_id,
    source_account_id,
    destination_account_id,
    amount_minor,
    currency,
    transaction_date,
    status,
    description,
    notes
  )
  values (
    current_user_id,
    source_account_id,
    destination_account_id,
    amount_minor,
    transfer_currency,
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
  )
  values
    (
      new_transfer_id,
      current_user_id,
      source_account_id,
      'outflow',
      amount_minor,
      transfer_currency,
      transaction_date,
      transfer_status
    ),
    (
      new_transfer_id,
      current_user_id,
      destination_account_id,
      'inflow',
      amount_minor,
      transfer_currency,
      transaction_date,
      transfer_status
    );

  return new_transfer_id;
end;
$$;

create or replace function public.update_transfer(
  target_transfer_id uuid,
  source_account_id uuid,
  destination_account_id uuid,
  amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text default null,
  transfer_notes text default null
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  transfer_currency char(3);
  transfer_is_active boolean;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select is_active into transfer_is_active
  from public.transfers
  where id = target_transfer_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception 'transfer_not_found' using errcode = 'P0002';
  end if;

  if amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_transfer_amount' using errcode = '23514';
  end if;

  transfer_currency := public.validate_transfer_accounts(
    current_user_id,
    source_account_id,
    destination_account_id
  );

  update public.transfers
  set
    source_account_id = update_transfer.source_account_id,
    destination_account_id = update_transfer.destination_account_id,
    amount_minor = update_transfer.amount_minor,
    currency = transfer_currency,
    transaction_date = update_transfer.transaction_date,
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
  )
  values
    (
      target_transfer_id,
      current_user_id,
      source_account_id,
      'outflow',
      amount_minor,
      transfer_currency,
      transaction_date,
      transfer_status,
      transfer_is_active
    ),
    (
      target_transfer_id,
      current_user_id,
      destination_account_id,
      'inflow',
      amount_minor,
      transfer_currency,
      transaction_date,
      transfer_status,
      transfer_is_active
    )
  on conflict (transfer_id, direction) do update
  set
    account_id = excluded.account_id,
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    transaction_date = excluded.transaction_date,
    status = excluded.status,
    is_active = excluded.is_active;

  return true;
end;
$$;

create or replace function public.set_transfer_active(
  target_transfer_id uuid,
  active boolean
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  update public.transfers
  set is_active = active
  where id = target_transfer_id
    and user_id = current_user_id;

  if not found then
    raise exception 'transfer_not_found' using errcode = 'P0002';
  end if;

  update public.transfer_entries
  set is_active = active
  where transfer_id = target_transfer_id
    and user_id = current_user_id;

  return true;
end;
$$;

revoke all on function public.validate_financial_transaction()
from public, anon, authenticated;
revoke all on function public.validate_transfer_accounts(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.create_transfer(
  uuid,
  uuid,
  bigint,
  date,
  public.transaction_status,
  text,
  text
) from public, anon;
revoke all on function public.update_transfer(
  uuid,
  uuid,
  uuid,
  bigint,
  date,
  public.transaction_status,
  text,
  text
) from public, anon;
revoke all on function public.set_transfer_active(uuid, boolean)
from public, anon;

grant execute on function public.create_transfer(
  uuid,
  uuid,
  bigint,
  date,
  public.transaction_status,
  text,
  text
) to authenticated;
grant execute on function public.update_transfer(
  uuid,
  uuid,
  uuid,
  bigint,
  date,
  public.transaction_status,
  text,
  text
) to authenticated;
grant execute on function public.set_transfer_active(uuid, boolean)
to authenticated;

create or replace view public.account_balances
with (security_invoker = true)
as
select
  accounts.id,
  accounts.user_id,
  accounts.name,
  accounts.type,
  accounts.context,
  accounts.currency,
  accounts.opening_balance_minor,
  accounts.opening_balance_date,
  accounts.archived_at,
  accounts.created_at,
  accounts.updated_at,
  (
    accounts.opening_balance_minor
    + coalesce(financial_transactions.balance_delta, 0)
    + coalesce(transfer_movements.balance_delta, 0)
  )::bigint as current_balance_minor
from public.accounts
left join lateral (
  select
    sum(
      case
        when transactions.transaction_type = 'income'
          then transactions.amount_minor
        else -transactions.amount_minor
      end
    )::bigint as balance_delta
  from public.transactions
  where transactions.account_id = accounts.id
    and transactions.is_active
    and transactions.status = 'completed'
) financial_transactions on true
left join lateral (
  select
    sum(
      case
        when transfer_entries.direction = 'inflow'
          then transfer_entries.amount_minor
        else -transfer_entries.amount_minor
      end
    )::bigint as balance_delta
  from public.transfer_entries
  where transfer_entries.account_id = accounts.id
    and transfer_entries.is_active
    and transfer_entries.status = 'completed'
) transfer_movements on true;

revoke all on table public.account_balances from anon, authenticated;
grant select on table public.account_balances to authenticated;

comment on table public.transfers is
'Registro canônico da transferência. Mutações são executadas apenas por funções SQL atômicas.';
comment on table public.transfer_entries is
'Duas movimentações vinculadas por transferência: saída na origem e entrada no destino.';
comment on view public.account_balances is
'Saldo derivado do saldo inicial e de movimentações ativas e realizadas; não armazena saldo duplicado.';
