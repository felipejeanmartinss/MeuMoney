-- Import review can classify a negative bank statement row as a technical
-- payment to an active credit card in the same currency. The confirmation
-- remains atomic and delegates the cash/card effects to the existing transfer
-- invariant introduced by 20260815160729_card_account_transfers.sql.

alter table public.import_staging_rows
  add column transfer_credit_card_id uuid
    references public.credit_cards(id) on delete restrict;

alter table public.import_staging_rows
  add constraint import_staging_single_transfer_target_check
    check (num_nonnulls(transfer_account_id, transfer_credit_card_id) <= 1),
  add constraint import_staging_target_kind_check
    check (
      coalesce(record_kind, 'transaction') = 'transfer'
      or (
        transfer_account_id is null
        and transfer_credit_card_id is null
      )
    );

create index import_staging_rows_transfer_credit_card_idx
on public.import_staging_rows (transfer_credit_card_id)
where transfer_credit_card_id is not null;

create or replace function private.validate_import_staging_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.transfer_account_id is not null
      and new.transfer_account_id is distinct from old.transfer_account_id
    then
      new.transfer_credit_card_id := null;
    elsif new.transfer_credit_card_id is not null
      and new.transfer_credit_card_id
        is distinct from old.transfer_credit_card_id
    then
      new.transfer_account_id := null;
    end if;
  end if;

  if new.user_id is distinct from (select auth.uid())
    or not exists (
      select 1 from public.import_jobs
      where id = new.job_id and user_id = new.user_id
    )
    or (
      new.account_id is not null
      and not exists (
        select 1 from public.accounts
        where id = new.account_id and user_id = new.user_id
      )
    )
    or (
      new.category_id is not null
      and not exists (
        select 1 from public.categories
        where id = new.category_id and user_id = new.user_id
      )
    )
    or (
      new.transfer_account_id is not null
      and not exists (
        select 1 from public.accounts
        where id = new.transfer_account_id and user_id = new.user_id
      )
    )
    or (
      new.transfer_credit_card_id is not null
      and not exists (
        select 1 from public.credit_cards
        where id = new.transfer_credit_card_id and user_id = new.user_id
      )
    )
    or (
      new.duplicate_transaction_id is not null
      and not exists (
        select 1 from public.transactions
        where id = new.duplicate_transaction_id and user_id = new.user_id
      )
    )
    or (
      new.duplicate_transfer_id is not null
      and not exists (
        select 1 from public.transfers
        where id = new.duplicate_transfer_id and user_id = new.user_id
      )
    )
  then
    raise exception 'import_staging_owner_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.import_credit_card_transfer_signature(
  target_user_id uuid,
  source_account_id uuid,
  target_credit_card_id uuid,
  target_transaction_date date,
  target_amount_minor bigint
)
returns char(64)
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(
    sha256(
      convert_to(
        concat_ws(
          '|',
          target_user_id::text,
          source_account_id::text,
          target_credit_card_id::text,
          target_transaction_date::text,
          target_amount_minor::text,
          'credit_card_payment'
        ),
        'UTF8'
      )
    ),
    'hex'
  )::char(64);
$$;

-- Preserve the mature CSV/OFX/QIF/PDF transaction and account-transfer
-- evaluator, then add the credit-card-payment specialization on top.
alter function private.refresh_import_job(uuid, uuid)
rename to refresh_import_job_before_card_payments;

