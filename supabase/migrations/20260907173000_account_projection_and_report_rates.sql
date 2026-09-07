-- Exposes both the closed balance and the future projection in the account
-- overview. The projection follows the same rule used by the account register:
-- completed movements before today plus every active movement from today on.

create or replace view public.account_balances
with (security_invoker = true)
as
select
  accounts.id,
  accounts.user_id,
  accounts.name,
  accounts.type,
  accounts.context,
  accounts.currency,
  accounts.opening_balance_minor,
  accounts.opening_balance_date,
  accounts.archived_at,
  accounts.created_at,
  accounts.updated_at,
  (
    accounts.opening_balance_minor
    + coalesce(financial_transactions.current_delta, 0)
    + coalesce(transfer_movements.current_delta, 0)
  )::bigint as current_balance_minor,
  (
    accounts.opening_balance_minor
    + coalesce(financial_transactions.projected_delta, 0)
    + coalesce(transfer_movements.projected_delta, 0)
  )::bigint as projected_balance_minor
from public.accounts
left join lateral (
  select
    sum(
      case
        when transactions.status = 'completed'
          and transactions.transaction_date
            < (now() at time zone 'America/Sao_Paulo')::date
          then case
            when transactions.transaction_type = 'income'
              then transactions.amount_minor
            else -transactions.amount_minor
          end
        else 0
      end
    )::bigint as current_delta,
    sum(
      case
        when (
          transactions.status = 'completed'
          and transactions.transaction_date
            < (now() at time zone 'America/Sao_Paulo')::date
        ) or transactions.transaction_date
          >= (now() at time zone 'America/Sao_Paulo')::date
          then case
            when transactions.transaction_type = 'income'
              then transactions.amount_minor
            else -transactions.amount_minor
          end
        else 0
      end
    )::bigint as projected_delta
  from public.transactions
  where transactions.account_id = accounts.id
    and transactions.is_active
) financial_transactions on true
left join lateral (
  select
    sum(
      case
        when transfer_entries.status = 'completed'
          and transfer_entries.transaction_date
            < (now() at time zone 'America/Sao_Paulo')::date
          then case
            when transfer_entries.direction = 'inflow'
              then transfer_entries.amount_minor
            else -transfer_entries.amount_minor
          end
        else 0
      end
    )::bigint as current_delta,
    sum(
      case
        when (
          transfer_entries.status = 'completed'
          and transfer_entries.transaction_date
            < (now() at time zone 'America/Sao_Paulo')::date
        ) or transfer_entries.transaction_date
          >= (now() at time zone 'America/Sao_Paulo')::date
          then case
            when transfer_entries.direction = 'inflow'
              then transfer_entries.amount_minor
            else -transfer_entries.amount_minor
          end
        else 0
      end
    )::bigint as projected_delta
  from public.transfer_entries
  where transfer_entries.account_id = accounts.id
    and transfer_entries.is_active
) transfer_movements on true;

revoke all on table public.account_balances from anon, authenticated;
grant select on table public.account_balances to authenticated;

comment on view public.account_balances is
'Owner-isolated current and projected account balances. Current closes yesterday in America/Sao_Paulo; projection includes every active movement from today onward.';

create index if not exists transfers_user_conversion_date_idx
on public.transfers (user_id, transaction_date desc)
where destination_account_id is not null
  and destination_currency is not null
  and destination_amount_minor is not null
  and is_active;
