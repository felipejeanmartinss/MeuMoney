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

  if target_ignored then
    update public.import_staging_rows
    set status = 'ignored'
    where id = target_row_id
      and user_id = current_user_id
      and not is_selected;
  end if;

  return true;
end;
$$;

revoke all on function private.set_import_staging_row_ignored(uuid, boolean)
from public, anon;
grant execute on function private.set_import_staging_row_ignored(uuid, boolean)
to authenticated;

comment on function private.set_import_staging_row_ignored(uuid, boolean) is
  'Excludes a staging row from review and confirmation, or re-evaluates it when selected again.';
