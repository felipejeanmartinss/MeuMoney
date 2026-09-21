create index financial_goal_contributions_goal_idx
  on public.financial_goal_contributions (goal_id);
create index financial_goal_contributions_goal_owner_idx
  on public.financial_goal_contributions (goal_id, user_id);
create index financial_goal_links_goal_idx
  on public.financial_goal_links (goal_id);
create index financial_goal_links_goal_owner_idx
  on public.financial_goal_links (goal_id, user_id);
create index financial_goal_links_account_idx
  on public.financial_goal_links (account_id)
  where account_id is not null;
create index financial_goal_links_investment_idx
  on public.financial_goal_links (investment_position_id)
  where investment_position_id is not null;
create index financial_goal_links_financing_idx
  on public.financial_goal_links (financing_contract_id)
  where financing_contract_id is not null;
