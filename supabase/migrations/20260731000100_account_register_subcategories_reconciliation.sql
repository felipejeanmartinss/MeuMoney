-- Account register, one-level subcategories and per-entry reconciliation.

alter table public.categories
drop constraint if exists categories_user_id_name_kind_context_key;

create unique index categories_user_hierarchy_name_unique_idx
on public.categories (
  user_id,
  kind,
  context,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

create index categories_user_parent_idx
on public.categories (user_id, parent_id)
where parent_id is not null;

create or replace function private.validate_category_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_category public.categories%rowtype;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'category_cannot_parent_itself' using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.categories child
      where child.parent_id = new.id
        and child.user_id = new.user_id
    ) then
      raise exception 'category_with_children_cannot_be_nested'
        using errcode = '23514';
    end if;

    select *
    into parent_category
    from public.categories
    where id = new.parent_id;

    if not found
      or parent_category.user_id <> new.user_id
      or parent_category.kind <> new.kind
      or parent_category.context <> new.context
      or parent_category.parent_id is not null
      or parent_category.archived_at is not null
    then
      raise exception 'invalid_category_parent' using errcode = '23503';
    end if;
  end if;

  if new.archived_at is not null and exists (
    select 1
    from public.categories child
    where child.parent_id = new.id
      and child.user_id = new.user_id
      and child.archived_at is null
  ) then
    raise exception 'category_has_active_subcategories' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_category_hierarchy()
from public, anon, authenticated;

create trigger categories_validate_hierarchy
before insert or update of user_id, parent_id, kind, context, archived_at
on public.categories
for each row execute procedure private.validate_category_hierarchy();

grant insert (parent_id) on table public.categories to authenticated;
grant update (parent_id) on table public.categories to authenticated;

alter table public.transactions
add column reconciled_at timestamptz;

alter table public.transfer_entries
add column reconciled_at timestamptz;

create or replace function private.clear_account_entry_reconciliation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reconciled_at := null;
  return new;
end;
$$;

revoke all on function private.clear_account_entry_reconciliation()
from public, anon, authenticated;

create trigger transactions_clear_reconciliation_on_financial_change
before update of account_id, transaction_type, amount_minor, transaction_date,
  status, is_active
on public.transactions
for each row execute procedure private.clear_account_entry_reconciliation();

create trigger transfer_entries_clear_reconciliation_on_financial_change
before update of account_id, direction, amount_minor, currency, transaction_date,
  status, is_active
on public.transfer_entries
for each row execute procedure private.clear_account_entry_reconciliation();

create index transactions_unreconciled_account_idx
on public.transactions (user_id, account_id, transaction_date)
where reconciled_at is null and is_active and status = 'completed';

create index transfer_entries_unreconciled_account_idx
on public.transfer_entries (user_id, account_id, transaction_date)
where reconciled_at is null and is_active and status = 'completed';

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
    update public.transactions
    set reconciled_at = case when target_reconciled then now() else null end
    where id = target_entry_id
      and user_id = current_user_id
      and is_active
      and status = 'completed';
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

create or replace function public.set_account_entry_reconciled(
  target_entry_type text,
  target_entry_id uuid,
  target_reconciled boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_account_entry_reconciled(
    target_entry_type,
    target_entry_id,
    target_reconciled
  );
$$;

revoke all on function public.set_account_entry_reconciled(text, uuid, boolean)
from public, anon;
grant execute on function public.set_account_entry_reconciled(text, uuid, boolean)
to authenticated;

comment on column public.categories.parent_id is
  'Optional root category. Subcategories are limited to one level and inherit nature and context.';
comment on column public.transactions.reconciled_at is
  'When non-null, the account owner confirmed this entry against the external statement.';
comment on column public.transfer_entries.reconciled_at is
  'Per-account reconciliation state for one side of a transfer.';
comment on function public.set_account_entry_reconciled(text, uuid, boolean) is
  'Marks an owned transaction or transfer entry as reconciled without changing its financial effect.';
