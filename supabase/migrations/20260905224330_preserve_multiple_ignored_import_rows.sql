-- Preserve every row explicitly ignored by the user while the import job is
-- recalculated after another row is edited, ignored, or re-included.
alter function private.refresh_import_job(uuid, uuid)
rename to refresh_import_job_before_persistent_ignored_rows;

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
  ignored_row_ids uuid[];
begin
  select coalesce(
    array_agg(staging.id order by staging.source_row_number),
    '{}'::uuid[]
  )
  into ignored_row_ids
  from public.import_staging_rows staging
  where staging.job_id = target_job_id
    and staging.user_id = target_user_id
    and staging.status = 'ignored'
    and not staging.is_selected;

  perform private.refresh_import_job_before_persistent_ignored_rows(
    target_job_id,
    target_user_id
  );

  if cardinality(ignored_row_ids) > 0 then
    update public.import_staging_rows
    set status = 'ignored',
        is_selected = false
    where job_id = target_job_id
      and user_id = target_user_id
      and id = any(ignored_row_ids);
  end if;
end;
$$;

revoke all on function private.refresh_import_job_before_persistent_ignored_rows(
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function private.refresh_import_job(uuid, uuid)
from public, anon, authenticated;

comment on function private.refresh_import_job(uuid, uuid) is
  'Recalculates an import job while preserving every row explicitly ignored by its owner.';
