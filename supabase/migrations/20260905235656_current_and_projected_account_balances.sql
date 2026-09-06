-- Current account balances stop at today's date in the product time zone.
-- Future active entries remain available to the application for projection.
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
    + coalesce(financial_transactions.balance_delta, 0)
    + coalesce(transfer_movements.balance_delta, 0)
  )::bigint as current_balance_minor
from public.accounts
left join lateral (
  select
    sum(
      case
        when transactions.transaction_type = 'income'
          then transactions.amount_minor
        else -transactions.amount_minor
      end
    )::bigint as balance_delta
  from public.transactions
  where transactions.account_id = accounts.id
    and transactions.is_active
    and transactions.status = 'completed'
    and transactions.transaction_date
      <= (now() at time zone 'America/Sao_Paulo')::date
) financial_transactions on true
left join lateral (
  select
    sum(
      case
        when transfer_entries.direction = 'inflow'
          then transfer_entries.amount_minor
        else -transfer_entries.amount_minor
      end
    )::bigint as balance_delta
  from public.transfer_entries
  where transfer_entries.account_id = accounts.id
    and transfer_entries.is_active
    and transfer_entries.status = 'completed'
    and transfer_entries.transaction_date
      <= (now() at time zone 'America/Sao_Paulo')::date
) transfer_movements on true;

revoke all on table public.account_balances from anon, authenticated;
grant select on table public.account_balances to authenticated;

comment on view public.account_balances is
'Saldo atual derivado de movimentos ativos e realizados até hoje em America/Sao_Paulo; datas futuras são tratadas como projeção pela aplicação.';
