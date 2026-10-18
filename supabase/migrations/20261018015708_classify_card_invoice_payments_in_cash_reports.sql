-- Invoice settlements are cash outflows, but not unclassified consumption.
-- Keep the existing view columns and grain so saved reports and drilldowns agree.
create or replace view public.financial_report_entries_by_source
with (security_invoker = true) as
with raw_entries as (
  select basis.value as basis, t.user_id,
    date_trunc('month', t.transaction_date)::date as reference_month,
    a.currency, t.transaction_type as section,
    case when t.origin_type::text = 'credit_card_invoice_payment'
      then 'expense:card-payments'
      else coalesce(t.category_id::text, t.transaction_type::text || ':uncategorized') end as row_id,
    case when t.origin_type::text = 'credit_card_invoice_payment'
      then null::uuid else t.category_id end as category_id,
    case when t.origin_type::text = 'credit_card_invoice_payment'
      then 'Pagamentos de cartões'::text end as special_group_name,
    case when t.origin_type::text = 'credit_card_invoice_payment'
      then 'Pagamentos de cartões'::text end as special_row_name,
    coalesce(c.context, a.context) as context,
    'account:' || a.id::text as source_key,
    t.amount_minor::numeric(20, 0) as amount_minor
  from public.transactions t
  join public.accounts a on a.id = t.account_id and a.user_id = t.user_id
  left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  cross join (values ('competence'::text), ('cash'::text)) as basis(value)
  where t.status = 'completed' and t.is_active
    and t.origin_type::text <> 'investment'
    and (basis.value = 'cash' or t.origin_type::text <> 'credit_card_invoice_payment')
  union all
  select basis.value, t.user_id, date_trunc('month', t.transaction_date)::date,
    a.currency, 'income'::public.transaction_kind,
    'investment-income:' || coalesce(f.income_type::text, 'other'),
    null::uuid, 'Rendimentos de investimentos'::text,
    case coalesce(f.income_type::text, 'other')
      when 'interest_on_capital' then 'Juros sobre capital'
      when 'dividend' then 'Dividendos'
      when 'bonus' then 'Bonificações em dinheiro'
      else 'Outros rendimentos' end,
    a.context, 'account:' || a.id::text, t.amount_minor::numeric(20, 0)
  from public.investment_cash_flows f
  join public.transactions t on t.id = f.transaction_id and t.user_id = f.user_id
  join public.accounts a on a.id = t.account_id and a.user_id = t.user_id
  cross join (values ('competence'::text), ('cash'::text)) as basis(value)
  where f.cash_flow_type = 'income' and t.transaction_type = 'income'
    and t.status = 'completed' and t.is_active
  union all
  select 'competence'::text, i.user_id, i.competence_date, card.currency,
    case when p.entry_kind = 'purchase' then 'expense'::public.transaction_kind
      else 'income'::public.transaction_kind end,
    case when p.entry_kind = 'purchase'
      then coalesce(p.category_id::text, 'expense:uncategorized')
      else 'card-credit:' || p.entry_kind::text end,
    p.category_id,
    case when p.entry_kind = 'purchase' then null else 'Créditos de cartão' end,
    case p.entry_kind when 'refund' then 'Estornos' when 'cashback' then 'Cashback' else null end,
    coalesce(c.context, a.context, 'personal'::public.financial_context),
    'card:' || card.id::text, i.amount::numeric(20, 0)
  from public.credit_card_installments i
  join public.credit_card_purchases p on p.id = i.purchase_id and p.user_id = i.user_id
  join public.credit_cards card on card.id = i.credit_card_id and card.user_id = i.user_id
  left join public.categories c on c.id = p.category_id and c.user_id = i.user_id
  left join public.accounts a on a.id = card.linked_account_id and a.user_id = card.user_id
  where p.status = 'active' and i.status <> 'cancelled'
  union all
  select 'cash'::text, tr.user_id, date_trunc('month', tr.transaction_date)::date,
    tr.currency, 'expense'::public.transaction_kind, 'expense:card-payments',
    null::uuid, 'Pagamentos de cartões'::text, 'Pagamentos de cartões'::text,
    a.context, 'account:' || a.id::text, tr.amount_minor::numeric(20, 0)
  from public.transfers tr
  join public.accounts a on a.id = tr.source_account_id and a.user_id = tr.user_id
  where tr.destination_credit_card_id is not null and tr.status = 'completed' and tr.is_active
), classified as (
  select e.*,
    coalesce(e.special_group_name, g.name,
      case when e.section = 'income' then 'Outras receitas' else 'Outras despesas' end) as group_name,
    coalesce(e.special_row_name,
      case when parent.id is not null then parent.name || ' › ' || c.name else c.name end,
      'Sem categoria') as row_name
  from raw_entries e
  left join public.categories c on c.id = e.category_id and c.user_id = e.user_id
  left join public.categories parent on parent.id = c.parent_id and parent.user_id = c.user_id
  left join public.category_groups g on g.id = c.group_id and g.user_id = c.user_id
)
select basis, user_id, reference_month, currency, section, row_id, category_id,
  group_name, row_name, context, source_key,
  sum(amount_minor)::numeric(20, 0) as amount_minor
