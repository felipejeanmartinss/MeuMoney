-- Card cash payments, cash/competence reporting, and staged financing imports.
-- The Supabase CLI 2.110.0 could not create the migration in this OneDrive
-- workspace (LegacyMigrationNewWriteError), so this cumulative file was
-- created with the timestamp returned immediately before the CLI attempt.

create table public.credit_card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete restrict,
  invoice_id uuid not null references public.credit_card_invoices(id) on delete restrict,
  source_account_id uuid not null references public.accounts(id) on delete restrict,
  payment_transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  amount_minor bigint not null
    check (amount_minor between 1 and 9007199254740991),
  payment_date date not null,
  state text not null default 'active'
    check (state in ('active', 'reversed')),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_card_payments_state_consistent check (
    (state = 'active' and reversed_at is null)
    or (state = 'reversed' and reversed_at is not null)
  )
);

create unique index credit_card_payments_active_invoice_idx
on public.credit_card_payments (invoice_id)
where state = 'active';

create index credit_card_payments_owner_date_idx
on public.credit_card_payments (user_id, payment_date desc, credit_card_id);

create trigger credit_card_payments_set_updated_at
before update on public.credit_card_payments
for each row execute procedure public.set_updated_at();

insert into public.credit_card_payments (
  user_id,
  credit_card_id,
  invoice_id,
  source_account_id,
  payment_transaction_id,
  amount_minor,
  payment_date
)
select
  invoices.user_id,
  invoices.credit_card_id,
  invoices.id,
  invoices.payment_account_id,
  invoices.payment_transaction_id,
  invoices.paid_amount::bigint,
  transactions.transaction_date
from public.credit_card_invoices invoices
join public.transactions transactions
  on transactions.id = invoices.payment_transaction_id
  and transactions.user_id = invoices.user_id
where invoices.status = 'paid'
  and invoices.payment_account_id is not null
  and invoices.payment_transaction_id is not null
  and invoices.paid_amount > 0
on conflict (payment_transaction_id) do nothing;

alter table public.credit_card_payments enable row level security;

create policy "credit_card_payments_owner_select"
on public.credit_card_payments
for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.credit_card_payments from anon, authenticated;
grant select on table public.credit_card_payments to authenticated;

create or replace function private.pay_credit_card_invoice(
  target_invoice_id uuid,
  target_account_id uuid,
  target_payment_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
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
    select 1
    from public.accounts
    where id = target_account_id
      and user_id = current_user_id
      and archived_at is null
      and currency = card_currency
  ) then
    raise exception 'invalid_payment_account' using errcode = '23503';
  end if;

  insert into public.transactions (
    user_id,
    account_id,
    category_id,
    transaction_type,
    description,
    amount_minor,
    transaction_date,
    status,
    notes,
    is_active,
    origin_type,
    origin_id,
    credit_card_invoice_id
  ) values (
    current_user_id,
    target_account_id,
    null,
    'expense',
    'Transferência para cartão · ' || card_name,
    invoice_record.total_amount,
    target_payment_date,
    'completed',
    'Pagamento de fatura: saída de caixa sem novo consumo por competência.',
    true,
    'credit_card_invoice_payment',
    target_invoice_id,
    target_invoice_id
  ) returning id into new_transaction_id;

  insert into public.credit_card_payments (
    user_id,
    credit_card_id,
    invoice_id,
    source_account_id,
    payment_transaction_id,
    amount_minor,
    payment_date
  ) values (
    current_user_id,
    invoice_record.credit_card_id,
    target_invoice_id,
    target_account_id,
    new_transaction_id,
    invoice_record.total_amount,
    target_payment_date
  );

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

create or replace function private.reverse_credit_card_invoice_payment(
  target_invoice_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
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
    select 1
    from public.credit_card_payments payments
    join public.transactions transactions
      on transactions.id = payments.payment_transaction_id
      and transactions.user_id = payments.user_id
    where payments.invoice_id = target_invoice_id
      and payments.user_id = current_user_id
      and payments.payment_transaction_id = invoice_record.payment_transaction_id
      and payments.state = 'active'
      and transactions.is_active
      and transactions.origin_type = 'credit_card_invoice_payment'
  ) then
    raise exception 'invoice_payment_inconsistent' using errcode = '23514';
  end if;

  update public.transactions
  set is_active = false
  where id = invoice_record.payment_transaction_id
    and user_id = current_user_id;

  update public.credit_card_payments
  set state = 'reversed', reversed_at = now()
  where invoice_id = target_invoice_id
    and user_id = current_user_id
    and state = 'active';

  update public.credit_card_installments
  set status = 'invoiced'
  where invoice_id = target_invoice_id and status = 'paid';

  update public.credit_card_invoices
  set status = 'closed',
      paid_amount = 0,
      paid_at = null,
      payment_account_id = null,
      payment_transaction_id = null
  where id = target_invoice_id;

  return true;
