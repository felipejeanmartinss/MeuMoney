-- Card statements keep the closing-cycle reference internally, while the UI
-- presents the billing month derived from the due date. This migration adds
-- the only two supported statement credits and a complete import-history
-- cleanup operation without deleting confirmed financial records.

do $$
begin
  create type public.credit_card_entry_kind as enum (
    'purchase', 'refund', 'cashback'
  );
exception when duplicate_object then null;
end;
$$;

alter table public.credit_card_purchases
add column entry_kind public.credit_card_entry_kind not null default 'purchase';

alter table public.credit_card_purchases
alter column category_id drop not null;

alter table public.credit_card_purchases
add constraint credit_card_purchases_entry_shape_check
check (
  (
    entry_kind = 'purchase'
    and category_id is not null
  )
  or (
    entry_kind in ('refund', 'cashback')
    and category_id is null
    and installment_count = 1
    and not is_recurring
  )
);

create or replace function public.refresh_credit_card_invoice_total(
  target_invoice_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  update public.credit_card_invoices invoices
  set total_amount = greatest(coalesce((
    select sum(
      case purchases.entry_kind
        when 'purchase' then installments.amount
        else -installments.amount
      end
    )
    from public.credit_card_installments installments
    join public.credit_card_purchases purchases
      on purchases.id = installments.purchase_id
      and purchases.user_id = installments.user_id
    where installments.invoice_id = target_invoice_id
      and installments.user_id = current_user_id
      and installments.status <> 'cancelled'
      and purchases.status = 'active'
  ), 0), 0)
  where invoices.id = target_invoice_id
    and invoices.user_id = current_user_id
    and invoices.status = 'open';
end;
$$;

drop function if exists public.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
);
drop function if exists public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
);
drop function if exists private.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
);
drop function if exists private.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text
);

create or replace function private.create_credit_card_purchase_custom(
  target_credit_card_id uuid,
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
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_purchase_id uuid;
  affected_invoice_id uuid;
  direct_invoice_reference date;
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
    and (
      target_installment_count <> 1
      or coalesce(purchase_is_recurring, false)
    )
  then
    raise exception 'invalid_credit_card_credit' using errcode = '23514';
  end if;
  if target_invoice_id is not null and purchase_entry_kind = 'purchase' then
    raise exception 'invalid_credit_card_credit' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.credit_cards cards
    where cards.id = target_credit_card_id
      and cards.user_id = current_user_id
      and cards.is_active
  ) then
    raise exception 'invalid_credit_card' using errcode = '23503';
  end if;

  if purchase_entry_kind = 'purchase' then
    if not exists (
      select 1
      from public.categories categories
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

  if target_invoice_id is not null then
    select invoices.reference_month
    into direct_invoice_reference
    from public.credit_card_invoices invoices
    where invoices.id = target_invoice_id
      and invoices.user_id = current_user_id
      and invoices.credit_card_id = target_credit_card_id
      and invoices.status = 'open'
    for update;
    if not found then
      raise exception 'invoice_not_open' using errcode = '23514';
    end if;
  end if;

  insert into public.credit_card_purchases (
    user_id,
    credit_card_id,
    category_id,
    entry_kind,
    description,
    total_amount,
    purchase_date,
    installment_count,
    is_recurring,
    notes
  ) values (
    current_user_id,
    target_credit_card_id,
    case when purchase_entry_kind = 'purchase' then target_category_id end,
    purchase_entry_kind,
    trim(purchase_description),
    purchase_total_amount,
    target_purchase_date,
    target_installment_count,
    coalesce(purchase_is_recurring, false),
    nullif(trim(purchase_notes), '')
  ) returning id into new_purchase_id;

  if target_invoice_id is not null then
    insert into public.credit_card_installments (
      user_id,
      purchase_id,
      credit_card_id,
      invoice_id,
      installment_number,
      installment_count,
      amount,
      competence_date
    ) values (
      current_user_id,
      new_purchase_id,
      target_credit_card_id,
      target_invoice_id,
      1,
      1,
      target_installment_amounts[1],
      direct_invoice_reference
    );
  else
    perform public.generate_credit_card_installments(new_purchase_id);

    update public.credit_card_installments installments
    set amount = distribution.amount
    from unnest(target_installment_amounts) with ordinality
      as distribution(amount, installment_number)
    where installments.purchase_id = new_purchase_id
      and installments.user_id = current_user_id
      and installments.installment_number = distribution.installment_number;
  end if;

  for affected_invoice_id in
    select distinct installments.invoice_id
    from public.credit_card_installments installments
    where installments.purchase_id = new_purchase_id
      and installments.user_id = current_user_id
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
    and (
      target_installment_count <> 1
      or coalesce(purchase_is_recurring, false)
    )
  then
    raise exception 'invalid_credit_card_credit' using errcode = '23514';
  end if;
  if target_invoice_id is not null and purchase_entry_kind = 'purchase' then
    raise exception 'invalid_credit_card_credit' using errcode = '23514';
  end if;

  if purchase_entry_kind = 'purchase' then
    if not exists (
      select 1
      from public.categories categories
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

  select min(installments.invoice_id)
  into existing_invoice_id
  from public.credit_card_installments installments
  where installments.purchase_id = target_purchase_id
    and installments.user_id = current_user_id;

  structure_changed :=
    purchase_record.total_amount <> purchase_total_amount
    or purchase_record.purchase_date <> target_purchase_date
    or purchase_record.installment_count <> target_installment_count
    or purchase_record.entry_kind <> purchase_entry_kind
    or coalesce(target_invoice_id::text, '')
      <> coalesce(
        case
          when purchase_record.entry_kind <> 'purchase'
          then existing_invoice_id::text
        end,
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
      and (
        installments.status = 'paid'
        or invoices.status <> 'open'
      )
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
  set category_id = case
        when purchase_entry_kind = 'purchase' then target_category_id
      end,
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
    select 1
    from public.credit_card_installments installments
    where installments.purchase_id = target_purchase_id
      and installments.user_id = current_user_id
  ) then
    if target_invoice_id is not null then
      insert into public.credit_card_installments (
        user_id,
        purchase_id,
        credit_card_id,
        invoice_id,
        installment_number,
        installment_count,
        amount,
        competence_date
      ) values (
        current_user_id,
        target_purchase_id,
        purchase_record.credit_card_id,
        target_invoice_id,
        1,
        1,
        target_installment_amounts[1],
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

create or replace function public.create_credit_card_purchase_custom(
  target_credit_card_id uuid,
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
    purchase_notes,
    purchase_entry_kind,
    target_invoice_id
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
  purchase_notes text default null,
  purchase_entry_kind public.credit_card_entry_kind default 'purchase',
  target_invoice_id uuid default null
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
    purchase_notes,
    purchase_entry_kind,
    target_invoice_id
  );
$$;

revoke all on function private.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) from public, anon, authenticated;
revoke all on function private.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) from public, anon, authenticated;
grant execute on function private.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) to authenticated;
grant execute on function private.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) to authenticated;

