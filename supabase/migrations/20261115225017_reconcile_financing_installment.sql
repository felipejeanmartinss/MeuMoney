-- Serialize with full-contract edits, but only change the selected installment.
create function private.reconcile_financing_installment(
  contract_id_in uuid, entry_id_in uuid, transaction_id_in uuid, version_in timestamptz,
  amount_in bigint, date_in date, account_in uuid, accept_difference boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  c public.financing_contracts%rowtype;
  e public.financing_schedule_entries%rowtype;
  t public.transactions%rowtype;
  fgts bigint;
begin
  select * into strict c from public.financing_contracts
    where id = contract_id_in and user_id = owner_id for update;
  if c.updated_at is distinct from version_in then raise exception 'financing_conflict'; end if;
  select * into strict e from public.financing_schedule_entries
    where id = entry_id_in and contract_id = c.id and user_id = owner_id for update;
  if e.linked_transaction_id is not null then raise exception 'already_linked'; end if;
  select tx.* into strict t from public.transactions tx join public.accounts a
    on a.id = tx.account_id and a.user_id = owner_id and a.currency = c.currency
    where tx.id = transaction_id_in and tx.user_id = owner_id and tx.is_active
      and tx.status = 'completed' and tx.transaction_type = 'expense'
      and tx.origin_type in ('manual','system') and tx.credit_card_invoice_id is null
    for share of tx,a;
  if t.amount_minor is distinct from amount_in or t.transaction_date is distinct from date_in
    or t.account_id is distinct from account_in then raise exception 'financing_conflict'; end if;
  select coalesce(max(fgts_amount_minor),0) into fgts from public.financing_amortization_sources
    where contract_id = c.id and installment_number = e.installment_number;
  if (case when e.payment_status = 'paid' then e.paid_amount_minor
        else e.total_amount_minor + e.extra_amortization_minor end) <> t.amount_minor + fgts
    and accept_difference is not true then raise exception 'confirm_difference'; end if;
  update public.financing_schedule_entries set linked_transaction_id = t.id,
    payment_status = 'paid', payment_date = t.transaction_date, paid_amount_minor = t.amount_minor + fgts
    where id = e.id and user_id = owner_id;
  update public.financing_contracts set updated_at = now() where id = c.id and user_id = owner_id;
end;
$$;
revoke all on function private.reconcile_financing_installment(uuid,uuid,uuid,timestamptz,bigint,date,uuid,boolean) from public,anon;
grant execute on function private.reconcile_financing_installment(uuid,uuid,uuid,timestamptz,bigint,date,uuid,boolean) to authenticated;
create function public.reconcile_financing_installment(
  contract_id_in uuid, entry_id_in uuid, transaction_id_in uuid, version_in timestamptz,
  amount_in bigint, date_in date, account_in uuid, accept_difference boolean
) returns void language sql security invoker set search_path = '' as $$
  select private.reconcile_financing_installment($1,$2,$3,$4,$5,$6,$7,$8);
$$;
revoke all on function public.reconcile_financing_installment(uuid,uuid,uuid,timestamptz,bigint,date,uuid,boolean) from public,anon;
grant execute on function public.reconcile_financing_installment(uuid,uuid,uuid,timestamptz,bigint,date,uuid,boolean) to authenticated;
