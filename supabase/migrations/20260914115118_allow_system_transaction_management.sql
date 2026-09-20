-- Generated recurrence entries are user-visible automatic transactions. They
-- may be removed by their owner just like manual entries. Technical invoice
-- payments and investment transactions remain protected by origin type.
drop policy if exists "transactions_owner_delete_manual"
on public.transactions;

create policy "transactions_owner_delete_manual_or_system"
on public.transactions
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and origin_type::text in ('manual', 'system')
);