create or replace function private.refresh_import_job(
  target_job_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_account_id uuid;
  target_account_currency char(3);
  next_status text;
  valid_count integer;
  duplicate_count integer;
begin
  perform private.refresh_import_job_before_card_payments(
    target_job_id,
    target_user_id
  );

  select jobs.account_id, accounts.currency
  into target_account_id, target_account_currency
  from public.import_jobs jobs
  left join public.accounts accounts
    on accounts.id = jobs.account_id
    and accounts.user_id = jobs.user_id
  where jobs.id = target_job_id
    and jobs.user_id = target_user_id
    and jobs.status in ('review', 'ready')
  for update of jobs;

  if not found then
    raise exception 'import_job_not_editable' using errcode = 'P0002';
  end if;

  with computed as (
    select
      staging.id,
      staging.source_row_number,
      staging.transaction_date,
      staging.description,
      staging.signed_amount_minor,
      staging.transfer_credit_card_id,
      staging.is_selected,
      staging.validation_code,
      abs(staging.signed_amount_minor) as computed_amount,
      private.normalize_import_description(staging.description)
        as computed_description,
      case
        when target_account_id is not null
          and staging.transfer_credit_card_id is not null
          and staging.transaction_date is not null
          and staging.signed_amount_minor < 0
          and nullif(trim(staging.description), '') is not null
        then private.import_credit_card_transfer_signature(
          target_user_id,
          target_account_id,
          staging.transfer_credit_card_id,
          staging.transaction_date,
          abs(staging.signed_amount_minor)
        )
      end as computed_signature
    from public.import_staging_rows staging
    where staging.job_id = target_job_id
      and staging.user_id = target_user_id
      and coalesce(staging.record_kind, 'transaction') = 'transfer'
      and staging.transfer_credit_card_id is not null
  ),
  evaluated as (
    select
      computed.*,
      credit_cards.id is not null
        and credit_cards.currency = target_account_currency
        and credit_cards.is_active
        as credit_card_is_valid,
      signatures.transfer_id as signature_transfer_id,
      existing_transfer.id as matching_transfer_id,
      exists (
        select 1
        from computed previous
        where previous.computed_signature = computed.computed_signature
          and previous.source_row_number < computed.source_row_number
      ) as duplicate_inside_job
    from computed
    left join public.credit_cards
      on credit_cards.id = computed.transfer_credit_card_id
      and credit_cards.user_id = target_user_id
    left join public.imported_transaction_signatures signatures
      on signatures.user_id = target_user_id
      and signatures.signature = computed.computed_signature
    left join lateral (
      select transfers.id
      from public.transfers
      where transfers.user_id = target_user_id
        and transfers.source_account_id = target_account_id
        and transfers.destination_credit_card_id
          = computed.transfer_credit_card_id
        and transfers.transaction_date = computed.transaction_date
        and transfers.amount_minor = computed.computed_amount
        and transfers.is_active
      order by transfers.created_at
      limit 1
    ) existing_transfer on true
  )
  update public.import_staging_rows staging
  set
    account_id = target_account_id,
    normalized_description = nullif(evaluated.computed_description, ''),
    transaction_type = null,
    amount_minor = evaluated.computed_amount,
    category_id = null,
    signature = evaluated.computed_signature,
    duplicate_transaction_id = null,
    duplicate_transfer_id = coalesce(
      evaluated.signature_transfer_id,
      evaluated.matching_transfer_id
    ),
    status = case
      when evaluated.validation_code is not null
        or evaluated.transaction_date is null
        or evaluated.signed_amount_minor is null
        or evaluated.signed_amount_minor >= 0
        or nullif(trim(evaluated.description), '') is null
      then 'error'
      when target_account_id is null
        or not evaluated.credit_card_is_valid
      then 'needs_review'
      when evaluated.signature_transfer_id is not null
        or evaluated.matching_transfer_id is not null
        or evaluated.duplicate_inside_job
      then 'duplicate'
      when not evaluated.is_selected then 'ignored'
      else 'valid'
    end,
    is_selected = case
      when evaluated.signature_transfer_id is not null
        or evaluated.matching_transfer_id is not null
        or evaluated.duplicate_inside_job
      then false
      else evaluated.is_selected
    end
  from evaluated
  where staging.id = evaluated.id;

  select
    count(*) filter (where status = 'valid' and is_selected),
    count(*) filter (where status = 'duplicate')
  into valid_count, duplicate_count
  from public.import_staging_rows
  where job_id = target_job_id
    and user_id = target_user_id;

  if target_account_id is not null
    and valid_count > 0
    and not exists (
      select 1
      from public.import_staging_rows
      where job_id = target_job_id
        and user_id = target_user_id
        and is_selected
        and status in ('needs_review', 'error', 'duplicate')
    )
  then
    next_status := 'ready';
  else
    next_status := 'review';
  end if;

  update public.import_jobs
  set
    status = next_status,
    valid_row_count = valid_count,
    duplicate_row_count = duplicate_count
  where id = target_job_id
    and user_id = target_user_id;
end;
$$;

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
    select 1 from public.categories
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
  set record_kind = 'transaction',
      transaction_date = target_transaction_date,
      description = trim(target_description),
      signed_amount_minor = target_signed_amount_minor,
      category_id = target_category_id,
      transfer_account_id = null,
      transfer_credit_card_id = null,
      validation_code = null,
      is_selected = true
  where id = target_row_id and user_id = current_user_id;

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
    select 1 from public.accounts
    where id = target_transfer_account_id
      and user_id = current_user_id
      and id <> source_account_id
      and currency = source_currency
      and archived_at is null
  ) then
    raise exception 'invalid_import_transfer_account' using errcode = '23503';
  end if;

  update public.import_staging_rows
  set record_kind = 'transfer',
      transaction_date = target_transaction_date,
      description = trim(target_description),
      signed_amount_minor = target_signed_amount_minor,
      transfer_account_id = target_transfer_account_id,
      transfer_credit_card_id = null,
      category_id = null,
      validation_code = null,
      is_selected = true
  where id = target_row_id and user_id = current_user_id;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return true;
