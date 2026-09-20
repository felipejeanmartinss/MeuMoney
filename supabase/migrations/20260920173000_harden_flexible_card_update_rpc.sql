-- The flexible date-adjustment wrapper is privileged because it temporarily
-- reopens unpaid invoices. Keep it private and expose only an invoker wrapper.
alter function public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) rename to update_credit_card_purchase_flexible;

alter function public.update_credit_card_purchase_flexible(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) set schema private;

revoke all on function private.update_credit_card_purchase_flexible(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) from public, anon, authenticated;
grant execute on function private.update_credit_card_purchase_flexible(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) to authenticated;

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
language sql
security invoker
set search_path = ''
as $$
  select private.update_credit_card_purchase_flexible(
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
$$;

revoke all on function public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) from public, anon;
grant execute on function public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) to authenticated;

notify pgrst, 'reload schema';
