-- Owner-scoped permanent deletion for categories and archived accounts.
-- Category deletion atomically reassigns every financial reference when needed.

create or replace function public.delete_category_with_replacement(
  target_category_id uuid,
  replacement_category_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_category public.categories%rowtype;
  replacement_category public.categories%rowtype;
  category_ids uuid[];
  reference_count bigint;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into target_category
  from public.categories
  where id = target_category_id
    and user_id = current_user_id;

  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  select array_agg(category.id order by category.parent_id nulls first)
  into category_ids
  from public.categories as category
  where category.user_id = current_user_id
    and (
      category.id = target_category_id
      or category.parent_id = target_category_id
    );

  perform 1
  from public.categories as category
  where category.user_id = current_user_id
    and (
      category.id = any(category_ids)
      or category.id = replacement_category_id
    )
  order by category.id
  for update;

  select * into target_category
  from public.categories
  where id = target_category_id
    and user_id = current_user_id;

  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  select
    (select count(*) from public.transactions
      where user_id = current_user_id and category_id = any(category_ids))
    + (select count(*) from public.recurring_transactions
      where user_id = current_user_id and category_id = any(category_ids))
    + (select count(*) from public.credit_card_purchases
      where user_id = current_user_id and category_id = any(category_ids))
    + (select count(*) from public.monthly_budgets
      where user_id = current_user_id and category_id = any(category_ids))
    + (select count(*) from public.import_staging_rows
      where user_id = current_user_id and category_id = any(category_ids))
  into reference_count;

  if reference_count > 0 and replacement_category_id is null then
    raise exception 'category_replacement_required' using errcode = '23503';
  end if;

  if replacement_category_id is not null then
    select * into replacement_category
    from public.categories
    where id = replacement_category_id
      and user_id = current_user_id;

    if not found
      or replacement_category.id = any(category_ids)
      or replacement_category.kind <> target_category.kind
      or replacement_category.context <> target_category.context
      or replacement_category.archived_at is not null
    then
      raise exception 'invalid_replacement_category' using errcode = '23503';
    end if;

    update public.transactions
    set category_id = replacement_category_id
    where user_id = current_user_id
      and category_id = any(category_ids);

    update public.recurring_transactions
    set category_id = replacement_category_id
    where user_id = current_user_id
      and category_id = any(category_ids);

    update public.credit_card_purchases
    set category_id = replacement_category_id
    where user_id = current_user_id
      and category_id = any(category_ids);

    update public.import_staging_rows
    set category_id = replacement_category_id
    where user_id = current_user_id
      and category_id = any(category_ids);

    insert into public.monthly_budgets (
      user_id,
      category_id,
      reference_month,
      currency,
      planned_amount_minor
    )
    select
      current_user_id,
      replacement_category_id,
      budget.reference_month,
      budget.currency,
      sum(budget.planned_amount_minor)::bigint
    from public.monthly_budgets as budget
    where budget.user_id = current_user_id
      and budget.category_id = any(category_ids)
    group by budget.reference_month, budget.currency
    order by budget.reference_month, budget.currency
    on conflict (user_id, reference_month, currency, category_id)
    do update set
      planned_amount_minor =
        public.monthly_budgets.planned_amount_minor
        + excluded.planned_amount_minor;
  end if;

  delete from public.monthly_budgets
  where user_id = current_user_id
    and category_id = any(category_ids);

  delete from public.categories
  where user_id = current_user_id
    and parent_id = target_category_id;

  delete from public.categories
  where user_id = current_user_id
    and id = target_category_id;

  return true;
end;
$$;

revoke all on function public.delete_category_with_replacement(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.delete_category_with_replacement(uuid, uuid)
to authenticated;

create or replace function public.delete_archived_account(
  target_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_account public.accounts%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into target_account
  from public.accounts
  where id = target_account_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  if target_account.archived_at is null then
    raise exception 'account_must_be_archived' using errcode = '23514';
  end if;

  update public.credit_cards
  set linked_account_id = null
  where user_id = current_user_id
    and linked_account_id = target_account_id;

  update public.credit_card_invoices as invoice
  set payment_account_id = null,
      payment_transaction_id = null
  where invoice.user_id = current_user_id
    and (
      invoice.payment_account_id = target_account_id
      or invoice.payment_transaction_id in (
        select transaction.id
        from public.transactions as transaction
        where transaction.user_id = current_user_id
          and transaction.account_id = target_account_id
      )
    );

  delete from public.imported_transaction_signatures
  where user_id = current_user_id
    and account_id = target_account_id;

  delete from public.import_jobs
  where user_id = current_user_id
    and account_id = target_account_id;

  delete from public.import_staging_rows
  where user_id = current_user_id
    and account_id = target_account_id;

  update public.import_staging_rows
  set transfer_account_id = null,
      status = case
        when status in ('imported', 'ignored') then status
        else 'needs_review'
      end
  where user_id = current_user_id
    and transfer_account_id = target_account_id;

  delete from public.transfers
  where user_id = current_user_id
    and (
      source_account_id = target_account_id
      or destination_account_id = target_account_id
    );

  delete from public.recurring_transactions
  where user_id = current_user_id
    and account_id = target_account_id;

  delete from public.transactions
  where user_id = current_user_id
    and account_id = target_account_id;

  delete from public.accounts
  where user_id = current_user_id
    and id = target_account_id;

  return true;
end;
$$;

revoke all on function public.delete_archived_account(uuid)
from public, anon, authenticated;
grant execute on function public.delete_archived_account(uuid)
to authenticated;

comment on function public.delete_category_with_replacement(uuid, uuid) is
  'Deletes an owned category and direct subcategories atomically; every financial reference must be reassigned to an active compatible category.';
comment on function public.delete_archived_account(uuid) is
  'Permanently deletes an owned archived account and its account-scoped history after unlinking dependent records.';
