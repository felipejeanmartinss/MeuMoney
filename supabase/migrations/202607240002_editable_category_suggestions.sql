-- Initial categories are user-owned suggestions. The is_system flag records
-- their origin, but it must not make them immutable.

drop policy if exists "categories_owner_update_custom" on public.categories;
drop policy if exists "categories_owner_update" on public.categories;

create policy "categories_owner_update" on public.categories
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

comment on column public.categories.is_system is
'True when the category came from the initial suggestion set; it does not restrict owner edits.';
