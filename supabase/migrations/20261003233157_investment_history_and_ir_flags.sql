-- Keep inception separate from the latest valuation date. Existing positions
-- start at their earliest recorded snapshot, never at an invented earlier date.
alter table public.investment_positions
  add column initial_position_date date,
  add column tax_deductible_pension boolean not null default false;

-- Backfill runs as the migration role, without an end-user JWT. The existing
-- validation trigger intentionally rejects that context, so suspend only that
-- trigger for this metadata-only update and restore it immediately.
alter table public.investment_positions disable trigger investment_positions_validate;
update public.investment_positions p
set initial_position_date = coalesce(
  (select min(s.position_date) from public.investment_position_snapshots s
   where s.position_id = p.id and s.user_id = p.user_id),
  p.position_date
);
alter table public.investment_positions enable trigger investment_positions_validate;

alter table public.investment_positions
  alter column initial_position_date set not null,
  add constraint investment_initial_date_before_latest
    check (initial_position_date <= position_date),
  add constraint investment_tax_deduction_only_pension
    check (not tax_deductible_pension or investment_class = 'pension');

grant insert (initial_position_date, tax_deductible_pension)
  on public.investment_positions to authenticated;
grant update (initial_position_date, tax_deductible_pension)
  on public.investment_positions to authenticated;

-- A destination account can represent a pension plan even before an
-- investment position has been created (for example a legacy Tegra account).
alter table public.accounts
  add column tax_deductible_pension boolean not null default false,
  add constraint account_tax_deduction_only_investment
    check (not tax_deductible_pension or type = 'investment');

comment on column public.investment_positions.tax_deductible_pension is
  'User-confirmed PGBL/equivalent status; VGBL must remain false.';
comment on column public.accounts.tax_deductible_pension is
  'User-confirmed deductible pension destination for transfers; not inferred from account name.';
