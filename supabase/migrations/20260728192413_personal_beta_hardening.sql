-- Sprint 12: personal beta hardening.
-- Adds immutable critical-operation history, import staging retention,
-- portable backups and atomic restore while preserving tenant isolation.

create table public.critical_operation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'data_exported',
      'backup_restored',
      'account_deletion_requested',
      'account_deletion_failed',
      'import_confirmed',
      'import_cancelled',
      'import_retention_applied'
    )
  ),
  outcome text not null check (outcome in ('success', 'failure')),
  resource_type text check (
    resource_type is null
    or (
      char_length(resource_type) between 1 and 40
      and resource_type ~ '^[a-z_]+$'
    )
  ),
  created_at timestamptz not null default now()
);

alter table public.critical_operation_events enable row level security;

create policy "critical_operation_events_owner_select"
on public.critical_operation_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create index critical_operation_events_owner_created_idx
on public.critical_operation_events (user_id, created_at desc);

revoke all on table public.critical_operation_events from public, anon, authenticated;
grant select on table public.critical_operation_events to authenticated;

alter table public.import_jobs
add column expires_at timestamptz;

update public.import_jobs
set expires_at = updated_at + interval '7 days'
where status in ('review', 'ready');

alter table public.import_jobs
alter column expires_at set default (now() + interval '7 days');

create index import_jobs_owner_expiration_idx
on public.import_jobs (user_id, expires_at)
where status in ('review', 'ready');

-- The initial category set is a suggestion owned by the user. Recreating the
-- policy also repairs environments that missed the Sprint 4 follow-up.
drop policy if exists "categories_owner_update_custom" on public.categories;
drop policy if exists "categories_owner_update" on public.categories;

create policy "categories_owner_update"
on public.categories
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function private.record_critical_operation(
  target_event_type text,
  target_outcome text,
  target_resource_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_event_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if target_event_type not in (
    'data_exported',
    'backup_restored',
    'account_deletion_requested',
    'account_deletion_failed',
    'import_confirmed',
    'import_cancelled',
    'import_retention_applied'
  ) then
    raise exception 'invalid_critical_event' using errcode = '22023';
  end if;

  if target_outcome not in ('success', 'failure') then
    raise exception 'invalid_critical_outcome' using errcode = '22023';
  end if;

  if target_resource_type is not null and (
    char_length(target_resource_type) not between 1 and 40
    or target_resource_type !~ '^[a-z_]+$'
  ) then
    raise exception 'invalid_critical_resource_type' using errcode = '22023';
  end if;

  insert into public.critical_operation_events (
    user_id,
    event_type,
    outcome,
    resource_type
  )
  values (
    current_user_id,
    target_event_type,
    target_outcome,
    target_resource_type
  )
  returning id into new_event_id;

  return new_event_id;
end;
$$;

revoke all on function private.record_critical_operation(text, text, text)
from public, anon, authenticated;
grant execute on function private.record_critical_operation(text, text, text)
to authenticated;

create or replace function public.record_critical_operation(
  target_event_type text,
  target_outcome text,
  target_resource_type text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_critical_operation(
    target_event_type,
    target_outcome,
    target_resource_type
  );
$$;

revoke all on function public.record_critical_operation(text, text, text)
from public, anon;
grant execute on function public.record_critical_operation(text, text, text)
to authenticated;

create or replace function private.audit_import_job_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.critical_operation_events (
      user_id,
      event_type,
      outcome,
      resource_type
    )
    values (new.user_id, 'import_confirmed', 'success', 'import_job');
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.critical_operation_events (
      user_id,
      event_type,
      outcome,
      resource_type
    )
    values (new.user_id, 'import_cancelled', 'success', 'import_job');
  end if;
  return new;
end;
$$;

revoke all on function private.audit_import_job_status()
from public, anon, authenticated;

create trigger import_jobs_critical_operation_audit
after update of status on public.import_jobs
for each row execute function private.audit_import_job_status();

create or replace function public.export_personal_backup()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  table_name text;
  owner_column text;
  table_rows jsonb;
  backup_data jsonb := '{}'::jsonb;
  table_specs constant text[][] := array[
    array['profiles', 'id'],
    array['accounts', 'user_id'],
    array['categories', 'user_id'],
    array['recurring_transactions', 'user_id'],
    array['transfers', 'user_id'],
    array['transfer_entries', 'user_id'],
    array['credit_cards', 'user_id'],
    array['credit_card_purchases', 'user_id'],
    array['credit_card_invoices', 'user_id'],
    array['credit_card_installments', 'user_id'],
    array['transactions', 'user_id'],
    array['monthly_budgets', 'user_id'],
    array['net_worth_items', 'user_id'],
    array['net_worth_valuations', 'user_id'],
    array['investment_positions', 'user_id'],
    array['investment_position_snapshots', 'user_id'],
    array['investment_cash_flows', 'user_id'],
    array['import_jobs', 'user_id'],
    array['import_staging_rows', 'user_id'],
    array['imported_transaction_signatures', 'user_id'],
    array['critical_operation_events', 'user_id']
  ];
  table_spec text[];
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  foreach table_spec slice 1 in array table_specs loop
    table_name := table_spec[1];
    owner_column := table_spec[2];

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id), ''[]''::jsonb)
       from public.%I row_data
       where row_data.%I = $1',
      table_name,
      owner_column
    )
    into table_rows
    using current_user_id;

    backup_data := backup_data || jsonb_build_object(table_name, table_rows);
  end loop;

  return jsonb_build_object(
    'product', 'MeuMoney',
    'schema_version', 1,
    'exported_at', clock_timestamp(),
    'data', backup_data
  );
