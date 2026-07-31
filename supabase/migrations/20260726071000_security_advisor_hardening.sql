-- Keep PostgREST-facing RPC names stable while moving privileged implementations
-- out of the exposed public schema. Public functions are SECURITY INVOKER facades.

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.create_transfer(
  uuid, uuid, bigint, date, public.transaction_status, text, text
) set schema private;
alter function public.update_transfer(
  uuid, uuid, uuid, bigint, date, public.transaction_status, text, text
) set schema private;
alter function public.set_transfer_active(uuid, boolean) set schema private;

alter function public.create_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) set schema private;
alter function public.update_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) set schema private;
alter function public.cancel_credit_card_purchase(uuid) set schema private;
alter function public.close_credit_card_invoice(uuid) set schema private;
alter function public.pay_credit_card_invoice(uuid, uuid, date) set schema private;
alter function public.reverse_credit_card_invoice_payment(uuid) set schema private;

alter function public.set_recurring_transaction_state(uuid, text) set schema private;
alter function public.generate_recurring_transactions(date) set schema private;
alter function public.copy_previous_month_budgets(
  date, public.financial_context, character
) set schema private;

revoke all on all functions in schema private from public, anon, authenticated;

grant execute on function private.create_transfer(
  uuid, uuid, bigint, date, public.transaction_status, text, text
) to authenticated;
grant execute on function private.update_transfer(
  uuid, uuid, uuid, bigint, date, public.transaction_status, text, text
) to authenticated;
grant execute on function private.set_transfer_active(uuid, boolean)
to authenticated;

grant execute on function private.create_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) to authenticated;
grant execute on function private.update_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) to authenticated;
grant execute on function private.cancel_credit_card_purchase(uuid)
to authenticated;
grant execute on function private.close_credit_card_invoice(uuid)
to authenticated;
grant execute on function private.pay_credit_card_invoice(uuid, uuid, date)
to authenticated;
grant execute on function private.reverse_credit_card_invoice_payment(uuid)
to authenticated;

grant execute on function private.set_recurring_transaction_state(uuid, text)
to authenticated;
grant execute on function private.generate_recurring_transactions(date)
to authenticated;
grant execute on function private.copy_previous_month_budgets(
  date, public.financial_context, character
) to authenticated;

create or replace function public.create_transfer(
  source_account_id uuid,
  destination_account_id uuid,
  amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text default null,
  transfer_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_transfer(
    source_account_id,
    destination_account_id,
    amount_minor,
    transaction_date,
    transfer_status,
    transfer_description,
    transfer_notes
  );
$$;

create or replace function public.update_transfer(
  target_transfer_id uuid,
  source_account_id uuid,
  destination_account_id uuid,
  amount_minor bigint,
  transaction_date date,
  transfer_status public.transaction_status,
  transfer_description text default null,
  transfer_notes text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_transfer(
    target_transfer_id,
    source_account_id,
    destination_account_id,
    amount_minor,
    transaction_date,
    transfer_status,
    transfer_description,
    transfer_notes
  );
$$;

create or replace function public.set_transfer_active(
  target_transfer_id uuid,
  active boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_transfer_active(target_transfer_id, active);
$$;

create or replace function public.create_credit_card_purchase(
  target_credit_card_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  purchase_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_credit_card_purchase(
    target_credit_card_id,
    target_category_id,
    purchase_description,
    purchase_total_amount,
    target_purchase_date,
    target_installment_count,
    purchase_notes
  );
$$;

create or replace function public.update_credit_card_purchase(
  target_purchase_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  purchase_notes text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_credit_card_purchase(
    target_purchase_id,
    target_category_id,
    purchase_description,
    purchase_total_amount,
    target_purchase_date,
    target_installment_count,
    purchase_notes
  );
$$;

create or replace function public.cancel_credit_card_purchase(
  target_purchase_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_credit_card_purchase(target_purchase_id);
$$;

create or replace function public.close_credit_card_invoice(
  target_invoice_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.close_credit_card_invoice(target_invoice_id);
$$;

create or replace function public.pay_credit_card_invoice(
  target_invoice_id uuid,
  target_account_id uuid,
  target_payment_date date
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.pay_credit_card_invoice(
    target_invoice_id,
    target_account_id,
    target_payment_date
  );
$$;

create or replace function public.reverse_credit_card_invoice_payment(
  target_invoice_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.reverse_credit_card_invoice_payment(target_invoice_id);
$$;

create or replace function public.set_recurring_transaction_state(
  target_recurring_id uuid,
  target_state text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_recurring_transaction_state(
    target_recurring_id,
    target_state
  );
$$;

create or replace function public.generate_recurring_transactions(
  target_until date
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.generate_recurring_transactions(target_until);
$$;

create or replace function public.copy_previous_month_budgets(
  target_reference_month date,
  target_context public.financial_context,
  target_currency char(3)
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.copy_previous_month_budgets(
    target_reference_month,
    target_context,
    target_currency
  );
$$;

revoke all on function public.create_transfer(
  uuid, uuid, bigint, date, public.transaction_status, text, text
) from public, anon;
revoke all on function public.update_transfer(
  uuid, uuid, uuid, bigint, date, public.transaction_status, text, text
) from public, anon;
revoke all on function public.set_transfer_active(uuid, boolean)
from public, anon;
revoke all on function public.create_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) from public, anon;
revoke all on function public.update_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) from public, anon;
revoke all on function public.cancel_credit_card_purchase(uuid)
from public, anon;
revoke all on function public.close_credit_card_invoice(uuid)
from public, anon;
revoke all on function public.pay_credit_card_invoice(uuid, uuid, date)
from public, anon;
revoke all on function public.reverse_credit_card_invoice_payment(uuid)
from public, anon;
revoke all on function public.set_recurring_transaction_state(uuid, text)
from public, anon;
revoke all on function public.generate_recurring_transactions(date)
from public, anon;
revoke all on function public.copy_previous_month_budgets(
  date, public.financial_context, character
) from public, anon;

grant execute on function public.create_transfer(
  uuid, uuid, bigint, date, public.transaction_status, text, text
) to authenticated;
grant execute on function public.update_transfer(
  uuid, uuid, uuid, bigint, date, public.transaction_status, text, text
) to authenticated;
grant execute on function public.set_transfer_active(uuid, boolean)
to authenticated;
grant execute on function public.create_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) to authenticated;
grant execute on function public.update_credit_card_purchase(
  uuid, uuid, text, numeric, date, integer, text
) to authenticated;
grant execute on function public.cancel_credit_card_purchase(uuid)
to authenticated;
grant execute on function public.close_credit_card_invoice(uuid)
to authenticated;
grant execute on function public.pay_credit_card_invoice(uuid, uuid, date)
to authenticated;
grant execute on function public.reverse_credit_card_invoice_payment(uuid)
to authenticated;
grant execute on function public.set_recurring_transaction_state(uuid, text)
to authenticated;
grant execute on function public.generate_recurring_transactions(date)
to authenticated;
grant execute on function public.copy_previous_month_budgets(
  date, public.financial_context, character
) to authenticated;

comment on schema private is
  'Internal implementations. The public Data API exposes only SECURITY INVOKER facades.';
