create view public.financial_report_category_monthly
with (security_invoker = true)
as
with categorized_income as (
  select
    basis.value as basis,
    transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date
      as reference_month,
    accounts.currency,
    'income'::public.transaction_kind as section,
    coalesce(transactions.category_id::text, 'income:uncategorized') as row_id,
    transactions.category_id,
    coalesce(groups.name, 'Outras receitas') as group_name,
    coalesce(
      case
        when parent.id is not null then parent.name || ' › ' || categories.name
        else categories.name
      end,
      'Sem categoria'
    ) as row_name,
    coalesce(categories.context, accounts.context) as context,
    transactions.amount_minor::numeric(20, 0) as amount_minor
  from public.transactions
  join public.accounts
    on accounts.id = transactions.account_id
   and accounts.user_id = transactions.user_id
  cross join (values ('competence'::text), ('cash'::text)) as basis(value)
  left join public.categories
    on categories.id = transactions.category_id
   and categories.user_id = transactions.user_id
  left join public.categories parent
    on parent.id = categories.parent_id
   and parent.user_id = categories.user_id
  left join public.category_groups groups
    on groups.id = categories.group_id
   and groups.user_id = categories.user_id
  where transactions.transaction_type = 'income'
    and transactions.status = 'completed'
    and transactions.is_active
    and transactions.origin_type::text <> 'investment'
),
investment_income as (
  select
    basis.value as basis,
    transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date
      as reference_month,
    accounts.currency,
    'income'::public.transaction_kind as section,
    'investment-income:' || coalesce(flow.income_type::text, 'other') as row_id,
    null::uuid as category_id,
    'Rendimentos de investimentos'::text as group_name,
    case coalesce(flow.income_type::text, 'other')
      when 'interest_on_capital' then 'Juros sobre capital'
      when 'dividend' then 'Dividendos'
      when 'bonus' then 'Bonificações em dinheiro'
      else 'Outros rendimentos'
    end as row_name,
    accounts.context,
    transactions.amount_minor::numeric(20, 0) as amount_minor
  from public.investment_cash_flows flow
  join public.transactions
    on transactions.id = flow.transaction_id
   and transactions.user_id = flow.user_id
  join public.accounts
    on accounts.id = transactions.account_id
   and accounts.user_id = transactions.user_id
  cross join (values ('competence'::text), ('cash'::text)) as basis(value)
  where flow.cash_flow_type = 'income'
    and transactions.transaction_type = 'income'
    and transactions.status = 'completed'
    and transactions.is_active
    and transactions.origin_type::text = 'investment'
),
categorized_expense as (
  select
    expense.basis,
    expense.user_id,
    expense.reference_month,
    expense.currency,
    'expense'::public.transaction_kind as section,
    coalesce(expense.category_id::text, 'expense:card-payments') as row_id,
    expense.category_id,
    coalesce(groups.name, 'Pagamentos de cartões') as group_name,
    coalesce(
      case
        when parent.id is not null then parent.name || ' › ' || categories.name
        else categories.name
      end,
      expense.category_name
    ) as row_name,
    expense.context,
    expense.expense_amount_minor::numeric(20, 0) as amount_minor
  from public.financial_dashboard_expense_categories_basis expense
  left join public.categories
    on categories.id = expense.category_id
   and categories.user_id = expense.user_id
  left join public.categories parent
    on parent.id = categories.parent_id
   and parent.user_id = categories.user_id
  left join public.category_groups groups
    on groups.id = categories.group_id
   and groups.user_id = categories.user_id
),
report_rows as (
  select * from categorized_income
  union all
  select * from investment_income
  union all
  select * from categorized_expense
)
select
  basis,
  user_id,
  reference_month,
  currency,
  section,
  row_id,
  category_id,
  group_name,
  row_name,
  context,
  sum(amount_minor)::numeric(20, 0) as amount_minor
from report_rows
group by
  basis,
  user_id,
  reference_month,
  currency,
  section,
  row_id,
  category_id,
  group_name,
  row_name,
  context;

revoke all on table public.financial_report_category_monthly
from anon, authenticated;
grant select on table public.financial_report_category_monthly to authenticated;

comment on view public.financial_report_category_monthly is
'Owner-isolated monthly income and expense matrix source with competence and cash bases, category hierarchy, identified investment income and no investment-capital duplication.';
