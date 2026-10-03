-- The SQL expression in the subscription generator must not share a name
-- with credit_card_invoices.reference_month. PL/pgSQL otherwise raises 42702
-- for every user who has an active card subscription.
create or replace function private.ensure_card_subscription_horizon(target_card_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  card_row public.credit_cards%rowtype;
  template_row public.credit_card_purchases%rowtype;
  first_month date;
  scheduled_month date;
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
      for scheduled_month in select generate_series(
        greatest(first_month + interval '1 month', date_trunc('month', current_date)),
        date_trunc('month', current_date) + interval '5 months', interval '1 month'
      )::date
      loop
        if exists (select 1 from public.credit_card_purchases p
          where p.recurring_source_purchase_id = template_row.id
            and p.recurring_reference_month = scheduled_month) then
          continue;
        end if;
        if exists (select 1 from public.credit_card_invoices i
          where i.credit_card_id = card_row.id and i.reference_month = scheduled_month
            and i.status <> 'open') then
          continue;
        end if;
        invoice_id := public.ensure_credit_card_invoice(current_user_id, card_row.id,
          scheduled_month, card_row.closing_day, card_row.due_day);
        select i.status into invoice_status from public.credit_card_invoices i
          where i.id = invoice_id and i.user_id = current_user_id for update;
        if invoice_status is distinct from 'open' then continue; end if;
        purchase_month := (date_trunc('month', template_row.purchase_date)::date
          + make_interval(months =>
            (extract(year from scheduled_month)::int - extract(year from first_month)::int) * 12
            + extract(month from scheduled_month)::int - extract(month from first_month)::int))::date;
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
          1, false, template_row.notes, template_row.id, scheduled_month
        ) on conflict do nothing returning id into new_purchase_id;
        if new_purchase_id is null then continue; end if;
        insert into public.credit_card_installments (
          user_id, purchase_id, credit_card_id, invoice_id,
          installment_number, installment_count, amount, competence_date
        ) values (current_user_id, new_purchase_id, card_row.id, invoice_id,
          1, 1, template_row.total_amount, scheduled_month);
        perform public.refresh_credit_card_invoice_total(invoice_id);
        created_count := created_count + 1;
      end loop;
    end loop;
  end loop;
  return created_count;
end;
$$;

revoke all on function private.ensure_card_subscription_horizon(uuid) from public, anon, authenticated;
grant execute on function private.ensure_card_subscription_horizon(uuid) to authenticated;
