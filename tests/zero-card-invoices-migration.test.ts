import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  "supabase/migrations/20261115212501_open_zero_credit_card_invoices.sql",
), "utf8");

describe("opening zero-value credit-card invoices", () => {
  it("checks the card owner and only materializes the requested month", () => {
    expect(migration).toContain("current_user_id uuid := (select auth.uid())");
    expect(migration).toContain("cards.user_id = current_user_id");
    expect(migration).toContain("target_reference_month");
    expect(migration).toContain("public.ensure_credit_card_invoice(");
  });

  it("never reopens a paid invoice with value or payment history", () => {
    expect(migration).toContain("invoice_record.total_amount <> 0");
    expect(migration).toContain("invoice_record.paid_amount <> 0");
    expect(migration).toContain("invoice_record.payment_transaction_id is not null");
    expect(migration).toContain("from public.credit_card_payments payments");
    expect(migration).toContain("raise exception 'invoice_reopen_protected'");
  });
});
