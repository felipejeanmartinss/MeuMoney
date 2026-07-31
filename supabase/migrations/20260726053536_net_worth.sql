-- Sprint 8: manual assets and liabilities kept outside transactional accounts.

create type public.net_worth_kind as enum ('asset', 'liability');

create type public.net_worth_item_type as enum (
  'real_estate',
  'vehicle',
  'other_asset',
  'financing',
  'loan',
  'other_debt'
);

create table public.net_worth_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.net_worth_kind not null,
  item_type public.net_worth_item_type not null,
  name text not null
    check (char_length(trim(name)) between 1 and 100),
  currency char(3) not null
    check (currency in ('BRL', 'USD', 'EUR')),
  current_value_minor bigint not null
    check (current_value_minor between 0 and 9007199254740991),
  valuation_date date not null,
  context public.financial_context not null,
  notes text
    check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint net_worth_items_id_user_unique unique (id, user_id),
  constraint net_worth_items_type_matches_kind check (
    (
      kind = 'asset'
      and item_type in ('real_estate', 'vehicle', 'other_asset')
    )
    or (
      kind = 'liability'
      and item_type in ('financing', 'loan', 'other_debt')
    )
  ),
  constraint net_worth_items_archive_state_consistent check (
    (is_active and archived_at is null)
    or (not is_active and archived_at is not null)
  )
);

create table public.net_worth_valuations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  currency char(3) not null
    check (currency in ('BRL', 'USD', 'EUR')),
  value_minor bigint not null
    check (value_minor between 0 and 9007199254740991),
  valuation_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint net_worth_valuations_item_owner_fkey
    foreign key (item_id, user_id)
    references public.net_worth_items(id, user_id)
    on delete cascade,
  constraint net_worth_valuations_item_date_unique
    unique (item_id, valuation_date)
);

create index net_worth_items_owner_type_idx
on public.net_worth_items (user_id, item_type, name);

create index net_worth_items_active_summary_idx
on public.net_worth_items (user_id, currency, kind)
where is_active;

create index net_worth_valuations_owner_history_idx
on public.net_worth_valuations (user_id, item_id, valuation_date desc);

create trigger net_worth_items_set_updated_at
before update on public.net_worth_items
for each row execute procedure public.set_updated_at();

create trigger net_worth_valuations_set_updated_at
before update on public.net_worth_valuations
for each row execute procedure public.set_updated_at();

create or replace function public.validate_net_worth_item()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or new.user_id <> current_user_id then
    raise exception 'net_worth_item_user_mismatch' using errcode = '42501';
  end if;

  if new.valuation_date > current_date then
    raise exception 'future_net_worth_valuation' using errcode = '22007';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'net_worth_item_owner_is_immutable' using errcode = '42501';
    end if;

    if new.currency <> old.currency then
      raise exception 'net_worth_item_currency_is_immutable' using errcode = '23514';
    end if;

    if new.kind <> old.kind then
      raise exception 'net_worth_item_kind_is_immutable' using errcode = '23514';
    end if;

    if (
      new.current_value_minor <> old.current_value_minor
      or new.valuation_date <> old.valuation_date
    ) and new.valuation_date < old.valuation_date then
      raise exception 'net_worth_valuation_date_cannot_go_backwards'
        using errcode = '22007';
    end if;
  end if;

  return new;
end;
$$;

create trigger net_worth_items_validate
before insert or update
on public.net_worth_items
for each row execute procedure public.validate_net_worth_item();

create or replace function public.record_net_worth_valuation()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.net_worth_valuations (
    item_id,
    user_id,
    currency,
    value_minor,
    valuation_date
  )
  values (
    new.id,
    new.user_id,
    new.currency,
    new.current_value_minor,
    new.valuation_date
  )
  on conflict (item_id, valuation_date)
  do update set
    value_minor = excluded.value_minor,
    currency = excluded.currency,
    updated_at = now();

  return new;
end;
$$;

create trigger net_worth_items_record_initial_valuation
after insert
on public.net_worth_items
for each row execute procedure public.record_net_worth_valuation();

create trigger net_worth_items_record_changed_valuation
after update of current_value_minor, valuation_date
on public.net_worth_items
for each row
when (
  old.current_value_minor is distinct from new.current_value_minor
  or old.valuation_date is distinct from new.valuation_date
)
execute procedure public.record_net_worth_valuation();

alter table public.net_worth_items enable row level security;
alter table public.net_worth_valuations enable row level security;

create policy "net_worth_items_owner_select" on public.net_worth_items
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "net_worth_items_owner_insert" on public.net_worth_items
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "net_worth_items_owner_update" on public.net_worth_items
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "net_worth_valuations_owner_select"
on public.net_worth_valuations
for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.net_worth_items from anon, authenticated;
grant select on table public.net_worth_items to authenticated;
grant insert (
  user_id,
  kind,
  item_type,
  name,
  currency,
  current_value_minor,
  valuation_date,
  context,
  notes
) on table public.net_worth_items to authenticated;
grant update (
  item_type,
  name,
  current_value_minor,
  valuation_date,
  context,
  notes,
  is_active,
  archived_at
) on table public.net_worth_items to authenticated;

revoke all on table public.net_worth_valuations from anon, authenticated;
grant select on table public.net_worth_valuations to authenticated;

create or replace view public.net_worth_summary
with (security_invoker = true)
as
select
  user_id,
  currency,
  coalesce(
    sum(current_value_minor) filter (where kind = 'asset'),
    0
  )::numeric(20, 0) as assets_minor,
  coalesce(
    sum(current_value_minor) filter (where kind = 'liability'),
    0
  )::numeric(20, 0) as liabilities_minor,
  (
    coalesce(
      sum(current_value_minor) filter (where kind = 'asset'),
      0
    )
    - coalesce(
      sum(current_value_minor) filter (where kind = 'liability'),
      0
    )
  )::numeric(20, 0) as net_worth_minor
from public.net_worth_items
where is_active
group by user_id, currency;

revoke all on table public.net_worth_summary from anon, authenticated;
grant select on table public.net_worth_summary to authenticated;

revoke all on function public.validate_net_worth_item()
from public, anon, authenticated;
revoke all on function public.record_net_worth_valuation()
from public, anon, authenticated;

comment on table public.net_worth_items is
'Ativos e passivos manuais, independentes de contas e movimentacoes transacionais.';
comment on table public.net_worth_valuations is
'Historico imutavel para o cliente das avaliacoes registradas em cada item patrimonial.';
comment on view public.net_worth_summary is
'Ativos, passivos e patrimonio liquido dos itens ativos, agregados separadamente por usuario e moeda.';
