do $$
begin
  create type public.credit_card_brand as enum (
    'visa', 'mastercard', 'elo', 'amex', 'hipercard', 'other'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.credit_card_purchase_status as enum ('active', 'cancelled');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.credit_card_installment_status as enum (
    'pending', 'invoiced', 'paid', 'cancelled'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.credit_card_invoice_status as enum (
    'open', 'closed', 'paid', 'overdue'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.transaction_origin_type as enum (
    'manual', 'credit_card_invoice_payment', 'system'
  );
exception when duplicate_object then null;
end;
$$;

alter table public.transactions
add column origin_type public.transaction_origin_type not null default 'manual',
add column origin_id uuid,
add column credit_card_invoice_id uuid;

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  issuer text not null check (char_length(trim(issuer)) between 1 and 80),
  brand public.credit_card_brand not null,
  last_four_digits char(4) not null check (last_four_digits ~ '^[0-9]{4}$'),
  credit_limit numeric(16, 0) not null default 0
    check (credit_limit between 0 and 9007199254740991),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  currency char(3) not null default 'BRL'
    check (currency in ('BRL', 'USD', 'EUR')),
  linked_account_id uuid references public.accounts(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_card_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  description text not null check (char_length(trim(description)) between 1 and 180),
  total_amount numeric(16, 0) not null
    check (total_amount between 1 and 9007199254740991),
  purchase_date date not null,
  installment_count smallint not null check (installment_count between 1 and 240),
  status public.credit_card_purchase_status not null default 'active',
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (installment_count <= total_amount)
);

create table public.credit_card_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete restrict,
  reference_month date not null check (reference_month = date_trunc('month', reference_month)::date),
  closing_date date not null,
  due_date date not null,
  status public.credit_card_invoice_status not null default 'open',
  total_amount numeric(16, 0) not null default 0
    check (total_amount between 0 and 9007199254740991),
  paid_amount numeric(16, 0) not null default 0
    check (paid_amount between 0 and 9007199254740991),
  closed_at timestamptz,
  paid_at timestamptz,
  payment_account_id uuid references public.accounts(id) on delete restrict,
  payment_transaction_id uuid unique references public.transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (credit_card_id, reference_month),
  check (
    (status = 'paid' and paid_amount = total_amount and paid_at is not null)
    or (status <> 'paid' and paid_amount = 0)
  )
);

create table public.credit_card_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.credit_card_purchases(id) on delete restrict,
  credit_card_id uuid not null references public.credit_cards(id) on delete restrict,
  invoice_id uuid not null references public.credit_card_invoices(id) on delete restrict,
  installment_number smallint not null check (installment_number > 0),
  installment_count smallint not null check (installment_count > 0),
  amount numeric(16, 0) not null check (amount between 1 and 9007199254740991),
  competence_date date not null
    check (competence_date = date_trunc('month', competence_date)::date),
  status public.credit_card_installment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_id, installment_number),
  check (installment_number <= installment_count)
);

alter table public.transactions
add constraint transactions_credit_card_invoice_fk
foreign key (credit_card_invoice_id)
references public.credit_card_invoices(id)
on delete restrict;

alter table public.transactions
add constraint transactions_origin_consistency
check (
  (
    origin_type = 'manual'
    and origin_id is null
    and credit_card_invoice_id is null
    and category_id is not null
  )
  or (
    origin_type = 'credit_card_invoice_payment'
    and origin_id = credit_card_invoice_id
    and credit_card_invoice_id is not null
    and category_id is null
    and transaction_type = 'expense'
    and status = 'completed'
  )
  or origin_type = 'system'
);

