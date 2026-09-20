-- Keep the mutating implementation outside the exposed API schema and expose
-- only a validated invoker wrapper, matching the other card RPCs.
alter function public.create_credit_card_invoice_entry(
  uuid, uuid, public.credit_card_entry_kind, text, bigint, date, text
) set schema private;

revoke all on function private.create_credit_card_invoice_entry(
  uuid, uuid, public.credit_card_entry_kind, text, bigint, date, text
) from public, anon, authenticated;
grant execute on function private.create_credit_card_invoice_entry(
  uuid, uuid, public.credit_card_entry_kind, text, bigint, date, text
) to authenticated;

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
language sql
security invoker
set search_path = ''
as $$
  select private.create_credit_card_invoice_entry(
    target_invoice_id,
    target_category_id,
    target_entry_kind,
    target_description,
    target_amount_minor,
    target_entry_date,
    target_notes
  );
$$;

revoke all on function public.create_credit_card_invoice_entry(
  uuid, uuid, public.credit_card_entry_kind, text, bigint, date, text
) from public, anon;
grant execute on function public.create_credit_card_invoice_entry(
  uuid, uuid, public.credit_card_entry_kind, text, bigint, date, text
) to authenticated;

notify pgrst, 'reload schema';
