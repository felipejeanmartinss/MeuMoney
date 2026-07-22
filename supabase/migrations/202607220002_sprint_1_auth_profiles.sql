alter table public.profiles rename column display_name to full_name;

update public.profiles as profiles
set full_name = coalesce(nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''), '')
from auth.users as users
where users.id = profiles.id and profiles.full_name is null;

alter table public.profiles alter column full_name set default '';
alter table public.profiles alter column full_name set not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (id, full_name)
select users.id, coalesce(nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''), '')
from auth.users as users
where not exists (select 1 from public.profiles where profiles.id = users.id);

drop policy if exists "profiles_owner_all" on public.profiles;
create policy "profiles_owner_select" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_owner_update" on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

revoke all on table public.profiles from anon, authenticated;
grant select, update (full_name) on table public.profiles to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
