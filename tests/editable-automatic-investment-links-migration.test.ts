import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const automaticMigration = readFileSync(resolve(
  "supabase/migrations/20260924120000_editable_automatic_entries.sql",
), "utf8");
const incomeMigration = readFileSync(resolve(
  "supabase/migrations/20260924121000_link_investment_bank_income.sql",
), "utf8");

describe("automatic entry and bank income migrations", () => {
  it("keys recurrence idempotency to its original occurrence, not the editable posting date", () => {
    expect(automaticMigration).toContain("scheduled_date = transaction_date");
    expect(automaticMigration).toContain("on public.transactions (recurring_transaction_id, scheduled_date)");
    expect(automaticMigration).toContain("transactions.scheduled_date = occurrence_date");
    expect(automaticMigration).toContain("create or replace function private.generate_one_recurring_transaction");
    expect(automaticMigration).toContain("create or replace function private.confirm_recurring_transaction");
  });

  it("links an existing bank income without assigning it as a deletable investment-origin transaction", () => {
    expect(incomeMigration).toContain("source_transaction_id uuid references public.transactions(id) on delete restrict");
    expect(incomeMigration).toContain("origin_type = 'manual' and transaction_type = 'income'");
    expect(incomeMigration).toContain("source_record.id, source_record.amount_minor");
    expect(incomeMigration).toContain("transaction_id,\n    source_transaction_id");
    expect(incomeMigration).toContain("investment_source_must_be_unlinked_first");
  });
});
