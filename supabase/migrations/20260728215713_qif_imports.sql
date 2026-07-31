-- Direct QIF imports from Microsoft Money and compatible producers.
-- QIF source files are parsed in memory; only normalized staging data reaches
-- Postgres. Bracketed account references are confirmed as real transfers.

alter table public.import_jobs
  drop constraint if exists import_jobs_file_type_supported_check,
  drop constraint if exists import_jobs_parser_config_check,
  drop constraint if exists import_jobs_adapter_metadata_check;

alter table public.import_jobs
  add constraint import_jobs_file_type_supported_check
    check (file_type in ('csv', 'ofx', 'qif', 'pdf')),
  add constraint import_jobs_parser_config_check
    check (
      (file_type = 'csv' and csv_config is not null)
      or (file_type in ('ofx', 'qif', 'pdf') and csv_config is null)
    ),
  add constraint import_jobs_adapter_metadata_check
    check (
      (
        file_type = 'pdf'
        and char_length(trim(source_adapter_id)) between 1 and 120
        and char_length(trim(source_document_type)) between 1 and 80
      )
      or (
        file_type <> 'pdf'
        and source_adapter_id is null
        and source_document_type is null
      )
    );

alter table public.import_staging_rows
  add column record_kind text default 'transaction'
    check (record_kind in ('transaction', 'transfer')),
  add column source_category_name text
    check (
      source_category_name is null
      or char_length(trim(source_category_name)) between 1 and 180
    ),
  add column transfer_account_name text
    check (
      transfer_account_name is null
      or char_length(trim(transfer_account_name)) between 1 and 180
    ),
  add column transfer_account_id uuid
    references public.accounts(id) on delete restrict,
  add column duplicate_transfer_id uuid
    references public.transfers(id) on delete set null;

create index import_staging_rows_transfer_account_idx
on public.import_staging_rows (transfer_account_id)
where transfer_account_id is not null;

create index import_staging_rows_duplicate_transfer_idx
on public.import_staging_rows (duplicate_transfer_id)
where duplicate_transfer_id is not null;

alter table public.imported_transaction_signatures
  alter column transaction_id drop not null,
  add column transfer_id uuid unique
    references public.transfers(id) on delete cascade,
  add constraint imported_signature_single_target_check
    check (num_nonnulls(transaction_id, transfer_id) = 1);

create or replace function private.validate_import_staging_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create or replace function private.validate_import_signature_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from (select auth.uid())
    or not exists (
      select 1 from public.accounts
      where id = new.account_id and user_id = new.user_id
    )
    or (
      new.transaction_id is not null
      and not exists (
        select 1 from public.transactions
        where id = new.transaction_id and user_id = new.user_id
      )
    )
    or (
      new.transfer_id is not null
      and not exists (
        select 1 from public.transfers
        where id = new.transfer_id and user_id = new.user_id
      )
    )
    or (
      new.source_job_id is not null
      and not exists (
        select 1 from public.import_jobs
        where id = new.source_job_id and user_id = new.user_id
      )
    )
  then
    raise exception 'import_signature_owner_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists import_staging_rows_validate_owner
on public.import_staging_rows;
create trigger import_staging_rows_validate_owner
before insert or update on public.import_staging_rows
for each row execute procedure private.validate_import_staging_owner();

drop trigger if exists imported_signatures_validate_owner
on public.imported_transaction_signatures;
create trigger imported_signatures_validate_owner
before insert or update on public.imported_transaction_signatures
for each row execute procedure private.validate_import_signature_owner();

create or replace function private.import_transfer_signature(
  target_user_id uuid,
  first_account_id uuid,
  second_account_id uuid,
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
          least(first_account_id::text, second_account_id::text),
          greatest(first_account_id::text, second_account_id::text),
          target_transaction_date::text,
          target_amount_minor::text,
          'transfer'
        ),
        'UTF8'
      )
    ),
    'hex'
  )::char(64);