create index credit_cards_user_active_idx
on public.credit_cards (user_id, is_active, name);
create index credit_card_purchases_card_date_idx
on public.credit_card_purchases (credit_card_id, purchase_date desc);
create index credit_card_installments_card_status_idx
on public.credit_card_installments (credit_card_id, status, competence_date);
create index credit_card_installments_invoice_idx
on public.credit_card_installments (invoice_id);
create index credit_card_invoices_card_reference_idx
on public.credit_card_invoices (credit_card_id, reference_month desc);
create unique index transactions_invoice_payment_unique_idx
on public.transactions (credit_card_invoice_id)
where origin_type = 'credit_card_invoice_payment' and is_active;

create trigger credit_cards_set_updated_at
before update on public.credit_cards
for each row execute procedure public.set_updated_at();
create trigger credit_card_purchases_set_updated_at
before update on public.credit_card_purchases
for each row execute procedure public.set_updated_at();
create trigger credit_card_installments_set_updated_at
before update on public.credit_card_installments
for each row execute procedure public.set_updated_at();
create trigger credit_card_invoices_set_updated_at
before update on public.credit_card_invoices
for each row execute procedure public.set_updated_at();

create or replace function public.validate_credit_card()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.user_id <> (select auth.uid()) then
    raise exception 'credit_card_user_mismatch' using errcode = '42501';
  end if;

  if new.linked_account_id is not null and not exists (
    select 1 from public.accounts
    where id = new.linked_account_id
      and user_id = new.user_id
      and currency = new.currency
  ) then
    raise exception 'invalid_credit_card_account' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger credit_cards_validate_owner
before insert or update of user_id, linked_account_id, currency
on public.credit_cards
for each row execute procedure public.validate_credit_card();

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
    select 1 from public.accounts
    where id = new.account_id and user_id = new.user_id
  ) then
    raise exception 'invalid_transaction_account' using errcode = '23503';
  end if;

  if new.origin_type = 'manual' and not exists (
    select 1 from public.categories
    where id = new.category_id
      and user_id = new.user_id
      and kind = new.transaction_type
  ) then
    raise exception 'invalid_transaction_category' using errcode = '23503';
  end if;

  if new.origin_type = 'credit_card_invoice_payment' and not exists (
    select 1 from public.credit_card_invoices
    where id = new.credit_card_invoice_id and user_id = new.user_id
  ) then
    raise exception 'invalid_invoice_payment_origin' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop policy if exists "transactions_owner_update" on public.transactions;
create policy "transactions_owner_update_manual" on public.transactions
for update to authenticated
using ((select auth.uid()) = user_id and origin_type = 'manual')
with check ((select auth.uid()) = user_id and origin_type = 'manual');

alter table public.credit_cards enable row level security;
alter table public.credit_card_purchases enable row level security;
alter table public.credit_card_installments enable row level security;
alter table public.credit_card_invoices enable row level security;

create policy "credit_cards_owner_select" on public.credit_cards
for select to authenticated using ((select auth.uid()) = user_id);
create policy "credit_cards_owner_insert" on public.credit_cards
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "credit_cards_owner_update" on public.credit_cards
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "credit_card_purchases_owner_select" on public.credit_card_purchases
for select to authenticated using ((select auth.uid()) = user_id);
create policy "credit_card_installments_owner_select" on public.credit_card_installments
for select to authenticated using ((select auth.uid()) = user_id);
create policy "credit_card_invoices_owner_select" on public.credit_card_invoices
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.credit_cards from anon, authenticated;
revoke all on table public.credit_card_purchases from anon, authenticated;
revoke all on table public.credit_card_installments from anon, authenticated;
revoke all on table public.credit_card_invoices from anon, authenticated;
grant select on table public.credit_cards to authenticated;
grant insert (
  user_id, name, issuer, brand, last_four_digits, credit_limit,
  closing_day, due_day, currency, linked_account_id
) on table public.credit_cards to authenticated;
grant update (
  name, issuer, brand, last_four_digits, credit_limit,
  closing_day, due_day, currency, linked_account_id, is_active
) on table public.credit_cards to authenticated;
grant select on table public.credit_card_purchases to authenticated;
grant select on table public.credit_card_installments to authenticated;
grant select on table public.credit_card_invoices to authenticated;

