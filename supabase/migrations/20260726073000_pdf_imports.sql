alter table public.import_jobs
  drop constraint if exists import_jobs_file_type_check,
  drop constraint if exists import_jobs_check;

alter table public.import_jobs
  add column source_adapter_id text,
  add column source_document_type text,
  add constraint import_jobs_file_type_supported_check
    check (file_type in ('csv', 'ofx', 'pdf')),
  add constraint import_jobs_parser_config_check
    check (
      (file_type = 'csv' and csv_config is not null)
      or (file_type in ('ofx', 'pdf') and csv_config is null)
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
  add column source_description_original text
    check (
      source_description_original is null
      or char_length(source_description_original) between 1 and 1000
    ),
  add column source_pages integer[] not null default '{}'
    check (
      array_position(source_pages, null) is null
      and 0 < all(source_pages)
    ),
  add column confidence numeric(4, 3)
    check (confidence is null or confidence between 0 and 1);

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
    or target_file_type not in ('csv', 'ofx', 'pdf')
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
    validation_code
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
    rows.validation_code
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

comment on column public.import_jobs.source_adapter_id is
  'Versioned PDF adapter identifier. Null for CSV and OFX imports.';
comment on column public.import_jobs.source_document_type is
  'Document type recognized by the selected PDF adapter.';
comment on column public.import_staging_rows.source_description_original is
  'Original description extracted from the source PDF before user correction.';
comment on column public.import_staging_rows.source_pages is
  'One-based PDF pages that originated this staging row.';
comment on column public.import_staging_rows.confidence is
  'Adapter confidence from zero to one; never bypasses explicit review.';
