-- Link existing account transfers to investment operations without duplicating
-- the funding or settlement transfer itself.

alter table public.investment_cash_flows
add column source_transfer_id uuid
  references public.transfers(id) on delete restrict,
add column source_account_id uuid
  references public.accounts(id) on delete restrict;

alter table public.investment_cash_flows
add constraint investment_cash_flows_source_transfer_consistent check (
  (source_transfer_id is null and source_account_id is null)
  or (source_transfer_id is not null and source_account_id is not null)
);

create unique index investment_cash_flows_source_transfer_unique_idx
on public.investment_cash_flows (source_transfer_id, source_account_id)
where source_transfer_id is not null;

create index investment_cash_flows_user_source_transfer_idx
on public.investment_cash_flows (
  user_id,
  source_account_id,
  source_transfer_id
)
where source_transfer_id is not null;

create or replace function private.link_investment_transfer_entry(
  target_account_id uuid,
  target_transfer_entry_id uuid,
  target_position_id uuid,
  target_event_type text,
  target_quantity numeric,
  target_notes text default null,
  target_create_position boolean default false,
  target_new_institution text default null,
  target_new_investment_class public.investment_class default null,
  target_new_investment_type text default null,
  target_new_asset_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  entry_record public.transfer_entries%rowtype;
  transfer_record public.transfers%rowtype;
  new_transaction_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into entry_record
  from public.transfer_entries
  where id = target_transfer_entry_id
    and user_id = current_user_id
    and account_id = target_account_id
    and status = 'completed'
    and is_active
    and transaction_date <= current_date
  for update;
  if not found then
    raise exception 'invalid_investment_transfer_entry'
      using errcode = '23503';
  end if;

  select * into transfer_record
  from public.transfers
  where id = entry_record.transfer_id
    and user_id = current_user_id
    and status = 'completed'
    and is_active
  for update;
  if not found then
    raise exception 'invalid_investment_transfer_entry'
      using errcode = '23503';
  end if;

  if (target_event_type = 'contribution' and entry_record.direction <> 'inflow')
    or (target_event_type <> 'contribution' and entry_record.direction <> 'outflow') then
    raise exception 'investment_transfer_direction_mismatch'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.investment_cash_flows flow
    where flow.user_id = current_user_id
      and flow.source_transfer_id = transfer_record.id
      and flow.source_account_id = target_account_id
  ) then
    raise exception 'investment_transfer_already_linked'
      using errcode = '23505';
  end if;

  new_transaction_id := private.create_investment_account_entry(
    target_account_id,
    target_position_id,
    target_event_type,
    coalesce(
      nullif(trim(transfer_record.description), ''),
      case
        when target_event_type = 'contribution' then 'Aplicação em investimento'
        when target_event_type = 'redemption' then 'Liquidação de investimento'
        when target_event_type = 'interest_on_capital' then 'Juros sobre capital'
        when target_event_type = 'dividend' then 'Dividendos'
        when target_event_type = 'bonus' then 'Bonificação em dinheiro'
        else 'Rendimento de investimento'
      end
    ),
    entry_record.amount_minor,
    target_quantity,
    entry_record.transaction_date,
    target_notes,
    target_create_position,
    target_new_institution,
    target_new_investment_class,
    target_new_investment_type,
    target_new_asset_name
  );

  update public.investment_cash_flows
  set source_transfer_id = transfer_record.id,
      source_account_id = target_account_id
  where user_id = current_user_id
    and transaction_id = new_transaction_id;

  if not found then
    raise exception 'investment_cash_flow_not_found' using errcode = 'P0002';
  end if;

  return new_transaction_id;
end;
$$;

create or replace function public.link_investment_transfer_entry(
  target_account_id uuid,
  target_transfer_entry_id uuid,
  target_position_id uuid,
  target_event_type text,
  target_quantity numeric,
  target_notes text default null,
  target_create_position boolean default false,
  target_new_institution text default null,
  target_new_investment_class public.investment_class default null,
  target_new_investment_type text default null,
  target_new_asset_name text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.link_investment_transfer_entry(
    target_account_id,
    target_transfer_entry_id,
    target_position_id,
    target_event_type,
    target_quantity,
    target_notes,
    target_create_position,
    target_new_institution,
    target_new_investment_class,
    target_new_investment_type,
    target_new_asset_name
  );
$$;

revoke all on function private.link_investment_transfer_entry(
  uuid, uuid, uuid, text, numeric, text, boolean, text,
  public.investment_class, text, text
) from public, anon, authenticated;
grant execute on function private.link_investment_transfer_entry(
  uuid, uuid, uuid, text, numeric, text, boolean, text,
  public.investment_class, text, text
) to authenticated;
revoke all on function public.link_investment_transfer_entry(
  uuid, uuid, uuid, text, numeric, text, boolean, text,
  public.investment_class, text, text
) from public, anon;
grant execute on function public.link_investment_transfer_entry(
  uuid, uuid, uuid, text, numeric, text, boolean, text,
  public.investment_class, text, text
) to authenticated;

create or replace function private.prevent_linked_investment_transfer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.investment_cash_flows flow
    where flow.source_transfer_id = old.id
  ) then
    raise exception 'linked_investment_transfer_is_immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger transfers_preserve_investment_links
before update of source_account_id, destination_account_id,
  destination_credit_card_id, amount_minor, currency, transaction_date,
  status, is_active
on public.transfers
for each row execute procedure private.prevent_linked_investment_transfer_change();

revoke all on function private.prevent_linked_investment_transfer_change()
from public, anon, authenticated;

create or replace view public.investment_transfer_candidates
with (security_invoker = true)
as
select
  entry.id as entry_id,
  entry.transfer_id,
  entry.user_id,
  entry.account_id,
  account.name as account_name,
  entry.currency,
  account.context,
  entry.direction,
  entry.amount_minor,
  entry.transaction_date,
  coalesce(
    nullif(trim(transfer.description), ''),
    case
      when entry.direction = 'inflow' then 'Entrada para investimento'
      else 'Saída de investimento'
    end
  ) as description,
  flow.id as cash_flow_id,
  flow.position_id,
  position.asset_name as position_asset_name
from public.transfer_entries entry
join public.transfers transfer
  on transfer.id = entry.transfer_id
 and transfer.user_id = entry.user_id
join public.accounts account
  on account.id = entry.account_id
 and account.user_id = entry.user_id
left join public.investment_cash_flows flow
  on flow.user_id = entry.user_id
 and flow.source_transfer_id = entry.transfer_id
 and flow.source_account_id = entry.account_id
left join public.investment_positions position
  on position.id = flow.position_id
 and position.user_id = flow.user_id
where account.type = 'investment'
  and account.archived_at is null
  and entry.status = 'completed'
  and entry.is_active
  and transfer.status = 'completed'
  and transfer.is_active
  and entry.transaction_date <= current_date;

revoke all on table public.investment_transfer_candidates
from anon, authenticated;
grant select on table public.investment_transfer_candidates to authenticated;

comment on column public.investment_cash_flows.source_transfer_id is
'Transferencia de caixa que financiou uma aplicacao ou recebeu uma liquidacao/renda.';
comment on column public.investment_cash_flows.source_account_id is
'Conta de investimento cuja perna da transferencia foi vinculada ao fluxo.';
comment on view public.investment_transfer_candidates is
'Transferencias realizadas em contas de investimento, com seu vinculo opcional a posicoes.';
