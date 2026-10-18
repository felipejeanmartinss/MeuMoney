-- Classify the funding source without changing historical installments or bank movements.
create table public.financing_amortization_sources (
  contract_id uuid not null references public.financing_contracts(id) on delete cascade,
  installment_number integer not null check (installment_number between 0 and 10000),
  fgts_amount_minor bigint not null check (fgts_amount_minor between 0 and 9007199254740991),
  primary key (contract_id, installment_number)
);
alter table public.financing_amortization_sources enable row level security;
revoke all on table public.financing_amortization_sources from anon, authenticated;
grant select on table public.financing_amortization_sources to authenticated;
create policy financing_amortization_sources_read on public.financing_amortization_sources
  for select to authenticated using (
    exists (select 1 from public.financing_contracts c where c.id = contract_id and c.user_id = (select auth.uid()))
  );

create or replace function public.save_financing_contract_with_sources(
  target_contract_id uuid, expected_updated_at timestamptz, target_contract jsonb, target_schedule jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved_id uuid;
  row_data jsonb;
  source_amount bigint;
begin
  -- The underlying function checks ownership, optimistic locking and every schedule row.
  saved_id := private.save_financing_contract(target_contract_id, expected_updated_at, target_contract, target_schedule);
  delete from public.financing_amortization_sources where contract_id = saved_id;
  for row_data in select * from jsonb_array_elements(target_schedule) loop
    if coalesce(row_data->>'extra_fgts_minor','') !~ '^\d+$' then raise exception 'invalid_financing_fgts'; end if;
    source_amount := (row_data->>'extra_fgts_minor')::bigint;
    if source_amount > (row_data->>'extra_amortization_minor')::bigint then raise exception 'invalid_financing_fgts'; end if;
    if source_amount > 0 then
      insert into public.financing_amortization_sources(contract_id, installment_number, fgts_amount_minor)
      values(saved_id, (row_data->>'installment_number')::integer, source_amount);
    end if;
  end loop;
  return saved_id;
end;
$$;
revoke all on function public.save_financing_contract_with_sources(uuid,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.save_financing_contract_with_sources(uuid,timestamptz,jsonb,jsonb) to authenticated;

create or replace view public.financing_contract_summaries with (security_invoker = true) as
select contracts.*, items.name, items.context,
  (coalesce(schedule.total_paid_minor,0)+coalesce(extra.extra_cash_minor,0)+coalesce(extra.extra_fgts_minor,0))::numeric(20,0) as total_paid_minor,
  coalesce(schedule.principal_paid_minor,0)::numeric(20,0) as principal_paid_minor,
  coalesce(schedule.interest_paid_minor,0)::numeric(20,0) as interest_paid_minor,
  coalesce(schedule.charges_paid_minor,0)::numeric(20,0) as charges_paid_minor,
  (coalesce(extra.extra_cash_minor,0)+coalesce(schedule.extra_paid_minor,0)-coalesce(sources.fgts_paid_minor,0))::numeric(20,0) as extra_cash_minor,
  (coalesce(extra.extra_fgts_minor,0)+coalesce(sources.fgts_paid_minor,0))::numeric(20,0) as extra_fgts_minor,
  coalesce(schedule.paid_installments,0)::integer as paid_installments,
  coalesce(schedule.scheduled_installments,0)::integer as scheduled_installments
from public.financing_contracts contracts
join public.net_worth_items items on items.id=contracts.net_worth_item_id and items.user_id=contracts.user_id
left join lateral (
  select sum(e.paid_amount_minor) filter(where e.payment_status='paid') as total_paid_minor,
    sum(e.principal_minor+e.extra_amortization_minor) filter(where e.payment_status='paid') as principal_paid_minor,
    sum(e.interest_minor) filter(where e.payment_status='paid') as interest_paid_minor,
    sum(e.insurance_mip_minor+e.insurance_dfi_minor+e.service_fee_minor+e.penalty_minor+e.late_interest_minor) filter(where e.payment_status='paid') as charges_paid_minor,
    (count(*) filter(where e.payment_status='paid')+coalesce(sum(e.installments_reduced) filter(where e.payment_status='paid'),0)) as paid_installments,
    sum(e.extra_amortization_minor) filter(where e.payment_status='paid') as extra_paid_minor,
    count(*) filter(where e.payment_status='scheduled') as scheduled_installments
  from public.financing_schedule_entries e where e.contract_id=contracts.id and e.user_id=contracts.user_id
) schedule on true
left join lateral (
  select sum(a.cash_amount_minor) as extra_cash_minor, sum(a.fgts_amount_minor) as extra_fgts_minor
  from public.financing_extra_amortizations a where a.contract_id=contracts.id and a.user_id=contracts.user_id
) extra on true
left join lateral (
  select sum(s.fgts_amount_minor) as fgts_paid_minor
  from public.financing_amortization_sources s
  join public.financing_schedule_entries e on e.contract_id=s.contract_id and e.installment_number=s.installment_number
  where s.contract_id=contracts.id and e.user_id=contracts.user_id and e.payment_status='paid'
) sources on true;
revoke all on table public.financing_contract_summaries from anon, authenticated;
grant select on table public.financing_contract_summaries to authenticated;
