create or replace view public.credit_card_summaries
with (security_invoker = true)
as
select
  cards.*,
  coalesce(committed.used_amount, 0)::numeric(16, 0) as used_limit,
  (
    cards.credit_limit - coalesce(committed.used_amount, 0)
  )::numeric(16, 0) as available_limit,
  (
    greatest(
      coalesce(committed.used_amount, 0)
        - coalesce(card_transfers.transferred_amount, 0),
      0
    )
  )::numeric(16, 0) as current_balance_minor
from public.credit_cards cards
left join lateral (
  select sum(installments.amount) as used_amount
  from public.credit_card_installments installments
  join public.credit_card_purchases purchases
    on purchases.id = installments.purchase_id
  where installments.credit_card_id = cards.id
    and installments.status in ('pending', 'invoiced')
    and purchases.status = 'active'
) committed on true
left join lateral (
  select sum(transfers.amount_minor) as transferred_amount
  from public.transfers
  where transfers.destination_credit_card_id = cards.id
    and transfers.user_id = cards.user_id
    and transfers.is_active
    and transfers.status = 'completed'
) card_transfers on true;

revoke all on table public.credit_card_summaries from anon, authenticated;
grant select on table public.credit_card_summaries to authenticated;

comment on view public.credit_card_summaries is
  'Resumo do cartão: limite comprometido por parcelas ativas pendentes ou faturadas; transferências livres reduzem somente o saldo devedor, não o consumo do limite.';
