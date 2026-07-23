alter table public.profiles
add column preferred_currency char(3) not null default 'BRL'
check (preferred_currency in ('BRL', 'USD', 'EUR'));

alter table public.accounts
add column opening_balance_date date;

update public.accounts
set opening_balance_date = created_at::date
where opening_balance_date is null;

alter table public.accounts
alter column opening_balance_date set default current_date,
alter column opening_balance_date set not null;

alter table public.accounts
add constraint accounts_supported_currency
check (currency in ('BRL', 'USD', 'EUR'));

alter table public.accounts
add constraint accounts_opening_balance_safe_integer
check (
  opening_balance_minor between -9007199254740991 and 9007199254740991
);

alter table public.categories
add column archived_at timestamptz,
add column updated_at timestamptz not null default now();

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute procedure public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute procedure public.set_updated_at();

drop policy if exists "accounts_owner_all" on public.accounts;
create policy "accounts_owner_select" on public.accounts
for select to authenticated
using ((select auth.uid()) = user_id);
create policy "accounts_owner_insert" on public.accounts
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "accounts_owner_update" on public.accounts
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "categories_owner_all" on public.categories;
create policy "categories_owner_select" on public.categories
for select to authenticated
using ((select auth.uid()) = user_id);
create policy "categories_owner_insert_custom" on public.categories
for insert to authenticated
with check ((select auth.uid()) = user_id and not is_system);
create policy "categories_owner_update_custom" on public.categories
for update to authenticated
using ((select auth.uid()) = user_id and not is_system)
with check ((select auth.uid()) = user_id and not is_system);

revoke all on table public.accounts from anon, authenticated;
grant select on table public.accounts to authenticated;
grant insert (user_id, name, type, context, currency, opening_balance_minor, opening_balance_date)
on table public.accounts to authenticated;
grant update (name, type, context, currency, opening_balance_minor, opening_balance_date, archived_at)
on table public.accounts to authenticated;

revoke all on table public.categories from anon, authenticated;
grant select on table public.categories to authenticated;
grant insert (user_id, name, kind, context)
on table public.categories to authenticated;
grant update (name, kind, context, archived_at)
on table public.categories to authenticated;

grant select, update (full_name, preferred_currency)
on table public.profiles to authenticated;

create or replace function public.seed_default_categories(target_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, kind, context, is_system)
  values
    (target_user_id, 'Salário', 'income', 'personal', true),
    (target_user_id, 'Benefícios', 'income', 'personal', true),
    (target_user_id, 'Rendimentos', 'income', 'personal', true),
    (target_user_id, 'Reembolsos', 'income', 'personal', true),
    (target_user_id, 'Outras receitas', 'income', 'personal', true),
    (target_user_id, 'Moradia', 'expense', 'personal', true),
    (target_user_id, 'Alimentação', 'expense', 'personal', true),
    (target_user_id, 'Transporte', 'expense', 'personal', true),
    (target_user_id, 'Saúde', 'expense', 'personal', true),
    (target_user_id, 'Educação e conhecimento', 'expense', 'personal', true),
    (target_user_id, 'Lazer e conforto', 'expense', 'personal', true),
    (target_user_id, 'Assinaturas e serviços', 'expense', 'personal', true),
    (target_user_id, 'Impostos e taxas', 'expense', 'personal', true),
    (target_user_id, 'Doações', 'expense', 'personal', true),
    (target_user_id, 'Outras despesas', 'expense', 'personal', true),
    (target_user_id, 'Vendas', 'income', 'professional', true),
    (target_user_id, 'Serviços prestados', 'income', 'professional', true),
    (target_user_id, 'Comissões', 'income', 'professional', true),
    (target_user_id, 'Outras receitas profissionais', 'income', 'professional', true),
    (target_user_id, 'Fornecedores', 'expense', 'professional', true),
    (target_user_id, 'Operação', 'expense', 'professional', true),
    (target_user_id, 'Marketing e vendas', 'expense', 'professional', true),
    (target_user_id, 'Ferramentas e sistemas', 'expense', 'professional', true),
    (target_user_id, 'Impostos profissionais', 'expense', 'professional', true),
    (target_user_id, 'Pró-labore', 'expense', 'professional', true),
    (target_user_id, 'Outras despesas profissionais', 'expense', 'professional', true)
  on conflict (user_id, name, kind, context) do nothing;
end;
$$;

comment on function public.seed_default_categories(uuid) is
'Cria a taxonomia inicial de receitas e despesas, inspirada na orientação AUVP e adaptada aos contextos pessoal e profissional do MeuMoney.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''));
  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

do $$
declare
  existing_user record;
begin
  for existing_user in select id from auth.users loop
    perform public.seed_default_categories(existing_user.id);
  end loop;
end;
$$;

revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
