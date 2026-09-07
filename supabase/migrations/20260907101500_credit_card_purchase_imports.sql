-- Import credit-card purchases through the same review workflow used by bank
-- accounts. Confirmed rows reuse the canonical purchase routine so invoices,
-- installments and balances remain consistent.

alter table public.import_jobs
add column credit_card_id uuid;

alter table public.credit_cards
add constraint credit_cards_id_user_unique unique (id, user_id);

alter table public.import_jobs
add constraint import_jobs_credit_card_owner_fk
foreign key (credit_card_id, user_id)
references public.credit_cards(id, user_id) on delete restrict;

alter table public.import_jobs
add constraint import_jobs_single_target_check
check (num_nonnulls(account_id, credit_card_id) <= 1);

create index import_jobs_credit_card_idx
on public.import_jobs (credit_card_id)
where credit_card_id is not null;

create or replace function private.import_credit_card_purchase_signature(
  target_user_id uuid,
  target_credit_card_id uuid,
  target_purchase_date date,
  target_amount_minor bigint,
  target_description text
)
returns char(64)
language sql
immutable
set search_path = ''
as $$
  select encode(
    sha256(
      convert_to(
        concat_ws(
          '|',
          target_user_id::text,
          target_credit_card_id::text,
          target_purchase_date::text,
          target_amount_minor::text,
          private.normalize_import_description(target_description),
          'credit_card_purchase'
        ),
        'UTF8'
      )
    ),
    'hex'
  )::char(64);
$$;

alter function private.refresh_import_job(uuid, uuid)
rename to refresh_import_job_before_credit_card_purchase_imports;

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
  target_credit_card_id uuid;
  next_status text;
  valid_count integer;
  duplicate_count integer;
begin
  select jobs.credit_card_id
  into target_credit_card_id
  from public.import_jobs jobs
  where jobs.id = target_job_id
    and jobs.user_id = target_user_id
    and jobs.status in ('review', 'ready')
  for update;

  if not found then
    raise exception 'import_job_not_editable' using errcode = 'P0002';
  end if;

  if target_credit_card_id is null then
    perform private.refresh_import_job_before_credit_card_purchase_imports(
      target_job_id,
      target_user_id
    );
    return;
  end if;

  with computed as (
    select
      staging.id,
      staging.source_row_number,
      staging.transaction_date,
      staging.description,
      staging.signed_amount_minor,
      staging.category_id,
      staging.is_selected,
      staging.validation_code,
      abs(staging.signed_amount_minor) as computed_amount,
      private.normalize_import_description(staging.description)
        as computed_description,
      case
        when staging.transaction_date is not null
          and staging.signed_amount_minor is not null
          and staging.signed_amount_minor <> 0
          and nullif(trim(staging.description), '') is not null
        then private.import_credit_card_purchase_signature(
          target_user_id,
          target_credit_card_id,
          staging.transaction_date,
          abs(staging.signed_amount_minor),
          staging.description
        )
      end as computed_signature
    from public.import_staging_rows staging
    where staging.job_id = target_job_id
      and staging.user_id = target_user_id
  ),
  evaluated as (
    select
      computed.*,
      categories.id is not null as category_is_valid,
      existing_purchase.id as matching_purchase_id,
      exists (
        select 1
        from computed previous
        where previous.computed_signature = computed.computed_signature
          and previous.source_row_number < computed.source_row_number
      ) as duplicate_inside_job
    from computed
    left join public.categories categories
      on categories.id = computed.category_id
      and categories.user_id = target_user_id
      and categories.kind = 'expense'
      and categories.archived_at is null
    left join lateral (
      select purchases.id
      from public.credit_card_purchases purchases
      where purchases.user_id = target_user_id
        and purchases.credit_card_id = target_credit_card_id
        and purchases.purchase_date = computed.transaction_date
        and purchases.total_amount = computed.computed_amount
        and private.normalize_import_description(purchases.description)
          = computed.computed_description
        and purchases.status = 'active'
      order by purchases.created_at
      limit 1
    ) existing_purchase on true
  )
  update public.import_staging_rows staging
  set
    record_kind = 'transaction',
    account_id = null,
    normalized_description = nullif(evaluated.computed_description, ''),
    transaction_type = 'expense',
    amount_minor = evaluated.computed_amount,
    transfer_account_id = null,
    transfer_credit_card_id = null,
    signature = evaluated.computed_signature,
    duplicate_transaction_id = null,
    duplicate_transfer_id = null,
    status = case
      when evaluated.validation_code is not null
        or evaluated.transaction_date is null
        or evaluated.signed_amount_minor is null
        or evaluated.signed_amount_minor = 0
        or nullif(trim(evaluated.description), '') is null
      then 'error'
      when not evaluated.category_is_valid then 'needs_review'
      when evaluated.matching_purchase_id is not null
        or evaluated.duplicate_inside_job
      then 'duplicate'
      when not evaluated.is_selected then 'ignored'
      else 'valid'
    end,
    is_selected = case
      when evaluated.matching_purchase_id is not null
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

  if valid_count > 0
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
  set status = next_status,
      valid_row_count = valid_count,
      duplicate_row_count = duplicate_count
  where id = target_job_id
    and user_id = target_user_id;