end;
$$;

create or replace function private.update_import_credit_card_transfer_row(
  target_row_id uuid,
  target_transaction_date date,
  target_description text,
  target_signed_amount_minor bigint,
  target_credit_card_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_job_id uuid;
  source_currency char(3);
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_signed_amount_minor is null
    or target_signed_amount_minor >= 0
    or abs(target_signed_amount_minor) > 9007199254740991
    or target_transaction_date is null
    or char_length(trim(coalesce(target_description, ''))) not between 1 and 180
  then
    raise exception 'invalid_import_credit_card_payment' using errcode = '22023';
  end if;

  select staging.job_id, accounts.currency
  into target_job_id, source_currency
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
    select 1 from public.credit_cards
    where id = target_credit_card_id
      and user_id = current_user_id
      and currency = source_currency
      and is_active
  ) then
    raise exception 'invalid_import_credit_card' using errcode = '23503';
  end if;

  update public.import_staging_rows
  set record_kind = 'transfer',
      transaction_date = target_transaction_date,
      description = trim(target_description),
      signed_amount_minor = target_signed_amount_minor,
      transfer_account_id = null,
      transfer_credit_card_id = target_credit_card_id,
      category_id = null,
      validation_code = null,
      is_selected = true
  where id = target_row_id and user_id = current_user_id;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return true;
end;
$$;