end;
$$;

create or replace view public.credit_card_cash_transfers
with (security_invoker = true)
as
select
  payments.id,
  payments.user_id,
  payments.credit_card_id,
  cards.name as credit_card_name,
  payments.invoice_id,
  invoices.reference_month,
  payments.source_account_id,
  accounts.name as source_account_name,
  cards.currency,
  payments.amount_minor,
  payments.payment_date,
  payments.state,
  payments.payment_transaction_id,
  payments.reversed_at,
  payments.created_at
from public.credit_card_payments payments
join public.credit_cards cards
  on cards.id = payments.credit_card_id
  and cards.user_id = payments.user_id
join public.credit_card_invoices invoices
  on invoices.id = payments.invoice_id
  and invoices.user_id = payments.user_id
join public.accounts accounts
  on accounts.id = payments.source_account_id
  and accounts.user_id = payments.user_id;

revoke all on table public.credit_card_cash_transfers from anon, authenticated;
grant select on table public.credit_card_cash_transfers to authenticated;

create or replace view public.financial_dashboard_monthly_basis
with (security_invoker = true)
as
with monthly_income as (
  select
    transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date as reference_month,
    accounts.currency,
    sum(transactions.amount_minor)::numeric(20, 0) as income_amount_minor
  from public.transactions
  join public.accounts
    on accounts.id = transactions.account_id
    and accounts.user_id = transactions.user_id
  where transactions.transaction_type = 'income'
    and transactions.status = 'completed'
    and transactions.is_active
  group by
    transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date,
    accounts.currency
),
competence_expense as (
  select
    monthly_consumption.user_id,
    monthly_consumption.reference_month,
    monthly_consumption.currency,
    sum(monthly_consumption.realized_amount_minor)::numeric(20, 0)
      as expense_amount_minor
  from public.monthly_consumption
  group by
    monthly_consumption.user_id,
    monthly_consumption.reference_month,
    monthly_consumption.currency
),
cash_expense as (
  select
    transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date as reference_month,
    accounts.currency,
    sum(transactions.amount_minor)::numeric(20, 0) as expense_amount_minor
  from public.transactions
  join public.accounts
    on accounts.id = transactions.account_id
    and accounts.user_id = transactions.user_id
  where transactions.transaction_type = 'expense'
    and transactions.status = 'completed'
    and transactions.is_active
  group by
    transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date,
    accounts.currency
),
monthly_plan as (
  select
    monthly_budgets.user_id,
    monthly_budgets.reference_month,
    monthly_budgets.currency,
    sum(monthly_budgets.planned_amount_minor)::numeric(20, 0)
      as planned_amount_minor
  from public.monthly_budgets
  group by
    monthly_budgets.user_id,
    monthly_budgets.reference_month,
    monthly_budgets.currency
),
competence_dimensions as (
  select user_id, reference_month, currency from monthly_income
  union
  select user_id, reference_month, currency from competence_expense
  union
  select user_id, reference_month, currency from monthly_plan
),
cash_dimensions as (
  select user_id, reference_month, currency from monthly_income
  union
  select user_id, reference_month, currency from cash_expense
)
select
  'competence'::text as basis,
  dimensions.user_id,
  dimensions.reference_month,
  dimensions.currency,
  coalesce(income.income_amount_minor, 0)::numeric(20, 0)
    as income_amount_minor,
  coalesce(expense.expense_amount_minor, 0)::numeric(20, 0)
    as expense_amount_minor,
  (
    coalesce(income.income_amount_minor, 0)
    - coalesce(expense.expense_amount_minor, 0)
  )::numeric(20, 0) as result_amount_minor,
  coalesce(plan.planned_amount_minor, 0)::numeric(20, 0)
    as planned_amount_minor,
  case
    when coalesce(plan.planned_amount_minor, 0) = 0 then null
    else round(
      coalesce(expense.expense_amount_minor, 0) * 100.0
      / plan.planned_amount_minor,
      2
    )
  end as budget_percentage_consumed
from competence_dimensions dimensions
left join monthly_income income
  on income.user_id = dimensions.user_id
  and income.reference_month = dimensions.reference_month
  and income.currency = dimensions.currency
