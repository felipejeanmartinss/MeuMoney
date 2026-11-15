-- Materialize a missing monthly invoice only when the owner explicitly opens it.
-- A zero invoice marked paid without any real payment can safely be reopened.
create or replace function private.open_zero_credit_card_invoice(
  target_card_id uuid,
  target_reference_month date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  card_record public.credit_cards%rowtype;
  invoice_record public.credit_card_invoices%rowtype;
  resolved_invoice_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_reference_month is null
    or target_reference_month <> date_trunc('month', target_reference_month)::date
    or target_reference_month < date '2000-01-01'
    or target_reference_month > date_trunc('month', current_date + interval '1 year')::date
  then
    raise exception 'invalid_invoice_month' using errcode = '23514';
  end if;

  select cards.* into card_record
  from public.credit_cards cards
  where cards.id = target_card_id
    and cards.user_id = current_user_id
    and cards.is_active
  for update;

  if not found then
    raise exception 'invalid_credit_card' using errcode = '23503';
  end if;

  resolved_invoice_id := public.ensure_credit_card_invoice(
    current_user_id,
    card_record.id,
    target_reference_month,
    card_record.closing_day,
    card_record.due_day
  );

  select invoices.* into invoice_record
  from public.credit_card_invoices invoices
  where invoices.id = resolved_invoice_id
    and invoices.user_id = current_user_id
    and invoices.credit_card_id = card_record.id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;

  if invoice_record.status = 'open' then
    return resolved_invoice_id;
  end if;

  if invoice_record.total_amount <> 0
    or invoice_record.paid_amount <> 0
    or invoice_record.payment_transaction_id is not null
    or invoice_record.payment_account_id is not null
    or exists (
      select 1 from public.credit_card_payments payments
      where payments.invoice_id = resolved_invoice_id
        and payments.user_id = current_user_id
    )
  then
    raise exception 'invoice_reopen_protected' using errcode = '23514';
  end if;

  update public.credit_card_installments installments
  set status = 'pending'
  where installments.invoice_id = resolved_invoice_id
    and installments.user_id = current_user_id
    and installments.status in ('paid', 'invoiced');

  update public.credit_card_invoices invoices
  set status = 'open',
      closed_at = null,
      paid_at = null,
      paid_amount = 0,
      payment_account_id = null,
      payment_transaction_id = null
  where invoices.id = resolved_invoice_id
    and invoices.user_id = current_user_id;

  return resolved_invoice_id;
end;
$$;

revoke all on function private.open_zero_credit_card_invoice(uuid, date)
from public, anon, authenticated;

create or replace function public.open_zero_credit_card_invoice(
  target_card_id uuid,
  target_reference_month date
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.open_zero_credit_card_invoice(target_card_id, target_reference_month);
$$;

revoke all on function public.open_zero_credit_card_invoice(uuid, date)
from public, anon;
grant execute on function public.open_zero_credit_card_invoice(uuid, date)
to authenticated;

notify pgrst, 'reload schema';
