create index financial_goal_contributions_goal_owner_idx
  on public.financial_goal_contributions (goal_id, user_id);
create index financial_goal_links_goal_owner_idx
  on public.financial_goal_links (goal_id, user_id);