left join competence_expense expense
  on expense.user_id = dimensions.user_id
  and expense.reference_month = dimensions.reference_month
  and expense.currency = dimensions.currency
left join monthly_plan plan
  on plan.user_id = dimensions.user_id
  and plan.reference_month = dimensions.reference_month
  and plan.currency = dimensions.currency
union all
select
  'cash'::text as basis,
  dimensions.user_id,
  dimensions.reference_month,
  dimensions.currency,
  coalesce(income.income_amount_minor, 0)::numeric(20, 0),
  coalesce(expense.expense_amount_minor, 0)::numeric(20, 0),
  (
    coalesce(income.income_amount_minor, 0)
    - coalesce(expense.expense_amount_minor, 0)
  )::numeric(20, 0),
  0::numeric(20, 0),
  null::numeric
from cash_dimensions dimensions
left join monthly_income income
  on income.user_id = dimensions.user_id
  and income.reference_month = dimensions.reference_month
  and income.currency = dimensions.currency
left join cash_expense expense
  on expense.user_id = dimensions.user_id
  and expense.reference_month = dimensions.reference_month
  and expense.currency = dimensions.currency;

create or replace view public.financial_dashboard_expense_categories_basis
with (security_invoker = true)
as
select
  'competence'::text as basis,
  consumption.user_id,
  consumption.reference_month,
  consumption.currency,
  consumption.category_id,
  categories.name as category_name,
  consumption.context,
  consumption.realized_amount_minor::numeric(20, 0) as expense_amount_minor
from public.monthly_consumption consumption
join public.categories categories
  on categories.id = consumption.category_id
  and categories.user_id = consumption.user_id
union all
select
  'cash'::text as basis,
  transactions.user_id,
  date_trunc('month', transactions.transaction_date)::date,
  accounts.currency,
  transactions.category_id,
  coalesce(categories.name, 'Pagamento de cartões') as category_name,
  coalesce(categories.context, accounts.context) as context,
  sum(transactions.amount_minor)::numeric(20, 0) as expense_amount_minor
from public.transactions
join public.accounts
  on accounts.id = transactions.account_id
  and accounts.user_id = transactions.user_id
left join public.categories
  on categories.id = transactions.category_id
  and categories.user_id = transactions.user_id
where transactions.transaction_type = 'expense'
  and transactions.status = 'completed'
  and transactions.is_active
group by
  transactions.user_id,
  date_trunc('month', transactions.transaction_date)::date,
  accounts.currency,
  transactions.category_id,
  coalesce(categories.name, 'Pagamento de cartões'),
  coalesce(categories.context, accounts.context);

revoke all on table public.financial_dashboard_monthly_basis
from anon, authenticated;
revoke all on table public.financial_dashboard_expense_categories_basis
from anon, authenticated;
grant select on table public.financial_dashboard_monthly_basis
to authenticated;
grant select on table public.financial_dashboard_expense_categories_basis
to authenticated;

create table public.financing_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255),
  file_sha256 char(64) not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  adapter_id text not null check (char_length(adapter_id) between 1 and 100),
  adapter_version text not null check (char_length(adapter_version) between 1 and 30),
  status text not null default 'review'
    check (status in ('review', 'completed', 'cancelled', 'failed')),
  institution text not null check (char_length(trim(institution)) between 1 and 120),
  contract_reference text not null
    check (char_length(trim(contract_reference)) between 1 and 80),
  currency char(3) not null check (currency in ('BRL', 'USD', 'EUR')),
  amortization_system text
    check (amortization_system is null or char_length(amortization_system) <= 40),
  indexer text check (indexer is null or char_length(indexer) <= 40),
  original_principal_minor bigint not null
    check (original_principal_minor between 1 and 9007199254740991),
  original_term_months integer
    check (original_term_months is null or original_term_months between 1 and 1200),
  contract_date date not null,
  release_date date,
  current_balance_minor bigint not null
    check (current_balance_minor between 0 and 9007199254740991),
  balance_date date not null,
  nominal_annual_rate numeric(12, 8),
  effective_annual_rate numeric(12, 8),
  cet_annual_rate numeric(12, 8),
  cesh_annual_rate numeric(12, 8),
  source_page_count integer not null check (source_page_count > 0),
  original_file_discarded_at timestamptz not null default now(),
  contract_id uuid,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financing_import_jobs_status_consistent check (
    (status = 'review' and contract_id is null and confirmed_at is null and cancelled_at is null)
    or (status = 'completed' and contract_id is not null and confirmed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and contract_id is null and cancelled_at is not null)
    or (status = 'failed' and contract_id is null and confirmed_at is null)
  )
);

