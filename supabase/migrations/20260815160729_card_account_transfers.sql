-- Allow account-to-card transfers without binding the cash movement to an invoice.
-- Competence remains driven by purchases/installments; completed card transfers
-- affect only the source account cash balance and the card's current balance.

alter table public.transfers
  alter column destination_account_id drop not null,
  add column destination_credit_card_id uuid
    references public.credit_cards(id) on delete restrict;

alter table public.transfers
  drop constraint if exists transfers_check,
  add constraint transfers_exactly_one_destination check (
    (destination_account_id is not null)::integer
    + (destination_credit_card_id is not null)::integer = 1
  ),
  add constraint transfers_accounts_must_differ check (
    destination_account_id is null
    or source_account_id <> destination_account_id
  );

create index transfers_credit_card_date_idx
on public.transfers (destination_credit_card_id, transaction_date desc)
where destination_credit_card_id is not null;

create or replace function private.update_transfer(
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
security definer
set search_path = ''
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
  set source_account_id = update_transfer.source_account_id,
      destination_account_id = update_transfer.destination_account_id,
      destination_credit_card_id = null,
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
  ) values
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
  set account_id = excluded.account_id,
      amount_minor = excluded.amount_minor,
      currency = excluded.currency,
      transaction_date = excluded.transaction_date,
      status = excluded.status,
      is_active = excluded.is_active;

  return true;
end;
$$;

