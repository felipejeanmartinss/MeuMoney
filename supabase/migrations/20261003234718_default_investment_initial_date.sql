-- Existing investment RPCs omit the new metadata; use the first valuation
-- date as inception unless the form supplied an explicit earlier date.
create function private.set_investment_initial_position_date()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.initial_position_date := coalesce(new.initial_position_date, new.position_date);
  return new;
end;
$$;
revoke all on function private.set_investment_initial_position_date() from public, anon;
grant execute on function private.set_investment_initial_position_date() to authenticated;

create trigger investment_positions_set_initial_date
before insert on public.investment_positions
for each row execute function private.set_investment_initial_position_date();
