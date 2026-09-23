-- Sprint 2: metas financeiras, contribuições e fontes vinculadas.

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  goal_type text not null check (goal_type in (
    'emergency_fund', 'travel', 'home_purchase', 'renovation',
    'financial_independence', 'financing_payoff'
  )),
  currency char(3) not null check (currency in ('BRL', 'USD', 'EUR')),
  target_amount_minor bigint not null check (target_amount_minor > 0),
  target_date date not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_goals
  add constraint financial_goals_id_user_unique unique (id, user_id);

create table public.financial_goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.financial_goals(id) on delete cascade,
  contribution_date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency in ('BRL', 'USD', 'EUR')),
  source text not null default 'manual'
    check (source in ('manual', 'transaction', 'investment')),
  description text check (description is null or char_length(description) <= 240),
  created_at timestamptz not null default now(),
  constraint financial_goal_contributions_id_user_unique unique (id, user_id),
  constraint financial_goal_contributions_goal_owner_fkey
    foreign key (goal_id, user_id)
    references public.financial_goals(id, user_id)
    on delete cascade
);

create table public.financial_goal_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  source_type text not null check (source_type in ('account', 'investment', 'financing')),
  account_id uuid references public.accounts(id) on delete cascade,
  investment_position_id uuid references public.investment_positions(id) on delete cascade,
  financing_contract_id uuid references public.financing_contracts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint financial_goal_links_goal_owner_fkey
    foreign key (goal_id, user_id)
    references public.financial_goals(id, user_id)
    on delete cascade,
  constraint financial_goal_links_single_source_check check (
    (source_type = 'account' and account_id is not null and investment_position_id is null and financing_contract_id is null)
    or (source_type = 'investment' and account_id is null and investment_position_id is not null and financing_contract_id is null)
    or (source_type = 'financing' and account_id is null and investment_position_id is null and financing_contract_id is not null)
  ),
  constraint financial_goal_links_unique_source unique (goal_id, source_type, account_id, investment_position_id, financing_contract_id)
);

create index financial_goals_owner_status_idx
  on public.financial_goals (user_id, status, target_date);
create index financial_goal_contributions_owner_goal_idx
  on public.financial_goal_contributions (user_id, goal_id, contribution_date desc);
create index financial_goal_links_owner_goal_idx
  on public.financial_goal_links (user_id, goal_id, source_type);

create trigger financial_goals_set_updated_at
before update on public.financial_goals
for each row execute procedure public.set_updated_at();

alter table public.financial_goals enable row level security;
alter table public.financial_goal_contributions enable row level security;
alter table public.financial_goal_links enable row level security;

create policy "financial_goals_owner_select" on public.financial_goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "financial_goals_owner_insert" on public.financial_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "financial_goals_owner_update" on public.financial_goals
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "financial_goals_owner_delete" on public.financial_goals
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "financial_goal_contributions_owner_select" on public.financial_goal_contributions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "financial_goal_contributions_owner_insert" on public.financial_goal_contributions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "financial_goal_contributions_owner_update" on public.financial_goal_contributions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "financial_goal_contributions_owner_delete" on public.financial_goal_contributions
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "financial_goal_links_owner_select" on public.financial_goal_links
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "financial_goal_links_owner_insert" on public.financial_goal_links
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "financial_goal_links_owner_update" on public.financial_goal_links
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "financial_goal_links_owner_delete" on public.financial_goal_links
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.financial_goals, public.financial_goal_contributions, public.financial_goal_links from anon, authenticated;
grant select, insert, update, delete on table public.financial_goals to authenticated;
grant select, insert, update, delete on table public.financial_goal_contributions to authenticated;
grant select, insert, update, delete on table public.financial_goal_links to authenticated;

comment on table public.financial_goals is 'Metas financeiras pessoais com valor alvo, prazo e progresso.';
comment on table public.financial_goal_links is 'Fontes opcionais de saldo vinculadas a uma meta.';
