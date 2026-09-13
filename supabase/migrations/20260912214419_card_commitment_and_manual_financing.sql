-- Corrige o horizonte do limite comprometido e oferece cadastro histórico
-- atômico para contratos de financiamento sem depender de um PDF.

create or replace view public.credit_card_summaries
with (security_invoker = true)
as
select
  cards.*,
  greatest(coalesce(committed.used_amount, 0), 0)::numeric(16, 0)
    as used_limit,
  (
    cards.credit_limit - greatest(coalesce(committed.used_amount, 0), 0)
  )::numeric(16, 0) as available_limit,
  greatest(
    greatest(coalesce(committed.used_amount, 0), 0)
      - coalesce(card_transfers.transferred_amount, 0),
    0
  )::numeric(16, 0) as current_balance_minor
from public.credit_cards cards
left join lateral (
  select max(invoices.reference_month) as last_invoice_month
  from public.credit_card_invoices invoices
  where invoices.credit_card_id = cards.id
    and invoices.user_id = cards.user_id
) horizon on true
left join lateral (
  select
    coalesce((
      select sum(greatest(installments.amount, 0))
      from public.credit_card_installments installments
      join public.credit_card_purchases purchases
        on purchases.id = installments.purchase_id
        and purchases.user_id = installments.user_id
      where installments.credit_card_id = cards.id
        and installments.user_id = cards.user_id
        and installments.status in ('pending', 'invoiced')
        and purchases.status = 'active'
        and horizon.last_invoice_month is not null
        and installments.competence_date <= horizon.last_invoice_month
    ), 0)
    + coalesce((
      select sum(greatest(purchases.total_amount, 0))
      from public.credit_card_purchases purchases
      cross join lateral (
        select public.card_reference_month(
          purchases.purchase_date,
          cards.closing_day
        ) as first_reference_month
      ) first_month
      cross join lateral generate_series(
        (first_month.first_reference_month + interval '1 month')::date,
        horizon.last_invoice_month,
        interval '1 month'
      ) projected_month
      where purchases.credit_card_id = cards.id
        and purchases.user_id = cards.user_id
        and purchases.status = 'active'
        and purchases.is_recurring
        and horizon.last_invoice_month is not null
        and not exists (
          select 1
          from public.credit_card_installments installments
          where installments.purchase_id = purchases.id
            and installments.user_id = purchases.user_id
            and installments.competence_date = projected_month::date
        )
    ), 0) as used_amount
) committed on true
left join lateral (
  select sum(transfers.amount_minor) as transferred_amount
  from public.transfers
  where transfers.destination_credit_card_id = cards.id
    and transfers.user_id = cards.user_id
    and transfers.is_active
    and transfers.status = 'completed'
) card_transfers on true;

revoke all on table public.credit_card_summaries from anon, authenticated;
grant select on table public.credit_card_summaries to authenticated;

comment on view public.credit_card_summaries is
  'Resumo do cartão: comprometido limitado à última fatura cadastrada; assinaturas completam somente meses ainda não registrados.';