end;
$$;

revoke all on function public.export_personal_backup()
from public, anon;
grant execute on function public.export_personal_backup()
to authenticated;

create or replace function private.restore_backup_rows(
  target_table text,
  target_owner_column text,
  target_rows jsonb,
  target_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_tables constant text[] := array[
    'accounts',
    'categories',
    'recurring_transactions',
    'transfers',
    'transfer_entries',
    'credit_cards',
    'credit_card_purchases',
    'credit_card_invoices',
    'credit_card_installments',
    'transactions',
    'monthly_budgets',
    'net_worth_items',
    'net_worth_valuations',
    'investment_positions',
    'investment_position_snapshots',
    'investment_cash_flows',
    'import_jobs',
    'import_staging_rows',
    'imported_transaction_signatures',
    'critical_operation_events'
  ];
  normalized_rows jsonb;
  inserted_count integer;
begin
  if target_table <> all(allowed_tables) then
    raise exception 'invalid_backup_table' using errcode = '22023';
  end if;

  if target_owner_column <> 'user_id' then
    raise exception 'invalid_backup_owner_column' using errcode = '22023';
  end if;

  if jsonb_typeof(target_rows) <> 'array' then
    raise exception 'invalid_backup_rows' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_set(backup_row, array[target_owner_column], to_jsonb(target_user_id), true)
    ),
    '[]'::jsonb
  )
  into normalized_rows
  from jsonb_array_elements(target_rows) as backup_row;

  if jsonb_array_length(normalized_rows) = 0 then
    return 0;
  end if;

  execute format(
    'insert into public.%I
     select *
     from pg_catalog.jsonb_populate_recordset(null::public.%I, $1)',
    target_table,
    target_table
  )
  using normalized_rows;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function private.restore_backup_rows(text, text, jsonb, uuid)
from public, anon, authenticated;

