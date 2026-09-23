-- Historical links never create, edit or delete bank transactions.
create unique index transactions_id_user_financing_idx on public.transactions(id, user_id);
alter table public.financing_schedule_entries
  add column extra_amortization_minor bigint not null default 0 check (extra_amortization_minor between 0 and 9007199254740991),
  add column installments_reduced integer not null default 0 check (installments_reduced between 0 and 1200),
  add column linked_transaction_id uuid,
  add constraint financing_schedule_link_owner_fkey foreign key(linked_transaction_id, user_id)
    references public.transactions(id, user_id) on delete set null (linked_transaction_id);
create unique index financing_schedule_transaction_idx on public.financing_schedule_entries(linked_transaction_id) where linked_transaction_id is not null;

create or replace function private.save_financing_contract(
  target_contract_id uuid, expected_updated_at timestamptz, target_contract jsonb, target_schedule jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved_id uuid := target_contract_id;
  existing public.financing_contracts%rowtype;
  row_data jsonb;
  row_id uuid;
  link_id uuid;
  item_id uuid;
  previous_entries jsonb;
  previous_entry public.financing_schedule_entries%rowtype;
  preserve_charges boolean;
begin
  if owner_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if jsonb_typeof(target_schedule) is distinct from 'array' or jsonb_typeof(target_contract) is distinct from 'object' then raise exception 'invalid_financing'; end if;
  if jsonb_array_length(target_schedule) not between 1 and 1200 then raise exception 'invalid_financing'; end if;
  if target_contract_id is not null then
    select * into existing from public.financing_contracts where id = target_contract_id and user_id = owner_id for update;
    if not found then raise exception 'financing_not_found' using errcode = '42501'; end if;
    if expected_updated_at is null or existing.updated_at <> expected_updated_at then raise exception 'financing_conflict'; end if;
  end if;
  if coalesce(target_contract->>'amortization_system', '') not in ('SAC', 'PRICE')
    or coalesce((target_contract->>'original_term_months')::integer, 0) not between 1 and 1200
    or coalesce((target_contract->>'original_principal_minor')::numeric, 0) not between 1 and 9007199254740991
    or coalesce((target_contract->>'current_balance_minor')::numeric, -1) not between 0 and 9007199254740991
    or (target_contract->>'contract_date') is null or (target_contract->>'balance_date') is null then
    raise exception 'invalid_financing';
  end if;
  if exists(select 1 from jsonb_array_elements(target_schedule) r group by r->>'installment_number' having count(*) > 1)
     or exists(select 1 from jsonb_array_elements(target_schedule) r where nullif(r->>'id','') is not null group by r->>'id' having count(*) > 1) then
    raise exception 'duplicate_financing_installment';
  end if;
  for row_data in select * from jsonb_array_elements(target_schedule) loop
    row_id := nullif(row_data->>'id', '')::uuid;
    if row_id is not null and not exists(select 1 from public.financing_schedule_entries where id = row_id and contract_id = target_contract_id and user_id = owner_id) then
      raise exception 'invalid_financing_entry' using errcode = '42501';
    end if;
    if coalesce((row_data->>'source_sequence')::integer,0) < 1 or coalesce((row_data->>'installment_number')::integer,-1) < 0
      or nullif(row_data->>'due_date','') is null
      or coalesce(row_data->>'payment_status','') not in ('paid','scheduled')
      or (row_data->>'payment_status' = 'paid' and nullif(row_data->>'payment_date','') is null)
      or (row_data->>'payment_status' = 'scheduled' and (nullif(row_data->>'payment_date','') is not null or (row_data->>'paid_amount_minor')::bigint <> 0)) then raise exception 'invalid_financing_schedule'; end if;
    if exists(select 1 from unnest(array['total_amount_minor','principal_minor','interest_minor','service_fee_minor','outstanding_balance_minor','paid_amount_minor','extra_amortization_minor']) k
      where coalesce(row_data->>k,'') !~ '^\d+$' or (row_data->>k)::numeric > 9007199254740991) then raise exception 'invalid_financing_amount'; end if;
    link_id := nullif(row_data->>'linked_transaction_id','')::uuid;
    if link_id is not null and not exists(
      select 1 from public.transactions t join public.accounts a on a.id = t.account_id and a.user_id = t.user_id
      where t.id = link_id and t.user_id = owner_id and a.currency = target_contract->>'currency'
        and ((t.is_active and t.status = 'completed' and t.transaction_type = 'expense')
          or exists(select 1 from public.financing_schedule_entries e where e.id = row_id and e.user_id = owner_id and e.contract_id = target_contract_id and e.linked_transaction_id = link_id))
    ) then raise exception 'invalid_financing_link' using errcode = '42501'; end if;
    if link_id is not null and exists(select 1 from public.financing_schedule_entries where linked_transaction_id = link_id and contract_id is distinct from target_contract_id) then raise exception 'invalid_financing_link'; end if;
  end loop;
  if saved_id is null then
    saved_id := private.create_manual_financing_contract(target_contract, target_schedule);
  else
    update public.financing_contracts set institution = trim(target_contract->>'institution'), contract_reference = trim(target_contract->>'contract_reference'),
      product_type = target_contract->>'product_type', currency = target_contract->>'currency', amortization_system = target_contract->>'amortization_system', indexer = nullif(target_contract->>'indexer',''),
      original_principal_minor = (target_contract->>'original_principal_minor')::bigint, original_term_months = (target_contract->>'original_term_months')::integer,
      contract_date = (target_contract->>'contract_date')::date, release_date = nullif(target_contract->>'release_date','')::date,
      current_balance_minor = (target_contract->>'current_balance_minor')::bigint, balance_date = (target_contract->>'balance_date')::date,
      nominal_annual_rate = nullif(target_contract->>'nominal_annual_rate','')::numeric,
      effective_annual_rate = nullif(target_contract->>'effective_annual_rate','')::numeric, cet_annual_rate = nullif(target_contract->>'cet_annual_rate','')::numeric,
      status = case when (target_contract->>'current_balance_minor')::bigint = 0 then 'settled' else 'active' end
    where id = saved_id and user_id = owner_id;
  end if;
  select net_worth_item_id into item_id from public.financing_contracts where id = saved_id and user_id = owner_id;
  update public.net_worth_items set name = trim(target_contract->>'name'), context = (target_contract->>'context')::public.financial_context,
    item_type = (target_contract->>'product_type')::public.net_worth_item_type, currency = target_contract->>'currency',
    current_value_minor = (target_contract->>'current_balance_minor')::bigint, valuation_date = least((target_contract->>'balance_date')::date, current_date)
  where id = item_id and user_id = owner_id;
  -- Replacing the schedule is atomic; submitted stable IDs are retained.
  select jsonb_object_agg(id::text, to_jsonb(entries)) into previous_entries
    from public.financing_schedule_entries entries where contract_id = saved_id and user_id = owner_id;
  delete from public.financing_schedule_entries where contract_id = saved_id and user_id = owner_id;
  for row_data in select * from jsonb_array_elements(target_schedule) loop
    select * into previous_entry from jsonb_populate_record(null::public.financing_schedule_entries, previous_entries->(row_data->>'id'));
    preserve_charges := previous_entry.id is not null and (row_data->>'service_fee_minor')::bigint =
      previous_entry.insurance_mip_minor + previous_entry.insurance_dfi_minor + previous_entry.service_fee_minor + previous_entry.penalty_minor + previous_entry.late_interest_minor;
    insert into public.financing_schedule_entries(id, contract_id, user_id, source_sequence, installment_number, due_date,
      total_amount_minor, principal_minor, interest_minor, correction_factor, service_fee_minor, outstanding_balance_minor,
      payment_status, payment_date, paid_amount_minor, source_pages, extra_amortization_minor, installments_reduced, linked_transaction_id,
      insurance_mip_minor, insurance_dfi_minor, penalty_minor, late_interest_minor, fgts_minor, balance_correction_factor, created_at)
    values(coalesce(nullif(row_data->>'id','')::uuid, gen_random_uuid()), saved_id, owner_id,
      (row_data->>'source_sequence')::integer, (row_data->>'installment_number')::integer, (row_data->>'due_date')::date,
      (row_data->>'total_amount_minor')::bigint, (row_data->>'principal_minor')::bigint, (row_data->>'interest_minor')::bigint,
      nullif(row_data->>'correction_factor','')::numeric, case when preserve_charges then previous_entry.service_fee_minor else (row_data->>'service_fee_minor')::bigint end, (row_data->>'outstanding_balance_minor')::bigint,
      row_data->>'payment_status', nullif(row_data->>'payment_date','')::date, (row_data->>'paid_amount_minor')::bigint, coalesce(previous_entry.source_pages, '{}'),
      (row_data->>'extra_amortization_minor')::bigint, (row_data->>'installments_reduced')::integer, nullif(row_data->>'linked_transaction_id','')::uuid,
      case when preserve_charges then previous_entry.insurance_mip_minor else 0 end,
      case when preserve_charges then previous_entry.insurance_dfi_minor else 0 end,
      case when preserve_charges then previous_entry.penalty_minor else 0 end,
      case when preserve_charges then previous_entry.late_interest_minor else 0 end,
      coalesce(previous_entry.fgts_minor,0), previous_entry.balance_correction_factor, coalesce(previous_entry.created_at, now()));
  end loop;
  return saved_id;
end;
$$;
revoke all on function private.save_financing_contract(uuid,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function private.save_financing_contract(uuid,timestamptz,jsonb,jsonb) to authenticated;
create or replace function public.save_financing_contract(target_contract_id uuid, expected_updated_at timestamptz, target_contract jsonb, target_schedule jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select private.save_financing_contract(target_contract_id, expected_updated_at, target_contract, target_schedule);
$$;
revoke all on function public.save_financing_contract(uuid,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.save_financing_contract(uuid,timestamptz,jsonb,jsonb) to authenticated;

create table public.investment_benchmark_months (
  code text not null check(code in ('cdi','selic','ipca','ibovespa','ifix','usd')),
  reference_month date not null check(extract(day from reference_month) = 1),
  return_percent numeric(18,8) not null check(return_percent >= -100 and return_percent <= 100000),
  source text not null,
  synced_at timestamptz not null default now(),
  primary key(code, reference_month)
);
alter table public.investment_benchmark_months enable row level security;
revoke all on table public.investment_benchmark_months from anon, authenticated;
grant select on table public.investment_benchmark_months to authenticated;
grant select, insert, update, delete on table public.investment_benchmark_months to service_role;
create policy benchmark_months_read on public.investment_benchmark_months for select to authenticated using(true);
create or replace view public.financing_contract_summaries
with (security_invoker = true)
as
select
  contracts.*,
  items.name,
  items.context,
  (coalesce(schedule.total_paid_minor, 0) + coalesce(extra.extra_cash_minor, 0) + coalesce(extra.extra_fgts_minor, 0))::numeric(20, 0) as total_paid_minor,
  coalesce(schedule.principal_paid_minor, 0)::numeric(20, 0) as principal_paid_minor,
  coalesce(schedule.interest_paid_minor, 0)::numeric(20, 0) as interest_paid_minor,
  coalesce(schedule.charges_paid_minor, 0)::numeric(20, 0) as charges_paid_minor,
  (coalesce(extra.extra_cash_minor, 0) + coalesce(schedule.extra_paid_minor, 0))::numeric(20, 0) as extra_cash_minor,
  coalesce(extra.extra_fgts_minor, 0)::numeric(20, 0) as extra_fgts_minor,
  coalesce(schedule.paid_installments, 0)::integer as paid_installments,
  coalesce(schedule.scheduled_installments, 0)::integer as scheduled_installments
from public.financing_contracts contracts
join public.net_worth_items items
  on items.id = contracts.net_worth_item_id
  and items.user_id = contracts.user_id
left join lateral (
  select
    sum(entries.paid_amount_minor) filter (
      where entries.payment_status = 'paid'
    ) as total_paid_minor,
    sum(entries.principal_minor + entries.extra_amortization_minor) filter (
      where entries.payment_status = 'paid'
    ) as principal_paid_minor,
    sum(entries.interest_minor) filter (
      where entries.payment_status = 'paid'
    ) as interest_paid_minor,
    sum(
      entries.insurance_mip_minor
      + entries.insurance_dfi_minor
      + entries.service_fee_minor
      + entries.penalty_minor
      + entries.late_interest_minor
    ) filter (where entries.payment_status = 'paid') as charges_paid_minor,
    (count(*) filter (where entries.payment_status = 'paid') + coalesce(sum(entries.installments_reduced) filter (where entries.payment_status = 'paid'),0)) as paid_installments,
    sum(entries.extra_amortization_minor) filter (where entries.payment_status = 'paid') as extra_paid_minor,
    count(*) filter (where entries.payment_status = 'scheduled') as scheduled_installments
  from public.financing_schedule_entries entries
  where entries.contract_id = contracts.id
    and entries.user_id = contracts.user_id
) schedule on true
left join lateral (
  select
    sum(amortizations.cash_amount_minor) as extra_cash_minor,
    sum(amortizations.fgts_amount_minor) as extra_fgts_minor
  from public.financing_extra_amortizations amortizations
  where amortizations.contract_id = contracts.id
    and amortizations.user_id = contracts.user_id
) extra on true;

revoke all on table public.financing_contract_summaries
from anon, authenticated;
grant select on table public.financing_contract_summaries to authenticated;
