-- Sprint 9: manually maintained investment positions and cash-flow history.

create type public.investment_class as enum (
  'fixed_income',
  'stock',
  'fund',
  'etf',
  'real_estate_fund',
  'pension',
  'crypto'
);

create type public.investment_cash_flow_type as enum (
  'contribution',
  'redemption',
  'income'
);

create table public.investment_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution text not null
    check (char_length(trim(institution)) between 1 and 120),
  investment_class public.investment_class not null,
  asset_name text not null
    check (char_length(trim(asset_name)) between 1 and 120),
  currency char(3) not null
    check (currency in ('BRL', 'USD', 'EUR')),
  quantity numeric(30, 12) not null
    check (quantity between 0 and 999999999999999999),
  accumulated_cost_minor bigint not null
    check (accumulated_cost_minor between 0 and 9007199254740991),
  current_value_minor bigint not null
    check (current_value_minor between 0 and 9007199254740991),
  position_date date not null,
  context public.financial_context not null,
  history_is_complete boolean not null default false,
  notes text
    check (notes is null or char_length(notes) <= 1000),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_positions_id_user_unique unique (id, user_id),
  constraint investment_positions_archive_state_consistent check (
    (is_active and archived_at is null)
    or (not is_active and archived_at is not null)
  )
);

create table public.investment_position_snapshots (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  currency char(3) not null
    check (currency in ('BRL', 'USD', 'EUR')),
  quantity numeric(30, 12) not null
    check (quantity between 0 and 999999999999999999),
  accumulated_cost_minor bigint not null
    check (accumulated_cost_minor between 0 and 9007199254740991),
  current_value_minor bigint not null
    check (current_value_minor between 0 and 9007199254740991),
  position_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_position_snapshots_owner_fkey
    foreign key (position_id, user_id)
    references public.investment_positions(id, user_id)
    on delete cascade,
  constraint investment_position_snapshots_position_date_unique
    unique (position_id, position_date)
);

create table public.investment_cash_flows (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  cash_flow_type public.investment_cash_flow_type not null,
  amount_minor bigint not null
    check (amount_minor between 1 and 9007199254740991),
  quantity numeric(30, 12)
    check (
      quantity is null
      or quantity between 0.000000000001 and 999999999999999999
    ),
  cash_flow_date date not null,
  notes text
    check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  constraint investment_cash_flows_owner_fkey
    foreign key (position_id, user_id)
    references public.investment_positions(id, user_id)
    on delete cascade
);

create index investment_positions_owner_list_idx
on public.investment_positions (
  user_id,
  is_active desc,
  currency,
  investment_class,
  asset_name
);

create index investment_positions_active_summary_idx
on public.investment_positions (user_id, currency)
where is_active;

create index investment_position_snapshots_owner_history_idx
on public.investment_position_snapshots (
  user_id,
  position_id,
  position_date desc
);

create index investment_position_snapshots_position_owner_idx
on public.investment_position_snapshots (position_id, user_id);

create index investment_cash_flows_owner_history_idx
on public.investment_cash_flows (
  user_id,
  position_id,
  cash_flow_date desc,
  created_at desc
);

create index investment_cash_flows_position_owner_idx
on public.investment_cash_flows (position_id, user_id);

create trigger investment_positions_set_updated_at
before update on public.investment_positions
for each row execute procedure public.set_updated_at();

create trigger investment_position_snapshots_set_updated_at
before update on public.investment_position_snapshots
for each row execute procedure public.set_updated_at();

create or replace function public.validate_investment_position()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or new.user_id <> current_user_id then
    raise exception 'investment_position_user_mismatch' using errcode = '42501';
  end if;

  if new.position_date > current_date then
    raise exception 'future_investment_position' using errcode = '22007';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'investment_position_owner_is_immutable'
        using errcode = '42501';
    end if;

    if new.currency <> old.currency then
      raise exception 'investment_position_currency_is_immutable'
        using errcode = '23514';
    end if;

    if (
      new.quantity <> old.quantity
      or new.accumulated_cost_minor <> old.accumulated_cost_minor
      or new.current_value_minor <> old.current_value_minor
      or new.position_date <> old.position_date
    ) and new.position_date < old.position_date then
      raise exception 'investment_position_date_cannot_go_backwards'
        using errcode = '22007';
    end if;
  end if;

  return new;