create or replace function private.restore_personal_backup(target_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  backup_data jsonb;
  profile_row jsonb;
  categories_without_parents jsonb;
  invoices_without_payment_transactions jsonb;
  restored_tables integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if jsonb_typeof(target_backup) <> 'object'
    or target_backup ->> 'product' <> 'MeuMoney'
    or target_backup ->> 'schema_version' <> '1'
    or jsonb_typeof(target_backup -> 'data') <> 'object'
  then
    raise exception 'invalid_backup_manifest' using errcode = '22023';
  end if;

  backup_data := target_backup -> 'data';

  if jsonb_typeof(backup_data -> 'profiles') <> 'array'
    or jsonb_array_length(backup_data -> 'profiles') <> 1
  then
    raise exception 'invalid_backup_profile' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(array[
      'accounts',
      'categories',
      'recurring_transactions',
      'transfers',
      'transfer_entries',
      'credit_cards',
      'credit_card_purchases',
      'credit_card_invoices',
      'credit_card_installments',
      'transactions',
      'monthly_budgets',
      'net_worth_items',
      'net_worth_valuations',
      'investment_positions',
      'investment_position_snapshots',
      'investment_cash_flows',
      'import_jobs',
      'import_staging_rows',
      'imported_transaction_signatures',
      'critical_operation_events'
    ]) as required_table
    where jsonb_typeof(backup_data -> required_table) <> 'array'
  ) then
    raise exception 'invalid_backup_tables' using errcode = '22023';
  end if;

  -- Break the bidirectional invoice/payment reference before clearing data.
  update public.credit_card_invoices
  set payment_transaction_id = null
  where user_id = current_user_id
    and payment_transaction_id is not null;

  delete from public.imported_transaction_signatures where user_id = current_user_id;
  delete from public.import_staging_rows where user_id = current_user_id;
  delete from public.import_jobs where user_id = current_user_id;
  delete from public.credit_card_installments where user_id = current_user_id;
  delete from public.transactions where user_id = current_user_id;
  delete from public.credit_card_invoices where user_id = current_user_id;
  delete from public.credit_card_purchases where user_id = current_user_id;
  delete from public.credit_cards where user_id = current_user_id;
  delete from public.transfer_entries where user_id = current_user_id;
  delete from public.transfers where user_id = current_user_id;
  delete from public.recurring_transactions where user_id = current_user_id;
  delete from public.monthly_budgets where user_id = current_user_id;
  delete from public.investment_cash_flows where user_id = current_user_id;
  delete from public.investment_position_snapshots where user_id = current_user_id;
  delete from public.investment_positions where user_id = current_user_id;
  delete from public.net_worth_valuations where user_id = current_user_id;
  delete from public.net_worth_items where user_id = current_user_id;
  delete from public.categories where user_id = current_user_id;
  delete from public.accounts where user_id = current_user_id;
  delete from public.critical_operation_events where user_id = current_user_id;

  perform private.restore_backup_rows(
    'accounts',
    'user_id',
    backup_data -> 'accounts',
    current_user_id
  );

  select coalesce(
    jsonb_agg(jsonb_set(backup_row, '{parent_id}', 'null'::jsonb, true)),
    '[]'::jsonb
  )
  into categories_without_parents
  from jsonb_array_elements(backup_data -> 'categories') as backup_row;

  perform private.restore_backup_rows(
    'categories',
    'user_id',
    categories_without_parents,
    current_user_id
  );

  if exists (
    select 1
    from jsonb_array_elements(backup_data -> 'categories') as child_row
    where child_row ->> 'parent_id' is not null
      and not exists (
        select 1
        from jsonb_array_elements(backup_data -> 'categories') as parent_row
        where parent_row ->> 'id' = child_row ->> 'parent_id'
      )
  ) then
    raise exception 'invalid_backup_category_parent' using errcode = '23503';
  end if;

  update public.categories as category
  set parent_id = nullif(backup_row ->> 'parent_id', '')::uuid
  from jsonb_array_elements(backup_data -> 'categories') as backup_row
  where category.id = (backup_row ->> 'id')::uuid
    and category.user_id = current_user_id;

  perform private.restore_backup_rows(
    'credit_cards',
    'user_id',
    backup_data -> 'credit_cards',
    current_user_id
  );
  perform private.restore_backup_rows(
    'recurring_transactions',
    'user_id',
    backup_data -> 'recurring_transactions',
    current_user_id
  );
  perform private.restore_backup_rows(
    'transfers',
    'user_id',
    backup_data -> 'transfers',
    current_user_id
  );
  perform private.restore_backup_rows(
    'transfer_entries',
    'user_id',
    backup_data -> 'transfer_entries',
    current_user_id
  );
  perform private.restore_backup_rows(
    'credit_card_purchases',
    'user_id',
    backup_data -> 'credit_card_purchases',
    current_user_id
  );

  select coalesce(
    jsonb_agg(
      jsonb_set(
        backup_row,
        '{payment_transaction_id}',
        'null'::jsonb,
        true
      )
    ),
    '[]'::jsonb
  )
  into invoices_without_payment_transactions
  from jsonb_array_elements(backup_data -> 'credit_card_invoices') as backup_row;

  perform private.restore_backup_rows(
    'credit_card_invoices',
    'user_id',
    invoices_without_payment_transactions,
    current_user_id
  );
  perform private.restore_backup_rows(
    'transactions',
    'user_id',
    backup_data -> 'transactions',
    current_user_id
  );

  if exists (
    select 1
    from jsonb_array_elements(backup_data -> 'credit_card_invoices') as invoice_row
    where invoice_row ->> 'payment_transaction_id' is not null
      and not exists (
        select 1
        from public.transactions
        where id = (invoice_row ->> 'payment_transaction_id')::uuid
          and user_id = current_user_id
      )
  ) then
    raise exception 'invalid_backup_invoice_payment' using errcode = '23503';
  end if;

  update public.credit_card_invoices as invoice
  set payment_transaction_id =
    nullif(backup_row ->> 'payment_transaction_id', '')::uuid
  from jsonb_array_elements(
    backup_data -> 'credit_card_invoices'
  ) as backup_row
  where invoice.id = (backup_row ->> 'id')::uuid
    and invoice.user_id = current_user_id;

  perform private.restore_backup_rows(
    'credit_card_installments',
    'user_id',
    backup_data -> 'credit_card_installments',
    current_user_id
  );
  perform private.restore_backup_rows(
    'monthly_budgets',
    'user_id',
    backup_data -> 'monthly_budgets',
    current_user_id
  );

  perform private.restore_backup_rows(
    'net_worth_items',
    'user_id',
    backup_data -> 'net_worth_items',
    current_user_id
  );
  delete from public.net_worth_valuations where user_id = current_user_id;
  perform private.restore_backup_rows(
    'net_worth_valuations',
    'user_id',
    backup_data -> 'net_worth_valuations',
    current_user_id
  );

  perform private.restore_backup_rows(
    'investment_positions',
    'user_id',
    backup_data -> 'investment_positions',
    current_user_id
  );
  delete from public.investment_position_snapshots where user_id = current_user_id;
  perform private.restore_backup_rows(
    'investment_position_snapshots',
    'user_id',
    backup_data -> 'investment_position_snapshots',
    current_user_id
  );
  perform private.restore_backup_rows(
    'investment_cash_flows',
    'user_id',
    backup_data -> 'investment_cash_flows',
    current_user_id
  );

  perform private.restore_backup_rows(
    'import_jobs',
    'user_id',
    backup_data -> 'import_jobs',
    current_user_id
  );
  perform private.restore_backup_rows(
    'import_staging_rows',
    'user_id',
    backup_data -> 'import_staging_rows',
    current_user_id
  );
  perform private.restore_backup_rows(
    'imported_transaction_signatures',
    'user_id',
    backup_data -> 'imported_transaction_signatures',
    current_user_id
  );
  perform private.restore_backup_rows(
    'critical_operation_events',
    'user_id',
    backup_data -> 'critical_operation_events',
    current_user_id
  );

  -- Reject any edited backup that links a restored row to another tenant.
  if exists (
    select 1
    from public.categories child
    join public.categories parent on parent.id = child.parent_id
    where child.user_id = current_user_id
      and parent.user_id <> current_user_id
  ) or exists (
    select 1
    from public.transactions transaction_row
    join public.accounts account_row on account_row.id = transaction_row.account_id
    where transaction_row.user_id = current_user_id
      and account_row.user_id <> current_user_id
  ) or exists (
    select 1
    from public.transactions transaction_row
    join public.categories category_row on category_row.id = transaction_row.category_id
    where transaction_row.user_id = current_user_id
      and category_row.user_id <> current_user_id
  ) or exists (
    select 1
    from public.transfers transfer_row
    join public.accounts source_account on source_account.id = transfer_row.source_account_id
    join public.accounts destination_account on destination_account.id = transfer_row.destination_account_id
    where transfer_row.user_id = current_user_id
      and (
        source_account.user_id <> current_user_id
        or destination_account.user_id <> current_user_id
      )
  ) or exists (
    select 1
    from public.credit_card_purchases purchase_row
    join public.credit_cards card_row on card_row.id = purchase_row.credit_card_id
    join public.categories category_row on category_row.id = purchase_row.category_id
    where purchase_row.user_id = current_user_id
      and (
        card_row.user_id <> current_user_id
        or category_row.user_id <> current_user_id
      )
  ) or exists (
    select 1
    from public.recurring_transactions recurring_row
    join public.accounts account_row on account_row.id = recurring_row.account_id
    join public.categories category_row on category_row.id = recurring_row.category_id
    where recurring_row.user_id = current_user_id
      and (
        account_row.user_id <> current_user_id
        or category_row.user_id <> current_user_id
      )
  ) or exists (
    select 1
    from public.monthly_budgets budget_row
    join public.categories category_row on category_row.id = budget_row.category_id
    where budget_row.user_id = current_user_id
      and category_row.user_id <> current_user_id
  ) or exists (
    select 1
    from public.transfer_entries entry_row
    join public.transfers transfer_row on transfer_row.id = entry_row.transfer_id
    join public.accounts account_row on account_row.id = entry_row.account_id
    where entry_row.user_id = current_user_id
      and (
        transfer_row.user_id <> current_user_id
        or account_row.user_id <> current_user_id
      )
  ) or exists (
    select 1
    from public.credit_cards card_row
    join public.accounts account_row on account_row.id = card_row.linked_account_id
    where card_row.user_id = current_user_id
      and account_row.user_id <> current_user_id
  ) or exists (
    select 1
    from public.credit_card_invoices invoice_row
    join public.credit_cards card_row on card_row.id = invoice_row.credit_card_id
    left join public.accounts payment_account
      on payment_account.id = invoice_row.payment_account_id
    left join public.transactions payment_transaction
      on payment_transaction.id = invoice_row.payment_transaction_id
    where invoice_row.user_id = current_user_id
      and (
        card_row.user_id <> current_user_id
        or (
          payment_account.id is not null
          and payment_account.user_id <> current_user_id
        )
        or (
          payment_transaction.id is not null
          and payment_transaction.user_id <> current_user_id
        )
      )
  ) or exists (
    select 1
    from public.credit_card_installments installment_row
    join public.credit_card_purchases purchase_row
      on purchase_row.id = installment_row.purchase_id
    join public.credit_cards card_row
      on card_row.id = installment_row.credit_card_id
    join public.credit_card_invoices invoice_row
      on invoice_row.id = installment_row.invoice_id
    where installment_row.user_id = current_user_id
      and (
        purchase_row.user_id <> current_user_id
        or card_row.user_id <> current_user_id
        or invoice_row.user_id <> current_user_id
      )
  ) or exists (
    select 1
    from public.net_worth_valuations valuation_row
    join public.net_worth_items item_row on item_row.id = valuation_row.item_id
    where valuation_row.user_id = current_user_id
      and item_row.user_id <> current_user_id
  ) or exists (
    select 1
    from public.investment_position_snapshots snapshot_row
    join public.investment_positions position_row
      on position_row.id = snapshot_row.position_id
    where snapshot_row.user_id = current_user_id
      and position_row.user_id <> current_user_id
  ) or exists (
    select 1
    from public.investment_cash_flows flow_row
    join public.investment_positions position_row
      on position_row.id = flow_row.position_id
    where flow_row.user_id = current_user_id
      and position_row.user_id <> current_user_id
  ) or exists (
    select 1
    from public.import_jobs job_row
    left join public.accounts account_row on account_row.id = job_row.account_id
    where job_row.user_id = current_user_id
      and account_row.id is not null
      and account_row.user_id <> current_user_id
  ) or exists (
    select 1
    from public.import_staging_rows staging_row
    join public.import_jobs job_row on job_row.id = staging_row.job_id
    left join public.accounts account_row on account_row.id = staging_row.account_id
    left join public.categories category_row on category_row.id = staging_row.category_id
    left join public.transactions duplicate_row
      on duplicate_row.id = staging_row.duplicate_transaction_id
    where staging_row.user_id = current_user_id
      and (
        job_row.user_id <> current_user_id
        or (
          account_row.id is not null
          and account_row.user_id <> current_user_id
        )
        or (
          category_row.id is not null
          and category_row.user_id <> current_user_id
        )
        or (
          duplicate_row.id is not null
          and duplicate_row.user_id <> current_user_id
        )
      )
  ) or exists (
    select 1
    from public.imported_transaction_signatures signature_row
    join public.accounts account_row on account_row.id = signature_row.account_id
    join public.transactions transaction_row
      on transaction_row.id = signature_row.transaction_id
    left join public.import_jobs job_row
      on job_row.id = signature_row.source_job_id
    where signature_row.user_id = current_user_id
      and (
        account_row.user_id <> current_user_id
        or transaction_row.user_id <> current_user_id
        or (
          job_row.id is not null
          and job_row.user_id <> current_user_id
        )
      )
  ) then
    raise exception 'backup_cross_tenant_reference' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.net_worth_items item_row
    where item_row.user_id = current_user_id
      and not exists (
        select 1
        from public.net_worth_valuations valuation_row
        where valuation_row.item_id = item_row.id
          and valuation_row.user_id = current_user_id
      )
  ) or exists (
    select 1
    from public.investment_positions position_row
    where position_row.user_id = current_user_id
      and not exists (
        select 1
        from public.investment_position_snapshots snapshot_row
        where snapshot_row.position_id = position_row.id
          and snapshot_row.user_id = current_user_id
      )
  ) then
    raise exception 'backup_missing_history' using errcode = '23514';
  end if;

  profile_row := (backup_data -> 'profiles') -> 0;

  if trim(coalesce(profile_row ->> 'full_name', '')) = ''
    or profile_row ->> 'preferred_currency' not in ('BRL', 'USD', 'EUR')
  then
    raise exception 'invalid_backup_profile' using errcode = '23514';
  end if;

  update public.profiles
  set
    full_name = trim(profile_row ->> 'full_name'),
    preferred_currency = (profile_row ->> 'preferred_currency')::char(3)
  where id = current_user_id;

  if not found then
    raise exception 'invalid_backup_profile' using errcode = '23514';
  end if;

  perform private.record_critical_operation(
    'backup_restored',
    'success',
    'personal_backup'
  );

  select count(*)
  into restored_tables
  from jsonb_object_keys(backup_data);

  return jsonb_build_object(
    'restored', true,
    'schema_version', 1,
    'table_count', restored_tables,
    'restored_at', clock_timestamp()
  );