$$;

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
      staging.category_id,
      staging.transfer_account_id,
      coalesce(staging.record_kind, 'transaction') as record_kind,
      staging.is_selected,
      staging.validation_code,
      case
        when staging.signed_amount_minor > 0 then 'income'
        when staging.signed_amount_minor < 0 then 'expense'
      end::public.transaction_kind as computed_type,
      abs(staging.signed_amount_minor) as computed_amount,
      private.normalize_import_description(staging.description)
        as computed_description,
      case
        when target_account_id is not null
          and staging.transaction_date is not null
          and staging.signed_amount_minor is not null
          and staging.signed_amount_minor <> 0
          and nullif(trim(staging.description), '') is not null
          and coalesce(staging.record_kind, 'transaction') = 'transaction'
        then private.import_transaction_signature(
          target_user_id,
          target_account_id,
          staging.transaction_date,
          staging.signed_amount_minor,
          staging.description
        )
        when target_account_id is not null
          and staging.transfer_account_id is not null
          and staging.transfer_account_id <> target_account_id
          and staging.transaction_date is not null
          and staging.signed_amount_minor is not null
          and staging.signed_amount_minor <> 0
          and nullif(trim(staging.description), '') is not null
          and coalesce(staging.record_kind, 'transaction') = 'transfer'
        then private.import_transfer_signature(
          target_user_id,
          target_account_id,
          staging.transfer_account_id,
          staging.transaction_date,
          abs(staging.signed_amount_minor)
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
      transfer_accounts.id is not null
        and transfer_accounts.id <> target_account_id
        and transfer_accounts.currency = target_account_currency
        as transfer_account_is_valid,
      signatures.transaction_id as signature_transaction_id,
      signatures.transfer_id as signature_transfer_id,
      existing_transaction.id as matching_transaction_id,
      existing_transfer.id as matching_transfer_id,
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
      and categories.kind = computed.computed_type
      and categories.archived_at is null
    left join public.accounts transfer_accounts
      on transfer_accounts.id = computed.transfer_account_id
      and transfer_accounts.user_id = target_user_id
      and transfer_accounts.archived_at is null
    left join public.imported_transaction_signatures signatures
      on signatures.user_id = target_user_id
      and signatures.signature = computed.computed_signature
    left join lateral (
      select transactions.id
      from public.transactions
      where computed.record_kind = 'transaction'
        and transactions.user_id = target_user_id
        and transactions.account_id = target_account_id
        and transactions.transaction_date = computed.transaction_date
        and transactions.transaction_type = computed.computed_type
        and transactions.amount_minor = computed.computed_amount
        and private.normalize_import_description(transactions.description)
          = computed.computed_description
      order by transactions.created_at
      limit 1
    ) existing_transaction on true
    left join lateral (
      select transfers.id
      from public.transfers
      where computed.record_kind = 'transfer'
        and transfers.user_id = target_user_id
        and transfers.transaction_date = computed.transaction_date
        and transfers.amount_minor = computed.computed_amount
        and transfers.is_active
        and (
          (
            computed.signed_amount_minor < 0
            and transfers.source_account_id = target_account_id
            and transfers.destination_account_id = computed.transfer_account_id
          )
          or (
            computed.signed_amount_minor > 0
            and transfers.source_account_id = computed.transfer_account_id
            and transfers.destination_account_id = target_account_id
          )
        )
      order by transfers.created_at
      limit 1
    ) existing_transfer on true
  )
  update public.import_staging_rows staging
  set
    account_id = target_account_id,
    normalized_description = nullif(evaluated.computed_description, ''),
    transaction_type = case
      when evaluated.record_kind = 'transaction'
      then evaluated.computed_type
    end,
    amount_minor = evaluated.computed_amount,
    signature = evaluated.computed_signature,
    duplicate_transaction_id = coalesce(
      evaluated.signature_transaction_id,
      evaluated.matching_transaction_id
    ),
    duplicate_transfer_id = coalesce(
      evaluated.signature_transfer_id,
      evaluated.matching_transfer_id
    ),
    status = case
      when evaluated.validation_code is not null
        or evaluated.transaction_date is null
        or evaluated.signed_amount_minor is null
        or evaluated.signed_amount_minor = 0
        or nullif(trim(evaluated.description), '') is null
      then 'error'
      when target_account_id is null
      then 'needs_review'
      when evaluated.record_kind = 'transaction'
        and not evaluated.category_is_valid
      then 'needs_review'
      when evaluated.record_kind = 'transfer'
        and not evaluated.transfer_account_is_valid
      then 'needs_review'
      when evaluated.signature_transaction_id is not null
        or evaluated.signature_transfer_id is not null
        or evaluated.matching_transaction_id is not null
        or evaluated.matching_transfer_id is not null
        or evaluated.duplicate_inside_job
      then 'duplicate'
      when not evaluated.is_selected then 'ignored'
      else 'valid'
    end,
    is_selected = case
      when evaluated.signature_transaction_id is not null
        or evaluated.signature_transfer_id is not null
        or evaluated.matching_transaction_id is not null
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

