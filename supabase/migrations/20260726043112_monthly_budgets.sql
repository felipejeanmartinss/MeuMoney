create table public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  reference_month date not null
    check (reference_month = date_trunc('month', reference_month)::date),
  currency char(3) not null
    check (currency in ('BRL', 'USD', 'EUR')),
  planned_amount_minor bigint not null default 0
    check (planned_amount_minor between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reference_month, currency, category_id)
);

create index monthly_budgets_category_id_idx
on public.monthly_budgets (category_id);

create index transactions_budget_consumption_idx
on public.transactions (user_id, transaction_date, category_id, account_id)
where is_active
  and status = 'completed'
  and transaction_type = 'expense'
  and category_id is not null
  and origin_type <> 'credit_card_invoice_payment';

create index credit_card_installments_budget_consumption_idx
on public.credit_card_installments (
  user_id,
  competence_date,
  purchase_id,
  credit_card_id
)
where status <> 'cancelled';

create trigger monthly_budgets_set_updated_at
before update on public.monthly_budgets
for each row execute procedure public.set_updated_at();

create or replace function public.validate_monthly_budget()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.user_id <> (select auth.uid()) then
    raise exception 'monthly_budget_user_mismatch' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.categories
    where id = new.category_id
      and user_id = new.user_id
      and kind = 'expense'
      and archived_at is null
  ) then
    raise exception 'invalid_monthly_budget_category' using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger monthly_budgets_validate_financial_data
before insert or update of user_id, category_id
on public.monthly_budgets
for each row execute procedure public.validate_monthly_budget();

alter table public.monthly_budgets enable row level security;

create policy "monthly_budgets_owner_select" on public.monthly_budgets
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "monthly_budgets_owner_insert" on public.monthly_budgets
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "monthly_budgets_owner_update" on public.monthly_budgets
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.monthly_budgets from anon, authenticated;
grant select on table public.monthly_budgets to authenticated;
grant insert (
  user_id,
  category_id,
  reference_month,
  currency,
  planned_amount_minor
) on table public.monthly_budgets to authenticated;
grant update (planned_amount_minor)
on table public.monthly_budgets to authenticated;

create or replace view public.monthly_consumption
with (security_invoker = true)
as
select
  consumption.user_id,
  consumption.category_id,
  consumption.context,
  consumption.currency,
  consumption.reference_month,
  sum(consumption.amount_minor)::numeric(20, 0) as realized_amount_minor
from (
  select
    transactions.user_id,
    transactions.category_id,
    categories.context,
    accounts.currency,
    date_trunc('month', transactions.transaction_date)::date as reference_month,
    transactions.amount_minor::numeric(20, 0) as amount_minor
  from public.transactions
  join public.accounts
    on accounts.id = transactions.account_id
    and accounts.user_id = transactions.user_id
  join public.categories
    on categories.id = transactions.category_id
    and categories.user_id = transactions.user_id
  where transactions.transaction_type = 'expense'
    and transactions.status = 'completed'
    and transactions.is_active
    and transactions.category_id is not null
    and transactions.origin_type <> 'credit_card_invoice_payment'

  union all

  select
    installments.user_id,
    purchases.category_id,
    categories.context,
    cards.currency,
    installments.competence_date as reference_month,
    installments.amount::numeric(20, 0) as amount_minor
  from public.credit_card_installments installments
  join public.credit_card_purchases purchases
    on purchases.id = installments.purchase_id
    and purchases.user_id = installments.user_id
  join public.credit_cards cards
    on cards.id = installments.credit_card_id
    and cards.user_id = installments.user_id
  join public.categories
    on categories.id = purchases.category_id
    and categories.user_id = installments.user_id
  where purchases.status = 'active'
    and installments.status <> 'cancelled'
) consumption
group by
  consumption.user_id,
  consumption.category_id,
  consumption.context,
  consumption.currency,
  consumption.reference_month;