create or replace function private.confirm_import_job(target_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  job_record public.import_jobs%rowtype;
  staging_record public.import_staging_rows%rowtype;
  new_transaction_id uuid;
  new_transfer_id uuid;
  imported_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into job_record
  from public.import_jobs
  where id = target_job_id
    and user_id = current_user_id
    and status in ('review', 'ready')
  for update;
  if not found then
    raise exception 'import_job_not_confirmable' using errcode = 'P0002';
  end if;

  perform private.refresh_import_job(target_job_id, current_user_id);
  select * into job_record
  from public.import_jobs
  where id = target_job_id and user_id = current_user_id;
  if job_record.status <> 'ready' then
    raise exception 'import_job_requires_review' using errcode = '23514';
  end if;

  for staging_record in
    select * from public.import_staging_rows
    where job_id = target_job_id
      and user_id = current_user_id
      and status = 'valid'
      and is_selected
    order by source_row_number
    for update
  loop
    if coalesce(staging_record.record_kind, 'transaction') = 'transfer' then
      if staging_record.transfer_credit_card_id is not null then
        new_transfer_id := private.create_credit_card_transfer(
          job_record.account_id,
          staging_record.transfer_credit_card_id,
          staging_record.amount_minor,
          staging_record.transaction_date,
          'completed'::public.transaction_status,
          staging_record.description,
          null
        );
      elsif staging_record.signed_amount_minor < 0 then
        new_transfer_id := private.create_transfer(
          job_record.account_id,
          staging_record.transfer_account_id,
          staging_record.amount_minor,
          staging_record.transaction_date,
          'completed'::public.transaction_status,
          staging_record.description,
          null
        );
      else
        new_transfer_id := private.create_transfer(
          staging_record.transfer_account_id,
          job_record.account_id,
          staging_record.amount_minor,
          staging_record.transaction_date,
          'completed'::public.transaction_status,
          staging_record.description,
          null
        );
      end if;

      insert into public.imported_transaction_signatures (
        user_id, account_id, transfer_id, source_job_id, signature
      ) values (
        current_user_id, job_record.account_id, new_transfer_id,
        target_job_id, staging_record.signature
      );
    else
      insert into public.transactions (
        user_id, account_id, category_id, transaction_type, description,
        amount_minor, transaction_date, status, notes
      ) values (
        current_user_id, job_record.account_id, staging_record.category_id,
        staging_record.transaction_type, staging_record.description,
        staging_record.amount_minor, staging_record.transaction_date,
        'completed', null
      )
      returning id into new_transaction_id;

      insert into public.imported_transaction_signatures (
        user_id, account_id, transaction_id, source_job_id, signature
      ) values (
        current_user_id, job_record.account_id, new_transaction_id,
        target_job_id, staging_record.signature
      );
    end if;
    imported_count := imported_count + 1;
  end loop;

  if imported_count = 0 then
    raise exception 'import_job_has_no_rows' using errcode = '23514';
  end if;

  update public.import_jobs
  set status = 'completed',
      imported_row_count = imported_count,
      confirmed_at = now()
  where id = target_job_id and user_id = current_user_id;

  delete from public.import_staging_rows
  where job_id = target_job_id and user_id = current_user_id;
  return imported_count;
end;
$$;

create or replace function public.update_import_credit_card_transfer_row(
  target_row_id uuid,
  target_transaction_date date,
  target_description text,
  target_signed_amount_minor bigint,
  target_credit_card_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_import_credit_card_transfer_row(
    target_row_id,
    target_transaction_date,
    target_description,
    target_signed_amount_minor,
    target_credit_card_id
  );
$$;

revoke all on function private.refresh_import_job_before_card_payments(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function private.refresh_import_job(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.import_credit_card_transfer_signature(
  uuid, uuid, uuid, date, bigint
) from public, anon, authenticated;
revoke all on function private.update_import_credit_card_transfer_row(
  uuid, date, text, bigint, uuid
) from public, anon, authenticated;
grant execute on function private.update_import_credit_card_transfer_row(
  uuid, date, text, bigint, uuid
) to authenticated;

revoke all on function public.update_import_credit_card_transfer_row(
  uuid, date, text, bigint, uuid
) from public, anon;
grant execute on function public.update_import_credit_card_transfer_row(
  uuid, date, text, bigint, uuid
) to authenticated;

comment on column public.import_staging_rows.transfer_credit_card_id is
  'Active same-currency credit card selected as a technical payment target.';
comment on function public.update_import_credit_card_transfer_row(
  uuid, date, text, bigint, uuid
) is
  'Classifies a negative imported bank row as a same-currency credit-card payment.';
