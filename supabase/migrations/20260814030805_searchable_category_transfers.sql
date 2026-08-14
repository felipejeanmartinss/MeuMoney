-- Allow an import staging row to be reclassified safely between a regular
-- transaction and an account transfer. The public wrappers and grants remain
-- unchanged; ownership is still enforced inside these private functions.

create or replace function private.update_import_staging_row(
  target_row_id uuid,
  target_transaction_date date,
  target_description text,
  target_signed_amount_minor bigint,
  target_category_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_job_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if target_signed_amount_minor is null
    or target_signed_amount_minor = 0
    or abs(target_signed_amount_minor) > 9007199254740991
    or target_transaction_date is null
    or char_length(trim(coalesce(target_description, ''))) not between 1 and 180
  then
    raise exception 'invalid_import_row' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.categories
    where id = target_category_id
      and user_id = current_user_id
      and kind = case
        when target_signed_amount_minor > 0 then 'income'
        else 'expense'
      end::public.transaction_kind
      and archived_at is null
  ) then
    raise exception 'invalid_import_category' using errcode = '23503';
  end if;

  select staging.job_id into target_job_id
  from public.import_staging_rows staging
  join public.import_jobs jobs
    on jobs.id = staging.job_id and jobs.user_id = staging.user_id
  where staging.id = target_row_id
    and staging.user_id = current_user_id
    and jobs.status in ('review', 'ready')
  for update of staging;

  if not found then
    raise exception 'import_row_not_editable' using errcode = 'P0002';
  end if;

  update public.import_staging_rows
  set
    record_kind = 'transaction',
    transaction_date = target_transaction_date,
    description = trim(target_description),
    signed_amount_minor = target_signed_amount_minor,
    category_id = target_category_id,
    transfer_account_id = null,
    validation_code = null,
    is_selected = true
  where id = target_row_id
    and user_id = current_user_id;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return true;
end;
$$;

create or replace function private.update_import_transfer_row(
  target_row_id uuid,
  target_transaction_date date,
  target_description text,
  target_signed_amount_minor bigint,
  target_transfer_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_job_id uuid;
  source_account_id uuid;
  source_currency char(3);
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_signed_amount_minor is null
    or target_signed_amount_minor = 0
    or abs(target_signed_amount_minor) > 9007199254740991
    or target_transaction_date is null
    or char_length(trim(coalesce(target_description, ''))) not between 1 and 180
  then
    raise exception 'invalid_import_row' using errcode = '22023';
  end if;

  select staging.job_id, jobs.account_id, accounts.currency
  into target_job_id, source_account_id, source_currency
  from public.import_staging_rows staging
  join public.import_jobs jobs
    on jobs.id = staging.job_id and jobs.user_id = staging.user_id
  join public.accounts accounts
    on accounts.id = jobs.account_id and accounts.user_id = jobs.user_id
  where staging.id = target_row_id
    and staging.user_id = current_user_id
    and jobs.status in ('review', 'ready')
  for update of staging;

  if not found then
    raise exception 'import_row_not_editable' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.accounts
    where id = target_transfer_account_id
      and user_id = current_user_id
      and id <> source_account_id
      and currency = source_currency
      and archived_at is null
  ) then
    raise exception 'invalid_import_transfer_account' using errcode = '23503';
  end if;

  update public.import_staging_rows
  set
    record_kind = 'transfer',
    transaction_date = target_transaction_date,
    description = trim(target_description),
    signed_amount_minor = target_signed_amount_minor,
    transfer_account_id = target_transfer_account_id,
    category_id = null,
    validation_code = null,
    is_selected = true
  where id = target_row_id and user_id = current_user_id;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return true;
end;
$$;

comment on function private.update_import_staging_row(
  uuid, date, text, bigint, uuid
) is
  'Owner-scoped import correction that also converts a transfer staging row back into a categorized transaction.';

comment on function private.update_import_transfer_row(
  uuid, date, text, bigint, uuid
) is
  'Owner-scoped import correction that also converts a categorized staging row into an account transfer.';
