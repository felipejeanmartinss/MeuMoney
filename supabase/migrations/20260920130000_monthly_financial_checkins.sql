-- Sprint 3: fechamento mensal guiado e observações do usuário.

create table public.monthly_financial_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference_month date not null check (extract(day from reference_month) = 1),
  status text not null default 'open' check (status in ('open', 'closed')),
  observation text check (observation is null or char_length(observation) <= 2000),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reference_month)
);

create index monthly_financial_checkins_owner_month_idx
  on public.monthly_financial_checkins (user_id, reference_month desc);

create trigger monthly_financial_checkins_set_updated_at
before update on public.monthly_financial_checkins
for each row execute procedure public.set_updated_at();

alter table public.monthly_financial_checkins enable row level security;

create policy "monthly_financial_checkins_owner_select"
on public.monthly_financial_checkins for select to authenticated
using ((select auth.uid()) = user_id);
create policy "monthly_financial_checkins_owner_insert"
on public.monthly_financial_checkins for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "monthly_financial_checkins_owner_update"
on public.monthly_financial_checkins for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "monthly_financial_checkins_owner_delete"
on public.monthly_financial_checkins for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.monthly_financial_checkins from anon, authenticated;
grant select, insert, update, delete on table public.monthly_financial_checkins to authenticated;

comment on table public.monthly_financial_checkins is
'Estado e observação do fechamento mensal guiado de cada usuário.';
