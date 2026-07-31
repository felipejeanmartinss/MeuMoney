-- Covers the composite foreign key used when a patrimonial item is removed
-- administratively together with its valuation history.
create index net_worth_valuations_item_owner_idx
on public.net_worth_valuations (item_id, user_id);
