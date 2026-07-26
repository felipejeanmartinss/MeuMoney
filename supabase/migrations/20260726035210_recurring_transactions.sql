-- Sprint 5: recurring income and expense templates.
-- Generated transactions are always pending and are uniquely identified by
-- recurring_transaction_id + transaction_date.

create type public.recurrence_frequency as enum (
  'weekly',
  'monthly',
  'yearly'
);

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  transaction_type public.transaction_kind not null,
  description text not null
    check (char_length(description) between 1 and 180),
  amount_minor bigint not null
    check (amount_minor between 1 and 9007199254740991),
  frequency public.recurrence_frequency not null,
  start_date date not null,
  end_date date,
  next_occurrence date not null,
  notes text
    check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_transactions_supported_type
    check (transaction_type in ('income', 'expense')),
  constraint recurring_transactions_date_order
    check (
      next_occurrence >= start_date
      and (end_date is null or end_date >= start_date)
    ),
  constraint recurring_transactions_end_state
    check (ended_at is null or not is_active)
);

alter table public.transactions
add column recurring_transaction_id uuid;

alter table public.transactions
add constraint transactions_recurring_transaction_fk
foreign key (recurring_transaction_id)
references public.recurring_transactions(id)
on delete restrict;

alter table public.transactions
drop constraint transactions_origin_consistency;

alter table public.transactions
add constraint transactions_origin_consistency
check (
  (
    origin_type = 'manual'
    and origin_id is null
    and credit_card_invoice_id is null
    and recurring_transaction_id is null
    and category_id is not null
  )
  or (
    origin_type = 'credit_card_invoice_payment'
    and origin_id = credit_card_invoice_id
    and credit_card_invoice_id is not null
    and recurring_transaction_id is null
    and category_id is null
    and transaction_type = 'expense'
    and status = 'completed'
  )
  or (
    origin_type = 'system'
    and origin_id = recurring_transaction_id
    and recurring_transaction_id is not null
    and credit_card_invoice_id is null
    and category_id is not null
    and status = 'pending'
  )
);

create index recurring_transactions_account_id_idx
on public.recurring_transactions (account_id);

create index recurring_transactions_category_id_idx
on public.recurring_transactions (category_id);

create index recurring_transactions_due_idx
on public.recurring_transactions (user_id, next_occurrence)
where is_active;

create unique index transactions_recurring_occurrence_unique_idx
on public.transactions (recurring_transaction_id, transaction_date)
where recurring_transaction_id is not null;

create trigger recurring_transactions_set_updated_at
before update on public.recurring_transactions
for each row execute procedure public.set_updated_at();

create or replace function public.validate_recurring_transaction()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or new.user_id <> (select auth.uid()) then
    raise exception 'recurring_transaction_user_mismatch'
      using errcode = '42501';
  end if;

  if new.transaction_type not in ('income', 'expense') then
    raise exception 'invalid_recurring_transaction_type'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.accounts
    where id = new.account_id
      and user_id = new.user_id
      and archived_at is null
  ) then
    raise exception 'invalid_recurring_transaction_account'
      using errcode = '23503';
  end if;

  if not exists (
    select 1
    from public.categories
    where id = new.category_id
      and user_id = new.user_id
      and kind = new.transaction_type
      and archived_at is null
  ) then
    raise exception 'invalid_recurring_transaction_category'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger recurring_transactions_validate_financial_data
before insert or update of
  user_id,
  account_id,
  category_id,
  transaction_type
on public.recurring_transactions
for each row execute procedure public.validate_recurring_transaction();

