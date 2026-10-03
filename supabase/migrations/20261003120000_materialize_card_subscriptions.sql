-- Each future subscription charge is an ordinary, independently editable purchase.
-- The source and reference month survive cancellation so a deleted charge is not recreated.
alter table public.credit_card_purchases
  add column recurring_source_purchase_id uuid references public.credit_card_purchases(id) on delete restrict,
  add column recurring_reference_month date;

alter table public.credit_card_purchases
  add constraint recurring_purchase_reference_consistency check (
    (recurring_source_purchase_id is null and recurring_reference_month is null)
    or (recurring_source_purchase_id is not null and recurring_reference_month is not null
      and recurring_reference_month = date_trunc('month', recurring_reference_month)::date
      and is_recurring = false and installment_count = 1)
  );

create unique index credit_card_recurring_purchase_month_idx
  on public.credit_card_purchases(recurring_source_purchase_id, recurring_reference_month)
  where recurring_source_purchase_id is not null;

create or replace view public.credit_card_summaries with (security_invoker = true) as
select cards.*,
  greatest(coalesce(committed.used_amount, 0), 0)::numeric(16, 0) as used_limit,
  (cards.credit_limit - greatest(coalesce(committed.used_amount, 0), 0))::numeric(16, 0) as available_limit,
  greatest(greatest(coalesce(committed.used_amount, 0), 0)
    - coalesce(card_transfers.transferred_amount, 0), 0)::numeric(16, 0) as current_balance_minor
from public.credit_cards cards
left join lateral (
  select max(i.reference_month) as last_invoice_month
  from public.credit_card_invoices i
  where i.credit_card_id = cards.id and i.user_id = cards.user_id
) horizon on true
left join lateral (
  select coalesce((
    select sum(case p.entry_kind when 'purchase' then i.amount else -i.amount end)
    from public.credit_card_installments i
    join public.credit_card_purchases p on p.id = i.purchase_id and p.user_id = i.user_id
    where i.credit_card_id = cards.id and i.user_id = cards.user_id
      and i.status in ('pending', 'invoiced') and p.status = 'active'
      and horizon.last_invoice_month is not null
      and i.competence_date <= horizon.last_invoice_month
  ), 0) + coalesce((
    select sum(p.total_amount)
    from public.credit_card_purchases p
    cross join lateral (select public.card_reference_month(p.purchase_date, cards.closing_day)
      as first_reference_month) first_month
    cross join lateral generate_series(
      (first_month.first_reference_month + interval '1 month')::date,
      horizon.last_invoice_month, interval '1 month') projected_month
    where p.credit_card_id = cards.id and p.user_id = cards.user_id
      and p.status = 'active' and p.entry_kind = 'purchase' and p.is_recurring
      and horizon.last_invoice_month is not null
      and not exists (select 1 from public.credit_card_installments i
        where i.purchase_id = p.id and i.user_id = p.user_id
          and i.competence_date = projected_month::date)
      and not exists (select 1 from public.credit_card_purchases occurrence
        where occurrence.recurring_source_purchase_id = p.id
          and occurrence.recurring_reference_month = projected_month::date)
  ), 0) as used_amount
) committed on true
left join lateral (
  select sum(t.amount_minor) as transferred_amount from public.transfers t
  where t.destination_credit_card_id = cards.id and t.user_id = cards.user_id
    and t.is_active and t.status = 'completed'
) card_transfers on true;

revoke all on table public.credit_card_summaries from anon, authenticated;
grant select on table public.credit_card_summaries to authenticated;

create or replace function private.ensure_card_subscription_horizon(target_card_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  card_row public.credit_cards%rowtype;
  template_row public.credit_card_purchases%rowtype;
  first_month date;
  reference_month date;
  purchase_month date;
  charge_date date;
  invoice_id uuid;
  invoice_status public.credit_card_invoice_status;
  new_purchase_id uuid;
  created_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_card_id is not null and not exists (
    select 1 from public.credit_cards c where c.id = target_card_id
      and c.user_id = current_user_id
  ) then
    raise exception 'invalid_credit_card' using errcode = '23503';
  end if;
  for card_row in select * from public.credit_cards c
    where c.user_id = current_user_id and c.is_active
      and (target_card_id is null or c.id = target_card_id)
  loop
    for template_row in select * from public.credit_card_purchases p
      where p.user_id = current_user_id and p.credit_card_id = card_row.id
        and p.is_recurring and p.entry_kind = 'purchase' and p.status = 'active'
        and p.recurring_source_purchase_id is null
      for update
    loop
      first_month := public.card_reference_month(template_row.purchase_date, card_row.closing_day);
      for reference_month in select generate_series(
        greatest(first_month + interval '1 month', date_trunc('month', current_date)),
        date_trunc('month', current_date) + interval '5 months', interval '1 month'
      )::date
      loop
        if exists (select 1 from public.credit_card_purchases p
          where p.recurring_source_purchase_id = template_row.id
            and p.recurring_reference_month = reference_month) then
          continue;
        end if;
        if exists (select 1 from public.credit_card_invoices i
          where i.credit_card_id = card_row.id and i.reference_month = reference_month
            and i.status <> 'open') then
          continue;
        end if;
        invoice_id := public.ensure_credit_card_invoice(current_user_id, card_row.id,
          reference_month, card_row.closing_day, card_row.due_day);
        select i.status into invoice_status from public.credit_card_invoices i
          where i.id = invoice_id and i.user_id = current_user_id for update;
        if invoice_status is distinct from 'open' then continue; end if;
        -- Preserve the purchase-day anchor, not a 30-day approximation.
        purchase_month := (date_trunc('month', template_row.purchase_date)::date
          + make_interval(months =>
            (extract(year from reference_month)::int - extract(year from first_month)::int) * 12
            + extract(month from reference_month)::int - extract(month from first_month)::int))::date;
        charge_date := public.card_bounded_date(purchase_month,
          extract(day from template_row.purchase_date)::integer);
        new_purchase_id := null;
        insert into public.credit_card_purchases (
          user_id, credit_card_id, category_id, entry_kind, description,
          total_amount, purchase_date, installment_count, is_recurring, notes,
          recurring_source_purchase_id, recurring_reference_month
        ) values (
          current_user_id, card_row.id, template_row.category_id, 'purchase',
          template_row.description, template_row.total_amount, charge_date,
          1, false, template_row.notes, template_row.id, reference_month
        ) on conflict do nothing returning id into new_purchase_id;
        if new_purchase_id is null then continue; end if;
        insert into public.credit_card_installments (
          user_id, purchase_id, credit_card_id, invoice_id,
          installment_number, installment_count, amount, competence_date
        ) values (current_user_id, new_purchase_id, card_row.id, invoice_id,
          1, 1, template_row.total_amount, reference_month);
        perform public.refresh_credit_card_invoice_total(invoice_id);
        created_count := created_count + 1;
      end loop;
    end loop;
  end loop;
  return created_count;
end;
$$;

create or replace function public.ensure_card_subscription_horizon(target_card_id uuid default null)
returns integer language sql security invoker set search_path = '' as $$
  select private.ensure_card_subscription_horizon(target_card_id);
$$;

revoke all on function private.ensure_card_subscription_horizon(uuid) from public, anon, authenticated;
grant execute on function private.ensure_card_subscription_horizon(uuid) to authenticated;
revoke all on function public.ensure_card_subscription_horizon(uuid) from public, anon;
grant execute on function public.ensure_card_subscription_horizon(uuid) to authenticated;