create table public.financing_import_schedule_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.financing_import_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_sequence integer not null check (source_sequence > 0),
  installment_number integer not null check (installment_number >= 0),
  due_date date not null,
  total_amount_minor bigint not null check (total_amount_minor >= 0),
  principal_minor bigint not null check (principal_minor >= 0),
  interest_minor bigint not null check (interest_minor >= 0),
  correction_factor numeric(20, 10),
  insurance_mip_minor bigint not null default 0 check (insurance_mip_minor >= 0),
  insurance_dfi_minor bigint not null default 0 check (insurance_dfi_minor >= 0),
  service_fee_minor bigint not null default 0 check (service_fee_minor >= 0),
  penalty_minor bigint not null default 0 check (penalty_minor >= 0),
  late_interest_minor bigint not null default 0 check (late_interest_minor >= 0),
  fgts_minor bigint not null default 0 check (fgts_minor >= 0),
  balance_correction_factor numeric(20, 10),
  outstanding_balance_minor bigint not null check (outstanding_balance_minor >= 0),
  payment_status text not null check (payment_status in ('paid', 'scheduled')),
  payment_date date,
  paid_amount_minor bigint not null default 0 check (paid_amount_minor >= 0),
  source_pages integer[] not null,
  created_at timestamptz not null default now(),
  unique (job_id, source_sequence)
);

create table public.financing_import_extra_amortizations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.financing_import_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_sequence integer not null check (source_sequence > 0),
  event_date date not null,
  reduction_type text not null
    check (reduction_type in ('term', 'payment')),
  cash_amount_minor bigint not null default 0 check (cash_amount_minor >= 0),
  fgts_amount_minor bigint not null default 0 check (fgts_amount_minor >= 0),
  installments_reduced integer
    check (installments_reduced is null or installments_reduced >= 0),
  source_pages integer[] not null,
  created_at timestamptz not null default now(),
  unique (job_id, source_sequence)
);

create table public.financing_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  net_worth_item_id uuid not null unique,
  institution text not null check (char_length(trim(institution)) between 1 and 120),
  product_type text not null check (product_type in ('financing', 'loan')),
  contract_reference text not null
    check (char_length(trim(contract_reference)) between 1 and 80),
  currency char(3) not null check (currency in ('BRL', 'USD', 'EUR')),
  amortization_system text,
  indexer text,
  original_principal_minor bigint not null check (original_principal_minor > 0),
  original_term_months integer,
  contract_date date not null,
  release_date date,
  current_balance_minor bigint not null check (current_balance_minor >= 0),
  balance_date date not null,
  nominal_annual_rate numeric(12, 8),
  effective_annual_rate numeric(12, 8),
  cet_annual_rate numeric(12, 8),
  cesh_annual_rate numeric(12, 8),
  status text not null default 'active'
    check (status in ('active', 'settled', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financing_contracts_id_user_unique unique (id, user_id),
  constraint financing_contracts_net_worth_owner_fkey
    foreign key (net_worth_item_id, user_id)
    references public.net_worth_items(id, user_id)
    on delete restrict
);

alter table public.financing_import_jobs
add constraint financing_import_jobs_contract_fkey
foreign key (contract_id, user_id)
references public.financing_contracts(id, user_id)
on delete restrict;

create table public.financing_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_sequence integer not null check (source_sequence > 0),
  installment_number integer not null check (installment_number >= 0),
  due_date date not null,
  total_amount_minor bigint not null check (total_amount_minor >= 0),
  principal_minor bigint not null check (principal_minor >= 0),
  interest_minor bigint not null check (interest_minor >= 0),
  correction_factor numeric(20, 10),
  insurance_mip_minor bigint not null default 0 check (insurance_mip_minor >= 0),
  insurance_dfi_minor bigint not null default 0 check (insurance_dfi_minor >= 0),
  service_fee_minor bigint not null default 0 check (service_fee_minor >= 0),
  penalty_minor bigint not null default 0 check (penalty_minor >= 0),
  late_interest_minor bigint not null default 0 check (late_interest_minor >= 0),
  fgts_minor bigint not null default 0 check (fgts_minor >= 0),
  balance_correction_factor numeric(20, 10),
  outstanding_balance_minor bigint not null check (outstanding_balance_minor >= 0),
  payment_status text not null check (payment_status in ('paid', 'scheduled')),
  payment_date date,
  paid_amount_minor bigint not null default 0 check (paid_amount_minor >= 0),
  source_pages integer[] not null,
  created_at timestamptz not null default now(),
  constraint financing_schedule_contract_owner_fkey
    foreign key (contract_id, user_id)
    references public.financing_contracts(id, user_id)
    on delete cascade,
  unique (contract_id, source_sequence)
);

