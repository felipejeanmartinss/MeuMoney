-- Account-centric finance UX: editable category groups and investment types.

create table public.category_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind public.transaction_kind not null check (kind <> 'transfer'),
  context public.financial_context not null,
  is_system boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_groups_id_user_unique unique (id, user_id),
  constraint category_groups_owner_name_unique
    unique (user_id, name, kind, context)
);

create index category_groups_owner_list_idx
on public.category_groups (user_id, context, kind, archived_at, name);

create unique index category_groups_owner_normalized_name_unique_idx
on public.category_groups (user_id, kind, context, lower(btrim(name)));

create trigger category_groups_set_updated_at
before update on public.category_groups
for each row execute procedure public.set_updated_at();

alter table public.category_groups enable row level security;

create policy "category_groups_owner_select"
on public.category_groups for select to authenticated
using ((select auth.uid()) = user_id);

create policy "category_groups_owner_insert"
on public.category_groups for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "category_groups_owner_update"
on public.category_groups for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.category_groups from anon, authenticated;
grant select on table public.category_groups to authenticated;
grant insert (user_id, name, kind, context)
on table public.category_groups to authenticated;
grant update (name, kind, context, archived_at)
on table public.category_groups to authenticated;

insert into public.category_groups (user_id, name, kind, context, is_system)
select distinct
  category.user_id,
  case
    when category.context = 'personal' and category.kind = 'income'
      then 'Receitas pessoais'
    when category.context = 'personal' and category.kind = 'expense'
      then 'Vida pessoal'
    when category.context = 'professional' and category.kind = 'income'
      then 'Receitas profissionais'
    else 'Operação profissional'
  end,
  category.kind,
  category.context,
  true
from public.categories as category
on conflict (user_id, name, kind, context) do nothing;

alter table public.categories add column group_id uuid;

update public.categories as category
set group_id = category_group.id
from public.category_groups as category_group
where category_group.user_id = category.user_id
  and category_group.kind = category.kind
  and category_group.context = category.context;

alter table public.categories alter column group_id set not null;
alter table public.categories
  add constraint categories_group_owner_fkey
  foreign key (group_id, user_id)
  references public.category_groups(id, user_id)
  on delete restrict;

drop index if exists public.categories_user_hierarchy_name_unique_idx;
create unique index categories_user_hierarchy_name_unique_idx
on public.categories (
  user_id,
  group_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

drop index if exists public.categories_user_parent_idx;
create index categories_parent_owner_idx
on public.categories (parent_id, user_id)
where parent_id is not null;

create index categories_group_owner_idx
on public.categories (group_id, user_id, parent_id, archived_at);

create or replace function private.validate_category_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.user_id <> old.user_id
    or new.kind <> old.kind
    or new.context <> old.context
  ) and exists (
    select 1
    from public.categories category
    where category.group_id = old.id
      and category.user_id = old.user_id
  ) then
    raise exception 'category_group_classification_in_use' using errcode = '23514';
  end if;

  if new.archived_at is not null and exists (
    select 1
    from public.categories category
    where category.group_id = new.id
      and category.user_id = new.user_id
      and category.archived_at is null
  ) then
    raise exception 'category_group_has_active_categories' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_category_group()
from public, anon, authenticated;

create trigger category_groups_validate
before update of user_id, kind, context, archived_at
on public.category_groups
for each row execute procedure private.validate_category_group();

create or replace function private.validate_category_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_category public.categories%rowtype;
  selected_group public.category_groups%rowtype;