end;
$$;

create trigger investment_positions_validate
before insert or update
on public.investment_positions
for each row execute procedure public.validate_investment_position();

create or replace function public.record_investment_position_snapshot()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.investment_position_snapshots (
    position_id,
    user_id,
    currency,
    quantity,
    accumulated_cost_minor,
    current_value_minor,
    position_date
  )
  values (
    new.id,
    new.user_id,
    new.currency,
    new.quantity,
    new.accumulated_cost_minor,
    new.current_value_minor,
    new.position_date
  )
  on conflict (position_id, position_date)
  do update set
    currency = excluded.currency,
    quantity = excluded.quantity,
    accumulated_cost_minor = excluded.accumulated_cost_minor,
    current_value_minor = excluded.current_value_minor,
    updated_at = now();

  return new;
end;
$$;

create trigger investment_positions_record_initial_snapshot
after insert on public.investment_positions
for each row execute procedure public.record_investment_position_snapshot();

create trigger investment_positions_record_changed_snapshot
after update of quantity, accumulated_cost_minor, current_value_minor, position_date
on public.investment_positions
for each row
when (
  old.quantity is distinct from new.quantity
  or old.accumulated_cost_minor is distinct from new.accumulated_cost_minor
  or old.current_value_minor is distinct from new.current_value_minor
  or old.position_date is distinct from new.position_date
)
execute procedure public.record_investment_position_snapshot();

create or replace function public.validate_investment_cash_flow()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or new.user_id <> current_user_id then
    raise exception 'investment_cash_flow_user_mismatch'
      using errcode = '42501';
  end if;

  if new.cash_flow_date > current_date then
    raise exception 'future_investment_cash_flow' using errcode = '22007';
  end if;

  if not exists (
    select 1
    from public.investment_positions as position
    where position.id = new.position_id
      and position.user_id = current_user_id
  ) then
    raise exception 'investment_position_not_owned' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger investment_cash_flows_validate
before insert on public.investment_cash_flows
for each row execute procedure public.validate_investment_cash_flow();

alter table public.investment_positions enable row level security;
alter table public.investment_position_snapshots enable row level security;
alter table public.investment_cash_flows enable row level security;

create policy "investment_positions_owner_select"
on public.investment_positions
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "investment_positions_owner_insert"
on public.investment_positions
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "investment_positions_owner_update"
on public.investment_positions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "investment_position_snapshots_owner_select"
on public.investment_position_snapshots
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "investment_cash_flows_owner_select"
on public.investment_cash_flows
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "investment_cash_flows_owner_insert"
on public.investment_cash_flows
for insert to authenticated
with check ((select auth.uid()) = user_id);

revoke all on table public.investment_positions from anon, authenticated;
grant select on table public.investment_positions to authenticated;
grant insert (
  user_id,
  institution,
  investment_class,
  asset_name,
  currency,
  quantity,
  accumulated_cost_minor,
  current_value_minor,
  position_date,
  context,
  history_is_complete,
  notes
) on table public.investment_positions to authenticated;
grant update (
  institution,
  investment_class,
  asset_name,
  quantity,
  accumulated_cost_minor,
  current_value_minor,
  position_date,
  context,
  history_is_complete,
  notes,
  is_active,
  archived_at
) on table public.investment_positions to authenticated;

revoke all on table public.investment_position_snapshots
from anon, authenticated;
grant select on table public.investment_position_snapshots to authenticated;

revoke all on table public.investment_cash_flows from anon, authenticated;
grant select on table public.investment_cash_flows to authenticated;
grant insert (
  position_id,
  user_id,
  cash_flow_type,
  amount_minor,
  quantity,
  cash_flow_date,
  notes
) on table public.investment_cash_flows to authenticated;

