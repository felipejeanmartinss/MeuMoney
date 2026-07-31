create or replace function private.clear_cancelled_import_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  deleted_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  delete from public.import_jobs
  where user_id = current_user_id
    and status = 'cancelled';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.clear_cancelled_import_jobs()
from public, anon, authenticated;
grant execute on function private.clear_cancelled_import_jobs()
to authenticated;

create or replace function public.clear_cancelled_import_jobs()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.clear_cancelled_import_jobs();
$$;

revoke all on function public.clear_cancelled_import_jobs()
from public, anon;
grant execute on function public.clear_cancelled_import_jobs()
to authenticated;

comment on function public.clear_cancelled_import_jobs() is
  'Permanently removes only cancelled import jobs owned by the authenticated user.';