create or replace function private.create_import_job(
  target_file_name text,
  target_file_type text,
  target_file_sha256 text,
  target_csv_config jsonb,
  target_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_job_id uuid;
  target_row_count integer;
  target_source_adapter_id text;
  target_source_document_type text;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(target_file_name, ''))) not between 1 and 255
    or target_file_type not in ('csv', 'ofx', 'qif', 'pdf')
    or target_file_sha256 !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(target_rows) <> 'array'
  then
    raise exception 'invalid_import_file' using errcode = '22023';
  end if;

  target_row_count := jsonb_array_length(target_rows);
  if target_row_count not between 1 and 5000 then
    raise exception 'invalid_import_row_count' using errcode = '22023';
  end if;

  if (target_file_type = 'csv') <> (target_csv_config is not null) then
    raise exception 'invalid_csv_configuration' using errcode = '22023';
  end if;

  if target_file_type = 'pdf' then
    target_source_adapter_id :=
      nullif(trim(target_rows -> 0 ->> 'source_adapter_id'), '');
    target_source_document_type :=
      nullif(trim(target_rows -> 0 ->> 'source_document_type'), '');

    if target_source_adapter_id is null
      or char_length(target_source_adapter_id) > 120
      or target_source_document_type is null
      or char_length(target_source_document_type) > 80
      or exists (
        select 1
        from jsonb_array_elements(target_rows) as source_row
        where nullif(
          trim(source_row ->> 'source_description_original'),
          ''
        ) is null
          or jsonb_typeof(source_row -> 'source_pages') <> 'array'
          or jsonb_array_length(source_row -> 'source_pages') = 0
          or nullif(trim(source_row ->> 'confidence'), '') is null
          or (source_row ->> 'confidence')::numeric not between 0 and 1
          or source_row ->> 'source_adapter_id'
            is distinct from target_source_adapter_id
          or source_row ->> 'source_document_type'
            is distinct from target_source_document_type
      )
    then
      raise exception 'invalid_pdf_adapter_result' using errcode = '22023';
    end if;
  end if;

  if target_file_type = 'qif'
    and exists (
      select 1
      from jsonb_array_elements(target_rows) source_row
      where coalesce(source_row ->> 'record_kind', 'transaction')
        not in ('transaction', 'transfer')
        or (
          source_row ->> 'record_kind' = 'transfer'
          and nullif(trim(source_row ->> 'transfer_account_name'), '') is null
        )
    )
  then
    raise exception 'invalid_qif_rows' using errcode = '22023';
  end if;

  insert into public.import_jobs (
    user_id,
    file_name,
    file_type,
    file_sha256,
    csv_config,
    source_adapter_id,
    source_document_type,
    status,
    source_row_count,
    original_file_discarded_at
  )
  values (
    current_user_id,
    trim(target_file_name),
    target_file_type,
    target_file_sha256,
    target_csv_config,
    target_source_adapter_id,
    target_source_document_type,
    'review',
    target_row_count,
    now()
  )
  returning id into new_job_id;

  insert into public.import_staging_rows (
    job_id,
    user_id,
    source_row_number,
    source_external_id,
    source_date_text,
    source_amount_text,
    source_description_original,
    source_pages,
    confidence,
    transaction_date,
    description,
    signed_amount_minor,
    validation_code,
    record_kind,
    source_category_name,
    transfer_account_name
  )
  select
    new_job_id,
    current_user_id,
    rows.source_row_number,
    nullif(left(trim(rows.source_external_id), 180), ''),
    left(coalesce(rows.source_date_text, ''), 80),
    left(coalesce(rows.source_amount_text, ''), 80),
    nullif(left(rows.source_description_original, 1000), ''),
    case
      when jsonb_typeof(rows.source_pages) = 'array'
      then array(
        select jsonb_array_elements_text(rows.source_pages)::integer
      )
      else '{}'
    end,
    rows.confidence,
    rows.transaction_date,
    nullif(left(trim(rows.description), 180), ''),
    rows.signed_amount_minor,
    rows.validation_code,
    coalesce(rows.record_kind, 'transaction'),
    nullif(left(trim(rows.source_category_name), 180), ''),
    nullif(left(trim(rows.transfer_account_name), 180), '')
  from jsonb_to_recordset(target_rows) as rows(
    source_row_number integer,
    source_external_id text,
    source_date_text text,
    source_amount_text text,
    source_description_original text,
    source_pages jsonb,
    confidence numeric,
    transaction_date date,
    description text,
    signed_amount_minor bigint,
    validation_code text,
    record_kind text,
    source_category_name text,
    transfer_account_name text
  );

  if (
    select count(*)
    from public.import_staging_rows
    where job_id = new_job_id
  ) <> target_row_count then
    raise exception 'invalid_import_rows' using errcode = '22023';
  end if;

  perform private.refresh_import_job(new_job_id, current_user_id);
  return new_job_id;
