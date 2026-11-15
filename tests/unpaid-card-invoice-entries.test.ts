import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261115210157_allow_entries_in_unpaid_card_invoices.sql"),
  "utf8",
);
const page = fs.readFileSync(
  path.join(root, "src/app/credit-cards/[id]/invoices/[invoiceId]/page.tsx"),
  "utf8",
);

describe("corrections to unpaid credit-card invoices", () => {
  it("accepts closed and overdue invoices but not paid ones", () => {
    expect(migration).toContain("invoices.status in ('open', 'closed', 'overdue')");
    expect(page).toContain("canEditUnpaidCreditCardInvoice(invoice.status)");
    expect(page).toContain('entryKind: invoice.status === "open" ? "purchase" : "cashback"');
  });

  it("keeps the corrected invoice and its pending payment forecast in sync", () => {
    expect(migration).toContain("refresh_unpaid_credit_card_invoice_total");
    expect(migration).toContain("set total_amount = new_total");
    expect(migration).toContain("transactions.status = 'pending'");
    expect(migration).toContain("case when invoice_record.status = 'open' then 'pending'");
    expect(migration).toContain("else 'invoiced' end)::public.credit_card_installment_status");
  });
});