create or replace function private.create_credit_card_transfer(
  source_account_id uuid,
  destination_credit_card_id uuid,
  amount_minor bigint,
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
  card_currency char(3);
  new_transfer_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_transfer_amount' using errcode = '23514';
  end if;

  select currency into source_currency
  from public.accounts
  where id = source_account_id
    and user_id = current_user_id
    and archived_at is null;

  select currency into card_currency
  from public.credit_cards
  where id = destination_credit_card_id
    and user_id = current_user_id
    and is_active;

  if source_currency is null then
    raise exception 'invalid_transfer_account' using errcode = '23503';
  end if;
  if card_currency is null then
    raise exception 'invalid_transfer_credit_card' using errcode = '23503';
  end if;
  if source_currency <> card_currency then
    raise exception 'transfer_currency_mismatch' using errcode = '23514';
  end if;

  insert into public.transfers (
    user_id,
    source_account_id,
    destination_account_id,
    destination_credit_card_id,
    amount_minor,
    currency,
    transaction_date,
    status,
    description,
    notes
  ) values (
    current_user_id,
    source_account_id,
    null,
    destination_credit_card_id,
    amount_minor,
    source_currency,
    transaction_date,
    transfer_status,
    coalesce(
      nullif(trim(transfer_description), ''),
      'Transferência para cartão'
    ),
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
  ) values (
    new_transfer_id,
    current_user_id,
    source_account_id,
    'outflow',
    amount_minor,
    source_currency,
    transaction_date,
    transfer_status
  );

  return new_transfer_id;
end;
$$;

create or replace function private.update_credit_card_transfer(
  target_transfer_id uuid,
  source_account_id uuid,
  destination_credit_card_id uuid,
  amount_minor bigint,
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
  card_currency char(3);
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

  select currency into source_currency
  from public.accounts
  where id = source_account_id
    and user_id = current_user_id
    and archived_at is null;

  select currency into card_currency
  from public.credit_cards
  where id = destination_credit_card_id
    and user_id = current_user_id
    and is_active;

  if source_currency is null then
    raise exception 'invalid_transfer_account' using errcode = '23503';
  end if;
  if card_currency is null then
    raise exception 'invalid_transfer_credit_card' using errcode = '23503';
  end if;
  if source_currency <> card_currency then
    raise exception 'transfer_currency_mismatch' using errcode = '23514';
  end if;

  update public.transfers
  set source_account_id = update_credit_card_transfer.source_account_id,
      destination_account_id = null,
      destination_credit_card_id = update_credit_card_transfer.destination_credit_card_id,
      amount_minor = update_credit_card_transfer.amount_minor,
      currency = source_currency,
      transaction_date = update_credit_card_transfer.transaction_date,
      status = transfer_status,
      description = coalesce(
        nullif(trim(transfer_description), ''),
        'Transferência para cartão'
      ),
      notes = nullif(trim(transfer_notes), '')
  where id = target_transfer_id
    and user_id = current_user_id;

  delete from public.transfer_entries
  where transfer_id = target_transfer_id
    and user_id = current_user_id
    and direction = 'inflow';

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
  ) values (
    target_transfer_id,
    current_user_id,
    source_account_id,
    'outflow',
    amount_minor,
    source_currency,
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

revoke all on function private.create_credit_card_transfer(
  uuid, uuid, bigint, date, public.transaction_status, text, text
) from public, anon, authenticated;
revoke all on function private.update_credit_card_transfer(
  uuid, uuid, uuid, bigint, date, public.transaction_status, text, text
) from public, anon, authenticated;
grant execute on function private.create_credit_card_transfer(
  uuid, uuid, bigint, date, public.transaction_status, text, text
) to authenticated;
grant execute on function private.update_credit_card_transfer(
  uuid, uuid, uuid, bigint, date, public.transaction_status, text, text
) to authenticated;

create or replace function public.create_credit_card_transfer(
  source_account_id uuid,
  destination_credit_card_id uuid,
  amount_minor bigint,
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
  select private.create_credit_card_transfer(
    source_account_id,
    destination_credit_card_id,
    amount_minor,
    transaction_date,
    transfer_status,
    transfer_description,
    transfer_notes
  );
$$;

create or replace function public.update_credit_card_transfer(
  target_transfer_id uuid,
  source_account_id uuid,
  destination_credit_card_id uuid,
  amount_minor bigint,
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
  select private.update_credit_card_transfer(
    target_transfer_id,
    source_account_id,
    destination_credit_card_id,
    amount_minor,
    transaction_date,
    transfer_status,
    transfer_description,
    transfer_notes
  );
$$;

revoke all on function public.create_credit_card_transfer(
  uuid, uuid, bigint, date, public.transaction_status, text, text
) from public, anon;
revoke all on function public.update_credit_card_transfer(
  uuid, uuid, uuid, bigint, date, public.transaction_status, text, text
) from public, anon;
grant execute on function public.create_credit_card_transfer(
  uuid, uuid, bigint, date, public.transaction_status, text, text
) to authenticated;
grant execute on function public.update_credit_card_transfer(
  uuid, uuid, uuid, bigint, date, public.transaction_status, text, text
) to authenticated;

create or replace view public.credit_card_summaries
with (security_invoker = true)
as
select
  cards.*,
  greatest(
    coalesce(outstanding.used_amount, 0)
      - coalesce(card_transfers.transferred_amount, 0),
    0
  )::numeric(16, 0) as used_limit,
  (
    cards.credit_limit
      - (
        coalesce(outstanding.used_amount, 0)
          - coalesce(card_transfers.transferred_amount, 0)
      )
  )::numeric(16, 0) as available_limit,
  (
    coalesce(outstanding.used_amount, 0)
      - coalesce(card_transfers.transferred_amount, 0)
  )::numeric(16, 0) as current_balance_minor
from public.credit_cards cards
left join lateral (
  select sum(installments.amount) as used_amount
  from public.credit_card_installments installments
  join public.credit_card_purchases purchases
    on purchases.id = installments.purchase_id
  where installments.credit_card_id = cards.id
    and installments.status in ('pending', 'invoiced')
    and purchases.status = 'active'
) outstanding on true
left join lateral (
  select sum(transfers.amount_minor) as transferred_amount
  from public.transfers
  where transfers.destination_credit_card_id = cards.id
    and transfers.user_id = cards.user_id
    and transfers.is_active
    and transfers.status = 'completed'
) card_transfers on true;

revoke all on table public.credit_card_summaries from anon, authenticated;
grant select on table public.credit_card_summaries to authenticated;

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
  group by transactions.user_id,
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
  group by monthly_consumption.user_id,
    monthly_consumption.reference_month,
    monthly_consumption.currency
),
cash_expense_components as (
  select
    transactions.user_id,
    transactions.transaction_date,
    accounts.currency,
    transactions.amount_minor
  from public.transactions
  join public.accounts
    on accounts.id = transactions.account_id
    and accounts.user_id = transactions.user_id
  where transactions.transaction_type = 'expense'
    and transactions.status = 'completed'
    and transactions.is_active
  union all
  select
    transfers.user_id,
    transfers.transaction_date,
    transfers.currency,
    transfers.amount_minor
  from public.transfers
  where transfers.destination_credit_card_id is not null
    and transfers.status = 'completed'
    and transfers.is_active
),
cash_expense as (
  select
    user_id,
    date_trunc('month', transaction_date)::date as reference_month,
    currency,
    sum(amount_minor)::numeric(20, 0) as expense_amount_minor
  from cash_expense_components
  group by user_id, date_trunc('month', transaction_date)::date, currency
),
monthly_plan as (
  select
    monthly_budgets.user_id,
    monthly_budgets.reference_month,
    monthly_budgets.currency,
    sum(monthly_budgets.planned_amount_minor)::numeric(20, 0)
      as planned_amount_minor
  from public.monthly_budgets
  group by monthly_budgets.user_id,
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
  'cash'::text,
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
with cash_expense_components as (
  select
    transactions.user_id,
    transactions.transaction_date,
    accounts.currency,
    transactions.category_id,
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
  union all
  select
    transfers.user_id,
    transfers.transaction_date,
    transfers.currency,
    null::uuid,
    'Pagamentos de cartões'::text,
    accounts.context,
    transfers.amount_minor
  from public.transfers
  join public.accounts accounts
    on accounts.id = transfers.source_account_id
    and accounts.user_id = transfers.user_id
  where transfers.destination_credit_card_id is not null
    and transfers.status = 'completed'
    and transfers.is_active
)
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
  'cash'::text,
  user_id,
  date_trunc('month', transaction_date)::date,
  currency,
  category_id,
  category_name,
  context,
  sum(amount_minor)::numeric(20, 0)
from cash_expense_components
group by user_id,
  date_trunc('month', transaction_date)::date,
  currency,
  category_id,
  category_name,
  context;

revoke all on table public.financial_dashboard_monthly_basis
from anon, authenticated;
revoke all on table public.financial_dashboard_expense_categories_basis
from anon, authenticated;
grant select on table public.financial_dashboard_monthly_basis
to authenticated;
grant select on table public.financial_dashboard_expense_categories_basis
to authenticated;

comment on column public.transfers.destination_credit_card_id is
'Destino opcional de uma transferência de caixa para cartão, sem vínculo obrigatório com fatura.';
comment on view public.credit_card_summaries is
'Saldo atual deriva das parcelas ativas menos transferências realizadas para o cartão; compras permanecem na competência e transferências no caixa.';
comment on view public.financial_dashboard_monthly_basis is
'Resumo mensal por moeda e regime: competência reconhece consumo; caixa reconhece despesas pagas e transferências efetivas para cartões.';