create or replace function public.validate_financial_transaction()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or new.user_id <> (select auth.uid()) then
    raise exception 'transaction_user_mismatch' using errcode = '42501';
  end if;

  if new.transaction_type not in ('income', 'expense') then
    raise exception 'invalid_transaction_type' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.accounts
    where id = new.account_id and user_id = new.user_id
  ) then
    raise exception 'invalid_transaction_account' using errcode = '23503';
  end if;

  if new.origin_type in ('manual', 'system') and not exists (
    select 1
    from public.categories
    where id = new.category_id
      and user_id = new.user_id
      and kind = new.transaction_type
  ) then
    raise exception 'invalid_transaction_category' using errcode = '23503';
  end if;

  if new.origin_type = 'system' and not exists (
    select 1
    from public.recurring_transactions recurrence
    where recurrence.id = new.recurring_transaction_id
      and recurrence.id = new.origin_id
      and recurrence.user_id = new.user_id
      and recurrence.account_id = new.account_id
      and recurrence.category_id = new.category_id
      and recurrence.transaction_type = new.transaction_type
      and recurrence.description = new.description
      and recurrence.amount_minor = new.amount_minor
      and recurrence.notes is not distinct from new.notes
  ) then
    raise exception 'invalid_recurring_transaction_origin'
      using errcode = '23503';
  end if;

  if new.origin_type = 'credit_card_invoice_payment' and not exists (
    select 1
    from public.credit_card_invoices
    where id = new.credit_card_invoice_id and user_id = new.user_id
  ) then
    raise exception 'invalid_invoice_payment_origin'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace function public.recurrence_next_date(
  anchor_date date,
  current_occurrence date,
  target_frequency public.recurrence_frequency
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  target_month date;
  target_month_end date;
  target_year integer;
begin
  if current_occurrence < anchor_date then
    raise exception 'invalid_recurrence_current_occurrence'
      using errcode = '22007';
  end if;

  if target_frequency = 'weekly' then
    return current_occurrence + 7;
  end if;

  if target_frequency = 'monthly' then
    target_month :=
      date_trunc('month', current_occurrence + interval '1 month')::date;
    target_month_end :=
      (target_month + interval '1 month - 1 day')::date;

    return make_date(
      extract(year from target_month)::integer,
      extract(month from target_month)::integer,
      least(
        extract(day from anchor_date)::integer,
        extract(day from target_month_end)::integer
      )
    );
  end if;

  target_year := extract(year from current_occurrence)::integer + 1;
  target_month := make_date(
    target_year,
    extract(month from anchor_date)::integer,
    1
  );
  target_month_end :=
    (target_month + interval '1 month - 1 day')::date;

  return make_date(
    target_year,
    extract(month from anchor_date)::integer,
    least(
      extract(day from anchor_date)::integer,
      extract(day from target_month_end)::integer
    )
  );
end;
$$;

create or replace function public.set_recurring_transaction_state(
  target_recurring_id uuid,
  target_state text
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  recurrence_record public.recurring_transactions%rowtype;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into recurrence_record
  from public.recurring_transactions
  where id = target_recurring_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception 'recurring_transaction_not_found'
      using errcode = 'P0002';
  end if;

  if target_state = 'suspended' then
    if recurrence_record.ended_at is not null then
      raise exception 'recurring_transaction_already_ended'
        using errcode = '23514';
    end if;

    update public.recurring_transactions
    set is_active = false
    where id = target_recurring_id;
  elsif target_state = 'active' then
    if recurrence_record.ended_at is not null then
      raise exception 'recurring_transaction_already_ended'
        using errcode = '23514';
    end if;
    if recurrence_record.end_date is not null
      and recurrence_record.next_occurrence > recurrence_record.end_date then
      raise exception 'recurring_transaction_schedule_ended'
        using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.accounts
      where id = recurrence_record.account_id
        and user_id = current_user_id
        and archived_at is null
    ) then
      raise exception 'invalid_recurring_transaction_account'
        using errcode = '23503';
    end if;
    if not exists (
      select 1
      from public.categories
      where id = recurrence_record.category_id
        and user_id = current_user_id
        and kind = recurrence_record.transaction_type
        and archived_at is null
    ) then
      raise exception 'invalid_recurring_transaction_category'
        using errcode = '23503';
    end if;

    update public.recurring_transactions
    set is_active = true
    where id = target_recurring_id;
  elsif target_state = 'ended' then
    update public.recurring_transactions
    set is_active = false,
        ended_at = coalesce(ended_at, now())
    where id = target_recurring_id;
  else
    raise exception 'invalid_recurring_transaction_state'
      using errcode = '22023';
  end if;

  return true;
end;
$$;

create or replace function public.generate_recurring_transactions(
  target_until date
)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  recurrence_record public.recurring_transactions%rowtype;
  occurrence_date date;
  generated_count integer := 0;
  inserted_count integer;
  iteration_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_until is null then
    raise exception 'generation_date_required' using errcode = '22004';
  end if;

  for recurrence_record in
    select recurrence.*
    from public.recurring_transactions recurrence
    where recurrence.user_id = current_user_id
      and recurrence.is_active
      and recurrence.next_occurrence <= target_until
    order by recurrence.next_occurrence, recurrence.id
    for update skip locked
  loop
    occurrence_date := recurrence_record.next_occurrence;
    iteration_count := 0;

    if not exists (
      select 1
      from public.accounts
      where id = recurrence_record.account_id
        and user_id = current_user_id
        and archived_at is null
    ) then
      raise exception 'invalid_recurring_transaction_account'
        using errcode = '23503';
    end if;
    if not exists (
      select 1
      from public.categories
      where id = recurrence_record.category_id
        and user_id = current_user_id
        and kind = recurrence_record.transaction_type
        and archived_at is null
    ) then
      raise exception 'invalid_recurring_transaction_category'
        using errcode = '23503';
    end if;

    while occurrence_date <= target_until
      and (
        recurrence_record.end_date is null
        or occurrence_date <= recurrence_record.end_date
      )
    loop
      iteration_count := iteration_count + 1;
      if iteration_count > 10000 then
        raise exception 'recurring_transaction_generation_limit'
          using errcode = '54000';
      end if;

      insert into public.transactions (
        user_id,
        account_id,
        category_id,
        transaction_type,
        description,
        amount_minor,
        transaction_date,
        status,
        notes,
        is_active,
        origin_type,
        origin_id,
        recurring_transaction_id
      ) values (
        current_user_id,
        recurrence_record.account_id,
        recurrence_record.category_id,
        recurrence_record.transaction_type,
        recurrence_record.description,
        recurrence_record.amount_minor,
        occurrence_date,
        'pending',
        recurrence_record.notes,
        true,
        'system',
        recurrence_record.id,
        recurrence_record.id
      )
      on conflict (recurring_transaction_id, transaction_date)
        where recurring_transaction_id is not null
      do nothing;

      get diagnostics inserted_count = row_count;
      generated_count := generated_count + inserted_count;
      occurrence_date := public.recurrence_next_date(
        recurrence_record.start_date,
        occurrence_date,
        recurrence_record.frequency
      );
    end loop;

    update public.recurring_transactions
    set next_occurrence = occurrence_date,
        is_active = case
          when end_date is not null and occurrence_date > end_date
            then false
          else is_active
        end,
        ended_at = case
          when end_date is not null and occurrence_date > end_date
            then coalesce(ended_at, now())
          else ended_at
        end
    where id = recurrence_record.id;
  end loop;

  return generated_count;
end;
$$;

alter table public.recurring_transactions enable row level security;

create policy "recurring_transactions_owner_select"
on public.recurring_transactions
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "recurring_transactions_owner_insert"
on public.recurring_transactions
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "recurring_transactions_owner_update"
on public.recurring_transactions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.recurring_transactions from anon, authenticated;
grant select on table public.recurring_transactions to authenticated;
grant insert (
  user_id,
  account_id,
  category_id,
  transaction_type,
  description,
  amount_minor,
  frequency,
  start_date,
  end_date,
  next_occurrence,
  notes
) on table public.recurring_transactions to authenticated;
grant update (
  account_id,
  category_id,
  transaction_type,
  description,
  amount_minor,
  frequency,
  start_date,
  end_date,
  next_occurrence,
  notes
) on table public.recurring_transactions to authenticated;

revoke all on function public.validate_recurring_transaction()
from public, anon, authenticated;
revoke all on function public.recurrence_next_date(
  date,
  date,
  public.recurrence_frequency
) from public, anon;
revoke all on function public.set_recurring_transaction_state(uuid, text)
from public, anon;
revoke all on function public.generate_recurring_transactions(date)
from public, anon;

grant execute on function public.recurrence_next_date(
  date,
  date,
  public.recurrence_frequency
) to authenticated;
grant execute on function public.set_recurring_transaction_state(uuid, text)
to authenticated;
grant execute on function public.generate_recurring_transactions(date)
to authenticated;

comment on table public.recurring_transactions is
'Modelo de receitas e despesas recorrentes. Gera apenas lançamentos previstos.';
comment on column public.recurring_transactions.next_occurrence is
'Próxima data ainda não processada pelo gerador idempotente.';
comment on column public.recurring_transactions.ended_at is
'Quando preenchido, o encerramento é definitivo e impede reativação.';
comment on column public.transactions.recurring_transaction_id is
'Vínculo da ocorrência prevista com sua recorrência de origem.';
