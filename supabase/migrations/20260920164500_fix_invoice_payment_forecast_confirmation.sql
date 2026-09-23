-- Avoid a PL/pgSQL variable/column ambiguity while confirming a forecast.
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
  resolved_transaction_id uuid;
begin
  select invoices.*
  into invoice_record
  from public.credit_card_invoices invoices
  where invoices.id = target_invoice_id
    and invoices.user_id = current_user_id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;
  if invoice_record.status not in ('closed', 'overdue')
    or invoice_record.total_amount <= 0 then
    raise exception 'invoice_not_payable' using errcode = '23514';
  end if;

  select cards.name, cards.currency
  into card_name, card_currency
  from public.credit_cards cards
  where cards.id = invoice_record.credit_card_id
    and cards.user_id = current_user_id;

  if not exists (
    select 1
    from public.accounts accounts
    where accounts.id = target_account_id
      and accounts.user_id = current_user_id
      and accounts.archived_at is null
      and accounts.currency = card_currency
  ) then
    raise exception 'invalid_payment_account' using errcode = '23503';
  end if;

  select transactions.id
  into resolved_transaction_id
  from public.transactions transactions
  where transactions.user_id = current_user_id
    and transactions.credit_card_invoice_id = target_invoice_id
    and transactions.origin_type = 'credit_card_invoice_payment'
    and transactions.is_active
  for update;

  if resolved_transaction_id is null then
    insert into public.transactions (
      user_id, account_id, category_id, transaction_type, description,
      amount_minor, transaction_date, status, notes, is_active,
      origin_type, origin_id, credit_card_invoice_id
    ) values (
      current_user_id, target_account_id, null, 'expense',
      'Transferência para cartão · ' || card_name,
      invoice_record.total_amount, target_payment_date, 'completed',
      'Pagamento de fatura: saída de caixa sem novo consumo por competência.',
      true, 'credit_card_invoice_payment', target_invoice_id, target_invoice_id
    ) returning id into resolved_transaction_id;
  else
    update public.transactions transactions
    set account_id = target_account_id,
        description = 'Transferência para cartão · ' || card_name,
        amount_minor = invoice_record.total_amount,
        transaction_date = target_payment_date,
        status = 'completed',
        notes = 'Pagamento de fatura: saída de caixa sem novo consumo por competência.'
    where transactions.id = resolved_transaction_id
      and transactions.user_id = current_user_id;
  end if;

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
    resolved_transaction_id,
    invoice_record.total_amount,
    target_payment_date
  );

  update public.credit_card_installments installments
  set status = 'paid'
  where installments.invoice_id = target_invoice_id
    and installments.status = 'invoiced';

  update public.credit_card_invoices invoices
  set status = 'paid',
      paid_amount = total_amount,
      paid_at = now(),
      payment_account_id = target_account_id,
      payment_transaction_id = resolved_transaction_id
  where invoices.id = target_invoice_id;

  update public.credit_card_installments installments
  set status = 'paid'
  where installments.user_id = current_user_id
    and installments.invoice_id in (
      select older.id
      from public.credit_card_invoices older
      where older.user_id = current_user_id
        and older.credit_card_id = invoice_record.credit_card_id
        and older.reference_month < invoice_record.reference_month
        and older.total_amount = 0
        and older.status in ('open', 'closed', 'overdue')
    )
    and installments.status in ('pending', 'invoiced');

  update public.credit_card_invoices older
  set status = 'paid',
      closed_at = coalesce(older.closed_at, now()),
      paid_amount = 0,
      paid_at = coalesce(older.paid_at, now()),
      payment_account_id = null,
      payment_transaction_id = null
  where older.user_id = current_user_id
    and older.credit_card_id = invoice_record.credit_card_id
    and older.reference_month < invoice_record.reference_month
    and older.total_amount = 0
    and older.status in ('open', 'closed', 'overdue');

  return resolved_transaction_id;
end;
$$;

notify pgrst, 'reload schema';