create or replace view public.investment_position_summary
with (security_invoker = true)
as
select
  position.id,
  position.user_id,
  position.institution,
  position.investment_class,
  position.asset_name,
  position.currency,
  position.quantity,
  position.accumulated_cost_minor,
  position.current_value_minor,
  position.position_date,
  position.context,
  position.history_is_complete,
  position.notes,
  position.is_active,
  position.archived_at,
  position.created_at,
  position.updated_at,
  coalesce(
    sum(flow.amount_minor) filter (
      where flow.cash_flow_type = 'contribution'
    ),
    0
  )::numeric(20, 0) as contributions_minor,
  coalesce(
    sum(flow.amount_minor) filter (
      where flow.cash_flow_type = 'redemption'
    ),
    0
  )::numeric(20, 0) as redemptions_minor,
  coalesce(
    sum(flow.amount_minor) filter (
      where flow.cash_flow_type = 'income'
    ),
    0
  )::numeric(20, 0) as income_minor,
  (
    position.current_value_minor - position.accumulated_cost_minor
  )::numeric(20, 0) as unrealized_appreciation_minor,
  case
    when position.history_is_complete then (
      position.current_value_minor
      + coalesce(
        sum(flow.amount_minor) filter (
          where flow.cash_flow_type = 'redemption'
        ),
        0
      )
      + coalesce(
        sum(flow.amount_minor) filter (
          where flow.cash_flow_type = 'income'
        ),
        0
      )
      - coalesce(
        sum(flow.amount_minor) filter (
          where flow.cash_flow_type = 'contribution'
        ),
        0
      )
    )::numeric(20, 0)
    else null
  end as total_result_minor
from public.investment_positions as position
left join public.investment_cash_flows as flow
  on flow.position_id = position.id
 and flow.user_id = position.user_id
group by position.id;

revoke all on table public.investment_position_summary
from anon, authenticated;
grant select on table public.investment_position_summary to authenticated;

create or replace view public.net_worth_summary
with (security_invoker = true)
as
with manual_summary as (
  select
    user_id,
    currency,
    coalesce(
      sum(current_value_minor) filter (where kind = 'asset'),
      0
    )::numeric(20, 0) as manual_assets_minor,
    coalesce(
      sum(current_value_minor) filter (where kind = 'liability'),
      0
    )::numeric(20, 0) as liabilities_minor
  from public.net_worth_items
  where is_active
  group by user_id, currency
),
investment_summary as (
  select
    user_id,
    currency,
    sum(current_value_minor)::numeric(20, 0) as investments_minor
  from public.investment_positions
  where is_active
  group by user_id, currency
),
summary_keys as (
  select user_id, currency from manual_summary
  union
  select user_id, currency from investment_summary
)
select
  summary_keys.user_id,
  summary_keys.currency,
  (
    coalesce(manual_summary.manual_assets_minor, 0)
    + coalesce(investment_summary.investments_minor, 0)
  )::numeric(20, 0) as assets_minor,
  coalesce(manual_summary.liabilities_minor, 0)::numeric(20, 0)
    as liabilities_minor,
  (
    coalesce(manual_summary.manual_assets_minor, 0)
    + coalesce(investment_summary.investments_minor, 0)
    - coalesce(manual_summary.liabilities_minor, 0)
  )::numeric(20, 0) as net_worth_minor,
  coalesce(manual_summary.manual_assets_minor, 0)::numeric(20, 0)
    as manual_assets_minor,
  coalesce(investment_summary.investments_minor, 0)::numeric(20, 0)
    as investments_minor
from summary_keys
left join manual_summary
  on manual_summary.user_id = summary_keys.user_id
 and manual_summary.currency = summary_keys.currency
left join investment_summary
  on investment_summary.user_id = summary_keys.user_id
 and investment_summary.currency = summary_keys.currency;

revoke all on table public.net_worth_summary from anon, authenticated;
grant select on table public.net_worth_summary to authenticated;

revoke all on function public.validate_investment_position()
from public, anon, authenticated;
revoke all on function public.record_investment_position_snapshot()
from public, anon, authenticated;
revoke all on function public.validate_investment_cash_flow()
from public, anon, authenticated;

comment on table public.investment_positions is
'Posicao manual atual de cada investimento, independente de contas transacionais.';
comment on table public.investment_position_snapshots is
'Historico automatico e somente leitura das posicoes manuais.';
comment on table public.investment_cash_flows is
'Historico de aportes, resgates e rendas informado pelo usuario.';
comment on view public.investment_position_summary is
'Posicao e fluxos separados; resultado total somente quando o historico foi declarado completo.';
comment on view public.net_worth_summary is
'Patrimonio por moeda com ativos manuais, investimentos ativos e passivos manuais.';