create table public.financing_extra_amortizations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_sequence integer not null check (source_sequence > 0),
  event_date date not null,
  reduction_type text not null check (reduction_type in ('term', 'payment')),
  cash_amount_minor bigint not null default 0 check (cash_amount_minor >= 0),
  fgts_amount_minor bigint not null default 0 check (fgts_amount_minor >= 0),
  installments_reduced integer,
  source_pages integer[] not null,
  created_at timestamptz not null default now(),
  constraint financing_extra_contract_owner_fkey
    foreign key (contract_id, user_id)
    references public.financing_contracts(id, user_id)
    on delete cascade,
  unique (contract_id, source_sequence)
);

create index financing_import_jobs_owner_status_idx
on public.financing_import_jobs (user_id, status, created_at desc);
create index financing_import_schedule_owner_job_idx
on public.financing_import_schedule_rows (user_id, job_id, source_sequence);
create index financing_contracts_owner_status_idx
on public.financing_contracts (user_id, status, currency, institution);
create index financing_schedule_owner_due_idx
on public.financing_schedule_entries (user_id, contract_id, due_date);
create index financing_schedule_paid_idx
on public.financing_schedule_entries (user_id, contract_id, payment_date)
where payment_status = 'paid';
create index financing_extra_owner_date_idx
on public.financing_extra_amortizations (user_id, contract_id, event_date);

create trigger financing_import_jobs_set_updated_at
before update on public.financing_import_jobs
for each row execute procedure public.set_updated_at();
create trigger financing_contracts_set_updated_at
before update on public.financing_contracts
for each row execute procedure public.set_updated_at();

alter table public.financing_import_jobs enable row level security;
alter table public.financing_import_schedule_rows enable row level security;
alter table public.financing_import_extra_amortizations enable row level security;
alter table public.financing_contracts enable row level security;
alter table public.financing_schedule_entries enable row level security;
alter table public.financing_extra_amortizations enable row level security;

create policy "financing_import_jobs_owner_select"
on public.financing_import_jobs for select to authenticated
using ((select auth.uid()) = user_id);
create policy "financing_import_schedule_owner_select"
on public.financing_import_schedule_rows for select to authenticated
using ((select auth.uid()) = user_id);
create policy "financing_import_extra_owner_select"
on public.financing_import_extra_amortizations for select to authenticated
using ((select auth.uid()) = user_id);
create policy "financing_contracts_owner_select"
on public.financing_contracts for select to authenticated
using ((select auth.uid()) = user_id);
create policy "financing_schedule_owner_select"
on public.financing_schedule_entries for select to authenticated
using ((select auth.uid()) = user_id);
create policy "financing_extra_owner_select"
on public.financing_extra_amortizations for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.financing_import_jobs from anon, authenticated;
revoke all on table public.financing_import_schedule_rows from anon, authenticated;
revoke all on table public.financing_import_extra_amortizations from anon, authenticated;
revoke all on table public.financing_contracts from anon, authenticated;
revoke all on table public.financing_schedule_entries from anon, authenticated;
revoke all on table public.financing_extra_amortizations from anon, authenticated;
grant select on table public.financing_import_jobs to authenticated;
grant select on table public.financing_import_schedule_rows to authenticated;
grant select on table public.financing_import_extra_amortizations to authenticated;
grant select on table public.financing_contracts to authenticated;
grant select on table public.financing_schedule_entries to authenticated;
grant select on table public.financing_extra_amortizations to authenticated;

