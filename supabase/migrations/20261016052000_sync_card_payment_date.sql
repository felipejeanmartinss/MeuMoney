-- A card-payment date belongs to both the account transaction and the
-- invoice's payment record. Keep them synchronized atomically.
create or replace function private.update_automatic_transaction_date(
  target_transaction_id uuid, target_transaction_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  entry_record public.transactions%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_transaction_date is null then
    raise exception 'transaction_date_required' using errcode = '22004';
  end if;
  select * into entry_record from public.transactions
  where id = target_transaction_id and user_id = current_user_id and is_active
    and origin_type in ('system', 'credit_card_invoice_payment')
    and status in ('pending', 'completed') for update;
  if not found then
    raise exception 'automatic_transaction_not_found' using errcode = 'P0002';
  end if;
  update public.transactions set transaction_date = target_transaction_date
  where id = entry_record.id and user_id = current_user_id;
  if entry_record.origin_type = 'credit_card_invoice_payment'
    and entry_record.status = 'completed' then
    update public.credit_card_payments set payment_date = target_transaction_date
    where payment_transaction_id = entry_record.id and user_id = current_user_id;
    if not found then
      raise exception 'invoice_payment_source_not_found' using errcode = 'P0002';
    end if;
  end if;
  return target_transaction_id;
end;
$$;
