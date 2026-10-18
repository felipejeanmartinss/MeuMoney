-- Keep the grain of each source entry so consolidated report cells can open
-- their underlying account transaction, card installment or card payment.
create or replace view public.financial_report_entry_details
with (security_invoker = true) as
select basis.value as basis, t.user_id,
  date_trunc('month', t.transaction_date)::date as reference_month,
  t.transaction_date as entry_date, a.currency,
  t.transaction_type as section,
  coalesce(t.category_id::text, t.transaction_type::text || ':uncategorized') as row_id,
  t.category_id, coalesce(c.context, a.context) as context,
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
  'investment_income'::text, t.id, t.description,
  t.amount_minor::numeric(20,0)
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

revoke all on public.financial_report_entry_details from public, anon;
grant select on public.financial_report_entry_details to authenticated;
