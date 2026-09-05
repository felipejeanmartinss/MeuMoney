-- Investment account entries, income/expense reporting and annual budgets.

alter type public.transaction_origin_type
add value if not exists 'investment';

do $$
begin
  create type public.investment_income_type as enum (
    'interest_on_capital',
    'dividend',
    'bonus',
    'other'
  );
exception when duplicate_object then null;
end;
$$;

alter table public.investment_cash_flows
add column transaction_id uuid references public.transactions(id) on delete cascade,
add column income_type public.investment_income_type;

alter table public.investment_cash_flows
add constraint investment_cash_flows_linked_kind_consistent check (
  transaction_id is null
  or (
    (cash_flow_type = 'income' and income_type is not null)
    or (cash_flow_type in ('contribution', 'redemption') and income_type is null)
  )
);

create unique index investment_cash_flows_transaction_unique_idx
on public.investment_cash_flows (transaction_id)
where transaction_id is not null;

create index investment_cash_flows_user_transaction_idx
on public.investment_cash_flows (user_id, transaction_id)
where transaction_id is not null;

alter table public.transactions
drop constraint transactions_origin_consistency;

alter table public.transactions
add constraint transactions_origin_consistency
check (
  (
    origin_type::text = 'manual'
    and origin_id is null
    and credit_card_invoice_id is null
    and recurring_transaction_id is null
    and category_id is not null
  )
  or (
    origin_type::text = 'credit_card_invoice_payment'
    and origin_id = credit_card_invoice_id
    and credit_card_invoice_id is not null
    and recurring_transaction_id is null
    and category_id is null
    and transaction_type = 'expense'
    and status = 'completed'
  )
  or (
    origin_type::text = 'system'
    and origin_id = recurring_transaction_id
    and recurring_transaction_id is not null
    and credit_card_invoice_id is null
    and category_id is not null
    and status = 'pending'
  )
  or (
    origin_type::text = 'investment'
    and origin_id is not null
    and credit_card_invoice_id is null
    and recurring_transaction_id is null
    and category_id is null
    and status = 'completed'
  )
);

create or replace function public.validate_financial_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or new.user_id <> (select auth.uid()) then
    raise exception 'transaction_user_mismatch' using errcode = '42501';
  end if;

  if new.transaction_type not in ('income', 'expense') then
    raise exception 'invalid_transaction_type' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.accounts
    where id = new.account_id and user_id = new.user_id
  ) then
    raise exception 'invalid_transaction_account' using errcode = '23503';
  end if;

  if new.origin_type::text in ('manual', 'system') and not exists (
    select 1
    from public.categories
    where id = new.category_id
      and user_id = new.user_id
      and kind = new.transaction_type
  ) then
    raise exception 'invalid_transaction_category' using errcode = '23503';
  end if;

  if new.origin_type::text = 'system' and not exists (
    select 1
    from public.recurring_transactions recurrence
    where recurrence.id = new.recurring_transaction_id
      and recurrence.id = new.origin_id
      and recurrence.user_id = new.user_id
      and recurrence.account_id = new.account_id
      and recurrence.category_id = new.category_id
      and recurrence.transaction_type = new.transaction_type
      and recurrence.description = new.description
      and recurrence.amount_minor = new.amount_minor
      and recurrence.notes is not distinct from new.notes
  ) then
    raise exception 'invalid_recurring_transaction_origin'
      using errcode = '23503';
  end if;

  if new.origin_type::text = 'credit_card_invoice_payment' and not exists (
    select 1
    from public.credit_card_invoices
    where id = new.credit_card_invoice_id and user_id = new.user_id
  ) then
    raise exception 'invalid_invoice_payment_origin'
      using errcode = '23503';
  end if;

  -- The position itself is validated and locked by the only RPC allowed to
  -- create investment-origin rows. Keeping this trigger focused on the
  -- account also preserves the established backup restore order, in which
  -- transactions are restored before investment positions.
  if new.origin_type::text = 'investment' and not exists (
    select 1
    from public.accounts account
    where account.id = new.account_id
      and account.user_id = new.user_id
      and account.type = 'investment'
      and account.archived_at is null
  ) then
    raise exception 'investment_account_mismatch' using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace function public.validate_investment_cash_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or new.user_id <> current_user_id then
    raise exception 'investment_cash_flow_user_mismatch'
      using errcode = '42501';
  end if;

  if new.cash_flow_date > current_date then
    raise exception 'future_investment_cash_flow' using errcode = '22007';
  end if;

  if not exists (
    select 1
    from public.investment_positions position
    where position.id = new.position_id
      and position.user_id = current_user_id
  ) then
    raise exception 'investment_position_not_owned' using errcode = '42501';
  end if;

  if new.transaction_id is not null and not exists (
    select 1
    from public.transactions transaction_row
    where transaction_row.id = new.transaction_id
      and transaction_row.user_id = current_user_id
      and transaction_row.origin_type::text = 'investment'
      and transaction_row.origin_id = new.position_id
      and transaction_row.amount_minor = new.amount_minor
      and transaction_row.transaction_date = new.cash_flow_date
      and transaction_row.status = 'completed'
      and transaction_row.is_active
      and transaction_row.transaction_type = case
        when new.cash_flow_type = 'contribution'
          then 'expense'::public.transaction_kind
        else 'income'::public.transaction_kind
      end
  ) then
    raise exception 'invalid_investment_transaction_link'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

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
      coalesce(target_quantity, 0), target_amount_minor, target_amount_minor,
      target_transaction_date, account_record.context, true,
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
    amount_minor, quantity, cash_flow_date, notes
  ) values (
    position_record.id, current_user_id, target_cash_flow_type,
    target_income_type, new_transaction_id, target_amount_minor,
    target_quantity, target_transaction_date, nullif(trim(target_notes), '')
  );

  return new_transaction_id;
