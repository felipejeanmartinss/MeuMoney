alter table public.transactions
  add column is_subscription boolean not null default false;
alter table public.recurring_transactions
  add column is_subscription boolean not null default false;

grant insert (is_subscription) on table public.transactions to authenticated;
grant update (is_subscription) on table public.transactions to authenticated;
grant insert (is_subscription) on table public.recurring_transactions to authenticated;
grant update (is_subscription) on table public.recurring_transactions to authenticated;

create or replace function public.copy_recurring_subscription_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.recurring_transaction_id is not null then
    new.is_subscription := coalesce((
      select recurrence.is_subscription
      from public.recurring_transactions recurrence
      where recurrence.id = new.recurring_transaction_id
        and recurrence.user_id = new.user_id
    ), false);
  end if;
  return new;
end;
$$;

create trigger transactions_copy_recurring_subscription
before insert or update of recurring_transaction_id on public.transactions
for each row execute function public.copy_recurring_subscription_flag();

update public.transactions transaction
set is_subscription = recurrence.is_subscription
from public.recurring_transactions recurrence
where transaction.recurring_transaction_id = recurrence.id
  and transaction.user_id = recurrence.user_id;

create or replace function public.update_generated_subscription_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_subscription is distinct from old.is_subscription then
    update public.transactions transaction
    set is_subscription = new.is_subscription
    where transaction.recurring_transaction_id = new.id
      and transaction.user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger recurring_transactions_sync_subscription
after update of is_subscription on public.recurring_transactions
for each row execute function public.update_generated_subscription_flag();

revoke all on function public.copy_recurring_subscription_flag() from public, anon, authenticated;
revoke all on function public.update_generated_subscription_flag() from public, anon, authenticated;

alter table public.categories
  drop constraint categories_fixed_expense_subcategory_check;
alter table public.categories
  add constraint categories_fixed_expense_kind_check
  check (not is_fixed_expense or kind = 'expense'::public.transaction_kind);
comment on column public.categories.is_fixed_expense is
  'User-defined classification for expense categories or subcategories included in the fixed-expense report.';
