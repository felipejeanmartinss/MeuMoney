-- Limita o comprometimento do cartão ao último mês de fatura cadastrado.
-- Assinaturas usam esse mesmo mês como horizonte para completar os meses
-- ainda não materializados em parcelas.
create or replace view public.credit_card_summaries
with (security_invoker = true)
as
select
  cards.*,
  coalesce(committed.used_amount, 0)::numeric(16, 0) as used_limit,
  (
    cards.credit_limit - coalesce(committed.used_amount, 0)
  )::numeric(16, 0) as available_limit,
  greatest(
    coalesce(committed.used_amount, 0)
      - coalesce(card_transfers.transferred_amount, 0),
    0
  )::numeric(16, 0) as current_balance_minor
from public.credit_cards cards
left join lateral (
  select max(invoices.reference_month) as last_invoice_month
  from public.credit_card_invoices invoices
  where invoices.credit_card_id = cards.id
    and invoices.user_id = cards.user_id
) horizon on true
left join lateral (
  select
    coalesce((
      select sum(installments.amount)
      from public.credit_card_installments installments
      join public.credit_card_purchases purchases
        on purchases.id = installments.purchase_id
      where installments.credit_card_id = cards.id
        and installments.user_id = cards.user_id
        and installments.status in ('pending', 'invoiced')
        and purchases.status = 'active'
        and (
          horizon.last_invoice_month is null
          or installments.competence_date <= horizon.last_invoice_month
        )
    ), 0)
    + coalesce((
      select sum(purchases.total_amount)
      from public.credit_card_purchases purchases
      cross join lateral (
        select public.card_reference_month(
          purchases.purchase_date,
          cards.closing_day
        ) as first_reference_month
      ) first_month
      cross join lateral generate_series(
        (first_month.first_reference_month + interval '1 month')::date,
        horizon.last_invoice_month,
        interval '1 month'
      ) projected_month
      where purchases.credit_card_id = cards.id
        and purchases.user_id = cards.user_id
        and purchases.status = 'active'
        and purchases.is_recurring
        and horizon.last_invoice_month is not null
        and projected_month::date <= horizon.last_invoice_month
        and not exists (
          select 1
          from public.credit_card_installments installments
          where installments.purchase_id = purchases.id
            and installments.user_id = purchases.user_id
            and installments.status in ('pending', 'invoiced')
            and installments.competence_date = projected_month::date
        )
    ), 0) as used_amount
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
  'Resumo do cartão: limite comprometido até a última fatura cadastrada, com assinaturas projetadas nesse horizonte.';