end;
$$;

create or replace function public.create_investment_account_entry(
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
language sql
security invoker
set search_path = ''
as $$
  select private.create_investment_account_entry(
    target_account_id,
    target_position_id,
    target_event_type,
    target_description,
    target_amount_minor,
    target_quantity,
    target_transaction_date,
    target_notes,
    target_create_position,
    target_new_institution,
    target_new_investment_class,
    target_new_investment_type,
    target_new_asset_name
  );
$$;

revoke all on function private.create_investment_account_entry(
  uuid, uuid, text, text, bigint, numeric, date, text,
  boolean, text, public.investment_class, text, text
) from public, anon, authenticated;
grant execute on function private.create_investment_account_entry(
  uuid, uuid, text, text, bigint, numeric, date, text,
  boolean, text, public.investment_class, text, text
) to authenticated;
revoke all on function public.create_investment_account_entry(
  uuid, uuid, text, text, bigint, numeric, date, text,
  boolean, text, public.investment_class, text, text
) from public, anon;
grant execute on function public.create_investment_account_entry(
  uuid, uuid, text, text, bigint, numeric, date, text,
  boolean, text, public.investment_class, text, text
) to authenticated;

create or replace function public.validate_monthly_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or new.user_id <> (select auth.uid()) then
    raise exception 'monthly_budget_user_mismatch' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.categories
    where id = new.category_id
      and user_id = new.user_id
      and kind in ('income', 'expense')
      and archived_at is null
  ) then
    raise exception 'invalid_monthly_budget_category' using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace view public.monthly_budget_actuals
with (security_invoker = true)
as
select
  actual.user_id,
  actual.category_id,
  actual.category_kind,
  actual.context,
  actual.currency,
  actual.reference_month,
  sum(actual.amount_minor)::numeric(20, 0) as realized_amount_minor
from (
  select
    consumption.user_id,
    consumption.category_id,
    'expense'::public.transaction_kind as category_kind,
    consumption.context,
    consumption.currency,
    consumption.reference_month,
    consumption.realized_amount_minor as amount_minor
  from public.monthly_consumption consumption

  union all

  select
    transactions.user_id,
    transactions.category_id,
    'income'::public.transaction_kind,
    categories.context,
    accounts.currency,
    date_trunc('month', transactions.transaction_date)::date,
    transactions.amount_minor::numeric(20, 0)
  from public.transactions
  join public.accounts
    on accounts.id = transactions.account_id
   and accounts.user_id = transactions.user_id
  join public.categories
    on categories.id = transactions.category_id
   and categories.user_id = transactions.user_id
   and categories.kind = 'income'
  where transactions.transaction_type = 'income'
    and transactions.status = 'completed'
    and transactions.is_active
) actual
group by actual.user_id, actual.category_id, actual.category_kind,
  actual.context, actual.currency, actual.reference_month;