end;
$$;

alter function private.configure_import_job(uuid, uuid)
rename to configure_import_job_before_credit_card_purchase_imports;

create or replace function private.configure_import_job(
  target_job_id uuid,
  target_account_id uuid
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

  update public.import_jobs
  set credit_card_id = null
  where id = target_job_id
    and user_id = current_user_id
    and status in ('review', 'ready');
  if not found then
    raise exception 'import_job_not_editable' using errcode = 'P0002';
  end if;

  return private.configure_import_job_before_credit_card_purchase_imports(
    target_job_id,
    target_account_id
  );
end;
$$;

create or replace function private.configure_credit_card_purchase_import_job(
  target_job_id uuid,
  target_credit_card_id uuid
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
  if not exists (
    select 1
    from public.credit_cards
    where id = target_credit_card_id
      and user_id = current_user_id
      and is_active
  ) then
    raise exception 'invalid_import_credit_card' using errcode = '23503';
  end if;

  update public.import_jobs
  set account_id = null,
      credit_card_id = target_credit_card_id
  where id = target_job_id
    and user_id = current_user_id
    and status in ('review', 'ready');
  if not found then
    raise exception 'import_job_not_editable' using errcode = 'P0002';
  end if;

  update public.import_staging_rows staging
  set record_kind = 'transaction',
      account_id = null,
      transfer_account_id = null,
      transfer_credit_card_id = null,
      category_id = coalesce(
        (
          select categories.id
          from public.categories categories
          where categories.id = staging.category_id
            and categories.user_id = current_user_id
            and categories.kind = 'expense'
            and categories.archived_at is null
        ),
        (
          select categories.id
          from public.categories categories
          where categories.user_id = current_user_id
            and categories.kind = 'expense'
            and categories.archived_at is null
            and lower(trim(categories.name)) = lower(trim(
              regexp_replace(
                regexp_replace(staging.source_category_name, '^.*:', ''),
                '/.*$',
                ''
              )
            ))
          order by categories.created_at
          limit 1
        )
      )
  where staging.job_id = target_job_id
    and staging.user_id = current_user_id;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return true;
end;
$$;

create or replace function private.update_import_credit_card_purchase_row(
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
      and kind = 'expense'
      and archived_at is null
  ) then
    raise exception 'invalid_import_category' using errcode = '23503';
  end if;

  select staging.job_id
  into target_job_id
  from public.import_staging_rows staging
  join public.import_jobs jobs
    on jobs.id = staging.job_id
    and jobs.user_id = staging.user_id
  where staging.id = target_row_id
    and staging.user_id = current_user_id
    and jobs.credit_card_id is not null
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
  where id = target_row_id
    and user_id = current_user_id;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return true;
end;
$$;

alter function private.confirm_import_job(uuid)
rename to confirm_import_job_before_credit_card_purchase_imports;

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
  imported_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select *
  into job_record
  from public.import_jobs
  where id = target_job_id
    and user_id = current_user_id
    and status in ('review', 'ready')
  for update;
  if not found then
    raise exception 'import_job_not_confirmable' using errcode = 'P0002';
  end if;

  if job_record.credit_card_id is null then
    return private.confirm_import_job_before_credit_card_purchase_imports(
      target_job_id
    );
  end if;

  perform private.refresh_import_job(target_job_id, current_user_id);
  select *
  into job_record
  from public.import_jobs
  where id = target_job_id
    and user_id = current_user_id;
  if job_record.status <> 'ready' then
    raise exception 'import_job_requires_review' using errcode = '23514';
  end if;

  for staging_record in
    select *
    from public.import_staging_rows
    where job_id = target_job_id
      and user_id = current_user_id
      and status = 'valid'
      and is_selected
    order by source_row_number
    for update
  loop
    perform private.create_credit_card_purchase(
      job_record.credit_card_id,
      staging_record.category_id,
      staging_record.description,
      staging_record.amount_minor,
      staging_record.transaction_date,
      1,
      null
    );
    imported_count := imported_count + 1;
  end loop;

  if imported_count = 0 then
    raise exception 'import_job_has_no_rows' using errcode = '23514';
  end if;

  update public.import_jobs
  set status = 'completed',
      imported_row_count = imported_count,
      confirmed_at = now()
  where id = target_job_id
    and user_id = current_user_id;

  delete from public.import_staging_rows
  where job_id = target_job_id
    and user_id = current_user_id;

  return imported_count;
end;
$$;

create or replace function public.configure_credit_card_purchase_import_job(
  target_job_id uuid,
  target_credit_card_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.configure_credit_card_purchase_import_job(
    target_job_id,
    target_credit_card_id
  );
$$;

create or replace function public.update_import_credit_card_purchase_row(
  target_row_id uuid,
  target_transaction_date date,
  target_description text,
  target_signed_amount_minor bigint,
  target_category_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_import_credit_card_purchase_row(
    target_row_id,
    target_transaction_date,
    target_description,
    target_signed_amount_minor,
    target_category_id
  );
$$;

revoke all on function private.refresh_import_job_before_credit_card_purchase_imports(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function private.confirm_import_job_before_credit_card_purchase_imports(
  uuid
) from public, anon, authenticated;
revoke all on function private.configure_import_job_before_credit_card_purchase_imports(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function private.import_credit_card_purchase_signature(
  uuid, uuid, date, bigint, text
) from public, anon, authenticated;
revoke all on function private.configure_credit_card_purchase_import_job(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function private.update_import_credit_card_purchase_row(
  uuid, date, text, bigint, uuid
) from public, anon, authenticated;
revoke all on function private.refresh_import_job(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.configure_import_job(uuid, uuid)
from public, anon, authenticated;

grant execute on function private.configure_credit_card_purchase_import_job(
  uuid, uuid
) to authenticated;
grant execute on function private.configure_import_job(uuid, uuid)
to authenticated;
grant execute on function private.update_import_credit_card_purchase_row(
  uuid, date, text, bigint, uuid
) to authenticated;

revoke all on function public.configure_credit_card_purchase_import_job(
  uuid, uuid
) from public, anon;
revoke all on function public.update_import_credit_card_purchase_row(
  uuid, date, text, bigint, uuid
) from public, anon;
grant execute on function public.configure_credit_card_purchase_import_job(
  uuid, uuid
) to authenticated;
grant execute on function public.update_import_credit_card_purchase_row(
  uuid, date, text, bigint, uuid
) to authenticated;

comment on column public.import_jobs.credit_card_id is
  'Optional active credit-card target when staged rows represent purchases.';
comment on function public.configure_credit_card_purchase_import_job(uuid, uuid)
is 'Associates an import review with a credit card so confirmed rows become one-installment purchases.';
comment on function public.update_import_credit_card_purchase_row(uuid, date, text, bigint, uuid)
is 'Corrects one staged credit-card purchase and validates an expense category.';
