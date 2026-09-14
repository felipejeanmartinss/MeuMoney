create or replace function public.update_credit_card_purchase_custom(
  target_purchase_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  target_installment_amounts bigint[],
  purchase_is_recurring boolean default false,
  purchase_notes text default null,
  purchase_entry_kind public.credit_card_entry_kind default 'purchase',
  target_invoice_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  purchase_card_id uuid;
  closed_invoice_ids uuid[];
  overdue_invoice_ids uuid[];
  result boolean;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select purchases.credit_card_id
  into purchase_card_id
  from public.credit_card_purchases purchases
  where purchases.id = target_purchase_id
    and purchases.user_id = current_user_id
    and purchases.status = 'active'
  for update;

  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.credit_card_installments installments
    join public.credit_card_invoices invoices
      on invoices.id = installments.invoice_id
      and invoices.user_id = installments.user_id
    where installments.purchase_id = target_purchase_id
      and installments.user_id = current_user_id
      and (
        installments.status = 'paid'
        or invoices.status = 'paid'
      )
  ) then
    raise exception 'purchase_structure_locked' using errcode = '23514';
  end if;

  perform 1
  from public.credit_card_invoices invoices
  where invoices.user_id = current_user_id
    and invoices.credit_card_id = purchase_card_id
    and invoices.status in ('closed', 'overdue')
    and invoices.payment_transaction_id is null
  for update;

  select
    array_agg(invoices.id) filter (where invoices.status = 'closed'),
    array_agg(invoices.id) filter (where invoices.status = 'overdue')
  into closed_invoice_ids, overdue_invoice_ids
  from public.credit_card_invoices invoices
  where invoices.user_id = current_user_id
    and invoices.credit_card_id = purchase_card_id
    and invoices.status in ('closed', 'overdue')
    and invoices.payment_transaction_id is null;

  update public.credit_card_invoices invoices
  set status = 'open'
  where invoices.user_id = current_user_id
    and invoices.credit_card_id = purchase_card_id
    and invoices.status in ('closed', 'overdue')
    and invoices.payment_transaction_id is null;

  result := private.update_credit_card_purchase_custom(
    target_purchase_id,
    target_category_id,
    purchase_description,
    purchase_total_amount,
    target_purchase_date,
    target_installment_count,
    target_installment_amounts,
    purchase_is_recurring,
    purchase_notes,
    purchase_entry_kind,
    target_invoice_id
  );

  update public.credit_card_invoices invoices
  set status = 'closed'
  where invoices.id = any(coalesce(closed_invoice_ids, array[]::uuid[]))
    and invoices.user_id = current_user_id;

  update public.credit_card_invoices invoices
  set status = 'overdue'
  where invoices.id = any(coalesce(overdue_invoice_ids, array[]::uuid[]))
    and invoices.user_id = current_user_id;

  update public.credit_card_installments installments
  set status = 'invoiced'
  where installments.user_id = current_user_id
    and installments.invoice_id = any(
      coalesce(closed_invoice_ids, array[]::uuid[])
      || coalesce(overdue_invoice_ids, array[]::uuid[])
    )
    and installments.status = 'pending';

  return result;
end;
$$;

revoke all on function public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) from public, anon;
grant execute on function public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) to authenticated;

create table public.saved_financial_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  report_type text not null check (
    report_type in (
      'income-expense',
      'fixed-expenses',
      'period-comparison',
      'asset-performance',
      'asset-performance-general',
      'net-worth-evolution'
    )
  ),
  filters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(filters) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.saved_financial_reports enable row level security;

create policy "saved_financial_reports_select_own"
on public.saved_financial_reports for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "saved_financial_reports_insert_own"
on public.saved_financial_reports for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "saved_financial_reports_update_own"
on public.saved_financial_reports for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "saved_financial_reports_delete_own"
on public.saved_financial_reports for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete
on public.saved_financial_reports to authenticated;

create trigger set_saved_financial_reports_updated_at
before update on public.saved_financial_reports
for each row execute function public.set_updated_at();