drop view public.monthly_budget_progress;

create view public.monthly_budget_progress
with (security_invoker = true)
as
select
  budgets.id as budget_id,
  coalesce(budgets.user_id, actuals.user_id) as user_id,
  coalesce(budgets.category_id, actuals.category_id) as category_id,
  categories.name as category_name,
  categories.context,
  coalesce(budgets.currency, actuals.currency) as currency,
  coalesce(budgets.reference_month, actuals.reference_month) as reference_month,
  coalesce(budgets.planned_amount_minor, 0)::numeric(20, 0)
    as planned_amount_minor,
  coalesce(actuals.realized_amount_minor, 0)::numeric(20, 0)
    as realized_amount_minor,
  case
    when categories.kind = 'income' then (
      coalesce(actuals.realized_amount_minor, 0)
      - coalesce(budgets.planned_amount_minor, 0)
    )::numeric(20, 0)
    else (
      coalesce(budgets.planned_amount_minor, 0)
      - coalesce(actuals.realized_amount_minor, 0)
    )::numeric(20, 0)
  end as available_amount_minor,
  case
    when coalesce(budgets.planned_amount_minor, 0) = 0 then null
    else round(
      coalesce(actuals.realized_amount_minor, 0) * 100.0
      / budgets.planned_amount_minor,
      2
    )
  end as percentage_consumed,
  categories.kind as category_kind
from public.monthly_budgets budgets
full outer join public.monthly_budget_actuals actuals
  on actuals.user_id = budgets.user_id
 and actuals.category_id = budgets.category_id
 and actuals.currency = budgets.currency
 and actuals.reference_month = budgets.reference_month
join public.categories
  on categories.id = coalesce(budgets.category_id, actuals.category_id)
 and categories.user_id = coalesce(budgets.user_id, actuals.user_id);

revoke all on table public.monthly_budget_actuals from anon, authenticated;
revoke all on table public.monthly_budget_progress from anon, authenticated;
grant select on table public.monthly_budget_actuals to authenticated;
grant select on table public.monthly_budget_progress to authenticated;

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
    and (
      transactions.origin_type::text <> 'investment'
      or exists (
        select 1
        from public.investment_cash_flows flow
        where flow.transaction_id = transactions.id
          and flow.user_id = transactions.user_id
          and flow.cash_flow_type = 'income'
      )
    )
  group by transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date,
    accounts.currency
),
competence_expense as (
  select user_id, reference_month, currency,
    sum(realized_amount_minor)::numeric(20, 0) as expense_amount_minor
  from public.monthly_consumption
  group by user_id, reference_month, currency
),
cash_expense_components as (
  select transactions.user_id, transactions.transaction_date,
    accounts.currency, transactions.amount_minor
  from public.transactions
  join public.accounts
    on accounts.id = transactions.account_id
   and accounts.user_id = transactions.user_id
  where transactions.transaction_type = 'expense'
    and transactions.status = 'completed'
    and transactions.is_active
    and transactions.origin_type::text <> 'investment'
  union all
  select transfers.user_id, transfers.transaction_date,
    transfers.currency, transfers.amount_minor
  from public.transfers
  where transfers.destination_credit_card_id is not null
    and transfers.status = 'completed'
    and transfers.is_active
),
cash_expense as (
  select user_id,
    date_trunc('month', transaction_date)::date as reference_month,
    currency,
    sum(amount_minor)::numeric(20, 0) as expense_amount_minor
  from cash_expense_components
  group by user_id, date_trunc('month', transaction_date)::date, currency
),
monthly_plan as (
  select budgets.user_id, budgets.reference_month, budgets.currency,
    sum(budgets.planned_amount_minor)::numeric(20, 0) as planned_amount_minor
  from public.monthly_budgets budgets
  join public.categories categories
    on categories.id = budgets.category_id
   and categories.user_id = budgets.user_id
   and categories.kind = 'expense'
  group by budgets.user_id, budgets.reference_month, budgets.currency
),
competence_dimensions as (
  select user_id, reference_month, currency from monthly_income
  union select user_id, reference_month, currency from competence_expense
  union select user_id, reference_month, currency from monthly_plan
),
cash_dimensions as (
  select user_id, reference_month, currency from monthly_income
  union select user_id, reference_month, currency from cash_expense
)
select 'competence'::text as basis, dimensions.user_id,
  dimensions.reference_month, dimensions.currency,
  coalesce(income.income_amount_minor, 0)::numeric(20, 0) as income_amount_minor,
  coalesce(expense.expense_amount_minor, 0)::numeric(20, 0) as expense_amount_minor,
  (coalesce(income.income_amount_minor, 0)
    - coalesce(expense.expense_amount_minor, 0))::numeric(20, 0)
    as result_amount_minor,
  coalesce(plan.planned_amount_minor, 0)::numeric(20, 0) as planned_amount_minor,
  case when coalesce(plan.planned_amount_minor, 0) = 0 then null
    else round(coalesce(expense.expense_amount_minor, 0) * 100.0
      / plan.planned_amount_minor, 2)
  end as budget_percentage_consumed
