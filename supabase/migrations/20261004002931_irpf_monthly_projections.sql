-- User-entered monthly totals for IRPF planning. NULL means use recorded actuals;
-- zero is an intentional override. Never turn these into ledger transactions.
create table public.irpf_monthly_projections (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_date date not null check (extract(day from month_date) = 1),
  salary_minor bigint check (salary_minor >= 0),
  vacation_minor bigint check (vacation_minor >= 0),
  inss_minor bigint check (inss_minor >= 0),
  health_minor bigint check (health_minor >= 0),
  health_reimbursement_minor bigint check (health_reimbursement_minor >= 0),
  pension_minor bigint check (pension_minor >= 0),
  withheld_tax_minor bigint check (withheld_tax_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_date)
);

create trigger irpf_monthly_projections_set_updated_at
before update on public.irpf_monthly_projections
for each row execute procedure public.set_updated_at();

alter table public.irpf_monthly_projections enable row level security;

create policy "irpf_monthly_projections_owner_select"
on public.irpf_monthly_projections for select to authenticated
using ((select auth.uid()) = user_id);
create policy "irpf_monthly_projections_owner_insert"
on public.irpf_monthly_projections for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "irpf_monthly_projections_owner_update"
on public.irpf_monthly_projections for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "irpf_monthly_projections_owner_delete"
on public.irpf_monthly_projections for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.irpf_monthly_projections from anon, authenticated;
grant select, insert, update, delete on table public.irpf_monthly_projections to authenticated;

comment on table public.irpf_monthly_projections is
  'Optional user forecasts; they override displayed monthly totals but never change source transactions.';