create or replace view public.monthly_budget_progress
with (security_invoker = true)
as
select
  budgets.id as budget_id,
  coalesce(budgets.user_id, consumption.user_id) as user_id,
  coalesce(budgets.category_id, consumption.category_id) as category_id,
  categories.name as category_name,
  categories.context,
  coalesce(budgets.currency, consumption.currency) as currency,
  coalesce(budgets.reference_month, consumption.reference_month) as reference_month,
  coalesce(budgets.planned_amount_minor, 0)::numeric(20, 0)
    as planned_amount_minor,
  coalesce(consumption.realized_amount_minor, 0)::numeric(20, 0)
    as realized_amount_minor,
  (
    coalesce(budgets.planned_amount_minor, 0)
    - coalesce(consumption.realized_amount_minor, 0)
  )::numeric(20, 0) as available_amount_minor,
  case
    when coalesce(budgets.planned_amount_minor, 0) = 0 then null
    else round(
      coalesce(consumption.realized_amount_minor, 0)
      * 100.0
      / budgets.planned_amount_minor,
      2
    )
  end as percentage_consumed
from public.monthly_budgets budgets
full outer join public.monthly_consumption consumption
  on consumption.user_id = budgets.user_id
  and consumption.category_id = budgets.category_id
  and consumption.currency = budgets.currency
  and consumption.reference_month = budgets.reference_month
join public.categories
  on categories.id = coalesce(budgets.category_id, consumption.category_id)
  and categories.user_id = coalesce(budgets.user_id, consumption.user_id);

revoke all on table public.monthly_consumption from anon, authenticated;
revoke all on table public.monthly_budget_progress from anon, authenticated;
grant select on table public.monthly_consumption to authenticated;
grant select on table public.monthly_budget_progress to authenticated;

create or replace function public.copy_previous_month_budgets(
  target_reference_month date,
  target_context public.financial_context,
  target_currency char(3)
)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  copied_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if target_reference_month <> date_trunc('month', target_reference_month)::date then
    raise exception 'invalid_reference_month' using errcode = '22007';
  end if;

  if target_currency not in ('BRL', 'USD', 'EUR') then
    raise exception 'unsupported_currency' using errcode = '23514';
  end if;

  insert into public.monthly_budgets (
    user_id,
    category_id,
    reference_month,
    currency,
    planned_amount_minor
  )
  select
    previous.user_id,
    previous.category_id,
    target_reference_month,
    previous.currency,
    previous.planned_amount_minor
  from public.monthly_budgets previous
  join public.categories
    on categories.id = previous.category_id
    and categories.user_id = previous.user_id
  where previous.user_id = current_user_id
    and previous.reference_month = (target_reference_month - interval '1 month')::date
    and previous.currency = target_currency
    and categories.context = target_context
    and categories.kind = 'expense'
    and categories.archived_at is null
  on conflict (user_id, reference_month, currency, category_id) do nothing;

  get diagnostics copied_count = row_count;
  return copied_count;
end;
$$;

revoke all on function public.validate_monthly_budget()
from public, anon, authenticated;
revoke all on function public.copy_previous_month_budgets(
  date,
  public.financial_context,
  char
) from public, anon;
grant execute on function public.copy_previous_month_budgets(
  date,
  public.financial_context,
  char
) to authenticated;

comment on table public.monthly_budgets is
'Planejamento mensal por categoria de despesa e moeda, armazenado em unidades monetarias inteiras.';
comment on view public.monthly_consumption is
'Consumo realizado por competencia: despesas ativas concluidas e parcelas ativas de cartao; exclui transferencias e pagamentos de fatura.';
comment on view public.monthly_budget_progress is
'Comparacao mensal entre valor planejado, realizado, disponivel e percentual consumido.';
comment on function public.copy_previous_month_budgets(
  date,
  public.financial_context,
  char
) is
'Copia de forma idempotente os orcamentos do mes anterior para o usuario autenticado.';
