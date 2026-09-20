-- Card invoice normalization, payment forecasts and reviewable recurrences.
-- The local Supabase CLI is not installed in this workspace; this timestamped
-- migration is the fallback after the required CLI creation attempt failed.

alter table public.recurring_transactions
add column is_amount_fixed boolean not null default true;

grant insert (is_amount_fixed)
on public.recurring_transactions to authenticated;

grant update (is_amount_fixed)
on public.recurring_transactions to authenticated;

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
    and status in ('pending', 'completed')
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
  'Preserves origin shapes and permits pending invoice-payment forecasts until they are confirmed.';

create or replace function private.close_credit_card_invoice(
  target_invoice_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invoice_record public.credit_card_invoices%rowtype;
  card_name text;
  card_currency char(3);
  preferred_account_id uuid;
  forecast_transaction_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select invoices.*
  into invoice_record
  from public.credit_card_invoices invoices
  where invoices.id = target_invoice_id
    and invoices.user_id = current_user_id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;
  if invoice_record.status = 'paid' then
    return true;
  end if;

  if invoice_record.status = 'open' then
    perform public.refresh_credit_card_invoice_total(target_invoice_id);

    select invoices.*
    into invoice_record
    from public.credit_card_invoices invoices
    where invoices.id = target_invoice_id
      and invoices.user_id = current_user_id
    for update;
  end if;

  select cards.name, cards.currency, cards.linked_account_id
  into card_name, card_currency, preferred_account_id
  from public.credit_cards cards
  where cards.id = invoice_record.credit_card_id
    and cards.user_id = current_user_id;

  if invoice_record.total_amount = 0 then
    update public.credit_card_installments installments
    set status = 'paid'
    where installments.invoice_id = target_invoice_id
      and installments.user_id = current_user_id
      and installments.status in ('pending', 'invoiced');

    update public.credit_card_invoices invoices
    set status = 'paid',
        closed_at = coalesce(invoices.closed_at, now()),
        paid_amount = 0,
        paid_at = coalesce(invoices.paid_at, now()),
        payment_account_id = null,
        payment_transaction_id = null
    where invoices.id = target_invoice_id
      and invoices.user_id = current_user_id;

    return true;
  end if;

  update public.credit_card_installments installments
  set status = 'invoiced'
  where installments.invoice_id = target_invoice_id
    and installments.user_id = current_user_id
    and installments.status = 'pending';

  update public.credit_card_invoices invoices
  set status = 'closed',
      closed_at = coalesce(invoices.closed_at, now())
  where invoices.id = target_invoice_id
    and invoices.user_id = current_user_id;

  if preferred_account_id is not null and exists (
    select 1
    from public.accounts accounts
    where accounts.id = preferred_account_id
      and accounts.user_id = current_user_id
      and accounts.archived_at is null
      and accounts.currency = card_currency
  ) then
    select transactions.id
    into forecast_transaction_id
    from public.transactions transactions
    where transactions.user_id = current_user_id
      and transactions.credit_card_invoice_id = target_invoice_id
      and transactions.origin_type = 'credit_card_invoice_payment'
      and transactions.is_active
    for update;

    if forecast_transaction_id is null then
      insert into public.transactions (
        user_id,
        account_id,
        category_id,
        transaction_type,
        description,
        amount_minor,
        transaction_date,
        status,
        notes,
        is_active,
        origin_type,
        origin_id,
        credit_card_invoice_id
      ) values (
        current_user_id,
        preferred_account_id,
        null,
        'expense',
        'Previsão de pagamento de fatura · ' || card_name,
        invoice_record.total_amount,
        invoice_record.due_date,
        'pending',
        'Previsão gerada no fechamento da fatura; será confirmada no pagamento.',
        true,
        'credit_card_invoice_payment',
        target_invoice_id,
        target_invoice_id
      );
    else
      update public.transactions transactions
      set account_id = preferred_account_id,
          description = 'Previsão de pagamento de fatura · ' || card_name,
          amount_minor = invoice_record.total_amount,
          transaction_date = invoice_record.due_date,
          status = 'pending',
          notes = 'Previsão gerada no fechamento da fatura; será confirmada no pagamento.'
      where transactions.id = forecast_transaction_id
        and transactions.user_id = current_user_id;
    end if;
  end if;

  return true;
end;
$$;

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

create or replace function public.create_credit_card_invoice_entry(
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

  select invoices.*
  into invoice_record
  from public.credit_card_invoices invoices
  join public.credit_cards cards
    on cards.id = invoices.credit_card_id
   and cards.user_id = invoices.user_id
   and cards.is_active
  where invoices.id = target_invoice_id
    and invoices.user_id = current_user_id
    and invoices.status = 'open'
  for update of invoices;

  if not found then
    raise exception 'invoice_not_open' using errcode = '23514';
  end if;

  if target_entry_kind = 'purchase' then
    if not exists (
      select 1
      from public.categories categories
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
    user_id,
    credit_card_id,
    category_id,
    entry_kind,
    description,
    total_amount,
    purchase_date,
    installment_count,
    is_recurring,
    notes
  ) values (
    current_user_id,
    invoice_record.credit_card_id,
    case when target_entry_kind = 'purchase' then target_category_id end,
    target_entry_kind,
    trim(target_description),
    target_amount_minor,
    target_entry_date,
    1,
    false,
    nullif(trim(target_notes), '')
  ) returning id into new_purchase_id;

  insert into public.credit_card_installments (
    user_id,
    purchase_id,
    credit_card_id,
    invoice_id,
    installment_number,
    installment_count,
    amount,
    competence_date
  ) values (
    current_user_id,
    new_purchase_id,
    invoice_record.credit_card_id,
    invoice_record.id,
    1,
    1,
    target_amount_minor,
    invoice_record.reference_month
  );

  perform public.refresh_credit_card_invoice_total(target_invoice_id);
  return new_purchase_id;
end;
$$;

revoke all on function public.create_credit_card_invoice_entry(
  uuid, uuid, public.credit_card_entry_kind, text, bigint, date, text
) from public, anon;

grant execute on function public.create_credit_card_invoice_entry(
  uuid, uuid, public.credit_card_entry_kind, text, bigint, date, text
) to authenticated;

create or replace function private.generate_recurring_transactions_reviewed(
  target_until date,
  review_overrides jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  review_item jsonb;
  target_recurring_id uuid;
  scheduled_date date;
  reviewed_date date;
  reviewed_amount bigint;
  generated_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(review_overrides, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_recurrence_review' using errcode = '22023';
  end if;

  for review_item in
    select value
    from jsonb_array_elements(coalesce(review_overrides, '[]'::jsonb))
  loop
    begin
      target_recurring_id := (review_item ->> 'recurringId')::uuid;
      scheduled_date := (review_item ->> 'scheduledDate')::date;
      reviewed_date := (review_item ->> 'transactionDate')::date;
      reviewed_amount := (review_item ->> 'amountMinor')::bigint;
    exception when others then
      raise exception 'invalid_recurrence_review' using errcode = '22023';
    end;

    if reviewed_amount <= 0 or reviewed_date is null
      or scheduled_date is null or scheduled_date > target_until then
      raise exception 'invalid_recurrence_review' using errcode = '23514';
    end if;

    perform 1
    from public.recurring_transactions recurrences
    where recurrences.id = target_recurring_id
      and recurrences.user_id = current_user_id
      and recurrences.is_active
      and not recurrences.is_amount_fixed
      and recurrences.next_occurrence = scheduled_date
    for update;

    if not found then
      raise exception 'invalid_recurrence_review' using errcode = '23514';
    end if;
  end loop;

  generated_count := private.generate_recurring_transactions(target_until);

  for review_item in
    select value
    from jsonb_array_elements(coalesce(review_overrides, '[]'::jsonb))
  loop
    target_recurring_id := (review_item ->> 'recurringId')::uuid;
    scheduled_date := (review_item ->> 'scheduledDate')::date;
    reviewed_date := (review_item ->> 'transactionDate')::date;
    reviewed_amount := (review_item ->> 'amountMinor')::bigint;

    update public.transactions transactions
    set transaction_date = reviewed_date,
        amount_minor = reviewed_amount
    where transactions.user_id = current_user_id
      and transactions.recurring_transaction_id = target_recurring_id
      and transactions.transaction_date = scheduled_date
      and transactions.origin_type = 'system'
      and transactions.status = 'pending'
      and transactions.is_active;

    if not found then
      raise exception 'recurrence_review_target_not_found'
        using errcode = 'P0002';
    end if;
  end loop;

  return generated_count;
end;
$$;

create or replace function public.generate_recurring_transactions_reviewed(
  target_until date,
  review_overrides jsonb default '[]'::jsonb
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.generate_recurring_transactions_reviewed(
    target_until,
    review_overrides
  );
$$;

revoke all on function private.generate_recurring_transactions_reviewed(date, jsonb)
from public, anon, authenticated;
grant execute on function private.generate_recurring_transactions_reviewed(date, jsonb)
to authenticated;

revoke all on function public.generate_recurring_transactions_reviewed(date, jsonb)
from public, anon;
grant execute on function public.generate_recurring_transactions_reviewed(date, jsonb)
to authenticated;

-- Existing empty invoices older than a paid invoice are historical closures,
-- not overdue debt. Mark their installments and invoice consistently.
update public.credit_card_installments installments
set status = 'paid'
where installments.invoice_id in (
  select empty_invoice.id
  from public.credit_card_invoices empty_invoice
  where empty_invoice.total_amount = 0
    and empty_invoice.status in ('open', 'closed', 'overdue')
    and exists (
      select 1
      from public.credit_card_invoices paid_invoice
      where paid_invoice.user_id = empty_invoice.user_id
        and paid_invoice.credit_card_id = empty_invoice.credit_card_id
        and paid_invoice.reference_month > empty_invoice.reference_month
        and paid_invoice.status = 'paid'
    )
)
and installments.status in ('pending', 'invoiced');

update public.credit_card_invoices empty_invoice
set status = 'paid',
    closed_at = coalesce(empty_invoice.closed_at, empty_invoice.due_date::timestamp with time zone),
    paid_amount = 0,
    paid_at = coalesce(empty_invoice.paid_at, empty_invoice.due_date::timestamp with time zone),
    payment_account_id = null,
    payment_transaction_id = null
where empty_invoice.total_amount = 0
  and empty_invoice.status in ('open', 'closed', 'overdue')
  and exists (
    select 1
    from public.credit_card_invoices paid_invoice
    where paid_invoice.user_id = empty_invoice.user_id
      and paid_invoice.credit_card_id = empty_invoice.credit_card_id
      and paid_invoice.reference_month > empty_invoice.reference_month
      and paid_invoice.status = 'paid'
  );

-- Remove stale generated forecasts that were explicitly made inactive after a
-- refund or reconciliation. Technical card and investment entries are kept.
delete from public.transactions transactions
where not transactions.is_active
  and transactions.origin_type = 'system';

notify pgrst, 'reload schema';