from competence_dimensions dimensions
left join monthly_income income using (user_id, reference_month, currency)
left join competence_expense expense using (user_id, reference_month, currency)
left join monthly_plan plan using (user_id, reference_month, currency)
union all
select 'cash'::text, dimensions.user_id, dimensions.reference_month,
  dimensions.currency,
  coalesce(income.income_amount_minor, 0)::numeric(20, 0),
  coalesce(expense.expense_amount_minor, 0)::numeric(20, 0),
  (coalesce(income.income_amount_minor, 0)
    - coalesce(expense.expense_amount_minor, 0))::numeric(20, 0),
  0::numeric(20, 0), null::numeric
from cash_dimensions dimensions
left join monthly_income income using (user_id, reference_month, currency)
left join cash_expense expense using (user_id, reference_month, currency);

create or replace view public.financial_dashboard_expense_categories_basis
with (security_invoker = true)
as
with cash_expense_components as (
  select transactions.user_id, transactions.transaction_date,
    accounts.currency, transactions.category_id,
    coalesce(categories.name, 'Pagamentos de cartões') as category_name,
    coalesce(categories.context, accounts.context) as context,
    transactions.amount_minor
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
    and transactions.origin_type::text <> 'investment'
  union all
  select transfers.user_id, transfers.transaction_date, transfers.currency,
    null::uuid, 'Pagamentos de cartões'::text, accounts.context,
    transfers.amount_minor
  from public.transfers
  join public.accounts accounts
    on accounts.id = transfers.source_account_id
   and accounts.user_id = transfers.user_id
  where transfers.destination_credit_card_id is not null
    and transfers.status = 'completed'
    and transfers.is_active
)
select 'competence'::text as basis, consumption.user_id,
  consumption.reference_month, consumption.currency,
  consumption.category_id, categories.name as category_name,
  consumption.context,
  consumption.realized_amount_minor::numeric(20, 0) as expense_amount_minor
from public.monthly_consumption consumption
join public.categories categories
  on categories.id = consumption.category_id
 and categories.user_id = consumption.user_id
union all
select 'cash'::text, user_id,
  date_trunc('month', transaction_date)::date, currency, category_id,
  category_name, context, sum(amount_minor)::numeric(20, 0)
from cash_expense_components
group by user_id, date_trunc('month', transaction_date)::date, currency,
  category_id, category_name, context;

revoke all on table public.financial_dashboard_monthly_basis
from anon, authenticated;
revoke all on table public.financial_dashboard_expense_categories_basis
from anon, authenticated;
grant select on table public.financial_dashboard_monthly_basis to authenticated;
grant select on table public.financial_dashboard_expense_categories_basis to authenticated;

comment on column public.investment_cash_flows.transaction_id is
'Optional atomic link to the matching investment-account transaction.';
comment on column public.investment_cash_flows.income_type is
'Subtype for linked investment income; null for contributions and redemptions.';
comment on view public.monthly_budget_actuals is
'Monthly realized income and expense by category; expense follows card competence rules.';
comment on view public.monthly_budget_progress is
'Monthly plan versus actual for income and expense categories, isolated by owner, context and currency.';
