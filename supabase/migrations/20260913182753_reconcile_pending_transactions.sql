create or replace function private.set_account_entry_reconciled(
  target_entry_type text,
  target_entry_id uuid,
  target_reconciled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if target_entry_type = 'transaction' then
    if target_reconciled then
      -- Changing the status fires the financial-change trigger, which clears
      -- reconciled_at. Keep the promotion and reconciliation as two atomic
      -- statements so the final state is completed and reconciled.
      update public.transactions
      set status = 'completed'
      where id = target_entry_id
        and user_id = current_user_id
        and is_active
        and status = 'pending';

      update public.transactions
      set reconciled_at = now()
      where id = target_entry_id
        and user_id = current_user_id
        and is_active
        and status = 'completed';
    else
      update public.transactions
      set reconciled_at = null
      where id = target_entry_id
        and user_id = current_user_id
        and is_active
        and status = 'completed';
    end if;
  elsif target_entry_type = 'transfer_entry' then
    update public.transfer_entries
    set reconciled_at = case when target_reconciled then now() else null end
    where id = target_entry_id
      and user_id = current_user_id
      and is_active
      and status = 'completed';
  else
    raise exception 'invalid_account_entry_type' using errcode = '22023';
  end if;

  if not found then
    raise exception 'account_entry_not_found' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function private.set_account_entry_reconciled(text, uuid, boolean)
from public, anon, authenticated;
grant execute on function private.set_account_entry_reconciled(text, uuid, boolean)
to authenticated;

comment on function public.set_account_entry_reconciled(text, uuid, boolean) is
  'Reconciles an owned active entry. Reconciling a pending transaction atomically promotes it to completed; pending transfers remain blocked.';

notify pgrst, 'reload schema';
