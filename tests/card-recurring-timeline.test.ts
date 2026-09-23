import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260920153000_card_forecasts_and_approximate_recurrences.sql",
  ),
  "utf8",
);
const invoicePage = fs.readFileSync(
  path.join(root, "src/app/credit-cards/[id]/invoices/[invoiceId]/page.tsx"),
  "utf8",
);
const recurringPage = fs.readFileSync(
  path.join(root, "src/app/recurring-transactions/page.tsx"),
  "utf8",
);

describe("card invoice forecasts and direct entries", () => {
  it("normalizes historical empty invoices without a bank transaction", () => {
    expect(migration).toContain("empty_invoice.total_amount = 0");
    expect(migration).toContain("empty_invoice.status in ('open', 'closed', 'overdue')");
    expect(migration).toContain("payment_transaction_id = null");
  });

  it("creates a pending payment forecast and confirms the same entry", () => {
    expect(migration).toContain("'Previsão de pagamento de fatura · '");
    expect(migration).toContain("invoice_record.due_date");
    expect(migration).toContain("set account_id = target_account_id");
    expect(migration).toContain("status = 'completed'");
  });

  it("allows the three supported entry kinds inside an open invoice", () => {
    expect(invoicePage).toContain('entryKinds={["purchase", "refund", "cashback"]}');
    expect(migration).toContain("create_credit_card_invoice_entry");
    expect(migration).toContain("invoices.status = 'open'");
  });
});

describe("reviewable recurrence timeline", () => {
  it("stores fixed versus approximate values and reviews approximate forecasts", () => {
    expect(migration).toContain("is_amount_fixed boolean not null default true");
    expect(migration).toContain("generate_recurring_transactions_reviewed");
    expect(recurringPage).toContain("Revisar valores aproximados");
  });

  it("renders the monthly interactive calendar", () => {
    expect(recurringPage).toContain("<RecurrenceCalendar");
    expect(recurringPage).toContain("timelineEvents");
  });
});
