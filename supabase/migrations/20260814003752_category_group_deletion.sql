-- Permanently delete an owned category group, atomically moving its complete
-- category hierarchy to a compatible active group when required.

create or replace function private.delete_category_group_with_replacement(
  target_group_id uuid,
  replacement_group_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_group public.category_groups%rowtype;
  replacement_group public.category_groups%rowtype;
  category_count bigint;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform 1
  from public.category_groups as category_group
  where category_group.user_id = current_user_id
    and category_group.id in (target_group_id, replacement_group_id)
  order by category_group.id
  for update;

  select * into target_group
  from public.category_groups
  where id = target_group_id
    and user_id = current_user_id;

  if not found then
    raise exception 'category_group_not_found' using errcode = 'P0002';
  end if;

  select count(*) into category_count
  from public.categories
  where user_id = current_user_id
    and group_id = target_group_id;

  if category_count > 0 and replacement_group_id is null then
    raise exception 'category_group_replacement_required'
      using errcode = '23503';
  end if;

  if replacement_group_id is not null then
    select * into replacement_group
    from public.category_groups
    where id = replacement_group_id
      and user_id = current_user_id;

    if not found
      or replacement_group.id = target_group.id
      or replacement_group.kind <> target_group.kind
      or replacement_group.context <> target_group.context
      or replacement_group.archived_at is not null
    then
      raise exception 'invalid_replacement_category_group'
        using errcode = '23503';
    end if;

    if exists (
      select 1
      from public.categories as source_category
      join public.categories as destination_category
        on destination_category.user_id = current_user_id
       and destination_category.group_id = replacement_group_id
       and destination_category.parent_id is null
       and lower(btrim(destination_category.name))
         = lower(btrim(source_category.name))
      where source_category.user_id = current_user_id
        and source_category.group_id = target_group_id
        and source_category.parent_id is null
    ) then
      raise exception 'category_group_name_conflict' using errcode = '23505';
    end if;

    update public.categories
    set group_id = replacement_group_id
    where user_id = current_user_id
      and group_id = target_group_id
      and parent_id is null;

    -- Parents move first so the hierarchy trigger always sees parent and child
    -- in the same destination group while direct subcategories are updated.
    update public.categories
    set group_id = replacement_group_id
    where user_id = current_user_id
      and group_id = target_group_id;
  end if;

  delete from public.category_groups
  where id = target_group_id
    and user_id = current_user_id;

  return true;
end;
$$;

create or replace function public.delete_category_group_with_replacement(
  target_group_id uuid,
  replacement_group_id uuid default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.delete_category_group_with_replacement(
    target_group_id,
    replacement_group_id
  );
$$;

revoke all on function private.delete_category_group_with_replacement(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function private.delete_category_group_with_replacement(
  uuid, uuid
) to authenticated;

revoke all on function public.delete_category_group_with_replacement(
  uuid, uuid
) from public, anon;
grant execute on function public.delete_category_group_with_replacement(
  uuid, uuid
) to authenticated;

comment on function private.delete_category_group_with_replacement(
  uuid, uuid
) is
  'Owner-scoped permanent category-group deletion with atomic hierarchy reassignment.';
comment on function public.delete_category_group_with_replacement(
  uuid, uuid
) is
  'Deletes an owned category group and moves its categories to a compatible group when required.';
