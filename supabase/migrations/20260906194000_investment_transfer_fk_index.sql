-- Cover the source account foreign key used by linked investment transfers.

create index investment_cash_flows_source_account_fk_idx
on public.investment_cash_flows (source_account_id)
where source_account_id is not null;