end;
$$;

revoke all on function private.restore_personal_backup(jsonb)
from public, anon, authenticated;
grant execute on function private.restore_personal_backup(jsonb)
to authenticated;

create or replace function public.restore_personal_backup(target_backup jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.restore_personal_backup(target_backup);
$$;

revoke all on function public.restore_personal_backup(jsonb)
from public, anon;
grant execute on function public.restore_personal_backup(jsonb)
to authenticated;

create or replace function private.apply_import_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  expired_review_count integer := 0;
  removed_metadata_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  update public.import_jobs
  set
    status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, now()),
    updated_at = now()
  where user_id = current_user_id
    and status in ('review', 'ready')
    and expires_at is not null
    and expires_at <= now();

  get diagnostics expired_review_count = row_count;

  delete from public.import_staging_rows as staging_row
  using public.import_jobs as import_job
  where staging_row.job_id = import_job.id
    and staging_row.user_id = current_user_id
    and import_job.user_id = current_user_id
    and import_job.status = 'cancelled';

  delete from public.import_jobs
  where user_id = current_user_id
    and status in ('completed', 'cancelled', 'failed')
    and coalesce(confirmed_at, cancelled_at, updated_at)
      < now() - interval '90 days';

  get diagnostics removed_metadata_count = row_count;

  if expired_review_count > 0 or removed_metadata_count > 0 then
    perform private.record_critical_operation(
      'import_retention_applied',
      'success',
      'import_job'
    );
  end if;

  return jsonb_build_object(
    'expired_review_count', expired_review_count,
    'removed_metadata_count', removed_metadata_count
  );
end;
$$;

revoke all on function private.apply_import_retention()
from public, anon, authenticated;
grant execute on function private.apply_import_retention()
to authenticated;

create or replace function public.apply_import_retention()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.apply_import_retention();
$$;

revoke all on function public.apply_import_retention()
from public, anon;
grant execute on function public.apply_import_retention()
to authenticated;

comment on table public.critical_operation_events is
  'Immutable, user-visible history of critical operations without financial payloads.';
comment on column public.import_jobs.expires_at is
  'Review staging expires after seven days; source file bytes are never persisted.';
comment on function public.export_personal_backup() is
  'Exports all application data visible to the authenticated owner as versioned JSON.';
comment on function public.restore_personal_backup(jsonb) is
  'Atomically replaces the authenticated owner data from a validated MeuMoney backup.';
comment on function public.apply_import_retention() is
  'Expires review staging after seven days and removes terminal metadata after ninety days.';
