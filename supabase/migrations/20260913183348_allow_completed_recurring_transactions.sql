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
    and status in ('pending', 'completed')
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

comment on constraint transactions_origin_consistency on public.transactions is
  'Preserves each origin shape while allowing an owned recurring forecast to become completed when reconciled.';

notify pgrst, 'reload schema';
