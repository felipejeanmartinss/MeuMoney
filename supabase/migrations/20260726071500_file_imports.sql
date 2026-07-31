create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete restrict,
  file_name text not null
    check (char_length(trim(file_name)) between 1 and 255),
  file_type text not null check (file_type in ('csv', 'ofx')),
  file_sha256 char(64) not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  csv_config jsonb,
  status text not null default 'review'
    check (status in ('review', 'ready', 'completed', 'cancelled', 'failed')),
  source_row_count integer not null default 0 check (source_row_count >= 0),
  valid_row_count integer not null default 0 check (valid_row_count >= 0),
  duplicate_row_count integer not null default 0 check (duplicate_row_count >= 0),
  imported_row_count integer not null default 0 check (imported_row_count >= 0),
  original_file_discarded_at timestamptz not null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (
    (file_type = 'csv' and csv_config is not null)
    or (file_type = 'ofx' and csv_config is null)
  )
);

create table public.import_staging_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  user_id uuid not null,
  source_row_number integer not null check (source_row_number > 0),
  source_external_id text
    check (source_external_id is null or char_length(source_external_id) <= 180),
  source_date_text text not null default ''
    check (char_length(source_date_text) <= 80),
  source_amount_text text not null default ''
    check (char_length(source_amount_text) <= 80),
  transaction_date date,
  description text
    check (description is null or char_length(trim(description)) between 1 and 180),
  normalized_description text
    check (
      normalized_description is null
      or char_length(normalized_description) between 1 and 180
    ),
  signed_amount_minor bigint
    check (
      signed_amount_minor is null
      or signed_amount_minor between -9007199254740991 and 9007199254740991
        and signed_amount_minor <> 0
    ),
  transaction_type public.transaction_kind
    check (transaction_type is null or transaction_type in ('income', 'expense')),
  amount_minor bigint
    check (
      amount_minor is null
      or amount_minor between 1 and 9007199254740991
    ),
  account_id uuid references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete restrict,
  signature char(64) check (signature is null or signature ~ '^[0-9a-f]{64}$'),
  status text not null default 'needs_review'
    check (
      status in (
        'needs_review',
        'valid',
        'duplicate',
        'ignored',
        'imported',
        'error'
      )
    ),
  validation_code text
    check (
      validation_code is null
      or validation_code in (
        'invalid_date',
        'invalid_amount',
        'missing_description',
        'unsupported_record'
      )
    ),
  duplicate_transaction_id uuid references public.transactions(id) on delete set null,
  is_selected boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, source_row_number),
  foreign key (job_id, user_id)
    references public.import_jobs(id, user_id)
    on delete cascade
);

create table public.imported_transaction_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  transaction_id uuid not null unique
    references public.transactions(id) on delete cascade,
  source_job_id uuid references public.import_jobs(id) on delete set null,
  signature char(64) not null check (signature ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (user_id, signature)
);

create index import_jobs_user_created_idx
on public.import_jobs (user_id, created_at desc);

create index import_jobs_account_idx
on public.import_jobs (account_id)
where account_id is not null;

create index import_staging_rows_job_status_idx
on public.import_staging_rows (job_id, status, source_row_number);

create index import_staging_rows_user_account_idx
on public.import_staging_rows (user_id, account_id);

create index import_staging_rows_account_idx
on public.import_staging_rows (account_id)
where account_id is not null;

create index import_staging_rows_category_idx
on public.import_staging_rows (category_id);

create index import_staging_rows_duplicate_transaction_idx
on public.import_staging_rows (duplicate_transaction_id)
where duplicate_transaction_id is not null;

create index imported_signatures_account_idx
on public.imported_transaction_signatures (account_id, created_at desc);

create index imported_signatures_source_job_idx
on public.imported_transaction_signatures (source_job_id)
where source_job_id is not null;

create trigger import_jobs_set_updated_at
before update on public.import_jobs
for each row execute procedure public.set_updated_at();

create trigger import_staging_rows_set_updated_at
before update on public.import_staging_rows
for each row execute procedure public.set_updated_at();

alter table public.import_jobs enable row level security;
alter table public.import_staging_rows enable row level security;
alter table public.imported_transaction_signatures enable row level security;

create policy "import_jobs_owner_select"
on public.import_jobs for select to authenticated
using ((select auth.uid()) = user_id);

create policy "import_staging_rows_owner_select"
on public.import_staging_rows for select to authenticated
using ((select auth.uid()) = user_id);

create policy "imported_signatures_owner_select"
on public.imported_transaction_signatures for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.import_jobs from public, anon, authenticated;
revoke all on table public.import_staging_rows from public, anon, authenticated;
revoke all on table public.imported_transaction_signatures
from public, anon, authenticated;

grant select on table public.import_jobs to authenticated;
grant select on table public.import_staging_rows to authenticated;
grant select on table public.imported_transaction_signatures to authenticated;

