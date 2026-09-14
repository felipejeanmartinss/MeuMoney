create or replace function private.update_credit_card_purchase_custom(
  target_purchase_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  target_installment_amounts bigint[],
  purchase_is_recurring boolean default false,
  purchase_notes text default null,
  purchase_entry_kind public.credit_card_entry_kind default 'purchase',
  target_invoice_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  purchase_record public.credit_card_purchases%rowtype;
  affected_invoice_id uuid;
  old_invoice_ids uuid[];
  existing_invoice_id uuid;
  direct_invoice_reference date;
  structure_changed boolean;
  distribution_count integer;
  distribution_total numeric;
  distribution_is_valid boolean;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select purchases.*
  into purchase_record
  from public.credit_card_purchases purchases
  where purchases.id = target_purchase_id
    and purchases.user_id = current_user_id
    and purchases.status = 'active'
  for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;

  select
    count(*),
    coalesce(sum(amount), 0),
    coalesce(bool_and(amount between 1 and 9007199254740991), false)
  into distribution_count, distribution_total, distribution_is_valid
  from unnest(target_installment_amounts) as amounts(amount);

  if purchase_total_amount not between 1 and 9007199254740991
    or purchase_total_amount <> trunc(purchase_total_amount)
    or distribution_count <> target_installment_count
    or distribution_total <> purchase_total_amount
    or not distribution_is_valid
  then
    raise exception 'invalid_installment_distribution' using errcode = '23514';
  end if;

  if purchase_entry_kind not in ('purchase', 'refund', 'cashback') then
    raise exception 'invalid_credit_card_entry_kind' using errcode = '23514';
  end if;
  if purchase_entry_kind <> 'purchase'
    and (target_installment_count <> 1 or coalesce(purchase_is_recurring, false))
  then
    raise exception 'invalid_credit_card_credit' using errcode = '23514';
  end if;
  if target_invoice_id is not null and purchase_entry_kind = 'purchase' then
    raise exception 'invalid_credit_card_credit' using errcode = '23514';
  end if;

  if purchase_entry_kind = 'purchase' then
    if not exists (
      select 1 from public.categories categories
      where categories.id = target_category_id
        and categories.user_id = current_user_id
        and categories.kind = 'expense'
        and categories.archived_at is null
    ) then
      raise exception 'invalid_purchase_category' using errcode = '23503';
    end if;
  elsif target_category_id is not null then
    raise exception 'invalid_credit_card_credit' using errcode = '23514';
  end if;

  select installments.invoice_id
  into existing_invoice_id
  from public.credit_card_installments installments
  where installments.purchase_id = target_purchase_id
    and installments.user_id = current_user_id
  order by installments.installment_number
  limit 1;

  structure_changed :=
    purchase_record.total_amount <> purchase_total_amount
    or purchase_record.purchase_date <> target_purchase_date
    or purchase_record.installment_count <> target_installment_count
    or purchase_record.entry_kind <> purchase_entry_kind
    or coalesce(target_invoice_id::text, '')
      <> coalesce(
        case when purchase_record.entry_kind <> 'purchase'
          then existing_invoice_id::text end,
        ''
      );

  if structure_changed and exists (
    select 1
    from public.credit_card_installments installments
    join public.credit_card_invoices invoices
      on invoices.id = installments.invoice_id
     and invoices.user_id = installments.user_id
    where installments.purchase_id = target_purchase_id
      and installments.user_id = current_user_id
      and (installments.status = 'paid' or invoices.status <> 'open')
  ) then
    raise exception 'purchase_structure_locked' using errcode = '23514';
  end if;

  if target_invoice_id is not null then
    select invoices.reference_month
    into direct_invoice_reference
    from public.credit_card_invoices invoices
    where invoices.id = target_invoice_id
      and invoices.user_id = current_user_id
      and invoices.credit_card_id = purchase_record.credit_card_id
      and invoices.status = 'open'
    for update;
    if not found then
      raise exception 'invoice_not_open' using errcode = '23514';
    end if;
  end if;

  if structure_changed then
    select array_agg(distinct installments.invoice_id)
    into old_invoice_ids
    from public.credit_card_installments installments
    where installments.purchase_id = target_purchase_id
      and installments.user_id = current_user_id;

    delete from public.credit_card_installments installments
    where installments.purchase_id = target_purchase_id
      and installments.user_id = current_user_id;

    foreach affected_invoice_id in array coalesce(old_invoice_ids, array[]::uuid[])
    loop
      perform public.refresh_credit_card_invoice_total(affected_invoice_id);
    end loop;
  end if;

  update public.credit_card_purchases purchases
  set category_id = case when purchase_entry_kind = 'purchase' then target_category_id end,
      entry_kind = purchase_entry_kind,
      description = trim(purchase_description),
      total_amount = purchase_total_amount,
      purchase_date = target_purchase_date,
      installment_count = target_installment_count,
      is_recurring = coalesce(purchase_is_recurring, false),
      notes = nullif(trim(purchase_notes), '')
  where purchases.id = target_purchase_id
    and purchases.user_id = current_user_id;

  if not exists (
    select 1 from public.credit_card_installments installments
    where installments.purchase_id = target_purchase_id
      and installments.user_id = current_user_id
  ) then
    if target_invoice_id is not null then
      insert into public.credit_card_installments (
        user_id, purchase_id, credit_card_id, invoice_id,
        installment_number, installment_count, amount, competence_date
      ) values (
        current_user_id, target_purchase_id, purchase_record.credit_card_id,
        target_invoice_id, 1, 1, target_installment_amounts[1],
        direct_invoice_reference
      );
    else
      perform public.generate_credit_card_installments(target_purchase_id);
    end if;
  end if;

  update public.credit_card_installments installments
  set amount = distribution.amount
  from unnest(target_installment_amounts) with ordinality
    as distribution(amount, installment_number)
  where installments.purchase_id = target_purchase_id
    and installments.user_id = current_user_id
    and installments.installment_number = distribution.installment_number;

  for affected_invoice_id in
    select distinct installments.invoice_id
    from public.credit_card_installments installments
    where installments.purchase_id = target_purchase_id
      and installments.user_id = current_user_id
  loop
    perform public.refresh_credit_card_invoice_total(affected_invoice_id);
  end loop;

  return true;
end;
$$;

revoke all on function private.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) from public, anon, authenticated;
grant execute on function private.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) to authenticated;
