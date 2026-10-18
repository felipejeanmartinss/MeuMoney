import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("automatic card payment date", () => {
  it("keeps the invoice payment and account entry on the same date atomically", () => {
    const migration = readFileSync("supabase/migrations/20261016052000_sync_card_payment_date.sql", "utf8");
    expect(migration).toContain("create or replace function private.update_automatic_transaction_date");
    expect(migration).toContain("update public.transactions set transaction_date = target_transaction_date");
    expect(migration).toContain("update public.credit_card_payments set payment_date = target_transaction_date");
    expect(migration).toContain("raise exception 'invoice_payment_source_not_found'");
  });
});