revoke all on function public.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) from public, anon;
revoke all on function public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) from public, anon;
grant execute on function public.create_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) to authenticated;
grant execute on function public.update_credit_card_purchase_custom(
  uuid, uuid, text, numeric, date, integer, bigint[], boolean, text,
  public.credit_card_entry_kind, uuid
) to authenticated;

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
      select sum(
        case purchases.entry_kind
          when 'purchase' then installments.amount
          else -installments.amount
        end
      )
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
      select sum(purchases.total_amount)
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
        and purchases.entry_kind = 'purchase'
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

create or replace view public.monthly_consumption
with (security_invoker = true)
as
select
  consumption.user_id,
  consumption.category_id,
  consumption.context,
  consumption.currency,
  consumption.reference_month,
  sum(consumption.amount_minor)::numeric(20, 0) as realized_amount_minor
from (
  select
    transactions.user_id,
    transactions.category_id,
    categories.context,
    accounts.currency,
    date_trunc('month', transactions.transaction_date)::date
      as reference_month,
    transactions.amount_minor::numeric(20, 0) as amount_minor
  from public.transactions
  join public.accounts
    on accounts.id = transactions.account_id
    and accounts.user_id = transactions.user_id
  join public.categories
    on categories.id = transactions.category_id
    and categories.user_id = transactions.user_id
  where transactions.transaction_type = 'expense'
    and transactions.status = 'completed'
    and transactions.is_active
    and transactions.category_id is not null
    and transactions.origin_type <> 'credit_card_invoice_payment'

  union all

  select
    installments.user_id,
    purchases.category_id,
    categories.context,
    cards.currency,
    installments.competence_date as reference_month,
    installments.amount::numeric(20, 0) as amount_minor
  from public.credit_card_installments installments
  join public.credit_card_purchases purchases
    on purchases.id = installments.purchase_id
    and purchases.user_id = installments.user_id
  join public.credit_cards cards
    on cards.id = installments.credit_card_id
    and cards.user_id = installments.user_id
  join public.categories
    on categories.id = purchases.category_id
    and categories.user_id = installments.user_id
  where purchases.status = 'active'
    and purchases.entry_kind = 'purchase'
    and installments.status <> 'cancelled'
) consumption
group by
  consumption.user_id,
  consumption.category_id,
  consumption.context,
  consumption.currency,
  consumption.reference_month;

revoke all on table public.monthly_consumption from anon, authenticated;
grant select on table public.monthly_consumption to authenticated;

create or replace function private.clear_all_import_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  deleted_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  delete from public.import_jobs jobs
  where jobs.user_id = current_user_id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.clear_all_import_jobs()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.clear_all_import_jobs();
$$;

revoke all on function private.clear_all_import_jobs()
from public, anon, authenticated;
grant execute on function private.clear_all_import_jobs()
to authenticated;
revoke all on function public.clear_all_import_jobs()
from public, anon;
grant execute on function public.clear_all_import_jobs()
to authenticated;

comment on column public.credit_card_purchases.entry_kind is
  'Purchase increases the statement; refund and cashback are the only supported credits.';
comment on function public.clear_all_import_jobs() is
  'Removes all import jobs owned by the authenticated user without deleting confirmed financial records.';

notify pgrst, 'reload schema';
