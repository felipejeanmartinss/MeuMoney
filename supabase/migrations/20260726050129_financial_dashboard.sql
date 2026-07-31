-- Sprint 7: bounded, read-only aggregates for the financial dashboard.
-- Every view uses the caller's permissions so the RLS policies of the
-- underlying tables remain the authorization boundary.

create or replace view public.financial_dashboard_monthly_summary
with (security_invoker = true)
as
with monthly_income as (
  select
    transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date
      as reference_month,
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
monthly_expense as (
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
dimensions as (
  select user_id, reference_month, currency from monthly_income
  union
  select user_id, reference_month, currency from monthly_expense
  union
  select user_id, reference_month, currency from monthly_plan
)
select
  dimensions.user_id,
  dimensions.reference_month,
  dimensions.currency,
  coalesce(monthly_income.income_amount_minor, 0)::numeric(20, 0)
    as income_amount_minor,
  coalesce(monthly_expense.expense_amount_minor, 0)::numeric(20, 0)
    as expense_amount_minor,
  (
    coalesce(monthly_income.income_amount_minor, 0)
    - coalesce(monthly_expense.expense_amount_minor, 0)
  )::numeric(20, 0) as result_amount_minor,
  coalesce(monthly_plan.planned_amount_minor, 0)::numeric(20, 0)
    as planned_amount_minor,
  case
    when coalesce(monthly_plan.planned_amount_minor, 0) = 0 then null
    else round(
      coalesce(monthly_expense.expense_amount_minor, 0)
      * 100.0
      / monthly_plan.planned_amount_minor,
      2
    )
  end as budget_percentage_consumed
from dimensions
left join monthly_income
  on monthly_income.user_id = dimensions.user_id
  and monthly_income.reference_month = dimensions.reference_month
  and monthly_income.currency = dimensions.currency
left join monthly_expense
  on monthly_expense.user_id = dimensions.user_id
  and monthly_expense.reference_month = dimensions.reference_month
  and monthly_expense.currency = dimensions.currency
left join monthly_plan
  on monthly_plan.user_id = dimensions.user_id
  and monthly_plan.reference_month = dimensions.reference_month
  and monthly_plan.currency = dimensions.currency;

create or replace view public.financial_dashboard_expense_categories
with (security_invoker = true)
as
select
  monthly_consumption.user_id,
  monthly_consumption.reference_month,
  monthly_consumption.currency,
  monthly_consumption.category_id,
  categories.name as category_name,
  monthly_consumption.context,
  monthly_consumption.realized_amount_minor::numeric(20, 0)
    as expense_amount_minor
from public.monthly_consumption
join public.categories
  on categories.id = monthly_consumption.category_id
  and categories.user_id = monthly_consumption.user_id;

create or replace view public.financial_dashboard_upcoming_recurrences
with (security_invoker = true)
as
select
  recurring_transactions.id,
  recurring_transactions.user_id,
  accounts.currency,
  accounts.name as account_name,
  categories.name as category_name,
  categories.context,
  recurring_transactions.transaction_type,
  recurring_transactions.description,
  recurring_transactions.amount_minor,
  recurring_transactions.frequency,
  recurring_transactions.next_occurrence
from public.recurring_transactions
join public.accounts
  on accounts.id = recurring_transactions.account_id
  and accounts.user_id = recurring_transactions.user_id
join public.categories
  on categories.id = recurring_transactions.category_id
  and categories.user_id = recurring_transactions.user_id
where recurring_transactions.is_active
  and recurring_transactions.ended_at is null;

create or replace view public.financial_dashboard_invoices
with (security_invoker = true)
as
select
  invoices.id,
  invoices.user_id,
  invoices.credit_card_id,
  cards.name as credit_card_name,
  cards.currency,
  invoices.reference_month,
  invoices.due_date,
  invoices.status,
  case
    when invoices.status in ('open', 'closed')
      and invoices.due_date < current_date
      then 'overdue'::public.credit_card_invoice_status
    else invoices.status
  end as effective_status,
  invoices.total_amount::numeric(20, 0) as total_amount_minor,
  (invoices.total_amount - invoices.paid_amount)::numeric(20, 0)
    as outstanding_amount_minor
from public.credit_card_invoices invoices
join public.credit_cards cards
  on cards.id = invoices.credit_card_id
  and cards.user_id = invoices.user_id
where invoices.status <> 'paid';

create index if not exists transactions_dashboard_income_idx
on public.transactions (user_id, transaction_date, account_id)
where is_active
  and status = 'completed'
  and transaction_type = 'income';

create index if not exists credit_card_invoices_dashboard_due_idx
on public.credit_card_invoices (user_id, due_date, credit_card_id)
where status <> 'paid';

revoke all on table public.financial_dashboard_monthly_summary
from anon, authenticated;
revoke all on table public.financial_dashboard_expense_categories
from anon, authenticated;
revoke all on table public.financial_dashboard_upcoming_recurrences
from anon, authenticated;
revoke all on table public.financial_dashboard_invoices
from anon, authenticated;

grant select on table public.financial_dashboard_monthly_summary
to authenticated;
grant select on table public.financial_dashboard_expense_categories
to authenticated;
grant select on table public.financial_dashboard_upcoming_recurrences
to authenticated;
grant select on table public.financial_dashboard_invoices
to authenticated;

comment on view public.financial_dashboard_monthly_summary is
'Resumo mensal por usuário e moeda. Receitas realizadas menos despesas de consumo; transferências e pagamentos técnicos de fatura não compõem o consumo.';
comment on view public.financial_dashboard_expense_categories is
'Distribuição mensal das despesas de consumo por categoria e moeda.';
comment on view public.financial_dashboard_upcoming_recurrences is
'Recorrências ativas futuras com conta, categoria, contexto e moeda.';
comment on view public.financial_dashboard_invoices is
'Faturas não pagas, com status vencido derivado da data atual.';