end;
$$;

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

  if not exists (
    select 1
    from public.accounts
    where id = target_account_id
      and user_id = current_user_id
      and archived_at is null
  ) then
    raise exception 'invalid_import_account' using errcode = '23503';
  end if;

  update public.import_jobs
  set account_id = target_account_id
  where id = target_job_id
    and user_id = current_user_id
    and status in ('review', 'ready');

  if not found then
    raise exception 'import_job_not_editable' using errcode = 'P0002';
  end if;

  update public.import_staging_rows staging
  set category_id = (
    select categories.id
    from public.categories categories
    where categories.user_id = current_user_id
      and categories.archived_at is null
      and categories.kind = case
        when staging.signed_amount_minor > 0 then 'income'
        else 'expense'
      end::public.transaction_kind
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
  where staging.job_id = target_job_id
    and staging.user_id = current_user_id
    and coalesce(staging.record_kind, 'transaction') = 'transaction'
    and staging.category_id is null
    and staging.source_category_name is not null;

  update public.import_staging_rows staging
  set transfer_account_id = (
    select candidate.id
    from public.accounts source_account
    join public.accounts candidate
      on candidate.user_id = source_account.user_id
      and candidate.currency = source_account.currency
    where source_account.id = target_account_id
      and source_account.user_id = current_user_id
      and candidate.id <> target_account_id
      and candidate.archived_at is null
      and lower(trim(candidate.name))
        = lower(trim(staging.transfer_account_name))
    order by candidate.created_at
    limit 1
  )
  where staging.job_id = target_job_id
    and staging.user_id = current_user_id
    and staging.record_kind = 'transfer'
    and staging.transfer_account_id is null;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return true;
end;
$$;

create or replace function private.map_import_qif_category(
  target_job_id uuid,
  target_source_category_name text,
  target_transaction_type public.transaction_kind,
  target_category_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  updated_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_transaction_type not in ('income', 'expense')
    or nullif(trim(target_source_category_name), '') is null
    or not exists (
      select 1
      from public.categories
      where id = target_category_id
        and user_id = current_user_id
        and kind = target_transaction_type
        and archived_at is null
    )
  then
    raise exception 'invalid_import_category' using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.import_jobs
    where id = target_job_id
      and user_id = current_user_id
      and file_type = 'qif'
      and status in ('review', 'ready')
  ) then
    raise exception 'import_job_not_editable' using errcode = 'P0002';
  end if;

  update public.import_staging_rows
  set category_id = target_category_id, is_selected = true
  where job_id = target_job_id
    and user_id = current_user_id
    and record_kind = 'transaction'
    and source_category_name = target_source_category_name
    and case
      when signed_amount_minor > 0 then 'income'
      else 'expense'
    end::public.transaction_kind = target_transaction_type;
  get diagnostics updated_count = row_count;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return updated_count;
end;
$$;

create or replace function private.map_import_qif_transfer_account(
  target_job_id uuid,
  target_source_account_name text,
  target_account_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  source_account_id uuid;
  source_currency char(3);
  updated_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select jobs.account_id, accounts.currency
  into source_account_id, source_currency
  from public.import_jobs jobs
  join public.accounts accounts
    on accounts.id = jobs.account_id
    and accounts.user_id = jobs.user_id
  where jobs.id = target_job_id
    and jobs.user_id = current_user_id
    and jobs.file_type = 'qif'
    and jobs.status in ('review', 'ready')
  for update of jobs;

  if not found then
    raise exception 'import_job_not_editable' using errcode = 'P0002';
  end if;
  if nullif(trim(target_source_account_name), '') is null
    or not exists (
      select 1
      from public.accounts
      where id = target_account_id
        and user_id = current_user_id
        and id <> source_account_id
        and currency = source_currency
        and archived_at is null
    )
  then
    raise exception 'invalid_import_transfer_account' using errcode = '23503';
  end if;

  update public.import_staging_rows
  set transfer_account_id = target_account_id, is_selected = true
  where job_id = target_job_id
    and user_id = current_user_id
    and record_kind = 'transfer'
    and transfer_account_name = target_source_account_name;
  get diagnostics updated_count = row_count;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return updated_count;
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
    and staging.record_kind = 'transfer'
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
    select *
    from public.import_staging_rows
    where job_id = target_job_id
      and user_id = current_user_id
      and status = 'valid'
      and is_selected
    order by source_row_number
    for update
  loop
    if coalesce(staging_record.record_kind, 'transaction') = 'transfer' then
      if staging_record.signed_amount_minor < 0 then
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
      )
      values (
        current_user_id, job_record.account_id, new_transfer_id,
        target_job_id, staging_record.signature
      );
    else
      insert into public.transactions (
        user_id, account_id, category_id, transaction_type, description,
        amount_minor, transaction_date, status, notes
      )
      values (
        current_user_id, job_record.account_id, staging_record.category_id,
        staging_record.transaction_type, staging_record.description,
        staging_record.amount_minor, staging_record.transaction_date,
        'completed', null
      )
      returning id into new_transaction_id;

      insert into public.imported_transaction_signatures (
        user_id, account_id, transaction_id, source_job_id, signature
      )
      values (
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
  set
    status = 'completed',
    imported_row_count = imported_count,
    confirmed_at = now()
  where id = target_job_id and user_id = current_user_id;

  delete from public.import_staging_rows
  where job_id = target_job_id and user_id = current_user_id;

  return imported_count;
end;
$$;

create or replace function public.map_import_qif_category(
  target_job_id uuid,
  target_source_category_name text,
  target_transaction_type public.transaction_kind,
  target_category_id uuid
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.map_import_qif_category(
    target_job_id,
    target_source_category_name,
    target_transaction_type,
    target_category_id
  );
$$;

create or replace function public.map_import_qif_transfer_account(
  target_job_id uuid,
  target_source_account_name text,
  target_account_id uuid
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.map_import_qif_transfer_account(
    target_job_id,
    target_source_account_name,
    target_account_id
  );
$$;

create or replace function public.update_import_transfer_row(
  target_row_id uuid,
  target_transaction_date date,
  target_description text,
  target_signed_amount_minor bigint,
  target_transfer_account_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_import_transfer_row(
    target_row_id,
    target_transaction_date,
    target_description,
    target_signed_amount_minor,
    target_transfer_account_id
  );
$$;

revoke all on function private.import_transfer_signature(
  uuid, uuid, uuid, date, bigint
) from public, anon, authenticated;
revoke all on function private.validate_import_staging_owner()
from public, anon, authenticated;
revoke all on function private.validate_import_signature_owner()
from public, anon, authenticated;
revoke all on function private.map_import_qif_category(
  uuid, text, public.transaction_kind, uuid
) from public, anon, authenticated;
revoke all on function private.map_import_qif_transfer_account(
  uuid, text, uuid
) from public, anon, authenticated;
revoke all on function private.update_import_transfer_row(
  uuid, date, text, bigint, uuid
) from public, anon, authenticated;

grant execute on function private.map_import_qif_category(
  uuid, text, public.transaction_kind, uuid
) to authenticated;
grant execute on function private.map_import_qif_transfer_account(
  uuid, text, uuid
) to authenticated;
grant execute on function private.update_import_transfer_row(
  uuid, date, text, bigint, uuid
) to authenticated;

revoke all on function public.map_import_qif_category(
  uuid, text, public.transaction_kind, uuid
) from public, anon;
revoke all on function public.map_import_qif_transfer_account(
  uuid, text, uuid
) from public, anon;
revoke all on function public.update_import_transfer_row(
  uuid, date, text, bigint, uuid
) from public, anon;

grant execute on function public.map_import_qif_category(
  uuid, text, public.transaction_kind, uuid
) to authenticated;
grant execute on function public.map_import_qif_transfer_account(
  uuid, text, uuid
) to authenticated;
grant execute on function public.update_import_transfer_row(
  uuid, date, text, bigint, uuid
) to authenticated;

comment on column public.import_staging_rows.record_kind is
  'QIF staging kind. Null in legacy backups is treated as transaction.';
comment on column public.import_staging_rows.source_category_name is
  'Original QIF category preserved for explicit bulk mapping.';
comment on column public.import_staging_rows.transfer_account_name is
  'Original QIF bracketed account name preserved for explicit mapping.';
comment on column public.import_staging_rows.transfer_account_id is
  'User-owned MeuMoney account mapped to a QIF transfer counterpart.';
