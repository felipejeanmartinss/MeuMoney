alter table public.credit_card_purchases
add column is_recurring boolean not null default false;

comment on column public.credit_card_purchases.is_recurring is
  'User-defined marker for subscriptions and other recurring card purchases.';

create or replace function private.create_credit_card_purchase_custom(
  target_credit_card_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  target_installment_amounts bigint[],
  purchase_is_recurring boolean default false,
  purchase_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_purchase_id uuid;
  affected_invoice_id uuid;
  distribution_count integer;
  distribution_total numeric;
  distribution_is_valid boolean;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select
    count(*),
    coalesce(sum(amount), 0),
    coalesce(bool_and(amount between 1 and 9007199254740991), false)
  into distribution_count, distribution_total, distribution_is_valid
  from unnest(target_installment_amounts) as amounts(amount);

  if distribution_count <> target_installment_count
    or distribution_total <> purchase_total_amount
    or not distribution_is_valid
  then
    raise exception 'invalid_installment_distribution' using errcode = '23514';
  end if;

  new_purchase_id := private.create_credit_card_purchase(
    target_credit_card_id,
    target_category_id,
    purchase_description,
    purchase_total_amount,
    target_purchase_date,
    target_installment_count,
    purchase_notes
  );

  update public.credit_card_purchases
  set is_recurring = coalesce(purchase_is_recurring, false)
  where id = new_purchase_id
    and user_id = current_user_id;

  update public.credit_card_installments installments
  set amount = distribution.amount
  from unnest(target_installment_amounts) with ordinality
    as distribution(amount, installment_number)
  where installments.purchase_id = new_purchase_id
    and installments.user_id = current_user_id
    and installments.installment_number = distribution.installment_number;

  for affected_invoice_id in
    select distinct invoice_id
    from public.credit_card_installments
    where purchase_id = new_purchase_id
      and user_id = current_user_id
  loop
    perform public.refresh_credit_card_invoice_total(affected_invoice_id);
  end loop;

  return new_purchase_id;
end;
$$;

create or replace function private.update_credit_card_purchase_custom(
  target_purchase_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  target_installment_amounts bigint[],
  purchase_is_recurring boolean default false,
  purchase_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  affected_invoice_id uuid;
  distribution_count integer;
  distribution_total numeric;
  distribution_is_valid boolean;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select
    count(*),
    coalesce(sum(amount), 0),
    coalesce(bool_and(amount between 1 and 9007199254740991), false)
  into distribution_count, distribution_total, distribution_is_valid
  from unnest(target_installment_amounts) as amounts(amount);

  if distribution_count <> target_installment_count
    or distribution_total <> purchase_total_amount
    or not distribution_is_valid
  then
    raise exception 'invalid_installment_distribution' using errcode = '23514';
  end if;

  perform private.update_credit_card_purchase(
    target_purchase_id,
    target_category_id,
    purchase_description,
    purchase_total_amount,
    target_purchase_date,
    target_installment_count,
    purchase_notes
  );

  if exists (
    select 1
    from public.credit_card_installments installments
    join public.credit_card_invoices invoices
      on invoices.id = installments.invoice_id
    where installments.purchase_id = target_purchase_id
      and installments.user_id = current_user_id
      and invoices.status <> 'open'
      and installments.amount <>
        target_installment_amounts[installments.installment_number]
  ) then
    raise exception 'purchase_structure_locked' using errcode = '23514';
  end if;

  update public.credit_card_installments installments
  set amount = distribution.amount
  from unnest(target_installment_amounts) with ordinality
    as distribution(amount, installment_number)
  where installments.purchase_id = target_purchase_id
    and installments.user_id = current_user_id
    and installments.installment_number = distribution.installment_number;

  update public.credit_card_purchases
  set is_recurring = coalesce(purchase_is_recurring, false)
  where id = target_purchase_id
    and user_id = current_user_id
    and status = 'active';

  for affected_invoice_id in
    select distinct invoice_id
    from public.credit_card_installments
    where purchase_id = target_purchase_id
      and user_id = current_user_id
  loop
    perform public.refresh_credit_card_invoice_total(affected_invoice_id);
  end loop;

  return true;
end;
$$;

create or replace function private.update_credit_card_installment_amount(
  target_installment_id uuid,
  target_amount_minor bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_purchase_id uuid;
  target_invoice_id uuid;
  new_purchase_total numeric;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_amount_minor not between 1 and 9007199254740991 then
    raise exception 'invalid_installment_amount' using errcode = '23514';
  end if;

  select installments.purchase_id, installments.invoice_id
  into target_purchase_id, target_invoice_id
  from public.credit_card_installments installments
  join public.credit_card_invoices invoices
    on invoices.id = installments.invoice_id
  join public.credit_card_purchases purchases
    on purchases.id = installments.purchase_id
  where installments.id = target_installment_id
    and installments.user_id = current_user_id
    and invoices.user_id = current_user_id
    and purchases.user_id = current_user_id
    and installments.status = 'pending'
    and invoices.status = 'open'
    and purchases.status = 'active'
  for update of installments, invoices, purchases;

  if not found then
    raise exception 'installment_not_editable' using errcode = 'P0002';
  end if;

  update public.credit_card_installments
  set amount = target_amount_minor
  where id = target_installment_id
    and user_id = current_user_id;

  select sum(amount)
  into new_purchase_total
  from public.credit_card_installments
  where purchase_id = target_purchase_id
    and user_id = current_user_id
    and status <> 'cancelled';

  if new_purchase_total not between 1 and 9007199254740991 then
    raise exception 'invalid_purchase_values' using errcode = '23514';
  end if;

  update public.credit_card_purchases
  set total_amount = new_purchase_total
  where id = target_purchase_id
    and user_id = current_user_id;

  perform public.refresh_credit_card_invoice_total(target_invoice_id);
  return true;
end;
$$;

create or replace function public.create_credit_card_purchase_custom(
  target_credit_card_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  target_installment_amounts bigint[],
  purchase_is_recurring boolean default false,
  purchase_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_credit_card_purchase_custom(
    target_credit_card_id,
    target_category_id,
    purchase_description,
    purchase_total_amount,
    target_purchase_date,
    target_installment_count,
    target_installment_amounts,
    purchase_is_recurring,
    purchase_notes
  );
$$;

create or replace function public.update_credit_card_purchase_custom(
  target_purchase_id uuid,
  target_category_id uuid,
  purchase_description text,
  purchase_total_amount numeric,
  target_purchase_date date,
  target_installment_count integer,
  target_installment_amounts bigint[],
  purchase_is_recurring boolean default false,
  purchase_notes text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_credit_card_purchase_custom(
    target_purchase_id,
    target_category_id,
    purchase_description,
    purchase_total_amount,
    target_purchase_date,
    target_installment_count,
    target_installment_amounts,
    purchase_is_recurring,
    purchase_notes
  );
$$;

create or replace function public.update_credit_card_installment_amount(
  target_installment_id uuid,
  target_amount_minor bigint
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_credit_card_installment_amount(
    target_installment_id,
    target_amount_minor
  );
$$;

revoke all on function private.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
) from public, anon, authenticated;
revoke all on function private.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
) from public, anon, authenticated;
revoke all on function private.update_credit_card_installment_amount(
  uuid, bigint
) from public, anon, authenticated;

grant execute on function private.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
) to authenticated;
grant execute on function private.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
) to authenticated;
grant execute on function private.update_credit_card_installment_amount(
  uuid, bigint
) to authenticated;

revoke all on function public.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
) from public, anon;
revoke all on function public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
) from public, anon;
revoke all on function public.update_credit_card_installment_amount(
  uuid, bigint
) from public, anon;

grant execute on function public.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
) to authenticated;
grant execute on function public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
) to authenticated;
grant execute on function public.update_credit_card_installment_amount(
  uuid, bigint
) to authenticated;

notify pgrst, 'reload schema';