create or replace function private.create_manual_financing_contract(
  target_contract jsonb,
  target_schedule jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_net_worth_item_id uuid;
  new_contract_id uuid;
  current_balance bigint;
  principal_initial bigint;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(target_contract) <> 'object'
    or jsonb_typeof(target_schedule) <> 'array'
    or jsonb_array_length(target_schedule) = 0 then
    raise exception 'invalid_manual_financing' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(target_contract->>'name', ''))) not between 1 and 100
    or char_length(trim(coalesce(target_contract->>'institution', ''))) not between 1 and 120
    or char_length(trim(coalesce(target_contract->>'contract_reference', ''))) not between 1 and 80
    or target_contract->>'product_type' not in ('financing', 'loan')
    or target_contract->>'context' not in ('personal', 'professional')
    or target_contract->>'currency' not in ('BRL', 'USD', 'EUR')
    or target_contract->>'amortization_system' not in ('SAC', 'PRICE')
    or coalesce(target_contract->>'original_principal_minor', '') !~ '^\d+$'
    or coalesce(target_contract->>'current_balance_minor', '') !~ '^\d+$'
    or coalesce(target_contract->>'original_term_months', '') !~ '^\d+$' then
    raise exception 'invalid_manual_financing' using errcode = '22023';
  end if;

  principal_initial := (target_contract->>'original_principal_minor')::bigint;
  current_balance := (target_contract->>'current_balance_minor')::bigint;
  if principal_initial <= 0
    or principal_initial > 9007199254740991
    or current_balance < 0
    or current_balance > 9007199254740991
    or (target_contract->>'original_term_months')::integer not between 1 and 1200 then
    raise exception 'invalid_manual_financing' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_schedule) as rows(
      source_sequence integer,
      installment_number integer,
      due_date date,
      total_amount_minor bigint,
      principal_minor bigint,
      interest_minor bigint,
      correction_factor numeric,
      insurance_mip_minor bigint,
      insurance_dfi_minor bigint,
      service_fee_minor bigint,
      penalty_minor bigint,
      late_interest_minor bigint,
      fgts_minor bigint,
      balance_correction_factor numeric,
      outstanding_balance_minor bigint,
      payment_status text,
      payment_date date,
      paid_amount_minor bigint,
      source_pages integer[]
    )
    where rows.source_sequence is null or rows.source_sequence <= 0
      or rows.installment_number is null or rows.installment_number < 0
      or rows.due_date is null
      or rows.total_amount_minor not between 0 and 9007199254740991
      or rows.principal_minor not between 0 and 9007199254740991
      or rows.interest_minor not between 0 and 9007199254740991
      or rows.service_fee_minor not between 0 and 9007199254740991
      or rows.outstanding_balance_minor not between 0 and 9007199254740991
      or rows.paid_amount_minor not between 0 and 9007199254740991
      or rows.payment_status not in ('paid', 'scheduled')
      or (rows.payment_status = 'paid' and rows.payment_date is null)
      or (rows.payment_status = 'scheduled' and rows.payment_date is not null)
  ) then
    raise exception 'invalid_manual_financing_schedule' using errcode = '22023';
  end if;

  insert into public.net_worth_items (
    user_id,
    kind,
    item_type,
    name,
    currency,
    current_value_minor,
    valuation_date,
    context,
    notes
  ) values (
    current_user_id,
    'liability',
    (target_contract->>'product_type')::public.net_worth_item_type,
    trim(target_contract->>'name'),
    target_contract->>'currency',
    current_balance,
    least((target_contract->>'balance_date')::date, current_date),
    (target_contract->>'context')::public.financial_context,
    'Saldo sincronizado por cadastro histórico manual.'
  ) returning id into new_net_worth_item_id;

  insert into public.financing_contracts (
    user_id,
    net_worth_item_id,
    institution,
    product_type,
    contract_reference,
    currency,
    amortization_system,
    indexer,
    original_principal_minor,
    original_term_months,
    contract_date,
    release_date,
    current_balance_minor,
    balance_date,
    nominal_annual_rate,
    effective_annual_rate,
    cet_annual_rate,
    status
  ) values (
    current_user_id,
    new_net_worth_item_id,
    trim(target_contract->>'institution'),
    target_contract->>'product_type',
    trim(target_contract->>'contract_reference'),
    target_contract->>'currency',
    target_contract->>'amortization_system',
    nullif(trim(coalesce(target_contract->>'indexer', '')), ''),
    principal_initial,
    (target_contract->>'original_term_months')::integer,
    (target_contract->>'contract_date')::date,
    nullif(target_contract->>'release_date', '')::date,
    current_balance,
    (target_contract->>'balance_date')::date,
    nullif(target_contract->>'nominal_annual_rate', '')::numeric,
    nullif(target_contract->>'effective_annual_rate', '')::numeric,
    nullif(target_contract->>'cet_annual_rate', '')::numeric,
    case when current_balance = 0 then 'settled' else 'active' end
  ) returning id into new_contract_id;

  insert into public.financing_schedule_entries (
    contract_id,
    user_id,
    source_sequence,
    installment_number,
    due_date,
    total_amount_minor,
    principal_minor,
    interest_minor,
    correction_factor,
    insurance_mip_minor,
    insurance_dfi_minor,
    service_fee_minor,
    penalty_minor,
    late_interest_minor,
    fgts_minor,
    balance_correction_factor,
    outstanding_balance_minor,
    payment_status,
    payment_date,
    paid_amount_minor,
    source_pages
  )
  select
    new_contract_id,
    current_user_id,
    rows.source_sequence,
    rows.installment_number,
    rows.due_date,
    rows.total_amount_minor,
    rows.principal_minor,
    rows.interest_minor,
    rows.correction_factor,
    rows.insurance_mip_minor,
    rows.insurance_dfi_minor,
    rows.service_fee_minor,
    rows.penalty_minor,
    rows.late_interest_minor,
    rows.fgts_minor,
    rows.balance_correction_factor,
    rows.outstanding_balance_minor,
    rows.payment_status,
    rows.payment_date,
    rows.paid_amount_minor,
    coalesce(rows.source_pages, '{}'::integer[])
  from jsonb_to_recordset(target_schedule) as rows(
    source_sequence integer,
    installment_number integer,
    due_date date,
    total_amount_minor bigint,
    principal_minor bigint,
    interest_minor bigint,
    correction_factor numeric,
    insurance_mip_minor bigint,
    insurance_dfi_minor bigint,
    service_fee_minor bigint,
    penalty_minor bigint,
    late_interest_minor bigint,
    fgts_minor bigint,
    balance_correction_factor numeric,
    outstanding_balance_minor bigint,
    payment_status text,
    payment_date date,
    paid_amount_minor bigint,
    source_pages integer[]
  );

  return new_contract_id;
end;
$$;

revoke all on function private.create_manual_financing_contract(jsonb, jsonb)
from public, anon, authenticated;
grant execute on function private.create_manual_financing_contract(jsonb, jsonb)
to authenticated;

create or replace function public.create_manual_financing_contract(
  target_contract jsonb,
  target_schedule jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_manual_financing_contract(
    target_contract,
    target_schedule
  );
$$;

revoke all on function public.create_manual_financing_contract(jsonb, jsonb)
from public, anon;
grant execute on function public.create_manual_financing_contract(jsonb, jsonb)
to authenticated;

comment on function public.create_manual_financing_contract(jsonb, jsonb) is
  'Cria atomicamente o passivo, o contrato e o histórico manual de parcelas do usuário autenticado.';
