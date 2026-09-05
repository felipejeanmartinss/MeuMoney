alter table public.categories
add column is_fixed_expense boolean not null default false;

alter table public.categories
add constraint categories_fixed_expense_subcategory_check
check (
  not is_fixed_expense
  or (kind = 'expense'::public.transaction_kind and parent_id is not null)
);

create index categories_user_fixed_expense_idx
on public.categories (user_id, id)
where is_fixed_expense;

grant insert (is_fixed_expense) on table public.categories to authenticated;
grant update (is_fixed_expense) on table public.categories to authenticated;

comment on column public.categories.is_fixed_expense is
'User-defined classification for expense subcategories included in the fixed-expense report.';
