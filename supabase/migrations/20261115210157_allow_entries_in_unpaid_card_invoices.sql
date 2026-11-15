-- Closed and overdue invoices may still receive corrections until payment.
-- Keep their existing payment history immutable and synchronize any forecast.
create or replace function private.refresh_unpaid_credit_card_invoice_total(
  target_invoice_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invoice_status public.credit_card_invoice_status;
  new_total numeric;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select invoices.status into invoice_status
  from public.credit_card_invoices invoices
  where invoices.id = target_invoice_id
    and invoices.user_id = current_user_id
    and invoices.status in ('open', 'closed', 'overdue')
  for update;

  if not found then
    raise exception 'invoice_not_editable' using errcode = '23514';
  end if;

  select greatest(coalesce(sum(
    case purchases.entry_kind
      when 'purchase' then installments.amount
      else -installments.amount
    end
  ), 0), 0) into new_total
  from public.credit_card_installments installments
  join public.credit_card_purchases purchases
    on purchases.id = installments.purchase_id
   and purchases.user_id = installments.user_id
  where installments.invoice_id = target_invoice_id
    and installments.user_id = current_user_id
    and installments.status <> 'cancelled'
    and purchases.status = 'active';

  if new_total > 9007199254740991 then
    raise exception 'invalid_installment_amount' using errcode = '23514';
  end if;

  update public.credit_card_invoices invoices
  set total_amount = new_total
  where invoices.id = target_invoice_id
    and invoices.user_id = current_user_id;

  if invoice_status in ('closed', 'overdue') then
    update public.transactions transactions
    set amount_minor = case when new_total > 0 then new_total else transactions.amount_minor end,
        is_active = new_total > 0
    where transactions.user_id = current_user_id
      and transactions.credit_card_invoice_id = target_invoice_id
      and transactions.origin_type = 'credit_card_invoice_payment'
      and transactions.status = 'pending';
  end if;
end;
$$;

revoke all on function private.refresh_unpaid_credit_card_invoice_total(uuid)
from public, anon, authenticated;

create or replace function private.create_credit_card_invoice_entry(
  target_invoice_id uuid,
  target_category_id uuid,
  target_entry_kind public.credit_card_entry_kind,
  target_description text,
  target_amount_minor bigint,
  target_entry_date date,
  target_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invoice_record public.credit_card_invoices%rowtype;
  new_purchase_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_installment_amount' using errcode = '23514';
  end if;
  if target_entry_kind not in ('purchase', 'refund', 'cashback') then
    raise exception 'invalid_credit_card_entry_kind' using errcode = '23514';
  end if;

  select invoices.* into invoice_record
  from public.credit_card_invoices invoices
  join public.credit_cards cards
    on cards.id = invoices.credit_card_id
   and cards.user_id = invoices.user_id
   and cards.is_active
  where invoices.id = target_invoice_id
    and invoices.user_id = current_user_id
    and invoices.status in ('open', 'closed', 'overdue')
  for update of invoices;

  if not found then
    raise exception 'invoice_not_editable' using errcode = '23514';
  end if;

  if target_entry_kind = 'purchase' then
    if not exists (
      select 1 from public.categories categories
      where categories.id = target_category_id
        and categories.user_id = current_user_id
        and categories.kind = 'expense'
        and categories.archived_at is null
    ) then
      raise exception 'invalid_purchase_category' using errcode = '23503';
    end if;
  elsif target_category_id is not null then
    raise exception 'invalid_credit_card_credit' using errcode = '23514';
  end if;

  insert into public.credit_card_purchases (
    user_id, credit_card_id, category_id, entry_kind, description,
    total_amount, purchase_date, installment_count, is_recurring, notes
  ) values (
    current_user_id, invoice_record.credit_card_id,
    case when target_entry_kind = 'purchase' then target_category_id end,
    target_entry_kind, trim(target_description), target_amount_minor,
    target_entry_date, 1, false, nullif(trim(target_notes), '')
  ) returning id into new_purchase_id;

  insert into public.credit_card_installments (
    user_id, purchase_id, credit_card_id, invoice_id,
    installment_number, installment_count, amount, competence_date, status
  ) values (
    current_user_id, new_purchase_id, invoice_record.credit_card_id,
    invoice_record.id, 1, 1, target_amount_minor, invoice_record.reference_month,
    (case when invoice_record.status = 'open' then 'pending'
      else 'invoiced' end)::public.credit_card_installment_status
  );

  perform private.refresh_unpaid_credit_card_invoice_total(target_invoice_id);
  return new_purchase_id;
end;
$$;

revoke all on function private.create_credit_card_invoice_entry(
  uuid, uuid, public.credit_card_entry_kind, text, bigint, date, text
) from public, anon;
grant execute on function private.create_credit_card_invoice_entry(
  uuid, uuid, public.credit_card_entry_kind, text, bigint, date, text
) to authenticated;

create or replace function private.update_credit_card_installment_amount(
  target_installment_id uuid,
  target_amount_minor bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_purchase_id uuid;
  target_invoice_id uuid;
  new_purchase_total numeric;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_installment_amount' using errcode = '23514';
  end if;

  select installments.purchase_id, installments.invoice_id
  into target_purchase_id, target_invoice_id
  from public.credit_card_installments installments
  join public.credit_card_invoices invoices
    on invoices.id = installments.invoice_id
  join public.credit_card_purchases purchases
    on purchases.id = installments.purchase_id
  where installments.id = target_installment_id
    and installments.user_id = current_user_id
    and invoices.user_id = current_user_id
    and purchases.user_id = current_user_id
    and installments.status in ('pending', 'invoiced')
    and invoices.status in ('open', 'closed', 'overdue')
    and purchases.status = 'active'
  for update of installments, invoices, purchases;

  if not found then
    raise exception 'installment_not_editable' using errcode = 'P0002';
  end if;

  update public.credit_card_installments
  set amount = target_amount_minor
  where id = target_installment_id
    and user_id = current_user_id;

  select sum(amount) into new_purchase_total
  from public.credit_card_installments
  where purchase_id = target_purchase_id
    and user_id = current_user_id
    and status <> 'cancelled';

  if new_purchase_total not between 1 and 9007199254740991 then
    raise exception 'invalid_purchase_values' using errcode = '23514';
  end if;

  update public.credit_card_purchases
  set total_amount = new_purchase_total
  where id = target_purchase_id
    and user_id = current_user_id;

  perform private.refresh_unpaid_credit_card_invoice_total(target_invoice_id);
  return true;
end;
$$;

revoke all on function private.update_credit_card_installment_amount(uuid, bigint)
from public, anon;
grant execute on function private.update_credit_card_installment_amount(uuid, bigint)
to authenticated;