create view public.financial_report_entries_by_source
with (security_invoker = true)
as
with raw_entries as (
  select
    basis.value as basis,
    transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date as reference_month,
    accounts.currency,
    transactions.transaction_type as section,
    coalesce(transactions.category_id::text, transactions.transaction_type::text || ':uncategorized') as row_id,
    transactions.category_id,
    null::text as special_group_name,
    null::text as special_row_name,
    coalesce(categories.context, accounts.context) as context,
    'account:' || accounts.id::text as source_key,
    transactions.amount_minor::numeric(20, 0) as amount_minor
  from public.transactions
  join public.accounts
    on accounts.id = transactions.account_id
   and accounts.user_id = transactions.user_id
  left join public.categories
    on categories.id = transactions.category_id
   and categories.user_id = transactions.user_id
  cross join (values ('competence'::text), ('cash'::text)) as basis(value)
  where transactions.status = 'completed'
    and transactions.is_active
    and transactions.origin_type::text <> 'investment'
    and (
      basis.value = 'cash'
      or transactions.origin_type::text <> 'credit_card_invoice_payment'
    )

  union all

  select
    basis.value,
    transactions.user_id,
    date_trunc('month', transactions.transaction_date)::date,
    accounts.currency,
    'income'::public.transaction_kind,
    'investment-income:' || coalesce(flows.income_type::text, 'other'),
    null::uuid,
    'Rendimentos de investimentos'::text,
    case coalesce(flows.income_type::text, 'other')
      when 'interest_on_capital' then 'Juros sobre capital'
      when 'dividend' then 'Dividendos'
      when 'bonus' then 'Bonificações em dinheiro'
      else 'Outros rendimentos'
    end,
    accounts.context,
    'account:' || accounts.id::text,
    transactions.amount_minor::numeric(20, 0)
  from public.investment_cash_flows flows
  join public.transactions
    on transactions.id = flows.transaction_id
   and transactions.user_id = flows.user_id
  join public.accounts
    on accounts.id = transactions.account_id
   and accounts.user_id = transactions.user_id
  cross join (values ('competence'::text), ('cash'::text)) as basis(value)
  where flows.cash_flow_type = 'income'
    and transactions.transaction_type = 'income'
    and transactions.status = 'completed'
    and transactions.is_active

  union all

  select
    'competence'::text,
    installments.user_id,
    installments.competence_date,
    cards.currency,
    case when purchases.entry_kind = 'purchase'
      then 'expense'::public.transaction_kind
      else 'income'::public.transaction_kind
    end,
    case when purchases.entry_kind = 'purchase'
      then coalesce(purchases.category_id::text, 'expense:uncategorized')
      else 'card-credit:' || purchases.entry_kind::text
    end,
    purchases.category_id,
    case when purchases.entry_kind = 'purchase' then null else 'Créditos de cartão' end,
    case purchases.entry_kind
      when 'refund' then 'Estornos'
      when 'cashback' then 'Cashback'
      else null
    end,
    coalesce(categories.context, linked_accounts.context, 'personal'::public.financial_context),
    'card:' || cards.id::text,
    installments.amount::numeric(20, 0)
  from public.credit_card_installments installments
  join public.credit_card_purchases purchases
    on purchases.id = installments.purchase_id
   and purchases.user_id = installments.user_id
  join public.credit_cards cards
    on cards.id = installments.credit_card_id
   and cards.user_id = installments.user_id
  left join public.categories
    on categories.id = purchases.category_id
   and categories.user_id = installments.user_id
  left join public.accounts linked_accounts
    on linked_accounts.id = cards.linked_account_id
   and linked_accounts.user_id = cards.user_id
  where purchases.status = 'active'
    and installments.status <> 'cancelled'

  union all

  select
    'cash'::text,
    transfers.user_id,
    date_trunc('month', transfers.transaction_date)::date,
    transfers.currency,
    'expense'::public.transaction_kind,
    'expense:card-payments',
    null::uuid,
    'Pagamentos de cartões'::text,
    'Pagamentos de cartões'::text,
    accounts.context,
    'account:' || accounts.id::text,
    transfers.amount_minor::numeric(20, 0)
  from public.transfers
  join public.accounts
    on accounts.id = transfers.source_account_id
   and accounts.user_id = transfers.user_id
  where transfers.destination_credit_card_id is not null
    and transfers.status = 'completed'
    and transfers.is_active
), classified as (
  select
    entries.*,
    coalesce(entries.special_group_name, groups.name,
      case when entries.section = 'income' then 'Outras receitas' else 'Outras despesas' end
    ) as group_name,
    coalesce(entries.special_row_name,
      case when parent.id is not null then parent.name || ' › ' || categories.name else categories.name end,
      'Sem categoria'
    ) as row_name
  from raw_entries entries
  left join public.categories
    on categories.id = entries.category_id
   and categories.user_id = entries.user_id
  left join public.categories parent
    on parent.id = categories.parent_id
   and parent.user_id = categories.user_id
  left join public.category_groups groups
    on groups.id = categories.group_id
   and groups.user_id = categories.user_id
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
  source_key,
  sum(amount_minor)::numeric(20, 0) as amount_minor
from classified
group by basis, user_id, reference_month, currency, section, row_id,
  category_id, group_name, row_name, context, source_key;

revoke all on table public.financial_report_entries_by_source
from anon, authenticated;
grant select on table public.financial_report_entries_by_source to authenticated;
