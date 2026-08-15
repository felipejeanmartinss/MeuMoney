-- Cover foreign-key access paths introduced by card cash payments and
-- financing imports. These indexes complement the owner-first query indexes.

create index if not exists credit_card_payments_credit_card_fk_idx
on public.credit_card_payments (credit_card_id);

create index if not exists credit_card_payments_source_account_fk_idx
on public.credit_card_payments (source_account_id);

create index if not exists financing_contracts_net_worth_owner_fk_idx
on public.financing_contracts (net_worth_item_id, user_id);

create index if not exists financing_extra_contract_owner_fk_idx
on public.financing_extra_amortizations (contract_id, user_id);

create index if not exists financing_import_extra_owner_fk_idx
on public.financing_import_extra_amortizations (user_id);

create index if not exists financing_import_jobs_contract_owner_fk_idx
on public.financing_import_jobs (contract_id, user_id)
where contract_id is not null;

create index if not exists financing_schedule_contract_owner_fk_idx
on public.financing_schedule_entries (contract_id, user_id);
