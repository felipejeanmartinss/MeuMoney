import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260908010726_editable_credit_card_installments.sql",
  ),
  "utf8",
);
const purchaseForm = fs.readFileSync(
  path.join(root, "src/components/forms/credit-card-purchase-form.tsx"),
  "utf8",
);
const invoicePage = fs.readFileSync(
  path.join(
    root,
    "src/app/credit-cards/[id]/invoices/[invoiceId]/page.tsx",
  ),
  "utf8",
);

describe("editable credit-card installments migration", () => {
  it("persists the subscription marker and validates custom distributions", () => {
    expect(migration).toContain(
      "add column is_recurring boolean not null default false",
    );
    expect(migration).toContain("invalid_installment_distribution");
    expect(migration).toContain("target_installment_amounts bigint[]");
  });

  it("only permits individual installment edits on open invoices", () => {
    expect(migration).toContain("installments.status = 'pending'");
    expect(migration).toContain("invoices.status = 'open'");
    expect(migration).toContain(
      "perform public.refresh_credit_card_invoice_total(target_invoice_id)",
    );
  });

  it("exposes editable previews and open-invoice editing in the interface", () => {
    expect(purchaseForm).toContain('name="installmentAmounts"');
    expect(purchaseForm).toContain('name="isRecurring"');
    expect(invoicePage).toContain("updateCreditCardInstallmentAmount");
    expect(invoicePage).toContain('invoice.status === "open"');
  });
});
