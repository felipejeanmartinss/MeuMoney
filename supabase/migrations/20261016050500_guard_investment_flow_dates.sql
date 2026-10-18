-- A completed linked transfer must not move its portfolio flow into the future.
create or replace function public.validate_investment_cash_flow_date_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cash_flow_date > current_date then
    raise exception 'future_investment_cash_flow' using errcode = '22007';
  end if;
  return new;
end;
$$;

create trigger investment_cash_flows_validate_updated_date
before update of cash_flow_date on public.investment_cash_flows
for each row execute function public.validate_investment_cash_flow_date_update();

revoke all on function public.validate_investment_cash_flow_date_update()
from public, anon, authenticated;