create or replace function private.normalize_import_description(value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

create or replace function private.import_transaction_signature(
  target_user_id uuid,
  target_account_id uuid,
  target_transaction_date date,
  target_signed_amount_minor bigint,
  target_description text
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
          target_account_id::text,
          target_transaction_date::text,
          target_signed_amount_minor::text,
          private.normalize_import_description(target_description)
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
  next_status text;
  valid_count integer;
  duplicate_count integer;
begin
  select account_id into target_account_id
  from public.import_jobs
  where id = target_job_id
    and user_id = target_user_id
    and status in ('review', 'ready')
  for update;

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
        then private.import_transaction_signature(
          target_user_id,
          target_account_id,
          staging.transaction_date,
          staging.signed_amount_minor,
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
      signatures.transaction_id as signature_transaction_id,
      existing_transaction.id as matching_transaction_id,
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
    left join public.imported_transaction_signatures signatures
      on signatures.user_id = target_user_id
      and signatures.signature = computed.computed_signature
    left join lateral (
      select transactions.id
      from public.transactions
      where transactions.user_id = target_user_id
        and transactions.account_id = target_account_id
        and transactions.transaction_date = computed.transaction_date
        and transactions.transaction_type = computed.computed_type
        and transactions.amount_minor = computed.computed_amount
        and private.normalize_import_description(transactions.description)
          = computed.computed_description
      order by transactions.created_at
      limit 1
    ) existing_transaction on true
  )
  update public.import_staging_rows staging
  set
    account_id = target_account_id,
    normalized_description = nullif(evaluated.computed_description, ''),
    transaction_type = evaluated.computed_type,
    amount_minor = evaluated.computed_amount,
    signature = evaluated.computed_signature,
    duplicate_transaction_id = coalesce(
      evaluated.signature_transaction_id,
      evaluated.matching_transaction_id
    ),
    status = case
      when evaluated.validation_code is not null
        or evaluated.transaction_date is null
        or evaluated.signed_amount_minor is null
        or evaluated.signed_amount_minor = 0
        or nullif(trim(evaluated.description), '') is null
      then 'error'
      when target_account_id is null or not evaluated.category_is_valid
      then 'needs_review'
      when evaluated.signature_transaction_id is not null
        or evaluated.matching_transaction_id is not null
        or evaluated.duplicate_inside_job
      then 'duplicate'
      when not evaluated.is_selected then 'ignored'
      else 'valid'
    end,
    is_selected = case
      when evaluated.signature_transaction_id is not null
        or evaluated.matching_transaction_id is not null
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
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(target_file_name, ''))) not between 1 and 255
    or target_file_type not in ('csv', 'ofx')
    or target_file_sha256 !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(target_rows) <> 'array'
  then
    raise exception 'invalid_import_file' using errcode = '22023';
  end if;

  target_row_count := jsonb_array_length(target_rows);
  if target_row_count not between 1 and 1000 then
    raise exception 'invalid_import_row_count' using errcode = '22023';
  end if;

  if (target_file_type = 'csv') <> (target_csv_config is not null) then
    raise exception 'invalid_csv_configuration' using errcode = '22023';
  end if;

  insert into public.import_jobs (
    user_id,
    file_name,
    file_type,
    file_sha256,
    csv_config,
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
    transaction_date,
    description,
    signed_amount_minor,
    validation_code
  )
  select
    new_job_id,
    current_user_id,
    rows.source_row_number,
    nullif(left(trim(rows.source_external_id), 180), ''),
    left(coalesce(rows.source_date_text, ''), 80),
    left(coalesce(rows.source_amount_text, ''), 80),
    rows.transaction_date,
    nullif(left(trim(rows.description), 180), ''),
    rows.signed_amount_minor,
    rows.validation_code
  from jsonb_to_recordset(target_rows) as rows(
    source_row_number integer,
    source_external_id text,
    source_date_text text,
    source_amount_text text,
    transaction_date date,
    description text,
    signed_amount_minor bigint,
    validation_code text
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

  perform private.refresh_import_job(target_job_id, current_user_id);
  return true;
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
    transaction_date = target_transaction_date,
    description = trim(target_description),
    signed_amount_minor = target_signed_amount_minor,
    category_id = target_category_id,
    validation_code = null,
    is_selected = true
  where id = target_row_id
    and user_id = current_user_id;

  perform private.refresh_import_job(target_job_id, current_user_id);
  return true;
end;
$$;

create or replace function private.set_import_staging_row_ignored(
  target_row_id uuid,
  target_ignored boolean
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
  set is_selected = not target_ignored
  where id = target_row_id
    and user_id = current_user_id;

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
    insert into public.transactions (
      user_id,
      account_id,
      category_id,
      transaction_type,
      description,
      amount_minor,
      transaction_date,
      status,
      notes
    )
    values (
      current_user_id,
      job_record.account_id,
      staging_record.category_id,
      staging_record.transaction_type,
      staging_record.description,
      staging_record.amount_minor,
      staging_record.transaction_date,
      'completed',
      null
    )
    returning id into new_transaction_id;

    insert into public.imported_transaction_signatures (
      user_id,
      account_id,
      transaction_id,
      source_job_id,
      signature
    )
    values (
      current_user_id,
      job_record.account_id,
      new_transaction_id,
      target_job_id,
      staging_record.signature
    );

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
  where id = target_job_id
    and user_id = current_user_id;

  delete from public.import_staging_rows
  where job_id = target_job_id
    and user_id = current_user_id;

  return imported_count;
end;
$$;

create or replace function private.cancel_import_job(target_job_id uuid)
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
  set status = 'cancelled', cancelled_at = now()
  where id = target_job_id
    and user_id = current_user_id
    and status in ('review', 'ready');

  if not found then
    raise exception 'import_job_not_cancellable' using errcode = 'P0002';
  end if;

  delete from public.import_staging_rows
  where job_id = target_job_id
    and user_id = current_user_id;

  return true;
end;
$$;

revoke all on function private.normalize_import_description(text)
from public, anon, authenticated;
revoke all on function private.import_transaction_signature(
  uuid, uuid, date, bigint, text
) from public, anon, authenticated;
revoke all on function private.refresh_import_job(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.create_import_job(
  text, text, text, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function private.configure_import_job(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.update_import_staging_row(
  uuid, date, text, bigint, uuid
) from public, anon, authenticated;
revoke all on function private.set_import_staging_row_ignored(uuid, boolean)
from public, anon, authenticated;
revoke all on function private.confirm_import_job(uuid)
from public, anon, authenticated;
revoke all on function private.cancel_import_job(uuid)
from public, anon, authenticated;

grant execute on function private.create_import_job(
  text, text, text, jsonb, jsonb
) to authenticated;
grant execute on function private.configure_import_job(uuid, uuid)
to authenticated;
grant execute on function private.update_import_staging_row(
  uuid, date, text, bigint, uuid
) to authenticated;
grant execute on function private.set_import_staging_row_ignored(uuid, boolean)
to authenticated;
grant execute on function private.confirm_import_job(uuid)
to authenticated;
grant execute on function private.cancel_import_job(uuid)
to authenticated;

create or replace function public.create_import_job(
  target_file_name text,
  target_file_type text,
  target_file_sha256 text,
  target_csv_config jsonb,
  target_rows jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_import_job(
    target_file_name,
    target_file_type,
    target_file_sha256,
    target_csv_config,
    target_rows
  );
$$;

create or replace function public.configure_import_job(
  target_job_id uuid,
  target_account_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.configure_import_job(target_job_id, target_account_id);
$$;

create or replace function public.update_import_staging_row(
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
  select private.update_import_staging_row(
    target_row_id,
    target_transaction_date,
    target_description,
    target_signed_amount_minor,
    target_category_id
  );
$$;

create or replace function public.set_import_staging_row_ignored(
  target_row_id uuid,
  target_ignored boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_import_staging_row_ignored(target_row_id, target_ignored);
$$;

create or replace function public.confirm_import_job(target_job_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_import_job(target_job_id);
$$;

create or replace function public.cancel_import_job(target_job_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_import_job(target_job_id);
$$;

revoke all on function public.create_import_job(
  text, text, text, jsonb, jsonb
) from public, anon;
revoke all on function public.configure_import_job(uuid, uuid)
from public, anon;
revoke all on function public.update_import_staging_row(
  uuid, date, text, bigint, uuid
) from public, anon;
revoke all on function public.set_import_staging_row_ignored(uuid, boolean)
from public, anon;
revoke all on function public.confirm_import_job(uuid)
from public, anon;
revoke all on function public.cancel_import_job(uuid)
from public, anon;

grant execute on function public.create_import_job(
  text, text, text, jsonb, jsonb
) to authenticated;
grant execute on function public.configure_import_job(uuid, uuid)
to authenticated;
grant execute on function public.update_import_staging_row(
  uuid, date, text, bigint, uuid
) to authenticated;
grant execute on function public.set_import_staging_row_ignored(uuid, boolean)
to authenticated;
grant execute on function public.confirm_import_job(uuid)
to authenticated;
grant execute on function public.cancel_import_job(uuid)
to authenticated;

comment on table public.import_jobs is
  'Import metadata only. Original CSV/OFX bytes are discarded before this row is created.';
comment on table public.import_staging_rows is
  'Temporary normalized financial rows. Deleted atomically on confirmation or cancellation.';
comment on function public.confirm_import_job(uuid) is
  'Validates duplicates and imports every selected row in one database transaction.';