begin
  -- Backups created before category groups existed do not contain group_id.
  if new.group_id is null then
    select category_group.id into new.group_id
    from public.category_groups as category_group
    where category_group.user_id = new.user_id
      and category_group.kind = new.kind
      and category_group.context = new.context
      and category_group.archived_at is null
    order by category_group.is_system desc, category_group.created_at
    limit 1;
  end if;

  select * into selected_group
  from public.category_groups
  where id = new.group_id;

  if not found
    or selected_group.user_id <> new.user_id
    or selected_group.kind <> new.kind
    or selected_group.context <> new.context
    or selected_group.archived_at is not null
  then
    raise exception 'invalid_category_group' using errcode = '23503';
  end if;

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'category_cannot_parent_itself' using errcode = '23514';
    end if;

    if exists (
      select 1 from public.categories child
      where child.parent_id = new.id and child.user_id = new.user_id
    ) then
      raise exception 'category_with_children_cannot_be_nested'
        using errcode = '23514';
    end if;

    select * into parent_category
    from public.categories
    where id = new.parent_id;

    if not found
      or parent_category.user_id <> new.user_id
      or parent_category.group_id <> new.group_id
      or parent_category.kind <> new.kind
      or parent_category.context <> new.context
      or parent_category.parent_id is not null
      or parent_category.archived_at is not null
    then
      raise exception 'invalid_category_parent' using errcode = '23503';
    end if;
  end if;

  if new.archived_at is not null and exists (
    select 1 from public.categories child
    where child.parent_id = new.id
      and child.user_id = new.user_id
      and child.archived_at is null
  ) then
    raise exception 'category_has_active_subcategories' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists categories_validate_hierarchy on public.categories;
create trigger categories_validate_hierarchy
before insert or update of user_id, group_id, parent_id, kind, context, archived_at
on public.categories
for each row execute procedure private.validate_category_hierarchy();

grant insert (group_id) on table public.categories to authenticated;
grant update (group_id) on table public.categories to authenticated;