create or replace function public.card_bounded_date(target_month date, target_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (
    date_trunc('month', target_month)::date
    + (least(
        target_day,
        extract(day from (date_trunc('month', target_month) + interval '1 month - 1 day'))::integer
      ) - 1)
  )::date;
$$;

create or replace function public.card_reference_month(
  purchase_date date,
  closing_day integer
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when purchase_date <= public.card_bounded_date(purchase_date, closing_day)
      then date_trunc('month', purchase_date)::date
    else (date_trunc('month', purchase_date) + interval '1 month')::date
  end;
$$;

create or replace function public.card_due_date(
  reference_month date,
  closing_day integer,
  due_day integer
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when public.card_bounded_date(reference_month, due_day)
      > public.card_bounded_date(reference_month, closing_day)
      then public.card_bounded_date(reference_month, due_day)
    else public.card_bounded_date(
      (date_trunc('month', reference_month) + interval '1 month')::date,
      due_day
    )
  end;
$$;

create or replace function public.ensure_credit_card_invoice(
  target_user_id uuid,
  target_card_id uuid,
  target_reference_month date,
  target_closing_day integer,
  target_due_day integer
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare target_invoice_id uuid;
begin
  insert into public.credit_card_invoices (
    user_id, credit_card_id, reference_month, closing_date, due_date
  ) values (
    target_user_id,
    target_card_id,
    date_trunc('month', target_reference_month)::date,
    public.card_bounded_date(target_reference_month, target_closing_day),
    public.card_due_date(
      target_reference_month, target_closing_day, target_due_day
    )
  )
  on conflict (credit_card_id, reference_month) do nothing;

  select id into target_invoice_id
  from public.credit_card_invoices
  where credit_card_id = target_card_id
    and reference_month = date_trunc('month', target_reference_month)::date
    and user_id = target_user_id;
  return target_invoice_id;
end;
$$;

create or replace function public.refresh_credit_card_invoice_total(
  target_invoice_id uuid
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.credit_card_invoices invoices
  set total_amount = coalesce((
    select sum(installments.amount)
    from public.credit_card_installments installments
    join public.credit_card_purchases purchases
      on purchases.id = installments.purchase_id
    where installments.invoice_id = target_invoice_id
      and installments.status <> 'cancelled'
      and purchases.status = 'active'
  ), 0)
  where invoices.id = target_invoice_id
    and invoices.status = 'open';
end;
$$;

create or replace function public.generate_credit_card_installments(
  target_purchase_id uuid
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  purchase_record public.credit_card_purchases%rowtype;
  card_record public.credit_cards%rowtype;
  base_reference date;
  installment_reference date;
  invoice_id uuid;
  invoice_status public.credit_card_invoice_status;
  base_amount numeric(16, 0);
  installment_amount numeric(16, 0);
  installment_number integer;
begin
  select * into purchase_record
  from public.credit_card_purchases
  where id = target_purchase_id;
  select * into card_record
  from public.credit_cards
  where id = purchase_record.credit_card_id;

  base_reference := public.card_reference_month(
    purchase_record.purchase_date, card_record.closing_day
  );
  base_amount := trunc(
    purchase_record.total_amount / purchase_record.installment_count
  );

  for installment_number in 1..purchase_record.installment_count loop
    installment_reference := (
      base_reference + make_interval(months => installment_number - 1)
    )::date;
    invoice_id := public.ensure_credit_card_invoice(
      purchase_record.user_id,
      purchase_record.credit_card_id,
      installment_reference,
      card_record.closing_day,
      card_record.due_day
    );
    select status into invoice_status
    from public.credit_card_invoices
    where id = invoice_id for update;
    if invoice_status <> 'open' then
      raise exception 'invoice_not_open' using errcode = '23514';
    end if;

    installment_amount := case
      when installment_number = purchase_record.installment_count
        then purchase_record.total_amount
          - base_amount * (purchase_record.installment_count - 1)
      else base_amount
    end;

    insert into public.credit_card_installments (
      user_id, purchase_id, credit_card_id, invoice_id,
      installment_number, installment_count, amount, competence_date
    ) values (
      purchase_record.user_id, purchase_record.id,
      purchase_record.credit_card_id, invoice_id,
      installment_number, purchase_record.installment_count,
      installment_amount, installment_reference
    );
    perform public.refresh_credit_card_invoice_total(invoice_id);
  end loop;
end;
$$;

create or replace function public.create_credit_card_purchase(
  target_credit_card_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  purchase_notes text default null
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_purchase_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if purchase_total_amount not between 1 and 9007199254740991
    or purchase_total_amount <> trunc(purchase_total_amount)
    or target_installment_count not between 1 and 240
    or target_installment_count > purchase_total_amount then
    raise exception 'invalid_purchase_values' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.credit_cards
    where id = target_credit_card_id
      and user_id = current_user_id and is_active
  ) then
    raise exception 'invalid_credit_card' using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.categories
    where id = target_category_id
      and user_id = current_user_id
      and kind = 'expense'
      and archived_at is null
  ) then
    raise exception 'invalid_purchase_category' using errcode = '23503';
  end if;

  insert into public.credit_card_purchases (
    user_id, credit_card_id, category_id, description,
    total_amount, purchase_date, installment_count, notes
  ) values (
    current_user_id, target_credit_card_id, target_category_id,
    trim(purchase_description), purchase_total_amount,
    target_purchase_date, target_installment_count,
    nullif(trim(purchase_notes), '')
  ) returning id into new_purchase_id;

  perform public.generate_credit_card_installments(new_purchase_id);
  return new_purchase_id;
end;
$$;

create or replace function public.update_credit_card_purchase(
  target_purchase_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  purchase_notes text default null
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  purchase_record public.credit_card_purchases%rowtype;
  old_invoice_id uuid;
  old_invoice_ids uuid[];
begin
  select * into purchase_record
  from public.credit_card_purchases
  where id = target_purchase_id
    and user_id = current_user_id
    and status = 'active'
  for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.categories
    where id = target_category_id
      and user_id = current_user_id
      and kind = 'expense'
      and archived_at is null
  ) then
    raise exception 'invalid_purchase_category' using errcode = '23503';
  end if;
  if purchase_total_amount not between 1 and 9007199254740991
    or purchase_total_amount <> trunc(purchase_total_amount)
    or target_installment_count not between 1 and 240
    or target_installment_count > purchase_total_amount then
    raise exception 'invalid_purchase_values' using errcode = '23514';
  end if;

  if purchase_record.total_amount <> purchase_total_amount
    or purchase_record.purchase_date <> target_purchase_date
    or purchase_record.installment_count <> target_installment_count then
    if exists (
      select 1 from public.credit_card_installments installments
      join public.credit_card_invoices invoices on invoices.id = installments.invoice_id
      where installments.purchase_id = target_purchase_id
        and (installments.status = 'paid' or invoices.status <> 'open')
    ) then
      raise exception 'purchase_structure_locked' using errcode = '23514';
    end if;

    select array_agg(distinct invoice_id)
    into old_invoice_ids
    from public.credit_card_installments
    where purchase_id = target_purchase_id;

    delete from public.credit_card_installments
    where purchase_id = target_purchase_id;

    foreach old_invoice_id in array coalesce(old_invoice_ids, array[]::uuid[])
    loop
      perform public.refresh_credit_card_invoice_total(old_invoice_id);
    end loop;
  end if;

  update public.credit_card_purchases
  set category_id = target_category_id,
      description = trim(purchase_description),
      total_amount = purchase_total_amount,
      purchase_date = target_purchase_date,
      installment_count = target_installment_count,
      notes = nullif(trim(purchase_notes), '')
  where id = target_purchase_id;

  if not exists (
    select 1 from public.credit_card_installments
    where purchase_id = target_purchase_id
  ) then
    perform public.generate_credit_card_installments(target_purchase_id);
  end if;
  return true;
end;
$$;

create or replace function public.cancel_credit_card_purchase(
  target_purchase_id uuid
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  affected_invoice_id uuid;
begin
  if exists (
    select 1 from public.credit_card_installments installments
    join public.credit_card_invoices invoices on invoices.id = installments.invoice_id
    where installments.purchase_id = target_purchase_id
      and installments.user_id = current_user_id
      and (installments.status = 'paid' or invoices.status <> 'open')
  ) then
    raise exception 'purchase_cancellation_locked' using errcode = '23514';
  end if;

  update public.credit_card_purchases
  set status = 'cancelled'
  where id = target_purchase_id
    and user_id = current_user_id
    and status = 'active';
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;

  update public.credit_card_installments
  set status = 'cancelled'
  where purchase_id = target_purchase_id
    and user_id = current_user_id;

  for affected_invoice_id in
    select distinct invoice_id from public.credit_card_installments
    where purchase_id = target_purchase_id
  loop
    perform public.refresh_credit_card_invoice_total(affected_invoice_id);
  end loop;
  return true;
end;
$$;

create or replace function public.close_credit_card_invoice(
  target_invoice_id uuid
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invoice_status public.credit_card_invoice_status;
begin
  select status into invoice_status
  from public.credit_card_invoices
  where id = target_invoice_id and user_id = current_user_id
  for update;
  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;
  if invoice_status in ('closed', 'overdue') then return true; end if;
  if invoice_status = 'paid' then
    raise exception 'invoice_already_paid' using errcode = '23514';
  end if;

  perform public.refresh_credit_card_invoice_total(target_invoice_id);
  update public.credit_card_installments
  set status = 'invoiced'
  where invoice_id = target_invoice_id and status = 'pending';
  update public.credit_card_invoices
  set status = 'closed', closed_at = now()
  where id = target_invoice_id;
  return true;
end;
$$;

create or replace function public.pay_credit_card_invoice(
  target_invoice_id uuid,
  target_account_id uuid,
  target_payment_date date
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invoice_record public.credit_card_invoices%rowtype;
  card_name text;
  card_currency char(3);
  new_transaction_id uuid;
begin
  select * into invoice_record
  from public.credit_card_invoices
  where id = target_invoice_id and user_id = current_user_id
  for update;
  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;
  if invoice_record.status not in ('closed', 'overdue')
    or invoice_record.total_amount <= 0 then
    raise exception 'invoice_not_payable' using errcode = '23514';
  end if;

  select name, currency into card_name, card_currency
  from public.credit_cards
  where id = invoice_record.credit_card_id and user_id = current_user_id;
  if not exists (
    select 1 from public.accounts
    where id = target_account_id
      and user_id = current_user_id
      and archived_at is null
      and currency = card_currency
  ) then
    raise exception 'invalid_payment_account' using errcode = '23503';
  end if;

  insert into public.transactions (
    user_id, account_id, category_id, transaction_type, description,
    amount_minor, transaction_date, status, notes, is_active,
    origin_type, origin_id, credit_card_invoice_id
  ) values (
    current_user_id, target_account_id, null, 'expense',
    'Pagamento de fatura · ' || card_name,
    invoice_record.total_amount, target_payment_date, 'completed',
    'Liquidação financeira; não representa nova despesa de consumo.',
    true, 'credit_card_invoice_payment', target_invoice_id, target_invoice_id
  ) returning id into new_transaction_id;

  update public.credit_card_installments
  set status = 'paid'
  where invoice_id = target_invoice_id and status = 'invoiced';
  update public.credit_card_invoices
  set status = 'paid',
      paid_amount = total_amount,
      paid_at = now(),
      payment_account_id = target_account_id,
      payment_transaction_id = new_transaction_id
  where id = target_invoice_id;
  return new_transaction_id;
end;
$$;

create or replace function public.reverse_credit_card_invoice_payment(
  target_invoice_id uuid
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invoice_record public.credit_card_invoices%rowtype;
begin
  select * into invoice_record
  from public.credit_card_invoices
  where id = target_invoice_id and user_id = current_user_id
  for update;
  if not found or invoice_record.status <> 'paid'
    or invoice_record.payment_transaction_id is null then
    raise exception 'invoice_payment_inconsistent' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.transactions
    where id = invoice_record.payment_transaction_id
      and user_id = current_user_id
      and credit_card_invoice_id = target_invoice_id
      and origin_type = 'credit_card_invoice_payment'
      and is_active
  ) then
    raise exception 'invoice_payment_inconsistent' using errcode = '23514';
  end if;

  update public.transactions
  set is_active = false
  where id = invoice_record.payment_transaction_id;
  update public.credit_card_installments
  set status = 'invoiced'
  where invoice_id = target_invoice_id and status = 'paid';
  update public.credit_card_invoices
  set status = 'closed', paid_amount = 0, paid_at = null,
      payment_account_id = null, payment_transaction_id = null
  where id = target_invoice_id;
  return true;
end;
$$;

revoke all on function public.validate_credit_card() from public, anon, authenticated;
revoke all on function public.card_bounded_date(date, integer) from public, anon;
revoke all on function public.card_reference_month(date, integer) from public, anon;
revoke all on function public.card_due_date(date, integer, integer) from public, anon;
revoke all on function public.ensure_credit_card_invoice(uuid, uuid, date, integer, integer)
from public, anon, authenticated;
revoke all on function public.refresh_credit_card_invoice_total(uuid)
from public, anon, authenticated;
revoke all on function public.generate_credit_card_installments(uuid)
from public, anon, authenticated;

grant execute on function public.card_bounded_date(date, integer) to authenticated;
grant execute on function public.card_reference_month(date, integer) to authenticated;
grant execute on function public.card_due_date(date, integer, integer) to authenticated;

revoke all on function public.create_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) from public, anon;
revoke all on function public.update_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) from public, anon;
revoke all on function public.cancel_credit_card_purchase(uuid) from public, anon;
revoke all on function public.close_credit_card_invoice(uuid) from public, anon;
revoke all on function public.pay_credit_card_invoice(uuid, uuid, date) from public, anon;
revoke all on function public.reverse_credit_card_invoice_payment(uuid) from public, anon;

grant execute on function public.create_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) to authenticated;
grant execute on function public.update_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) to authenticated;
grant execute on function public.cancel_credit_card_purchase(uuid) to authenticated;
grant execute on function public.close_credit_card_invoice(uuid) to authenticated;
grant execute on function public.pay_credit_card_invoice(uuid, uuid, date) to authenticated;
grant execute on function public.reverse_credit_card_invoice_payment(uuid) to authenticated;

create or replace view public.credit_card_summaries
with (security_invoker = true)
as
select
  cards.*,
  coalesce(used_limits.used_amount, 0)::numeric(16, 0) as used_limit,
  (cards.credit_limit - coalesce(used_limits.used_amount, 0))::numeric(16, 0)
    as available_limit
from public.credit_cards cards
left join lateral (
  select sum(installments.amount) as used_amount
  from public.credit_card_installments installments
  join public.credit_card_purchases purchases
    on purchases.id = installments.purchase_id
  where installments.credit_card_id = cards.id
    and installments.status in ('pending', 'invoiced')
    and purchases.status = 'active'
) used_limits on true;

revoke all on table public.credit_card_summaries from anon, authenticated;
grant select on table public.credit_card_summaries to authenticated;

comment on table public.credit_card_purchases is
'Registra o consumo por categoria; não movimenta saldo de conta.';
comment on table public.credit_card_invoices is
'Consolida parcelas por competência. O pagamento é liquidação financeira, não novo consumo.';
comment on view public.credit_card_summaries is
'Limites derivados de todas as parcelas ativas ainda não pagas, inclusive futuras.';