from classified
group by basis, user_id, reference_month, currency, section, row_id,
  category_id, group_name, row_name, context, source_key;

create or replace view public.financial_report_entry_details
with (security_invoker = true) as
select basis.value as basis, t.user_id,
  date_trunc('month', t.transaction_date)::date as reference_month,
  t.transaction_date as entry_date, a.currency, t.transaction_type as section,
  case when t.origin_type::text = 'credit_card_invoice_payment'
    then 'expense:card-payments'
    else coalesce(t.category_id::text, t.transaction_type::text || ':uncategorized') end as row_id,
  case when t.origin_type::text = 'credit_card_invoice_payment'
    then null::uuid else t.category_id end as category_id,
  coalesce(c.context, a.context) as context,
  'account:' || a.id::text as source_key,
  'transaction'::text as entry_kind, t.id as entry_id,
  t.description, t.amount_minor::numeric(20,0) as amount_minor
from public.transactions t
join public.accounts a on a.id = t.account_id and a.user_id = t.user_id
left join public.categories c on c.id = t.category_id and c.user_id = t.user_id
cross join (values ('competence'::text), ('cash'::text)) as basis(value)
where t.status = 'completed' and t.is_active and t.origin_type::text <> 'investment'
  and (basis.value = 'cash' or t.origin_type::text <> 'credit_card_invoice_payment')
union all
select basis.value, t.user_id, date_trunc('month', t.transaction_date)::date,
  t.transaction_date, a.currency, 'income'::public.transaction_kind,
  'investment-income:' || coalesce(f.income_type::text, 'other'),
  null::uuid, a.context, 'account:' || a.id::text,
  'investment_income'::text, t.id, t.description, t.amount_minor::numeric(20,0)
from public.investment_cash_flows f
join public.transactions t on t.id = f.transaction_id and t.user_id = f.user_id
join public.accounts a on a.id = t.account_id and a.user_id = t.user_id
cross join (values ('competence'::text), ('cash'::text)) as basis(value)
where f.cash_flow_type = 'income' and t.transaction_type = 'income'
  and t.status = 'completed' and t.is_active
union all
select 'competence'::text, i.user_id, i.competence_date,
  p.purchase_date, card.currency,
  case when p.entry_kind = 'purchase' then 'expense'::public.transaction_kind
    else 'income'::public.transaction_kind end,
  case when p.entry_kind = 'purchase'
    then coalesce(p.category_id::text, 'expense:uncategorized')
    else 'card-credit:' || p.entry_kind::text end,
  p.category_id, coalesce(c.context, a.context, 'personal'::public.financial_context),
  'card:' || card.id::text, 'card_installment'::text, i.id,
  p.description, i.amount::numeric(20,0)
from public.credit_card_installments i
join public.credit_card_purchases p on p.id = i.purchase_id and p.user_id = i.user_id
join public.credit_cards card on card.id = i.credit_card_id and card.user_id = i.user_id
left join public.categories c on c.id = p.category_id and c.user_id = i.user_id
left join public.accounts a on a.id = card.linked_account_id and a.user_id = card.user_id
where p.status = 'active' and i.status <> 'cancelled'
union all
select 'cash'::text, tr.user_id, date_trunc('month', tr.transaction_date)::date,
  tr.transaction_date, tr.currency, 'expense'::public.transaction_kind,
  'expense:card-payments'::text, null::uuid, a.context,
  'account:' || a.id::text, 'card_payment'::text, tr.id,
  'Pagamento de cartão'::text, tr.amount_minor::numeric(20,0)
from public.transfers tr
join public.accounts a on a.id = tr.source_account_id and a.user_id = tr.user_id
where tr.destination_credit_card_id is not null and tr.status = 'completed' and tr.is_active;

revoke all on public.financial_report_entries_by_source from public, anon;
grant select on public.financial_report_entries_by_source to authenticated;
revoke all on public.financial_report_entry_details from public, anon;
grant select on public.financial_report_entry_details to authenticated;