create or replace function public.seed_default_categories(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.category_groups (user_id, name, kind, context, is_system)
  values
    (target_user_id, 'Receitas pessoais', 'income', 'personal', true),
    (target_user_id, 'Vida pessoal', 'expense', 'personal', true),
    (target_user_id, 'Receitas profissionais', 'income', 'professional', true),
    (target_user_id, 'Operação profissional', 'expense', 'professional', true)
  on conflict (user_id, name, kind, context) do nothing;

  insert into public.categories (
    user_id, group_id, name, kind, context, is_system
  )
  select
    target_user_id,
    category_group.id,
    seed.name,
    seed.kind::public.transaction_kind,
    seed.context::public.financial_context,
    true
  from (values
    ('Salário', 'income', 'personal'),
    ('Benefícios', 'income', 'personal'),
    ('Rendimentos', 'income', 'personal'),
    ('Reembolsos', 'income', 'personal'),
    ('Outras receitas', 'income', 'personal'),
    ('Moradia', 'expense', 'personal'),
    ('Alimentação', 'expense', 'personal'),
    ('Transporte', 'expense', 'personal'),
    ('Saúde', 'expense', 'personal'),
    ('Educação e conhecimento', 'expense', 'personal'),
    ('Lazer e conforto', 'expense', 'personal'),
    ('Assinaturas e serviços', 'expense', 'personal'),
    ('Impostos e taxas', 'expense', 'personal'),
    ('Doações', 'expense', 'personal'),
    ('Outras despesas', 'expense', 'personal'),
    ('Vendas', 'income', 'professional'),
    ('Serviços prestados', 'income', 'professional'),
    ('Comissões', 'income', 'professional'),
    ('Outras receitas profissionais', 'income', 'professional'),
    ('Fornecedores', 'expense', 'professional'),
    ('Operação', 'expense', 'professional'),
    ('Marketing e vendas', 'expense', 'professional'),
    ('Ferramentas e sistemas', 'expense', 'professional'),
    ('Impostos profissionais', 'expense', 'professional'),
    ('Pró-labore', 'expense', 'professional'),
    ('Outras despesas profissionais', 'expense', 'professional')
  ) as seed(name, kind, context)
  join public.category_groups category_group
    on category_group.user_id = target_user_id
   and category_group.kind = seed.kind::public.transaction_kind
   and category_group.context = seed.context::public.financial_context
  on conflict do nothing;
end;
$$;

revoke all on function public.seed_default_categories(uuid)
from public, anon, authenticated;

alter table public.investment_positions
add column investment_type text;

update public.investment_positions
set investment_type = case investment_class
  when 'fixed_income' then 'other_fixed_income'
  when 'stock' then 'stock'
  when 'fund' then 'variable_fund'
  when 'etf' then 'etf'
  when 'real_estate_fund' then 'fii'
  when 'pension' then 'pension'
  when 'crypto' then 'crypto'
end;

create or replace function private.default_investment_position_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Backups created before product types existed contain only the class.
  if new.investment_type is null then
    new.investment_type := case new.investment_class
      when 'fixed_income' then 'other_fixed_income'
      when 'stock' then 'stock'
      when 'fund' then 'variable_fund'
      when 'etf' then 'etf'
      when 'real_estate_fund' then 'fii'
      when 'pension' then 'pension'
      when 'crypto' then 'crypto'
    end;
  end if;
  return new;
end;
$$;

revoke all on function private.default_investment_position_type()
from public, anon, authenticated;

create trigger investment_positions_default_type
before insert or update of investment_class, investment_type
on public.investment_positions
for each row execute procedure private.default_investment_position_type();

alter table public.investment_positions
alter column investment_type set not null;

alter table public.investment_positions
add constraint investment_positions_type_class_consistent check (
  (investment_class = 'fixed_income' and investment_type in (
    'treasury', 'cdb', 'lci_lca', 'debenture', 'other_fixed_income'
  ))
  or (investment_class = 'stock' and investment_type = 'stock')
  or (investment_class = 'fund' and investment_type = 'variable_fund')
  or (investment_class = 'etf' and investment_type = 'etf')
  or (investment_class = 'real_estate_fund' and investment_type = 'fii')
  or (investment_class = 'pension' and investment_type = 'pension')
  or (investment_class = 'crypto' and investment_type = 'crypto')
);

grant insert (investment_type)
on table public.investment_positions to authenticated;
grant update (investment_type)
on table public.investment_positions to authenticated;

create or replace view public.investment_position_summary
with (security_invoker = true)
as
select
  position.id,
  position.user_id,
  position.institution,
  position.investment_class,
  position.asset_name,
  position.currency,
  position.quantity,
  position.accumulated_cost_minor,
  position.current_value_minor,
  position.position_date,
  position.context,
  position.history_is_complete,
  position.notes,
  position.is_active,
  position.archived_at,
  position.created_at,
  position.updated_at,
  coalesce(
    sum(flow.amount_minor) filter (
      where flow.cash_flow_type = 'contribution'
    ), 0
  )::numeric(20, 0) as contributions_minor,
  coalesce(
    sum(flow.amount_minor) filter (
      where flow.cash_flow_type = 'redemption'
    ), 0
  )::numeric(20, 0) as redemptions_minor,
  coalesce(
    sum(flow.amount_minor) filter (
      where flow.cash_flow_type = 'income'
    ), 0
  )::numeric(20, 0) as income_minor,
  (
    position.current_value_minor - position.accumulated_cost_minor
  )::numeric(20, 0) as unrealized_appreciation_minor,
  case
    when position.history_is_complete then (
      position.current_value_minor
      + coalesce(sum(flow.amount_minor) filter (
          where flow.cash_flow_type = 'redemption'
        ), 0)
      + coalesce(sum(flow.amount_minor) filter (
          where flow.cash_flow_type = 'income'
        ), 0)
      - coalesce(sum(flow.amount_minor) filter (
          where flow.cash_flow_type = 'contribution'
        ), 0)
    )::numeric(20, 0)
    else null
  end as total_result_minor,
  position.investment_type
from public.investment_positions as position
left join public.investment_cash_flows as flow
  on flow.position_id = position.id
 and flow.user_id = position.user_id
group by position.id;

comment on table public.category_groups is
  'Editable owner-scoped reporting groups that organize categories and their one-level subcategories.';
comment on column public.categories.group_id is
  'Editable reporting group. Category and optional subcategory remain the classification levels used by entries.';
comment on column public.investment_positions.investment_type is
  'Operational investment type compatible with investment_class; used to distinguish products without inventing returns.';