create or replace function private.create_financing_import_job(
  target_file_name text,
  target_file_sha256 text,
  target_adapter_id text,
  target_adapter_version text,
  target_contract jsonb,
  target_schedule jsonb,
  target_extra_amortizations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_job_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(target_contract) <> 'object'
    or jsonb_typeof(target_schedule) <> 'array'
    or jsonb_typeof(target_extra_amortizations) <> 'array' then
    raise exception 'invalid_financing_import_payload' using errcode = '22023';
  end if;

  insert into public.financing_import_jobs (
    user_id,
    file_name,
    file_sha256,
    adapter_id,
    adapter_version,
    institution,
    contract_reference,
    currency,
    amortization_system,
    indexer,
    original_principal_minor,
    original_term_months,
    contract_date,
    release_date,
    current_balance_minor,
    balance_date,
    nominal_annual_rate,
    effective_annual_rate,
    cet_annual_rate,
    cesh_annual_rate,
    source_page_count
  ) values (
    current_user_id,
    left(target_file_name, 255),
    target_file_sha256,
    target_adapter_id,
    target_adapter_version,
    target_contract->>'institution',
    target_contract->>'contractReference',
    target_contract->>'currency',
    nullif(target_contract->>'amortizationSystem', ''),
    nullif(target_contract->>'indexer', ''),
    (target_contract->>'originalPrincipalMinor')::bigint,
    nullif(target_contract->>'originalTermMonths', '')::integer,
    (target_contract->>'contractDate')::date,
    nullif(target_contract->>'releaseDate', '')::date,
    (target_contract->>'currentBalanceMinor')::bigint,
    (target_contract->>'balanceDate')::date,
    nullif(target_contract->>'nominalAnnualRate', '')::numeric,
    nullif(target_contract->>'effectiveAnnualRate', '')::numeric,
    nullif(target_contract->>'cetAnnualRate', '')::numeric,
    nullif(target_contract->>'ceshAnnualRate', '')::numeric,
    (target_contract->>'sourcePageCount')::integer
  ) returning id into new_job_id;

  insert into public.financing_import_schedule_rows (
    job_id,
    user_id,
    source_sequence,
    installment_number,
    due_date,
    total_amount_minor,
    principal_minor,
    interest_minor,
    correction_factor,
    insurance_mip_minor,
    insurance_dfi_minor,
    service_fee_minor,
    penalty_minor,
    late_interest_minor,
    fgts_minor,
    balance_correction_factor,
    outstanding_balance_minor,
    payment_status,
    payment_date,
    paid_amount_minor,
    source_pages
  )
  select
    new_job_id,
    current_user_id,
    row.source_sequence,
    row.installment_number,
    row.due_date,
    row.total_amount_minor,
    row.principal_minor,
    row.interest_minor,
    row.correction_factor,
    row.insurance_mip_minor,
    row.insurance_dfi_minor,
    row.service_fee_minor,
    row.penalty_minor,
    row.late_interest_minor,
    row.fgts_minor,
    row.balance_correction_factor,
    row.outstanding_balance_minor,
    row.payment_status,
    row.payment_date,
    row.paid_amount_minor,
    row.source_pages
  from jsonb_to_recordset(target_schedule) as row(
    source_sequence integer,
    installment_number integer,
    due_date date,
    total_amount_minor bigint,
    principal_minor bigint,
    interest_minor bigint,
    correction_factor numeric,
    insurance_mip_minor bigint,
    insurance_dfi_minor bigint,
    service_fee_minor bigint,
    penalty_minor bigint,
    late_interest_minor bigint,
    fgts_minor bigint,
    balance_correction_factor numeric,
    outstanding_balance_minor bigint,
    payment_status text,
    payment_date date,
    paid_amount_minor bigint,
    source_pages integer[]
  );

  insert into public.financing_import_extra_amortizations (
    job_id,
    user_id,
    source_sequence,
    event_date,
    reduction_type,
    cash_amount_minor,
    fgts_amount_minor,
    installments_reduced,
    source_pages
  )
  select
    new_job_id,
    current_user_id,
    row.source_sequence,
    row.event_date,
    row.reduction_type,
    row.cash_amount_minor,
    row.fgts_amount_minor,
    row.installments_reduced,
    row.source_pages
  from jsonb_to_recordset(target_extra_amortizations) as row(
    source_sequence integer,
    event_date date,
    reduction_type text,
    cash_amount_minor bigint,
    fgts_amount_minor bigint,
    installments_reduced integer,
    source_pages integer[]
  );

  if not exists (
    select 1 from public.financing_import_schedule_rows
    where job_id = new_job_id
  ) then
    raise exception 'financing_schedule_empty' using errcode = '23514';
  end if;

  return new_job_id;
end;
$$;

create or replace function private.confirm_financing_import(
  target_job_id uuid,
  target_name text,
  target_product_type text,
  target_context public.financial_context
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  job public.financing_import_jobs%rowtype;
  new_net_worth_item_id uuid;
  new_contract_id uuid;
begin
  select * into job
  from public.financing_import_jobs
  where id = target_job_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'financing_import_not_found' using errcode = 'P0002';
  end if;
  if job.status <> 'review' then
    raise exception 'financing_import_not_reviewable' using errcode = '23514';
  end if;
  if target_product_type not in ('financing', 'loan')
    or char_length(trim(target_name)) not between 1 and 100 then
    raise exception 'invalid_financing_confirmation' using errcode = '22023';
  end if;

  insert into public.net_worth_items (
    user_id,
    kind,
    item_type,
    name,
    currency,
    current_value_minor,
    valuation_date,
    context,
    notes
  ) values (
    current_user_id,
    'liability',
    target_product_type::public.net_worth_item_type,
    trim(target_name),
    job.currency,
    job.current_balance_minor,
    least(job.balance_date, current_date),
    target_context,
    'Saldo sincronizado por extrato financeiro importado (' || job.adapter_id || ').'
  ) returning id into new_net_worth_item_id;

  insert into public.financing_contracts (
    user_id,
    net_worth_item_id,
    institution,
    product_type,
    contract_reference,
    currency,
    amortization_system,
    indexer,
    original_principal_minor,
    original_term_months,
    contract_date,
    release_date,
    current_balance_minor,
    balance_date,
    nominal_annual_rate,
    effective_annual_rate,
    cet_annual_rate,
    cesh_annual_rate,
    status
  ) values (
    current_user_id,
    new_net_worth_item_id,
    job.institution,
    target_product_type,
    job.contract_reference,
    job.currency,
    job.amortization_system,
    job.indexer,
    job.original_principal_minor,
    job.original_term_months,
    job.contract_date,
    job.release_date,
    job.current_balance_minor,
    job.balance_date,
    job.nominal_annual_rate,
    job.effective_annual_rate,
    job.cet_annual_rate,
    job.cesh_annual_rate,
    case when job.current_balance_minor = 0 then 'settled' else 'active' end
  ) returning id into new_contract_id;

  insert into public.financing_schedule_entries (
    contract_id,
    user_id,
    source_sequence,
    installment_number,
    due_date,
    total_amount_minor,
    principal_minor,
    interest_minor,
    correction_factor,
    insurance_mip_minor,
    insurance_dfi_minor,
    service_fee_minor,
    penalty_minor,
    late_interest_minor,
    fgts_minor,
    balance_correction_factor,
    outstanding_balance_minor,
    payment_status,
    payment_date,
    paid_amount_minor,
    source_pages
  )
  select
    new_contract_id,
    current_user_id,
    source_sequence,
    installment_number,
    due_date,
    total_amount_minor,
    principal_minor,
    interest_minor,
    correction_factor,
    insurance_mip_minor,
    insurance_dfi_minor,
    service_fee_minor,
    penalty_minor,
    late_interest_minor,
    fgts_minor,
    balance_correction_factor,
    outstanding_balance_minor,
    payment_status,
    payment_date,
    paid_amount_minor,
    source_pages
  from public.financing_import_schedule_rows
  where job_id = target_job_id and user_id = current_user_id;

  insert into public.financing_extra_amortizations (
    contract_id,
    user_id,
    source_sequence,
    event_date,
    reduction_type,
    cash_amount_minor,
    fgts_amount_minor,
    installments_reduced,
    source_pages
  )
  select
    new_contract_id,
    current_user_id,
    source_sequence,
    event_date,
    reduction_type,
    cash_amount_minor,
    fgts_amount_minor,
    installments_reduced,
    source_pages
  from public.financing_import_extra_amortizations
  where job_id = target_job_id and user_id = current_user_id;

  delete from public.financing_import_schedule_rows
  where job_id = target_job_id and user_id = current_user_id;
  delete from public.financing_import_extra_amortizations
  where job_id = target_job_id and user_id = current_user_id;

  update public.financing_import_jobs
  set status = 'completed',
      contract_id = new_contract_id,
      confirmed_at = now()
  where id = target_job_id;

  return new_contract_id;
end;
$$;

create or replace function private.cancel_financing_import(target_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  update public.financing_import_jobs
  set status = 'cancelled', cancelled_at = now()
  where id = target_job_id
    and user_id = current_user_id
    and status = 'review';

  if not found then
    raise exception 'financing_import_not_reviewable' using errcode = '23514';
  end if;

  delete from public.financing_import_schedule_rows
  where job_id = target_job_id and user_id = current_user_id;
  delete from public.financing_import_extra_amortizations
  where job_id = target_job_id and user_id = current_user_id;
  return true;
end;
$$;

revoke all on function private.create_financing_import_job(
  text, text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function private.confirm_financing_import(
  uuid, text, text, public.financial_context
) from public, anon, authenticated;
revoke all on function private.cancel_financing_import(uuid)
from public, anon, authenticated;
grant execute on function private.create_financing_import_job(
  text, text, text, text, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function private.confirm_financing_import(
  uuid, text, text, public.financial_context
) to authenticated;
grant execute on function private.cancel_financing_import(uuid)
to authenticated;

create or replace function public.create_financing_import_job(
  target_file_name text,
  target_file_sha256 text,
  target_adapter_id text,
  target_adapter_version text,
  target_contract jsonb,
  target_schedule jsonb,
  target_extra_amortizations jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_financing_import_job(
    target_file_name,
    target_file_sha256,
    target_adapter_id,
    target_adapter_version,
    target_contract,
    target_schedule,
    target_extra_amortizations
  );
$$;

create or replace function public.confirm_financing_import(
  target_job_id uuid,
  target_name text,
  target_product_type text,
  target_context public.financial_context
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_financing_import(
    target_job_id,
    target_name,
    target_product_type,
    target_context
  );
$$;

create or replace function public.cancel_financing_import(target_job_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_financing_import(target_job_id);
$$;

revoke all on function public.create_financing_import_job(
  text, text, text, text, jsonb, jsonb, jsonb
) from public, anon;
revoke all on function public.confirm_financing_import(
  uuid, text, text, public.financial_context
) from public, anon;
revoke all on function public.cancel_financing_import(uuid)
from public, anon;
grant execute on function public.create_financing_import_job(
  text, text, text, text, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.confirm_financing_import(
  uuid, text, text, public.financial_context
) to authenticated;
grant execute on function public.cancel_financing_import(uuid)
to authenticated;

create or replace view public.financing_contract_summaries
with (security_invoker = true)
as
select
  contracts.*,
  items.name,
  items.context,
  coalesce(schedule.total_paid_minor, 0)::numeric(20, 0) as total_paid_minor,
  coalesce(schedule.principal_paid_minor, 0)::numeric(20, 0) as principal_paid_minor,
  coalesce(schedule.interest_paid_minor, 0)::numeric(20, 0) as interest_paid_minor,
  coalesce(schedule.charges_paid_minor, 0)::numeric(20, 0) as charges_paid_minor,
  coalesce(extra.extra_cash_minor, 0)::numeric(20, 0) as extra_cash_minor,
  coalesce(extra.extra_fgts_minor, 0)::numeric(20, 0) as extra_fgts_minor,
  coalesce(schedule.paid_installments, 0)::integer as paid_installments,
  coalesce(schedule.scheduled_installments, 0)::integer as scheduled_installments
from public.financing_contracts contracts
join public.net_worth_items items
  on items.id = contracts.net_worth_item_id
  and items.user_id = contracts.user_id
left join lateral (
  select
    sum(entries.paid_amount_minor) filter (
      where entries.payment_status = 'paid'
    ) as total_paid_minor,
    sum(entries.principal_minor) filter (
      where entries.payment_status = 'paid'
    ) as principal_paid_minor,
    sum(entries.interest_minor) filter (
      where entries.payment_status = 'paid'
    ) as interest_paid_minor,
    sum(
      entries.insurance_mip_minor
      + entries.insurance_dfi_minor
      + entries.service_fee_minor
      + entries.penalty_minor
      + entries.late_interest_minor
    ) filter (where entries.payment_status = 'paid') as charges_paid_minor,
    count(*) filter (where entries.payment_status = 'paid') as paid_installments,
    count(*) filter (where entries.payment_status = 'scheduled') as scheduled_installments
  from public.financing_schedule_entries entries
  where entries.contract_id = contracts.id
    and entries.user_id = contracts.user_id
) schedule on true
left join lateral (
  select
    sum(amortizations.cash_amount_minor) as extra_cash_minor,
    sum(amortizations.fgts_amount_minor) as extra_fgts_minor
  from public.financing_extra_amortizations amortizations
  where amortizations.contract_id = contracts.id
    and amortizations.user_id = contracts.user_id
) extra on true;

revoke all on table public.financing_contract_summaries
from anon, authenticated;
grant select on table public.financing_contract_summaries to authenticated;

comment on table public.credit_card_payments is
'Transferência de caixa da conta pagadora para a fatura do cartão. Não cria novo consumo por competência.';
comment on view public.financial_dashboard_monthly_basis is
'Resumo mensal separado por moeda e regime: competência reconhece parcelas; caixa reconhece pagamentos efetivos, inclusive faturas.';
comment on table public.financing_import_jobs is
'Staging de extratos financeiros de financiamento; o PDF original é descartado após a leitura.';
comment on table public.financing_contracts is
'Contrato estruturado e vinculado a um único passivo patrimonial para evitar dupla contagem.';
comment on view public.financing_contract_summaries is
'Indicadores de valor pago, principal, juros, encargos e amortizações extraordinárias por contrato.';
